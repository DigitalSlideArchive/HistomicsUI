import os

import cherrypy
from girder import constants, plugin, __version__
from girder.constants import ServerMode
from girder.models.setting import Setting
from girder.utility import config, server, webroot


def configure(mode: str) -> dict:
    cur_config = config.getConfig()

    appconf = {
        '/': {
            'request.dispatch': cherrypy.dispatch.MethodDispatcher(),
            'request.show_tracebacks': mode == ServerMode.TESTING,
            'request.methods_with_bodies': ('POST', 'PUT', 'PATCH'),
            'response.headers.server': 'Girder %s' % __version__,
            'error_page.default': server._errorDefault
        }
    }

    cur_config.update(appconf)
    cur_config['server']['mode'] = mode

    # Don't import this until after the configs have been read; some module
    # initialization code requires the configuration to be set up.
    # TODO is the above comment (copied from girder) correct? If so, that's bad.
    from girder.api import api_main

    root = webroot.Webroot()
    api_main.addApiToNode(root)  # this does not have side effects, it only modifies `root`

    return {
        'config': appconf,
        'serverRoot': root,
        # This previously had a "serverRootPath" key, but nobody was using it
        'apiRoot': root.api.v1,
    }


def create_wsgi_app(info: dict) -> cherrypy._cptree.Tree:
    """
    This is an attempt at a side effect-free WSGI app creation

    Removed side effects:
      * setupCache() call
      * Global registration of new mime types
      * girder.events.setupDaemon() call
      * Setup of cherrypy.engine callbacks and cherrypy.engine configuration
      * cherrypy.tree is a global instance of Tree, so we use our own instance instead
    Some remaining side effects:
      * cherrypy.config is global and mutated
      * Loading plugins may mutate global state, and may be non-idempotent
    """
    pluginWebroots = plugin.getPluginWebroots()
    girderWebroot = info['serverRoot']
    routeTable = server.loadRouteTable(reconcileRoutes=True)

    tree = cherrypy._cptree.Tree()
    tree.mount(girderWebroot, str(routeTable[constants.GIRDER_ROUTE_ID]), info['config'])
    tree.mount(None, '/static', {
        '/': {
            'tools.staticdir.on': True,
            'tools.staticdir.dir': os.path.join(constants.STATIC_ROOT_DIR),
            'request.show_tracebacks': info['config']['/']['request.show_tracebacks'],
            'response.headers.server': 'Girder %s' % __version__,
            'error_page.default': server._errorDefault,
        }
    })

    # Mount everything else in the routeTable
    for name, route in routeTable.items():
        if name != constants.GIRDER_ROUTE_ID and name in pluginWebroots:
            tree.mount(pluginWebroots[name], route, info['config'])

    return tree


# TODO do we need to call _setupCache for HistomicsUI?
# TODO database configuration? Other env vars?
# TODO log configuration?

# Set the broker from the environment
broker = os.getenv('GIRDER_BROKER_URI')
if broker and Setting.get('worker.broker') != broker:
    Setting().set('worker.broker', broker)
    Setting().set('worker.backend', broker)  # We actually want this to be null, but girder_worker doesn't allow that right now

info = configure(mode=os.environ.get('GIRDER_SERVER_MODE', ServerMode.PRODUCTION))
app = create_wsgi_app(info)
plugin._loadPlugins(info)
