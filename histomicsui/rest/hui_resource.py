from girder import logger
from girder.api import access
from girder.api.rest import Resource, filtermodel
from girder.api.describe import autoDescribeRoute, describeRoute, Description
from girder.constants import AccessType, TokenScope
from girder.exceptions import RestException
from girder.models.item import Item
from girder.models.setting import Setting
from girder.utility.model_importer import ModelImporter

from ..constants import PluginSettings
from .. import handlers
from .system import allChildFolders, allChildItems


class HistomicsUIResource(Resource):
    def __init__(self):
        super(HistomicsUIResource, self).__init__()
        self.resourceName = 'histomicsui'

        self.route('GET', ('settings',), self.getPublicSettings)
        self.route('PUT', ('quarantine', ':id'), self.putQuarantine)
        self.route('PUT', ('quarantine', ':id', 'restore'), self.restoreQuarantine)
        # The route function tells girder to route calls to the endpoint to
        # a specific function.  The arguments here mean:
        #  1st: This is for GET requests
        #  2nd: This describes the path of the endpoint.
        #  3rd: The function that will be called.
        #
        # The `:id` component in the path is a wildcard that matches any string
        # The value matched will be passed as an argument to the function.  As
        # an example if you make a GET request to
        #   `/api/v1/histomicsui/child_metadata/foobar`
        # the function `self.getChildMetadata` will be called with the parameter
        # `id="foobar"`.
        self.route('GET', ('child_metadata', ':id'), self.getChildMetadata)

        # Similarly, this route handles calls to:
        #  `GET /api/v1/histomicsui/query_metadata`
        self.route('GET', ('query_metadata',), self.findItemsByMetadata)

    @describeRoute(
        Description('Get public settings for HistomicsUI.')
    )
    @access.public
    def getPublicSettings(self, params):
        keys = [
            PluginSettings.HUI_BRAND_NAME,
            PluginSettings.HUI_DEFAULT_DRAW_STYLES,
            PluginSettings.HUI_PANEL_LAYOUT,
            PluginSettings.HUI_QUARANTINE_FOLDER,
            PluginSettings.HUI_WEBROOT_PATH
        ]
        result = {k: Setting().get(k) for k in keys}
        result[PluginSettings.HUI_QUARANTINE_FOLDER] = bool(
            result[PluginSettings.HUI_QUARANTINE_FOLDER])
        return result

    @autoDescribeRoute(
        Description('Move an item to the quarantine folder.')
        .responseClass('Item')
        .modelParam('id', model=Item, level=AccessType.WRITE)
        .errorResponse('ID was invalid.')
        .errorResponse('Write access was denied for the item', 403)
    )
    @access.user(scope=TokenScope.DATA_WRITE)
    @filtermodel(model=Item)
    def putQuarantine(self, item):
        return handlers.quarantine_item(item, self.getCurrentUser())

    @autoDescribeRoute(
        Description('Restore a quarantined item to its original folder.')
        .responseClass('Item')
        .modelParam('id', model=Item, level=AccessType.WRITE)
        .errorResponse('ID was invalid.')
        .errorResponse('Write access was denied for the item', 403)
    )
    @access.admin
    @filtermodel(model=Item)
    def restoreQuarantine(self, item):
        return handlers.restore_quarantine_item(item, self.getCurrentUser())

    # The `autoDescrbeRoute` (and `describeRoute` used in older code)
    # serves to generate the swagger documentation that looks like:
    #   https://data.kitware.com/api/v1
    #
    # The api for this is described at https://goo.gl/hnU3ws.
    @autoDescribeRoute(
        # Instantiate the instance with a basic description of the endpoint.
        Description('Get all metadata for a resource and all folders and '
                    'items that are children of a resource.')
        # Add a required "path" parameter (this is the `:id` component in the
        # route).
        .param('id', 'The ID of the resource.', paramType='path')
        # Add a required "query" parameter... e.g. `?type=collection`.
        .param('type', 'The type of the resource',
               enum=['folder', 'collection', 'user'])
        # The following to lines document common rest errors that can occur
        # when calling this endpoint.  This is for documentation only.
        .errorResponse('ID was invalid.')
        .errorResponse('Access was denied for the resource.', 403)
    )
    # This makes the endpoint accessible without logging in.
    @access.public
    def getChildMetadata(self, id, params):
        # The `autoDescribeRoute` decorator processes the incoming request and
        # populates the function arguments.  Path parameters are added as
        # individual arguments, while query parameters are packed into the
        # `params` dictionary.
        user = self.getCurrentUser()
        modelType = params['type']
        model = ModelImporter.model(modelType)
        doc = model.load(id=id, user=user, level=AccessType.READ)
        if not doc:
            raise RestException('Resource not found.')
        results = {}
        if doc.get('meta'):
            results[str(doc['_id'])] = doc['meta']
        logger.info('Getting child metadata')
        for folder in allChildFolders(parentType=modelType, parent=doc,
                                      user=user, limit=0, offset=0):
            if folder.get('meta'):
                results[str(folder['_id'])] = folder['meta']
        for item in allChildItems(parentType=modelType, parent=doc,
                                  user=user, limit=0, offset=0):
            if item.get('meta'):
                results[str(item['_id'])] = item['meta']
        # By default, responses to girder endpoints are json encoded when
        # returned to the client.  In this case, it is a dictionary mapping
        # `id` -> `metadata`.
        return results

    # This endpoint returns a paginated list of all items with a given
    # (key, value) pair in their metadata.  This endpoint can be called as
    # follows:
    #
    # /histomicsui/query_metadata?
    #   key=doctor&value="John Doe"&limit=10&sort=created&sortdir=-1
    #
    # This will return a list of items matched as `{'meta': {'doctor':
    # 'John Doe'}}`.  It will return at most 10 items starting from the most
    # recently created.
    @autoDescribeRoute(
        Description('Get a list of items with a specific metadata value.')
        # This is a required string parameter representing the key in the
        # metadata.
        .param('key', 'The metadata key')
        # This is the value which should be json encoded.
        .jsonParam('value', 'The (json encoded) metadata value')
        # This adds paging parameters "limit", "offset", and "sort".  By
        # default it sorts by the `name` field of the item in ascending order.
        .pagingParams('name')
        # The following to lines document common rest errors that can occur
        # when calling this endpoint.  This is for documentation only.
        .errorResponse('Required parameters were not provided.')
        .errorResponse('Invalid value provided.')
    )
    @access.public
    def findItemsByMetadata(self, key, value, limit, offset, sort):
        # Construct a mongo query from the parameters given.  Developers should
        # be careful when constructing these queries to ensure that private
        # information is not leaked.  In this example, the user could pass an
        # arbitrary dictionary which could involve an aggregation pipeline, so
        # we check that only simple types are accepted.
        if isinstance(value, (list, dict)):
            # This is a special type of exception that tells girder to respond
            # with an HTTP response with the given code and message.
            raise RestException('The value must not be a dictionary or list.', code=400)

        query = {
            'meta': {
                key: value
            }
        }

        # This gets the logged in user who created the request.  If it is an
        # anonymous request, this value will be `None`.
        user = self.getCurrentUser()

        # Here, item is a "model" class which is a single instance providing an
        # api that wraps traditional mongo queries.  This API is described at:
        # http://girder.readthedocs.io/en/latest/api-docs.html?#models
        item = Item()

        # This runs a "find" operation on the item collection returning a mongo
        # cursor.
        cursor = item.find(query, sort=sort)

        # The `filterResultsByPermission` allows paged access to a mongo query
        # while filtering out documents that the current user doesn't have
        # access to.  In this case, it requires the current user have read
        # access to the items.  The return value is an iterator that begins at
        # `offset` and ends at `offset + limit`.
        response = item.filterResultsByPermission(
            cursor,
            user=user, level=AccessType.READ,
            limit=limit, offset=offset
        )

        # Finally, we turn the iterator into an explicit list for return to the
        # user.  Girder handles json encoding the response.
        return list(response)
