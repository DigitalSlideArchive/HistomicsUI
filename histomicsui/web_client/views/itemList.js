import $ from 'jquery';

import {wrap} from '@girder/core/utilities/PluginUtils';
import {AccessType} from '@girder/core/constants';
import {restRequest} from '@girder/core/rest';
import events from '@girder/core/events';
import ItemListWidget from '@girder/large_image/views/itemList';

import {HuiSettings} from './utils';

import '../stylesheets/views/itemList.styl';

wrap(ItemListWidget, 'render', function (render) {
    const root = this;

    render.call(this);

    function adjustView(settings) {
        if (!settings || !settings['histomicsui.quarantine_folder']) {
            return;
        }
        for (let ix = 0; ix < this.collection.length; ix++) {
            if (!this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') .g-hui-quarantine').length) {
                this.$el.find('.g-item-list li.g-item-list-entry:eq(' + ix + ') a[class^=g-]:last').after(
                    $('<a class="g-hui-quarantine"><span>Q</span></a>').attr({
                        'g-item-cid': this.collection.models[ix].cid,
                        title: 'Move this item to the quarantine folder'
                    })
                );
            }
        }
    }

    function quarantine(event) {
        const target = $(event.currentTarget);
        const cid = target.attr('g-item-cid');
        const item = root.collection.get(cid);
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
            root.trigger('g:changed');
            if (root.parentView && root.parentView.setCurrentModel && root.parentView.parentModel) {
                root.parentView.setCurrentModel(root.parentView.parentModel, {setRoute: false});
            } else {
                target.closest('.g-item-list-entry').remove();
            }
        }).fail((resp) => {
            events.trigger('g:alert', {
                icon: 'cancel',
                text: 'Failed to quarantine item.',
                type: 'danger',
                timeout: 4000
            });
        });
    }

    HuiSettings.getSettings().then((settings) => {
        if (this.accessLevel >= AccessType.WRITE) {
            adjustView.call(this, settings);
        }
        return settings;
    });

    if (this.accessLevel >= AccessType.WRITE) {
        this.events['click .g-hui-quarantine'] = quarantine;
        this.delegateEvents();
    }
});

HuiSettings.getSettings().then((settings) => {
    const brandName = (settings['histomicsui.brand_name'] || 'HistomicsUI');
    const webrootPath = (settings['histomicsui.webroot_path'] || 'histomics');

    ItemListWidget.registeredApplications.histomicsui = {
        name: brandName,
        // icon:
        check: (modelType, model) => {
            if (modelType !== 'item' || !model.get('largeImage')) {
                return false;
            }
            const li = model.get('largeImage');
            if (!li.fileId || li.expected === true) {
                return false;
            }
            let priority = 0;
            try {
                if (model.get('meta') && model.get('meta').dicom && model.get('meta').dicom.Modality && model.get('meta').dicom.Modality !== 'SM') {
                    priority = 1;
                }
            } catch (e) {}
            return {
                url: `${webrootPath}#?image=${model.id}`,
                priority: priority
            };
        }
    };
    return settings;
});
