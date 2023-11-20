import events from '@girder/core/events';
import router from '@girder/core/router';

import {registerPluginNamespace} from '@girder/core/pluginUtils';
import {exposePluginConfig} from '@girder/core/utilities/PluginUtils';

// expose symbols under girder.plugins
import * as histomicsui from '@girder/histomicsui';

// import modules for side effects
import './views/itemList';
import './views/itemPage';
import './views/HierarchyWidget';
import './views/searchResultsView';
import './views/JobDetailsWidget';

import ConfigView from './views/body/ConfigView';

const pluginName = 'histomicsui';
const configRoute = `plugins/${pluginName}/config`;

registerPluginNamespace(pluginName, histomicsui);

exposePluginConfig(pluginName, configRoute);

router.route(configRoute, 'HistomicsUIConfig', function () {
    events.trigger('g:navigateTo', ConfigView);
});
