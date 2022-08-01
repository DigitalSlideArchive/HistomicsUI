import { wrap } from '@girder/core/utilities/PluginUtils';
import HierarchyWidget from '@girder/large_image_annotation/views/hierarchyWidget';
import ItemCollection from '@girder/core/collections/ItemCollection';

wrap(HierarchyWidget, 'initialize', function (initialize, settings) {
    settings = settings || {};
    if (settings.paginated === undefined) {
        settings.paginated = true;
    }
    return initialize.call(this, settings);
});

ItemCollection.prototype.pageLimit = Math.max(250, ItemCollection.prototype.pageLimit);
