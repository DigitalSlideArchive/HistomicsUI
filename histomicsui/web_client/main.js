const events = girder.events;
const router = girder.router;

const { registerPluginNamespace } = girder.pluginUtils;
const { exposePluginConfig } = girder.utilities.PluginUtils;

// import modules for side effects
import './views/itemList';
import './views/itemPage';
import './views/HierarchyWidget';
import './views/searchResultsView';
import './views/JobDetailsWidget';

import ConfigView from './views/body/ConfigView';

const pluginName = 'histomicsui';
const configRoute = `plugins/${pluginName}/config`;

registerPluginNamespace(pluginName, pluginName);

exposePluginConfig(pluginName, configRoute);

router.route(configRoute, 'HistomicsUIConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});
