import logging
import os

import pytest
from pytest_girder.fixtures import _getPluginsFromMarker
from pytest_girder.plugin_registry import PluginRegistry
from pytest_girder.utils import serverContext


class EventBindingFilter(logging.Filter):
    """Filter warnings we aren't going to act on."""

    def filter(self, record):
        if record.name == 'girder.events' and 'Event binding already exists' in record.getMessage():
            return False
        return True


@pytest.fixture
def alt_server(db, request):
    os.environ['HUI_WEBROOT_PATH'] = 'alternate'
    registry = PluginRegistry()
    with registry():
        plugins = _getPluginsFromMarker(request, registry)
        with serverContext(plugins, bindPort=True) as server:
            yield server


def pytest_configure(config):
    # Add the filter to the girder.events logger
    logging.getLogger('girder.events').addFilter(EventBindingFilter())
