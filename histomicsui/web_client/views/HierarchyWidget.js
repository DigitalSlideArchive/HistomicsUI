const {wrap} = girder.utilities.PluginUtils;
const HierarchyWidget = girder.views.widgets.HierarchyWidget;
const ItemCollection = girder.collections.ItemCollection;

wrap(HierarchyWidget, 'initialize', function (initialize, settings) {
    settings = settings || {};
    if (settings.paginated === undefined) {
        settings.paginated = true;
    }
    return initialize.call(this, settings);
});

ItemCollection.prototype.pageLimit = Math.max(250, ItemCollection.prototype.pageLimit);
