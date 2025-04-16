"""Test annotation file and metadata handlers."""

import json

import pytest
from girder.models.item import Item
from girder_large_image_annotation.models.annotation import Annotation

from . import girder_utilities as utilities


@pytest.mark.plugin('histomicsui')
class TestHUIHandlers:
    def testAnnotationHandler(self, server, fsAssetstore, admin):
        file = utilities.uploadExternalFile('Easy1.png', admin, fsAssetstore)
        item = Item().load(file['itemId'], user=admin)
        utilities.uploadTestFile(
            'sample.anot', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'NotAnAnnotation',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        assert Annotation().findOne({'itemId': item['_id']}) is None
        utilities.uploadTestFile(
            'sample.anot', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'IsAnAnnotationFile',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        assert Annotation().findOne({'itemId': item['_id']}) is not None

    def testMetadataHandler(self, server, fsAssetstore, admin):
        file = utilities.uploadExternalFile('Easy1.png', admin, fsAssetstore)
        item = Item().load(file['itemId'], user=admin)
        utilities.uploadTestFile(
            'sample.meta', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'NotItemMetadataForItem',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        item = Item().load(file['itemId'], user=admin)
        assert item.get('meta', {}).get('sample') is None
        utilities.uploadTestFile(
            'sample.meta', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'NotItemMetadata',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        item = Item().load(file['itemId'], user=admin)
        assert item['meta']['sample'] == 'value'
        assert item['meta']['complex']['key1'] == 'value1'

    def testAnnotationWithGirderIdHandler(self, server, fsAssetstore, admin, eagerWorkerTasks):
        file = utilities.uploadExternalFile('Easy1.png', admin, fsAssetstore)
        item = Item().load(file['itemId'], user=admin)
        utilities.uploadExternalFile(
            'Easy1.png', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'ImageRecord1',
                'uuid': '12345',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        assert Annotation().findOne({'itemId': item['_id']}) is None
        utilities.uploadTestFile(
            'sample_girder_id.anot', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'IsAnAnnotationFile',
                'uuid': '12345',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        assert Annotation().findOne({'itemId': item['_id']}) is not None

    def testAnnotationWithGirderIdHandlerAltOrder(
            self, server, fsAssetstore, admin, eagerWorkerTasks):
        file = utilities.uploadExternalFile('Easy1.png', admin, fsAssetstore)
        item = Item().load(file['itemId'], user=admin)
        utilities.uploadTestFile(
            'sample_girder_id.anot', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'IsAnAnnotationFile',
                'uuid': '12346',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        utilities.uploadExternalFile(
            'Easy1.png', admin, fsAssetstore, reference=json.dumps({
                'identifier': 'ImageRecord1',
                'uuid': '12346',
                'userId': str(admin['_id']),
                'itemId': str(item['_id']),
                'fileId': str(file['_id']),
            }))
        assert Annotation().findOne({'itemId': item['_id']}) is not None
