import $ from 'jquery';
import _ from 'underscore';

import Panel from '@girder/slicer_cli_web/views/Panel';
import {AccessType} from '@girder/core/constants';
import {MetadataWidget, liMetadataKeyEntry} from '@girder/large_image/views/metadataWidget';

import metadataWidgetPanelTemplate from '../templates/panels/metadataWidgetPanel.pug';
import '../stylesheets/panels/metadataWidget.styl';

/**
 * This widget shows a list of metadata in a given item.
 */
var MetadataWidgetPanel = Panel.extend({
    events: _.extend(Panel.prototype.events, MetadataWidget.prototype.events, {
        'click .h-panel-maximize': function (event) {
            this.expand(event);
            this.$('.s-panel-content').addClass('in');
            const panelElem = this.$el.closest('.s-panel');
            const maximize = !panelElem.hasClass('h-panel-maximized');
            panelElem.toggleClass('h-panel-maximized', maximize);
            panelElem.toggleClass('s-no-panel-toggle', maximize);
        }
    }),

    /**
     * Creates a widget to display and optionally edit metadata fields.
     *
     * @param settings.item {Model} The model object whose metadata to display.
     *    Can be any model type that inherits MetadataMixin.
     * @param [settings.fieldName='meta'] {string} The name of the model attribute
     *    to display/edit. The model attribute with this name should be an object
     *    whose top level keys represent metadata keys.
     * @param [settings.title='Metadata'] {string} Title for the widget.
     * @param [settings.apiPath] {string} The relative API path to use when editing
     *    metadata keys for this model. Defaults to using the MetadataMixin default path.
     * @param [settings.accessLevel=AccessType.READ] {AccessType} The
     *    access level for this widget. Use READ for read-only, or WRITE (or greater)
     *    for adding editing capabilities as well.
     * @param [settings.onMetadataAdded] {Function} A custom callback for when a
     *    new metadata key is added to the list. If passed, will override the
     *    default behavior of calling MetadataMixin.addMetadata.
     * @param [settings.onMetadataEdited] {Function} A custom callback for when an
     *    existing metadata key is updated. If passed, will override the default
     *    behavior of calling MetadataMixin.editMetadata.
     */

    initialize: function (settings) {
        MetadataWidget.prototype.initialize.call(this, settings);
        this.panel = settings.panel === undefined ? true : settings.panel;
        // the event is created
        this.on('li-metadata-widget-update', (event) => {
            this.renderMetadataWidgetHeader(event);
        });
    },

    renderMetadataWidgetHeader: function () {
        // prevent automatically collapsing the widget after rendering again
        this.render();
    },

    render: function () {
        if (this.item && this.item.id) {
            let func = this.item.getAccessLevel;
            if (this.item.get('_modelType') === 'annotation') {
                func = (callback) => {
                    const accessLevel = this.item.getAccessLevel();
                    callback(accessLevel);
                };
            }
            func.call(this.item, (accessLevel) => {
                this.accessLevel = accessLevel;
                MetadataWidget.prototype.render.call(this);
            });
        }
        return this;
    },

    _renderHeader: function (contents) {
        contents = $(contents).closest('.btn-group.pull-right').html();
        let firstKey = this._sortedMetaKeys[0];
        let firstValue = this._renderedMetaDict[firstKey];
        firstKey = liMetadataKeyEntry(this._limetadata, firstKey) ? liMetadataKeyEntry(this._limetadata, firstKey).title || firstKey : firstKey;
        if (_.isObject(firstValue)) {
            // if the value is a json object, JSON.stringify to make it more readable
            firstValue = JSON.stringify(firstValue);
        }
        this.$el.html(metadataWidgetPanelTemplate({
            contents,
            accessLevel: this.item.attributes._accessLevel,
            AccessType,
            firstKey,
            firstValue,
            panel: this.panel,
            title: this.title,
            collapsed: this.panel && !this.$('.s-panel-content').hasClass('in') && !this.$el.closest('.s-panel').hasClass('h-panel-maximized')
        }));
        if (this.parentView && this.parentView._orderPanels) {
            this.parentView._orderPanels();
        }
    }
});

MetadataWidgetPanel.prototype.modes = MetadataWidget.prototype.modes;
MetadataWidgetPanel.prototype.setItem = MetadataWidget.prototype.setItem;
MetadataWidgetPanel.prototype.getModeFromValue = MetadataWidget.prototype.getModeFromValue;
MetadataWidgetPanel.prototype.addMetadata = function (evt, mode) {
    // expand the widget when adding new metadata
    this.$('.s-panel-content').collapse('show');
    return MetadataWidget.prototype.addMetadata.call(this, evt, mode);
};
MetadataWidgetPanel.prototype.addMetadataByKey = function (evt) {
    // expand the widget when adding new metadata
    this.$('.s-panel-content').collapse('show');
    return MetadataWidget.prototype.addMetadataByKey.call(this, evt);
};

export default MetadataWidgetPanel;
