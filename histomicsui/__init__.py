#############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#############################################################################

import json
import logging
import os
import re
from functools import wraps

import cherrypy
from bson import json_util
from girder import events, logger, plugin
from girder.api import access
from girder.api.rest import getCurrentToken
from girder.constants import AssetstoreType
from girder.exceptions import AccessException, ValidationException
from girder.models.assetstore import Assetstore
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.settings import SettingDefault, SettingKey
from girder.utility import config
from girder.utility import path as path_util
from girder.utility import setting_utilities
from girder.utility.model_importer import ModelImporter
from girder.utility.webroot import Webroot
from pkg_resources import DistributionNotFound, get_distribution

from . import handlers, rest
from .constants import PluginSettings
from .models.aperio import Aperio
from .models.case import Case
from .models.cohort import Cohort
from .models.image import Image
from .models.pathology import Pathology
from .models.slide import Slide

try:
    __version__ = get_distribution(__name__).version
except DistributionNotFound:
    # package is not installed
    pass

# There are other packages that add to the root log handler; this makes the
# system very noisy.  Stop that.
while logging.root.hasHandlers():
    logging.root.removeHandler(logging.root.handlers[0])
logging.root.addHandler(logging.NullHandler())

_template = os.path.join(
    os.path.dirname(__file__),
    'webroot.mako',
)


def patchCookieParsing():
    """
    Python's http cookie parser fails for all cookies when there are some
    invalid cookies.  Work around some of that.

    See https://bugs.python.org/issue31456 for a discussion.
    See https://github.com/python/cpython/blob/master/Lib/http/cookies.py for
    the relevant Python source code.
    """
    try:
        # This will fail in Python 2.7.  Python 2.7 has a backport module, but
        # it is constructed differently.
        import http.cookies

        # This is both a sanity check and to make sure we don't do things
        # multiple times.  It should work on python 3.5 - 3.9 (and possibly
        # later).  See
        if (r'\s' not in http.cookies._LegalValueChars and
                r'\w' in http.cookies._LegalValueChars and
                http.cookies.BaseCookie._BaseCookie__parse_string.__defaults__ == (
                    http.cookies._CookiePattern, )):
            http.cookies._LegalValueChars += r'\s'
            http.cookies._CookiePattern = re.compile(
                http.cookies._CookiePattern.pattern.replace(r'\[\]', r'\[\]\s'),
                http.cookies._CookiePattern.flags)
            http.cookies.BaseCookie._BaseCookie__parse_string.__defaults__ = (
                http.cookies._CookiePattern, )
    except Exception:
        pass


def betterInvalidateJSandCSSCaches(root):
    from girder import constants

    origRenderHTML = root._renderHTML

    def _renderHTML(self):
        topBuiltDir = os.path.join(constants.STATIC_ROOT_DIR, 'built')
        result = origRenderHTML()
        lastUpdate = 0
        for filename in {
                'girder_lib.min.js', 'girder_app.min.js', 'girder_lib.min.css',
                'Girder_Favicon.png'}:
            filepath = os.path.join(topBuiltDir, filename)
            if os.path.exists(filepath):
                lastUpdate = max(lastUpdate, os.path.getmtime(filepath))
        builtDir = os.path.join(constants.STATIC_ROOT_DIR, 'built', 'plugins')
        for pluginName in self.vars['plugins']:
            for filepath in [
                os.path.join(builtDir, pluginName, 'plugin.min.css'),
                os.path.join(builtDir, pluginName, 'plugin.min.js'),
            ]:
                if os.path.exists(filepath):
                    lastUpdate = max(lastUpdate, os.path.getmtime(filepath))
        luParam = '?_=%d' % int(lastUpdate * 1000)
        while True:
            match = re.search(
                r'<(link rel="(icon|stylesheet)" [^>]*href="[^>?"]*\.(css|png)|'
                r'script src="[^>?"]*.js)">', result)
            if not match:
                break
            result = result[:match.span()[1] - 2] + luParam + result[match.span()[1] - 2:]
        return result

    root._renderHTML = _renderHTML.__get__(root)


@setting_utilities.validator({
    PluginSettings.HUI_DEFAULT_DRAW_STYLES,
    PluginSettings.HUI_PANEL_LAYOUT,
})
def validateListOrJSON(doc):
    val = doc['value']
    try:
        if isinstance(val, list):
            doc['value'] = json.dumps(val)
        elif val is None or val.strip() == '':
            doc['value'] = None
        else:
            parsed = json.loads(val)
            if not isinstance(parsed, list):
                raise ValueError
            doc['value'] = val.strip()
    except (ValueError, AttributeError):
        raise ValidationException('%s must be a JSON list.' % doc['key'], 'value')


