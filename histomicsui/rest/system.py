#############################################################################
#  Copyright Kitware Inc.
#
#  Licensed under the Apache License, Version 2.0 ( the "License" );
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#    http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#############################################################################

import datetime
import os

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute, describeRoute
from girder.api.rest import RestException, boundHandler, filtermodel
from girder.api.v1.resource import Resource as ResourceResource
from girder.constants import AccessType, AssetstoreType, TokenScope
from girder.models.assetstore import Assetstore
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.utility.model_importer import ModelImporter
from girder_jobs.models.job import Job


def addSystemEndpoints(apiRoot):
    """
    This adds endpoints to routes that already exist in Girder.

    :param apiRoot: Girder api root class.
    """
    # Added to the item route
    apiRoot.item.route('GET', ('query',), getItemsByQuery)
    # Added to the folder route
    apiRoot.folder.route('GET', ('query',), getFoldersByQuery)
    # Added to the system route
    apiRoot.system.route('PUT', ('restart',), restartServer)
    apiRoot.system.route('GET', ('setting', 'default'), getSettingDefault)
    # Added to the job route
    apiRoot.job.route('GET', ('old',), getOldJobs)
    apiRoot.job.route('DELETE', ('old',), deleteOldJobs)
    # Added to the file route
    apiRoot.file.route('POST', (':id', 'import', 'adjust_path'), adjustFileImportPath)
    # Added to the histomicui route
    HUIResourceResource(apiRoot)


def allChildFolders(parent, parentType, user, limit=0, offset=0,
                    sort=None, _internal=None, **kwargs):
    """
    This generator will yield all folders that are children of the resource
    or recursively children of child folders of the resource, with access
    policy filtering.  Passes any kwargs to the find function.

    :param parent: The parent object.
    :type parentType: Type of the parent object.
    :param parentType: The parent type.
    :type parentType: 'user', 'folder', or 'collection'
    :param user: The user running the query.  Only returns folders that this
                 user can see.
    :param limit: Result limit.
    :param offset: Result offset.
    :param sort: The sort structure to pass to pymongo.  Child folders are
        served depth first, and this sort is applied within the resource
        and then within each child folder.
    """
    if _internal is None:
        _internal = {
            'limit': limit,
            'offset': offset,
            'done': False
        }
    for folder in Folder().childFolders(
            parentType=parentType, parent=parent, user=user,
            limit=_internal['limit'], offset=0, sort=sort, **kwargs):
        if _internal['done']:
            return
        if _internal['offset']:
            _internal['offset'] -= 1
        else:
            yield folder
            if _internal['limit']:
                _internal['limit'] -= 1
                if not _internal['limit']:
                    _internal['done'] = True
                    return
        yield from allChildFolders(
            folder, 'folder', user, sort=sort, _internal=_internal, **kwargs)


def allChildItems(parent, parentType, user, limit=0, offset=0,
                  sort=None, _internal=None, **kwargs):
    """
    This generator will yield all items that are children of the resource
    or recursively children of child folders of the resource, with access
    policy filtering.  Passes any kwargs to the find function.

    :param parent: The parent object.
    :type parentType: Type of the parent object.
    :param parentType: The parent type.
    :type parentType: 'user', 'folder', or 'collection'
    :param user: The user running the query. Only returns items that this
                 user can see.
    :param limit: Result limit.
    :param offset: Result offset.
    :param sort: The sort structure to pass to pymongo.  Child folders are
        served depth first, and this sort is applied within the resource
        and then within each child folder.  Child items are processed
        before child folders.
    """
    if _internal is None:
        _internal = {
            'limit': limit,
            'offset': offset,
            'done': False
        }
    model = ModelImporter.model(parentType)
    if hasattr(model, 'childItems'):
        if parentType == 'folder':
            kwargs = kwargs.copy()
            kwargs['includeVirtual'] = True
        for item in model.childItems(
                parent, user=user,
                limit=_internal['limit'] + _internal['offset'],
                offset=0, sort=sort, **kwargs):
            if _internal['offset']:
                _internal['offset'] -= 1
            else:
                yield item
                if _internal['limit']:
                    _internal['limit'] -= 1
                    if not _internal['limit']:
                        _internal['done'] = True
                        return
    for folder in Folder().childFolders(
            parentType=parentType, parent=parent, user=user,
            limit=0, offset=0, sort=sort, **kwargs):
        if _internal['done']:
            return
        for item in allChildItems(folder, 'folder', user, sort=sort,
                                  _internal=_internal, **kwargs):
            yield item


