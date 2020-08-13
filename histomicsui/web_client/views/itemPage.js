import { wrap } from '@girder/core/utilities/PluginUtils';
import { restRequest } from '@girder/core/rest';
import events from '@girder/core/events';
import ItemView from '@girder/core/views/body/ItemView';

import { HuiSettings } from './utils';

import '../stylesheets/views/itemList.styl';

wrap(ItemView, 'render', function (render) {
    function quarantine(event) {
        const item = this.model;
        restRequest({
            type: 'PUT',
            url: 'histomicsui/quarantine/' + item.id,
            error: null
        }).done((resp) => {
            events.trigger('g:alert', {
                icon: 'ok',
                text: 'Item quarantined.',
                type: 'success',
                timeout: 4000
            });
            delete this.model.parent;
            this.model.fetch({ success: () => this.render() });
        }).fail((resp) => {
            events.trigger('g:alert', {
                icon: 'cancel',
                text: 'Failed to quarantine item.',
                type: 'danger',
                timeout: 4000
            });
        });
    }
    this.once('g:rendered', function () {
        HuiSettings.getSettings().then((settings) => {
            const brandName = (settings['histomicsui.brand_name'] || '');
            const webrootPath = (settings['histomicsui.webroot_path'] || '');
            if (this.$el.find('.g-edit-item[role="menuitem"]').length && !this.$el.find('.g-hui-quarantine-item[role="menuitem"]').length) {
                this.$el.find('.g-edit-item[role="menuitem"]').parent('li').after(
                    '<li role="presentation"><a class="g-hui-quarantine-item" role="menuitem"><span>Q</span>Quarantine item</a></li>'
                );
            }
            if (this.$el.find('.g-item-actions-menu').length && !this.$el.find('.g-hui-open-item[role="menuitem"]').length &&
                this.model.attributes.largeImage) {
                this.$el.find('.g-item-actions-menu').prepend(
                    `<li role="presentation">
                    <a class="g-hui-open-item" role="menuitem" href="${webrootPath}#?image=${this.model.id}" target="_blank">
                        <i class="icon-link-ext"></i>Open in ${brandName}
                    </a>
                </li>`
                );
            }
            this.events['click .g-hui-quarantine-item'] = quarantine;
            this.delegateEvents();
            return settings;
        });
    });
    render.call(this);
});
