import datetime
import json
import time

import cachetools
import orjson
from girder import logger
from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.user import User
from girder_large_image_annotation.models.annotation import Annotation
from girder_worker.app import app

from .constants import PluginSettings


def _itemFromEvent(info, identifierEnding, itemAccessLevel=AccessType.READ):  # noqa
    """
    If an event has a reference and an associated identifier that ends with a
    specific string, return the associated item, user, and image file.

    :param info: the "data.process" event.info dictionary.
    :param identifierEnding: the required end of the identifier.
    :returns: a dictionary with item, user, and file if there was a match.
    """
    identifier = None
    reference = info.get('reference', None)
    if reference is not None:
        try:
            reference = json.loads(reference)
        except (ValueError, TypeError):
            pass

    if isinstance(reference, dict) and isinstance(reference.get('identifier'), str):
        identifier = reference['identifier']

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


@app.task
def process_annotations_task(info: dict) -> None:
    results = _itemFromEvent(info, 'AnnotationFile')
    if not results:
        return
    item = results['item']
    user = results['user']

    file = File().load(info['file']['_id'], level=AccessType.READ, user=user)
    startTime = time.time()

    if not file:
        logger.error('Could not load models from the database')
        return

    with File().open(file) as fptr:
        data = orjson.loads(fptr.read().decode())

    if time.time() - startTime > 10:
        logger.info('Decoded json in %5.3fs', time.time() - startTime)

    if not isinstance(data, list):
        data = [data]

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


def process_annotations(event):  # noqa
    """Add annotations to an image on a ``data.process`` event"""
    process_annotations_task.delay(event.info)


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
        raise RestException('The quarantine folder is not configured.')
    folder = Folder().load(folder, force=True, exc=True)
    if not folder:
        raise RestException('The quarantine folder does not exist.')
    if str(folder['_id']) == str(item['folderId']):
        raise RestException('The item is already in the quarantine folder.')
    originalFolder = Folder().load(item['folderId'], force=True)
    quarantineInfo = {
        'originalFolderId': item['folderId'],
        'originalBaseParentType': item['baseParentType'],
        'originalBaseParentId': item['baseParentId'],
        'originalUpdated': item['updated'],
        'quarantineUserId': user['_id'],
        'quarantineTime': datetime.datetime.utcnow()
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
            'quarantineTime': quarantineInfo['quarantineTime']
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
        raise RestException('The item has no quarantine record.')
    folder = Folder().load(item['meta']['quarantine']['originalFolderId'], force=True)
    if not folder:
        raise RestException('The original folder is not accessible.')
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
    results = _itemFromEvent(event.info, 'ItemMetadata', AccessType.WRITE)
    if not results:
        return
    file = File().load(
        event.info.get('file', {}).get('_id'),
        level=AccessType.READ, user=results['user']
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