@access.public(scope=TokenScope.DATA_READ)
@filtermodel(model=Item)
@autoDescribeRoute(
    Description('List items that match a query.')
    .responseClass('Item', array=True)
    .jsonParam('query', 'Find items that match this Mongo query.',
               required=True, requireObject=True)
    .pagingParams(defaultSort='_id')
    .errorResponse()
)
@boundHandler()
def getItemsByQuery(self, query, limit, offset, sort):
    user = self.getCurrentUser()
    return Item().findWithPermissions(query, offset=offset, limit=limit, sort=sort, user=user)


@access.public(scope=TokenScope.DATA_READ)
@filtermodel(model=Folder)
@autoDescribeRoute(
    Description('List folders that match a query.')
    .responseClass('Folder', array=True)
    .jsonParam('query', 'Find folders that match this Mongo query.',
               required=True, requireObject=True)
    .pagingParams(defaultSort='_id')
    .errorResponse()
)
@boundHandler()
def getFoldersByQuery(self, query, limit, offset, sort):
    user = self.getCurrentUser()
    return Folder().findWithPermissions(query, offset=offset, limit=limit, sort=sort, user=user)


@access.admin
@autoDescribeRoute(
    Description('Restart the Girder REST server.')
    .notes('Must be a system administrator to call this.')
    .errorResponse('You are not a system administrator.', 403)
)
@boundHandler()
def restartServer(self):
    import datetime

    import cherrypy
    from girder.utility import config

    if not config.getConfig()['server'].get('cherrypy_server', True):
        raise RestException('Restarting of server is disabled.', 403)

    class Restart(cherrypy.process.plugins.Monitor):
        def __init__(self, bus, frequency=1):
            cherrypy.process.plugins.Monitor.__init__(
                self, bus, self.run, frequency)

        def start(self):
            cherrypy.process.plugins.Monitor.start(self)

        def run(self):
            self.bus.log('Restarting.')
            self.thread.cancel()
            self.bus.restart()

    restart = Restart(cherrypy.engine)
    restart.subscribe()
    restart.start()
    return {'restarted': datetime.datetime.utcnow()}


@autoDescribeRoute(
    Description('Report on old jobs.')
    .param('age', 'The minimum age in days.', required=False,
           dataType='int', default=1)
    .param('status', 'A comma-separated list of statuses to include.  Blank '
           'for all.', required=False, default='0,1,2')
    .errorResponse()
)
@access.admin
@boundHandler()
def getOldJobs(self, age, status):
    age = datetime.datetime.utcnow() + datetime.timedelta(-age)
    query = {'updated': {'$lt': age}}
    if status:
        query['status'] = {'$in': [int(s) for s in status.split(',')]}
    return Job().find(query, force=True).count()


@autoDescribeRoute(
    Description('Delete old jobs.')
    .param('age', 'The minimum age in days.', required=False,
           dataType='int', default=1)
    .param('status', 'A comma-separated list of statuses to include.  Blank '
           'for all.', required=False, default='0,1,2')
    .errorResponse()
)
@access.admin
@boundHandler()
def deleteOldJobs(self, age, status):
    age = datetime.datetime.utcnow() + datetime.timedelta(-age)
    query = {'updated': {'$lt': age}}
    if status:
        query['status'] = {'$in': [int(s) for s in status.split(',')]}
    count = 0
    for job in Job().find(query, force=True):
        Job().remove(job)
        count += 1
    return count


