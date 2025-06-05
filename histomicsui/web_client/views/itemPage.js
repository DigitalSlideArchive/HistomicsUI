import {HuiSettings} from './utils';

import '../stylesheets/views/itemList.styl';

const {wrap} = girder.utilities.PluginUtils;
const {restRequest} = girder.rest;
const events = girder.events;
const ItemView = girder.views.body.ItemView;

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
            this.model.fetch({success: () => this.render()});
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
            if (!this.$el.find('.g-hui-open-item[role="button"]').length && this.model.attributes.largeImage) {
                this.$el.find('.g-item-header .btn-group').before(
                    `<a class="g-hui-open-item btn btn-sm btn-primary" role="button" href="${webrootPath}#?image=${this.model.id}" target="_blank">
                            <i class="icon-link-ext"></i>Open in ${brandName}
                    </a>`
                );
            }
            this.events['click .g-hui-quarantine-item'] = quarantine;
            this.delegateEvents();
            return settings;
        });
    });
    render.call(this);
});
