import datetime
import json
import math
import time

import cachetools
import cherrypy
import girder.utility
import girder_large_image_annotation
import large_image.config
import orjson
from girder import logger
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.models.user import User
from girder_large_image_annotation.models.annotation import Annotation

from .constants import PluginSettings

_recentIdentifiers = cachetools.TTLCache(maxsize=100, ttl=86400)


def _itemFromEvent(event, identifierEnding, itemAccessLevel=AccessType.READ):  # noqa
    """
    If an event has a reference and an associated identifier that ends with a
    specific string, return the associated item, user, and image file.

    :param event: the data.process event.
    :param identifierEnding: the required end of the identifier.
    :returns: a dictionary with item, user, and file if there was a match.
    """
    info = event.info
    identifier = None
    reference = info.get('reference', None)
    if reference is not None:
        try:
            reference = json.loads(reference)
            if (isinstance(reference, dict) and
                    isinstance(reference.get('identifier'), str)):
                identifier = reference['identifier']
        except (ValueError, TypeError):
            logger.debug('Failed to parse data.process reference: %r', reference)
    if identifier and 'uuid' in reference:
        if reference['uuid'] not in _recentIdentifiers:
            _recentIdentifiers[reference['uuid']] = {}
        _recentIdentifiers[reference['uuid']][identifier] = info
        reprocessFunc = _recentIdentifiers[reference['uuid']].pop('_reprocess', None)
        if reprocessFunc:
            reprocessFunc()
    if identifier is not None and identifier.endswith(identifierEnding):
        if 'itemId' not in reference and 'fileId' not in reference:
            logger.error('Reference does not contain at least one of itemId or fileId.')
            return
        userId = reference.get('userId')
        if not userId:
            if 'itemId' in reference:
                item = Item().load(reference['itemId'], force=True)
            else:
                file = File().load(reference['fileId'], force=True)
                item = Item().load(file['itemId'], force=True)
            if 'folderId' not in item:
                logger.error('Reference does not contain userId.')
                return
            folder = Folder().load(item['folderId'], force=True)
            userId = folder['creatorId']
        user = User().load(userId, force=True)
        imageId = reference.get('fileId')
        if not imageId:
            item = Item().load(reference['itemId'], force=True)
            if 'largeImage' in item and 'fileId' in item['largeImage']:
                imageId = item['largeImage']['fileId']
        image = File().load(imageId, level=AccessType.READ, user=user)
        item = Item().load(image['itemId'], level=itemAccessLevel, user=user)
        return {'item': item, 'user': user, 'file': image, 'uuid': reference.get('uuid')}


def resolveAnnotationGirderIds(event, results, data, possibleGirderIds):
    """
    If an annotation has references to girderIds, resolve them to actual ids.

    :param event: a data.process event.
    :param results: the results from _itemFromEvent,
    :param data: annotation data.
    :param possibleGirderIds: a list of annotation elements with girderIds
        needing resolution.
    :returns: True if all ids were processed.
    """
    # Exclude actual girderIds from resolution
    girderIds = []
    for element in possibleGirderIds:
        # This will throw an exception if the girderId isn't well-formed as an
        # actual id.
        try:
            if Item().load(element['girderId'], level=AccessType.READ, force=True) is None:
                girderIds.append(element)
        except Exception:
            girderIds.append(element)
    if not len(girderIds):
        return True
    idRecord = _recentIdentifiers.get(results.get('uuid'))
    if idRecord and not all(element['girderId'] in idRecord for element in girderIds):
        idRecord['_reprocess'] = lambda: process_annotations(event)
        return False
    for element in girderIds:
        element['girderId'] = str(idRecord[element['girderId']]['file']['itemId'])
        # Currently, all girderIds inside annotations are expected to be
        # large images.  In this case, load them and ask if they can be so,
        # in case they are small images
        from girder_large_image.models.image_item import ImageItem

        try:
            item = ImageItem().load(element['girderId'], force=True)
            ImageItem().createImageItem(
                item, list(ImageItem().childFiles(item=item, limit=1))[0], createJob=False)
        except Exception:
            pass
    return True


def process_annotations(event):  # noqa
    """Add annotations to an image on a ``data.process`` event"""
    results = _itemFromEvent(event, 'AnnotationFile')
    if not results:
        return
    item = results['item']
    user = results['user']

    file = File().load(
        event.info.get('file', {}).get('_id'),
        level=AccessType.READ, user=user,
    )
    startTime = time.time()

    if not file:
        logger.error('Could not load models from the database')
        return
    try:
        if file['size'] > int(large_image.config.getConfig(
                'max_annotation_input_file_length', 1024 ** 3)):
            msg = 'File is larger than will be read into memory.'
            raise Exception(msg)
        data = []
        with File().open(file) as fptr:
            while True:
                chunk = fptr.read(1024 ** 2)
                if not len(chunk):
                    break
                data.append(chunk)
        data = orjson.loads(b''.join(data).decode())
    except Exception:
        logger.error('Could not parse annotation file')
        raise
    if time.time() - startTime > 10:
        logger.info('Decoded json in %5.3fs', time.time() - startTime)

    if not isinstance(data, list) or (
            hasattr(girder_large_image_annotation.utils, 'isGeoJSON') and
            girder_large_image_annotation.utilsisGeoJSON(data)):
        data = [data]
    # Check some of the early elements to see if there are any girderIds
    # that need resolution.
    if 'uuid' in results:
        girderIds = [
            element for annotation in data
            for element in annotation.get('elements', [])[:100]
            if 'girderId' in element]
        if len(girderIds):
            if not resolveAnnotationGirderIds(event, results, data, girderIds):
                return
    for annotation in data:
        try:
            Annotation().createAnnotation(item, user, annotation)
        except Exception:
            logger.error('Could not create annotation object from data')
            raise
    if Setting().get(PluginSettings.HUI_DELETE_ANNOTATIONS_AFTER_INGEST):
        item = Item().load(file['itemId'], force=True)
        if item and len(list(Item().childFiles(item, limit=2))) == 1:
            Item().remove(item)


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
    del item['meta']['quarantine']
    item = Item().updateItem(item)
    if placeholder is not None:
        Item().remove(placeholder)
    return item


def process_metadata(event):
    """Add metadata to an item on a ``data.process`` event"""
    results = _itemFromEvent(event, 'ItemMetadata', AccessType.WRITE)
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
