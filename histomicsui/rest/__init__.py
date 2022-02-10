from . import system
from .hui_resource import HistomicsUIResource
from .image_browse_resource import ImageBrowseResource


def addEndpoints(apiRoot):
    """
    This adds endpoints from each module.

    :param apiRoot: Girder api root class.
    """
    system.addSystemEndpoints(apiRoot)

    ImageBrowseResource(apiRoot)

    apiRoot.histomicsui = HistomicsUIResource()