@setting_utilities.validator({
    PluginSettings.HUI_BANNER_COLOR,
    PluginSettings.HUI_BRAND_COLOR,
})
def validateHistomicsUIColor(doc):
    if not doc['value']:
        msg = 'The banner color may not be empty'
        raise ValidationException(msg, 'value')
    elif not re.match(r'^#[0-9A-Fa-f]{6}$', doc['value']):
        msg = 'The banner color must be a hex color triplet'
        raise ValidationException(msg, 'value')


@setting_utilities.validator(PluginSettings.HUI_BRAND_NAME)
def validateHistomicsUIBrandName(doc):
    if not doc['value']:
        msg = 'The brand name may not be empty'
        raise ValidationException(msg, 'value')


@setting_utilities.validator(PluginSettings.HUI_WEBROOT_PATH)
def validateHistomicsUIWebrootPath(doc):
    if not doc['value']:
        msg = 'The webroot path may not be empty'
        raise ValidationException(msg, 'value')
    if re.match(r'^girder$', doc['value']):
        msg = 'The webroot path may not be "girder"'
        raise ValidationException(msg, 'value')


@setting_utilities.validator(PluginSettings.HUI_ALTERNATE_WEBROOT_PATH)
def validateHistomicsUIAlternateWebrootPath(doc):
    if re.match(r'(^,|)girder(,|$)', doc['value']):
        msg = 'The alternate webroot path may not contain "girder"'
        raise ValidationException(msg, 'value')


@setting_utilities.validator(PluginSettings.HUI_QUARANTINE_FOLDER)
def validateHistomicsUIQuarantineFolder(doc):
    if not doc.get('value', None):
        doc['value'] = None
    else:
        Folder().load(doc['value'], force=True, exc=True)


@setting_utilities.validator(PluginSettings.HUI_LOGIN_SESSION_EXPIRY_MINUTES)
def validateLoginSessionExpiryMinutes(doc):
    if not doc.get('value', None):
        doc['value'] = None
    else:
        try:
            doc['value'] = float(doc['value'])
            if doc['value'] > 0:
                return
        except ValueError:
            pass  # We want to raise the ValidationException
        msg = 'Login session expiry must be None or a number >= 0.0.'
        raise ValidationException(msg, 'value')


# Defaults that have fixed values are added to the system defaults dictionary.
SettingDefault.defaults.update({
    PluginSettings.HUI_WEBROOT_PATH: 'histomics',
    PluginSettings.HUI_BRAND_NAME: 'HistomicsUI',
    PluginSettings.HUI_BANNER_COLOR: '#f8f8f8',
    PluginSettings.HUI_BRAND_COLOR: '#777777',
    PluginSettings.HUI_HELP_URL:
        'https://github.com/DigitalSlideArchive/HistomicsUI/blob/master/docs/controls.rst',
    PluginSettings.HUI_HELP_TOOLTIP: 'Mouse and keyboard controls',
    PluginSettings.HUI_HELP_TEXT: 'Help',
})


@setting_utilities.validator({
    PluginSettings.HUI_HELP_URL,
    PluginSettings.HUI_HELP_TOOLTIP,
    PluginSettings.HUI_HELP_TEXT,
    PluginSettings.HUI_LOGIN_TEXT,
})
def validateHistomicsUIHelp(doc):
    pass


@setting_utilities.validator({
    PluginSettings.HUI_DELETE_ANNOTATIONS_AFTER_INGEST,
})
def validateBoolean(doc):
    val = doc['value']
    if str(val).lower() not in ('false', 'true', ''):
        raise ValidationException('%s must be a boolean.' % doc['key'], 'value')
    doc['value'] = (str(val).lower() == 'true')


def childItems(self, folder, limit=0, offset=0, sort=None, filters=None,
               includeVirtual=False, **kwargs):
    if not includeVirtual or not folder.get('isVirtual') or 'virtualItemsQuery' not in folder:
        return Folder._childItemsBeforeHUI(
            self, folder, limit=limit, offset=offset, sort=sort,
            filters=filters, **kwargs)
    q = json_util.loads(folder['virtualItemsQuery'])
    if 'virtualItemsSort' in folder and sort is None:
        sort = json.loads(folder['virtualItemsSort'])
    q.update(filters or {})
    return Item().find(q, limit=limit, offset=offset, sort=sort, **kwargs)


