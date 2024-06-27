import * as histomicsui from './index';
import ConfigView from './views/body/ConfigView';

const events = girder.events;
const router = girder.router;

const { registerPluginNamespace } = girder.pluginUtils;
const { exposePluginConfig } = girder.utilities.PluginUtils;

const pluginName = 'histomicsui';
const configRoute = `plugins/${pluginName}/config`;

registerPluginNamespace(pluginName, histomicsui);

exposePluginConfig(pluginName, configRoute);

router.route(configRoute, 'HistomicsUIConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});
