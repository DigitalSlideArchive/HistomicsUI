import { wrap } from '@girder/core/utilities/PluginUtils';
import HierarchyWidget from '@girder/core/views/widgets/HierarchyWidget';
import ItemCollection from '@girder/core/collections/ItemCollection';
import { HuiSettings } from './utils';

wrap(HierarchyWidget, 'initialize', function (initialize, settings) {
    settings = settings || {};
    if (settings.paginated === undefined) {
        settings.paginated = true;
    }

    return initialize.call(this, settings);
});

wrap(HierarchyWidget, 'render', function (render) {
    render.call(this);
    HuiSettings.getSettings().then((settings) => {
        if (this.itemListView) {
            const webrootPath = (settings['histomicsui.webroot_path'] || '');
            const folderMetadata = this.parentModel.get('meta');
            const activeLearningFolder = folderMetadata['active_learning'];
            if (activeLearningFolder && !this.$el.find('.g-hui-open-active-learning').length) {
                const btnContainer = this.$el.find('.g-folder-header-buttons');
                btnContainer.prepend(
                    `<a class="g-hui-open-active-learning btn btn-sm btn-primary" role="button" href="${webrootPath}#/active-learning?folder=${this.parentModel.id}" target="_blank">
                        <i class="icon-link-ext"></i>Active Learning
                    </a>`
                );
            }
        }
    });
});

ItemCollection.prototype.pageLimit = Math.max(250, ItemCollection.prototype.pageLimit);
