# -*- coding: utf-8 -*-

"""Test annotation file and metadata handlers."""

import json
import pytest
import time

from girder.models.item import Item
from girder_large_image_annotation.models.annotation import Annotation

from . import girder_utilities as utilities


@pytest.mark.plugin('histomicsui')
class TestHUIHandlers(object):
    def testAnnotationHandler(self, server, fsAssetstore, admin):
        file = utilities.uploadExternalFile(
            'data/Easy1.png.sha512', admin, fsAssetstore)
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
        starttime = time.time()
        while time.time() < starttime + 10:
            if Annotation().findOne({'itemId': item['_id']}) is not None:
                break
            time.sleep(0.1)
        assert Annotation().findOne({'itemId': item['_id']}) is not None

    def testMetadataHandler(self, server, fsAssetstore, admin):
        file = utilities.uploadExternalFile(
            'data/Easy1.png.sha512', admin, fsAssetstore)
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
        starttime = time.time()
        while time.time() < starttime + 10:
            item = Item().load(file['itemId'], user=admin)
            if 'sample' in item.get('meta', {}):
                break
            time.sleep(0.1)
        item = Item().load(file['itemId'], user=admin)
        assert item['meta']['sample'] == 'value'
        assert item['meta']['complex']['key1'] == 'value1'