class HUIResourceResource(ResourceResource):
    def __init__(self, apiRoot):
        super(ResourceResource, self).__init__()
        # Added to the resource route
        apiRoot.resource.route('GET', (':id', 'items'), self.getResourceItems)
        apiRoot.resource.route('PUT', ('metadata',), self.putResourceMetadata)

    @describeRoute(
        Description('Get all of the items that are children of a resource.')
        .param('id', 'The ID of the resource.', paramType='path')
        .param('type', 'The type of the resource (folder, collection, or '
               'user).')
        .pagingParams(defaultSort='_id')
        .errorResponse('ID was invalid.')
        .errorResponse('Access was denied for the resource.', 403)
    )
    @access.public
    def getResourceItems(self, id, params):
        user = self.getCurrentUser()
        modelType = params['type']
        model = ModelImporter.model(modelType)
        doc = model.load(id=id, user=user, level=AccessType.READ)
        if not doc:
            raise RestException('Resource not found.')
        limit, offset, sort = self.getPagingParameters(params, '_id')
        return list(allChildItems(
            parentType=modelType, parent=doc, user=user,
            limit=limit, offset=offset, sort=sort))

    @autoDescribeRoute(
        Description('Set metadata on multiple resources at once.')
        .jsonParam('resources', 'A JSON-encoded set of resources to modify.  '
                   'Each type is a list of ids. For example: {"item": [(item '
                   'id 1), (item id 2)], "folder": [(folder id 1)]}.',
                   requireObject=True)
        .jsonParam('metadata', 'A JSON object containing the metadata keys to '
                   'add', paramType='body', requireObject=True)
        .param('allowNull', 'Whether "null" is allowed as a metadata value.',
               required=False, dataType='boolean', default=False)
        .errorResponse('Unsupported or unknown resource type.')
        .errorResponse('Invalid resources format.')
        .errorResponse('No resources specified.')
        .errorResponse('Resource not found.')
        .errorResponse('Write access was denied for a resource.', 403)
    )
    @access.public
    def putResourceMetadata(self, resources, metadata, allowNull):
        user = self.getCurrentUser()
        self._validateResourceSet(resources)
        # Validate that we have write permission for all resources; if any
        # fail, no item will be changed.
        for kind in resources:
            model = self._getResourceModel(kind, 'setMetadata')
            for id in resources[kind]:
                model.load(id=id, user=user, level=AccessType.WRITE)
        metaUpdate = {}
        for key, value in metadata.items():
            if value is None and not allowNull:
                metaUpdate.setdefault('$unset', {})['meta.' + key] = ''
            else:
                metaUpdate.setdefault('$set', {})['meta.' + key] = value
        modified = 0
        for kind in resources:
            model = self._getResourceModel(kind, 'setMetadata')
            for id in resources[kind]:
                resource = model.load(id=id, user=user, level=AccessType.WRITE)
                # We aren't using model.setMetadata, since it is more
                # restrictive than we want.
                modified += model.update({'_id': resource['_id']}, metaUpdate).modified_count
        return modified


@access.admin(scope=TokenScope.SETTINGS_READ)
@autoDescribeRoute(
    Description('Get the value of a system setting, or a list of them.')
    .notes('Must be a system administrator to call this.')
    .param('key', 'The key identifying this setting.', required=False)
    .jsonParam('list', 'A JSON list of keys representing a set of settings to return.',
               required=False, requireArray=True)
    .param('default', 'If "none", return a null value if a setting is '
           'currently the default value. If "default", return the default '
           'value of the setting(s).', required=False)
    .errorResponse('You are not a system administrator.', 403)
)
@boundHandler
def getSettingDefault(self, key, list, default=None):
    getFunc = Setting().get
    if default == 'none':
        getFunc = (lambda k: (Setting()._get(k) or {}).get('value'))
    elif default == 'default':
        getFunc = Setting().getDefault
    elif default:
        raise RestException("Default was not 'none', 'default', or blank.")
    if list is not None:
        return {k: getFunc(k) for k in list}
    else:
        self.requireParams({'key': key})
        return getFunc(key)


@access.admin
@filtermodel(model=File)
@autoDescribeRoute(
    Description('Adjust the import path of a file.')
    .responseClass('File')
    .modelParam('id', model=File, level=AccessType.ADMIN)
    .param('path', 'The new import path of the file.')
    .errorResponse('ID was invalid.')
    .errorResponse('Write access was denied on the parent folder.', 403)

)
@boundHandler()
def adjustFileImportPath(self, file, path):
    assetstore = Assetstore().load(file['assetstoreId'])
    if assetstore['type'] != AssetstoreType.FILESYSTEM or not file.get('path'):
        raise RestException('The file must be on a filesystem assetstore')
    if not os.path.exists(path):
        raise RestException('The new import path does not exist or is unreachable')
    File().getAssetstoreAdapter(file).deleteFile(file)
    file['size'] = os.path.getsize(path)
    file['imported'] = True
    file['path'] = path
    file = File().save(file)
    try:
        import girder_hashsum_download as hashsum_download

        hashsum_download._computeHash(file)
    except ImportError:
        pass
    return file
