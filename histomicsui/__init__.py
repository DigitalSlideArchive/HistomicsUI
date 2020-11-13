# -*- coding: utf-8 -*-

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
import os
import re

from bson import json_util
from girder import events
from girder import plugin
from girder.api import access
from girder.exceptions import ValidationException
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.settings import SettingDefault, SettingKey
from girder.utility import config, setting_utilities
from girder.utility.model_importer import ModelImporter
from girder.utility.webroot import Webroot
from pkg_resources import DistributionNotFound, get_distribution

from . import rest
from .constants import PluginSettings
from .handlers import process_annotations
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


_template = os.path.join(
    os.path.dirname(__file__),
    'webroot.mako'
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
        raise ValidationException('The banner color may not be empty', 'value')
    elif not re.match(r'^#[0-9A-Fa-f]{6}$', doc['value']):
        raise ValidationException('The banner color must be a hex color triplet', 'value')


@setting_utilities.validator(PluginSettings.HUI_BRAND_NAME)
def validateHistomicsUIBrandName(doc):
    if not doc['value']:
        raise ValidationException('The brand name may not be empty', 'value')


@setting_utilities.validator(PluginSettings.HUI_WEBROOT_PATH)
def validateHistomicsUIWebrootPath(doc):
    if not doc['value']:
        raise ValidationException('The webroot path may not be empty', 'value')
    if re.match(r'^girder$', doc['value']):
        raise ValidationException('The webroot path may not be "girder"', 'value')


@setting_utilities.validator(PluginSettings.HUI_ALTERNATE_WEBROOT_PATH)
def validateHistomicsUIAlternateWebrootPath(doc):
    if re.match(r'(^,|)girder(,|$)', doc['value']):
        raise ValidationException('The alternate webroot path may not contain "girder"', 'value')


@setting_utilities.validator(PluginSettings.HUI_QUARANTINE_FOLDER)
def validateHistomicsUIQuarantineFolder(doc):
    if not doc.get('value', None):
        doc['value'] = None
    else:
        Folder().load(doc['value'], force=True, exc=True)


# Defaults that have fixed values are added to the system defaults dictionary.
SettingDefault.defaults.update({
    PluginSettings.HUI_WEBROOT_PATH: 'histomics',
    PluginSettings.HUI_BRAND_NAME: 'HistomicsUI',
    PluginSettings.HUI_BANNER_COLOR: '#f8f8f8',
    PluginSettings.HUI_BRAND_COLOR: '#777777',
})


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
        })
        return super(WebrootHistomicsUI, self)._renderHTML()


class GirderPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'HistomicsUI'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):
        plugin.getPlugin('jobs').load(info)
        plugin.getPlugin('slicer_cli_web').load(info)
        plugin.getPlugin('large_image_annotation').load(info)

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
        global originalChildItems
        if not getattr(Folder, '_childItemsBeforeHUI', None):
            Folder._childItemsBeforeHUI = Folder.childItems
            Folder.childItems = childItems

        girderRoot = info['serverRoot']
        huiRoot = WebrootHistomicsUI(_template)
        huiRoot.updateHtmlVars(girderRoot.vars)

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

        # auto-ingest annotations into database when a .anot file is uploaded
        events.bind('data.process', 'histomicsui', process_annotations)

        events.bind('model.job.save', 'histomicsui', _saveJob)

        def updateWebroot(event):
            """
            If the webroot path setting is changed, bind the new path to the
            hui webroot resource.  Note that a change to the alternate webroot
            requires a restart.
            """
            if event.info.get('key') == PluginSettings.HUI_WEBROOT_PATH:
                setattr(info['serverRoot'], event.info['value'], huiRoot)

        events.bind('model.setting.save.after', 'histomicsui', updateWebroot)

        curConfig = config.getConfig().get('histomicsui', {})
        if curConfig.get('restrict_downloads'):
            # Change some endpoints to require token access
            endpoints = [
                ('collection', 'GET', (':id', 'download')),
                ('file', 'GET', (':id', 'download')),
                ('file', 'GET', (':id', 'download', ':name')),
                ('folder', 'GET', (':id', 'download')),
                ('item', 'GET', (':id', 'download')),
                ('resource', 'GET', ('download', )),
                ('resource', 'POST', ('download', )),

                ('item', 'GET', (':itemId', 'tiles', 'images', ':image')),
            ]

            for resource, method, route in endpoints:
                cls = getattr(info['apiRoot'], resource)
                func = cls.getRouteHandler(method, route)
                if func.accessLevel == 'public':
                    func = access.token(func)
                    cls.removeRoute(method, route)
                    cls.route(method, route, func)
