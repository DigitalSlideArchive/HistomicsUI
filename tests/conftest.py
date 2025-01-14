import os

import pytest
from pytest_girder.fixtures import _getPluginsFromMarker
from pytest_girder.plugin_registry import PluginRegistry
from pytest_girder.utils import serverContext


@pytest.fixture
def alt_server(db, request):
    os.environ['HUI_WEBROOT_PATH'] = 'alternate'
    registry = PluginRegistry()
    with registry():
        plugins = _getPluginsFromMarker(request, registry)
        with serverContext(plugins, bindPort=True) as server:
            yield server
