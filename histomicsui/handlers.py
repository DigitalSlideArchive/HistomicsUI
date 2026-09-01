import datetime
import json
import logging
import math
import time

import cherrypy
import girder.utility
import orjson
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token

from .constants import PluginSettings

logger = logging.getLogger(__name__)


def process_annotations(event):
    """Add annotations to an image on a ``data.process`` event"""
    import girder_large_image_annotation.handlers

    girder_large_image_annotation.handlers.process_annotations(
        event, 'AnnotationFile',
        Setting().get(PluginSettings.HUI_DELETE_ANNOTATIONS_AFTER_INGEST))


def quarantine_item(item, user, makePlaceholder=True):
    """
    Quarantine an item, marking which user did it.  Note that this raises
    RestExceptions for failures.

    :param user: the user doing the quarantining.
    :param item: an item to quarantine.
    :returns: the modified item.
    """
    folder = Setting().get(PluginSettings.HUI_QUARANTINE_FOLDER)
    if not folder:
        msg = 'The quarantine folder is not configured.'
        raise RestException(msg)
    folder = Folder().load(folder, force=True, exc=True)
    if not folder:
        msg = 'The quarantine folder does not exist.'
        raise RestException(msg)
    if str(folder['_id']) == str(item['folderId']):
        msg = 'The item is already in the quarantine folder.'
        raise RestException(msg)
    originalFolder = Folder().load(item['folderId'], force=True)
    quarantineInfo = {
        'originalFolderId': item['folderId'],
        'originalBaseParentType': item['baseParentType'],
        'originalBaseParentId': item['baseParentId'],
        'originalUpdated': item['updated'],
        'quarantineUserId': user['_id'],
        'quarantineTime': datetime.datetime.now(datetime.timezone.utc),
    }
    item = Item().move(item, folder)
    if makePlaceholder:
        placeholder = Item().createItem(
            item['name'] + ' [Removed - Quarantined]',
            {'_id': item['creatorId']}, originalFolder,
            description=item['description'])
        quarantineInfo['placeholderItemId'] = placeholder['_id']
    item.setdefault('meta', {})['quarantine'] = quarantineInfo
    item['updatedId'] = user['_id']
    item = Item().updateItem(item)
    if makePlaceholder:
        placeholderInfo = {
            'quarantined': True,
            'quarantineTime': quarantineInfo['quarantineTime'],
        }
        placeholder.setdefault('meta', {})['quarantine'] = placeholderInfo
        placeholder = Item().updateItem(placeholder)
    return item


def restore_quarantine_item(item, user):
    """
    Unquarantine an item, returning it to its original location.  Note that
    this raises RestExceptions for failures.

    :param item: an item to unquarantine.
    :returns: the modified item.
    """
    if not item.get('meta', {}).get('quarantine'):
        msg = 'The item has no quarantine record.'
        raise RestException(msg)
    folder = Folder().load(item['meta']['quarantine']['originalFolderId'], force=True)
    if not folder:
        msg = 'The original folder is not accessible.'
        raise RestException(msg)
    if 'placeholderItemId' in item['meta']['quarantine']:
        placeholder = Item().load(item['meta']['quarantine']['placeholderItemId'], force=True)
    else:
        placeholder = None
    item = Item().move(item, folder)
    item['updated'] = item['meta']['quarantine']['originalUpdated']
    if user:
        item['updatedId'] = user['_id']
    del item['meta']['quarantine']
    item = Item().updateItem(item)
    if placeholder is not None:
        Item().remove(placeholder)
    return item


def process_metadata(event):
    """Add metadata to an item on a ``data.process`` event"""
    from girder_large_image_annotation.handlers import itemFromEvent

    results = itemFromEvent(event.info, 'ItemMetadata', AccessType.WRITE)
    if not results:
        return
    file = File().load(
        event.info.get('file', {}).get('_id'),
        level=AccessType.READ, user=results['user'],
    )

    if not file:
        logger.error('Could not load models from the database')
        return
    try:
        data = orjson.loads(File().open(file).read().decode())
    except Exception:
        logger.error('Could not parse metadata file')
        raise

    item = results['item']
    Item().setMetadata(item, data, allowNull=False)


def nan2None(obj):
    """
    Convert NaN and +/-Infitity to None.
    """
    if isinstance(obj, dict):
        return {k: nan2None(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [nan2None(v) for v in obj]
    elif isinstance(obj, float) and (
            math.isnan(obj) or obj == float('inf') or obj == -float('inf')):
        print('Nan')
        return None
    return obj


def json_nans_as_nulls():
    """
    Convert NaN and +/-Infinity to nulls so that they will serialize
    """

    def encode(self, obj, *args, **kwargs):
        obj = nan2None(obj)
        return json.JSONEncoder.encode(self, obj, *args, **kwargs)

    def iterencode(self, obj, *args, **kwargs):
        obj = nan2None(obj)
        return json.JSONEncoder.iterencode(self, obj, *args, **kwargs)

    girder.utility.JsonEncoder.encode = encode
    girder.utility.JsonEncoder.iterencode = iterencode


def shortLoginSessions():
    import girder.api.rest

    _recentTokens = {}

    origGetCurrentUser = girder.api.rest.getCurrentUser

    def getCurrentUser(*args, **kwargs):
        result = origGetCurrentUser(*args, **kwargs)
        try:
            if 'api/v1/notification/stream' in cherrypy.request.path_info:
                return result
        except Exception:
            pass
        user = result[0] if isinstance(result, tuple) else result
        if user:
            token = girder.api.rest.getCurrentToken()
        if user and token:
            if token['_id'] not in _recentTokens or time.time() - _recentTokens[token['_id']] > 60:
                if Setting().get(PluginSettings.HUI_LOGIN_SESSION_EXPIRY_MINUTES):
                    days = float(Setting().get(
                        PluginSettings.HUI_LOGIN_SESSION_EXPIRY_MINUTES)) / 24 / 60
                    token['expires'] = datetime.datetime.utcnow() + datetime.timedelta(
                        days=float(days))
                    token = Token().save(token)
                    logger.debug(
                        'Extend user login duration '
                        f'(user {user["_id"]}, token {token["_id"][:16]}...)')
            if len(_recentTokens) > 100:
                _recentTokens.clear()
            _recentTokens[token['_id']] = time.time()
        return result

    girder.api.rest.getCurrentUser = getCurrentUser

    origResourceSendAuthTokenCookie = girder.api.rest.Resource.sendAuthTokenCookie

    def sendAuthTokenCookie(self, user=None, scope=None, token=None, days=None):
        if days is None and Setting().get(PluginSettings.HUI_LOGIN_SESSION_EXPIRY_MINUTES):
            days = float(Setting().get(PluginSettings.HUI_LOGIN_SESSION_EXPIRY_MINUTES)) / 24 / 60
        return origResourceSendAuthTokenCookie(self, user, scope, token, days)

    girder.api.rest.Resource.sendAuthTokenCookie = origResourceSendAuthTokenCookie