def _saveJob(event):
    """
    When a job is saved, if it is a docker run task, add the Dask Bokeh port to
    the list of exposed ports.
    """
    job = event.info
    try:
        jobkwargs = json_util.loads(job['kwargs'])
        if '--scheduler' in jobkwargs['container_args']:
            jobkwargs['ports'] = {'8787': None}
            job['kwargs'] = json_util.dumps(jobkwargs)
    except Exception:
        pass


class WebrootHistomicsUI(Webroot):
    def _renderHTML(self):
        self.updateHtmlVars({
            'title': Setting().get(PluginSettings.HUI_BRAND_NAME),
            'huiBrandName': Setting().get(PluginSettings.HUI_BRAND_NAME),
            'huiBrandColor': Setting().get(PluginSettings.HUI_BRAND_COLOR),
            'huiBannerColor': Setting().get(PluginSettings.HUI_BANNER_COLOR),
            'huiHelpURL': Setting().get(PluginSettings.HUI_HELP_URL),
            'huiHelpTooltip': Setting().get(PluginSettings.HUI_HELP_TOOLTIP),
            'huiHelpText': Setting().get(PluginSettings.HUI_HELP_TEXT),
        })
        return super()._renderHTML()

    def GET(self, **params):
        print(params)
        if params.get('token'):
            try:
                token = Token().load(params['token'], force=True, objectId=False)
                if token:
                    cookie = cherrypy.response.cookie
                    cookie['girderToken'] = str(token['_id'])
                    cookie['girderToken']['path'] = '/'
                    days = float(Setting().get(SettingKey.COOKIE_LIFETIME))
                    cookie['girderToken']['expires'] = int(days * 3600 * 24)
                    cookie['girderToken']['sameSite'] = 'None'
                    cookie['girderToken']['secure'] = True
            except Exception:
                pass
        return self._renderHTML()


def restrict_downloads(info):
    """
    If restrict_downloads is configured, modify endpoints to do that.
    """
    curConfig = config.getConfig().get('histomicsui', {})
    if not curConfig.get('restrict_downloads'):
        return
    # Change some endpoints to require token access
    endpoints = [
        ('collection', 'GET', (':id', 'download'), True),
        ('file', 'GET', (':id', 'download', ':name'), True),
        ('folder', 'GET', (':id', 'download'), True),
        ('resource', 'GET', ('download', ), False),
        ('resource', 'POST', ('download', ), True),

        ('item', 'GET', (':itemId', 'tiles', 'images', ':image'), True),
    ]
    intEndpoints = [
        ('file', 'GET', (':id', 'download'), True),
        ('item', 'GET', (':id', 'download'), True),
    ]
    if not isinstance(curConfig['restrict_downloads'], int):
        endpoints += intEndpoints

    for resource, method, route, clrScope in endpoints:
        cls = getattr(info['apiRoot'], resource)
        boundfunc = cls.getRouteHandler(method, route)
        func = getattr(boundfunc, '__func__', boundfunc)
        if func.accessLevel == 'public':
            newfunc = access.token(func)
            newfunc.requiredScopes = getattr(func, 'requiredScopes', None)
            if getattr(func, 'requiredScopes', None) and clrScope:
                del func.requiredScopes
            if getattr(func, 'cookieAuth', None) and clrScope:
                newfunc.cookieAuth = True
                del func.cookieAuth
            # Rebind new function
            if boundfunc != func:
                newfunc = newfunc.__get__(boundfunc.__self__, boundfunc.__class__)
                setattr(newfunc.__self__, newfunc.__name__, newfunc)
            cls.removeRoute(method, route)
            cls.route(method, route, newfunc)
    if isinstance(curConfig['restrict_downloads'], int):
        def limitLengthDownload(fun, limit):
            @wraps(fun)
            def wrapped(*args, **kwargs):
                if (not getCurrentToken() and len(args) >= 1 and
                        args[0] and args[0].get('size', 0) >= limit):
                    msg = 'You must be logged in or have a valid auth token.'
                    raise AccessException(
                        msg)
                return fun(*args, **kwargs)
            return wrapped
        File().download = limitLengthDownload(
            File().download, curConfig['restrict_downloads'])


