import $ from 'jquery';
import _ from 'underscore';
import View from '@girder/core/views/View';

import PluginConfigBreadcrumbWidget from '@girder/core/views/widgets/PluginConfigBreadcrumbWidget';
import BrowserWidget from '@girder/core/views/widgets/BrowserWidget';
import {restRequest} from '@girder/core/rest';
import events from '@girder/core/events';
import router from '@girder/core/router';

import {HuiSettings} from '../utils';

import ConfigViewTemplate from '../../templates/body/configView.pug';
import '../../stylesheets/body/configView.styl';

/**
 * Show the default quota settings for users and collections.
 */
var ConfigView = View.extend({
    events: {
        'click #g-hui-save': function (event) {
            this.$('#g-hui-error-message').text('');
            var settings = _.map(this.settingsKeys, (key) => {
                const element = this.$('#g-' + key.replace('histomicsui', 'hui').replace(/[_.]/g, '-'));
                var result = {
                    key,
                    value: element.val() || null
                };
                switch (key) {
                    case 'histomicsui.quarantine_folder':
                        result.value = result.value ? result.value.split(' ')[0] : '';
                        break;
                    case 'histomicsui.delete_annotations_after_ingest':
                        result.value = this.$('.g-hui-delete-annotations-after-ingest').prop('checked');
                        break;
                    case 'histomicsui.help_url':
                    case 'histomicsui.help_tooltip':
                    case 'histomicsui.help_text':
                    case 'histomicsui.login_text':
                        result.value = result.value === null || !result.value.trim() ? '' : result.value;
                        break;
                }
                return result;
            });
            this._saveSettings(settings);
        },
        'click #g-hui-brand-default-color': function () {
            this.$('#g-hui-brand-color').val(this.defaults['histomicsui.brand_color']);
        },
        'click #g-hui-banner-default-color': function () {
            this.$('#g-hui-banner-color').val(this.defaults['histomicsui.banner_color']);
        },
        'click #g-hui-help-default-url': function () {
            this.$('#g-hui-help-url').val(this.defaults['histomicsui.help_url']);
            this.$('#g-hui-help-url').trigger('change');
        },
        'click #g-hui-help-default-text': function () {
            this.$('#g-hui-help-text').val(this.defaults['histomicsui.help_text']);
        },
        'click #g-hui-help-default-tooltip': function () {
            this.$('#g-hui-help-tooltip').val(this.defaults['histomicsui.help_tooltip']);
        },
        'click #g-hui-cancel': function (event) {
            router.navigate('plugins', {trigger: true});
        },
        'change #g-hui-help-url': function (event) {
            if (this.$('#g-hui-help-url').val().trim() === '') {
                this.$('#g-hui-help-text-container').children().attr('disabled', 'disabled');
                this.$('#g-hui-help-tooltip-container').children().attr('disabled', 'disabled');
            } else {
                this.$('#g-hui-help-text-container').children().removeAttr('disabled');
                this.$('#g-hui-help-tooltip-container').children().removeAttr('disabled');
            }
        },
        'click .g-open-browser': '_openBrowser'
    },
    initialize: function () {
        this.breadcrumb = new PluginConfigBreadcrumbWidget({
            pluginName: 'HistomicsUI',
            parentView: this
        });

        this.settingsKeys = [
            'histomicsui.webroot_path',
            'histomicsui.brand_name',
            'histomicsui.brand_color',
            'histomicsui.banner_color',
            'histomicsui.default_draw_styles',
            'histomicsui.panel_layout',
            'histomicsui.quarantine_folder',
            'histomicsui.delete_annotations_after_ingest',
            'histomicsui.help_url',
            'histomicsui.help_tooltip',
            'histomicsui.help_text',
            'histomicsui.login_text'
        ];
        $.when(
            restRequest({
                method: 'GET',
                url: 'system/setting/default',
                data: {
                    list: JSON.stringify(this.settingsKeys),
                    default: 'none'
                }
            }).done((resp) => {
                this.settings = resp;
            }),
            restRequest({
                method: 'GET',
                url: 'system/setting/default',
                data: {
                    list: JSON.stringify(this.settingsKeys),
                    default: 'default'
                }
            }).done((resp) => {
                this.defaults = resp;
            })
        ).done(() => {
            this.render();
        });

        this._browserWidgetView = new BrowserWidget({
            parentView: this,
            titleText: 'Quarantine Destination',
            helpText: 'Browse to a location to select it as the destination.',
            submitText: 'Select Destination',
            validate: function (model) {
                const isValid = $.Deferred();
                if (!model || model.get('_modelType') !== 'folder') {
                    isValid.reject('Please select a folder.');
                } else {
                    isValid.resolve();
                }
                return isValid.promise();
            }
        });
        this.listenTo(this._browserWidgetView, 'g:saved', function (val) {
            this.$('#g-hui-quarantine-folder').val(val.id);
            restRequest({
                url: `resource/${val.id}/path`,
                method: 'GET',
                data: {type: val.get('_modelType')}
            }).done((result) => {
                // Only add the resource path if the value wasn't altered
                if (this.$('#g-hui-quarantine-folder').val() === val.id) {
                    this.$('#g-hui-quarantine-folder').val(`${val.id} (${result})`);
                }
            });
        });
    },

    render: function () {
        this.$el.html(ConfigViewTemplate({
            settings: this.settings,
            defaults: this.defaults
        }));
        this.$('#g-hui-help-url').trigger('change');
        this.breadcrumb.setElement(this.$('.g-config-breadcrumb-container')).render();
        return this;
    },

    _saveSettings: function (settings) {
        return restRequest({
            method: 'PUT',
            url: 'system/setting',
            data: {
                list: JSON.stringify(settings)
            },
            error: null
        }).done(() => {
            HuiSettings.clearSettingsCache();
            events.trigger('g:alert', {
                icon: 'ok',
                text: 'Settings saved.',
                type: 'success',
                timeout: 4000
            });
        }).fail((resp) => {
            this.$('#g-hui-error-message').text(
                resp.responseJSON.message
            );
        });
    },

    _openBrowser: function () {
        this._browserWidgetView.setElement($('#g-dialog-container')).render();
    }
});

export default ConfigView;
