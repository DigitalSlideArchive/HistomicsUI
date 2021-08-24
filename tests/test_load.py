import pytest
from girder.plugin import loadedPlugins


@pytest.mark.plugin('histomicsui')
def test_import(server):
    assert 'histomicsui' in loadedPlugins()