def cleanupFSAssetstores():
    curConfig = config.getConfig().get('histomicsui', {})
    if not curConfig.get('cleanup_fsassetstore'):
        return
    check = curConfig.get('cleanup_fsassetstore') == 'check'
    for assetstore in Assetstore().find({'type': AssetstoreType.FILESYSTEM}):
        fullcount = 0
        count = 0
        total = 0
        base = assetstore['root'].rstrip(os.sep) + os.sep
        logger.info('Checking assetstore if it needs cleanup: %s at %s', assetstore['name'], base)
        paths = {entry['path'] for entry in File().find({
            'assetstoreId': assetstore['_id'], 'imported': {'$exists': False}})}
        for root, _dirs, files in os.walk(base):
            for file in files:
                fullcount += 1
                path = os.path.join(root, file)
                if path.startswith(base) and path[len(base):] not in paths:
                    count += 1
                    total += os.path.getsize(path)
                    if not check:
                        logger.info('Unlink unused file: %s (%d)',
                                    path, os.path.getsize(path))
                        os.unlink(path)
                    else:
                        logger.info('Would unlink unused file: %s (%d)',
                                    path, os.path.getsize(path))
        logger.info('Finished checking assetstore: %s (%d/%d file(s), %d byte(s))',
                    assetstore['name'], count, fullcount, total)


class GirderPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'HistomicsUI'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):  # noqa
        plugin.getPlugin('jobs').load(info)
        try:
            plugin.getPlugin('slicer_cli_web').load(info)
        except Exception:
            logger.info('slicer_cli_web plugin is unavailable.  Analysis '
                        'tasks are therefore unavailable.')
        plugin.getPlugin('large_image_annotation').load(info)

        # Support short login sessions
        handlers.shortLoginSessions()
        # Python's http cookie parser fails for all cookies when there are some
        # invalid cookies.  Work around some of that.
        patchCookieParsing()

        ModelImporter.registerModel('aperio', Aperio, 'histomicsui')
        ModelImporter.registerModel('case', Case, 'histomicsui')
        ModelImporter.registerModel('cohort', Cohort, 'histomicsui')
        ModelImporter.registerModel('image', Image, 'histomicsui')
        ModelImporter.registerModel('pathology', Pathology, 'histomicsui')
        ModelImporter.registerModel('slide', Slide, 'histomicsui')

        rest.addEndpoints(info['apiRoot'])
        info['serverRoot'].updateHtmlVars({
            'brandName': Setting().get(SettingKey.BRAND_NAME)})
        # Better virtual folder support
        if not getattr(Folder, '_childItemsBeforeHUI', None):
            Folder._childItemsBeforeHUI = Folder.childItems
            Folder.childItems = childItems
        # Allow virtual folders to form resource paths.  This could be moved to
        # the virtual folder plugin's load method.
        oldLookUpToken = path_util.lookUpToken

        def lookUpToken(token, parentType, parent):
            if parentType == 'folder' and parent.get('isVirtual') and 'virtualItemsQuery' in parent:
                q = json_util.loads(parent['virtualItemsQuery'])
                q = {'$and': [q, {'name': token}]}
                item = Item().findOne(q)
                if item:
                    return item, 'item'
            return oldLookUpToken(token, parentType, parent)

        path_util.lookUpToken = lookUpToken

        girderRoot = info['serverRoot']
        huiRoot = WebrootHistomicsUI(_template)
        huiRoot.updateHtmlVars(girderRoot.vars)

        betterInvalidateJSandCSSCaches(girderRoot)
        betterInvalidateJSandCSSCaches(huiRoot)

        # The interface is always available under hui and also available
        # under the specified path.
        info['serverRoot'].hui = huiRoot
        webrootPath = Setting().get(PluginSettings.HUI_WEBROOT_PATH)
        alternateWebrootPath = Setting().get(PluginSettings.HUI_ALTERNATE_WEBROOT_PATH)
        setattr(info['serverRoot'], webrootPath, huiRoot)
        if alternateWebrootPath:
            for alt_webroot_path in alternateWebrootPath.split(','):
                if alt_webroot_path:
                    setattr(info['serverRoot'], alt_webroot_path, huiRoot)
        info['serverRoot'].girder = girderRoot

        # Auto-ingest annotations into database when a file with an identifier
        # ending in 'AnnotationFile' is uploaded (usually .anot files).
        events.bind('data.process', 'histomicsui.annotations', handlers.process_annotations)
        # Auto-ingest metadata into parent when a file with an identifier
        # ending in 'ItemMetadata' is uploaded (usually .meta files).
        events.bind('data.process', 'histomicsui.metadata', handlers.process_metadata)

        events.bind('model.job.save', 'histomicsui', _saveJob)

        handlers.json_nans_as_nulls()

        def updateWebroot(event):
            """
            If the webroot path setting is changed, bind the new path to the
            hui webroot resource.  Note that a change to the alternate webroot
            requires a restart.
            """
            if event.info.get('key') == PluginSettings.HUI_WEBROOT_PATH:
                setattr(info['serverRoot'], event.info['value'], huiRoot)

        events.bind('model.setting.save.after', 'histomicsui', updateWebroot)

        restrict_downloads(info)
        cleanupFSAssetstores()
