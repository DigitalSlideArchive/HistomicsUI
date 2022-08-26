import tinycolor from 'tinycolor2';
import _ from 'underscore';
import $ from 'jquery';

import View from '@girder/core/views/View';
import events from '@girder/core/events';
import { restRequest } from '@girder/core/rest';
import { getCurrentUser } from '@girder/core/auth';

import StyleModel from '../models/StyleModel';
import editStyleGroups from '../templates/dialogs/editStyleGroups.pug';
import '@girder/core/utilities/jquery/girderModal';
import '../stylesheets/dialogs/editStyleGroups.styl';

/**
 * Create a modal dialog with fields to edit and create annotation
 * style groups.
 */
const EditStyleGroups = View.extend({
    events: {
        'click .h-create-new-style': '_createNewStyle',
        'click .h-save-new-style': '_saveNewStyle',
        'click .h-delete-style': '_deleteStyle',
        'click #h-reset-defaults': '_resetDefaults',
        'click #h-set-defaults': '_setDefaults',
        'click #h-export': '_exportGroups',
        'click #h-import': '_selectImportGroups',
        'click #h-import-replace': '_toggleImportReplace',
        'change #h-import-groups': '_importGroups',
        'change .h-style-def': '_updateStyle',
        'changeColor .h-colorpicker': '_updateStyle',
        'change select': '_setStyle'
    },

    render() {
        this.$('.h-colorpicker').colorpicker('destroy');
        this.$el.html(
            editStyleGroups({
                collection: this.collection,
                model: this.model,
                newStyle: this._newStyle,
                user: getCurrentUser() || {}
            })
        );
        this.$('.h-colorpicker').colorpicker();
        return this;
    },

    _setStyle(evt) {
        evt.preventDefault();
        this.model.set(
            this.collection.get(this.$('.h-group-name').val()).toJSON()
        );
        this.render();
    },

    _updateStyle(evt) {
        evt.preventDefault();

        const data = {};
        const label = this.$('#h-element-label').val();
        let validation = '';

        data.id = this.$('.h-group-name :selected').val() || this.$('.h-new-group-name').val().trim();
        if (!data.id) {
            validation += 'A style name is required';
            this.$('.h-new-group-name').parent().addClass('has-error');
        }
        data.label = label ? {value: label} : {};
        const group = data.id;
        data.group = group && group !== this._defaultGroup ? group : undefined;

        const lineWidth = this.$('#h-element-line-width').val();
        if (lineWidth) {
            data.lineWidth = parseFloat(lineWidth);
            if (data.lineWidth < 0 || !isFinite(data.lineWidth)) {
                validation += 'Invalid line width. ';
                this.$('#h-element-line-width').parent().addClass('has-error');
            }
        }

        const lineColor = this.$('#h-element-line-color').val();
        if (lineColor) {
            data.lineColor = this.convertColor(lineColor);
        }

        const fillColor = this.$('#h-element-fill-color').val();
        if (fillColor) {
            data.fillColor = this.convertColor(fillColor);
        }

        if (validation) {
            this.$('.g-validation-failed-message').text(validation)
                .removeClass('hidden');
        }

        this.model.set(data);
    },

    /**
     * A helper function converting a string into normalized rgb/rgba
     * color value.  If no value is given, then it returns a color
     * with opacity 0.
     */
    convertColor(val) {
        if (!val) {
            return 'rgba(0,0,0,0)';
        }
        return tinycolor(val).toRgbString();
    },

    _createNewStyle(evt) {
        evt.preventDefault();
        this._newStyle = true;
        this.render();
    },

    _saveNewStyle(evt) {
        this._updateStyle(evt);
        this._newStyle = false;
        this.collection.create(this.model.toJSON());
        this.render();
    },

    _deleteStyle(evt) {
        evt.preventDefault();
        // if we are creating a new style, cancel that and go back to a
        // previous style.
        if (this._newStyle) {
            this._newStyle = false;
        } else {
            const id = this.$('.h-group-name :selected').val();
            var model = this.collection.get(id);
            model.destroy();
            this.collection.remove(model);
        }
        this.model.set(this.collection.at(0).toJSON());
        this.render();
    },

    _resetDefaults(evt) {
        restRequest({
            method: 'GET',
            url: 'histomicsui/settings'
        }).done((resp) => {
            var styleJSON = resp['histomicsui.default_draw_styles'],
                oldid = this.model && this.model.id,
                styles = [], styleModels;
            styles = styleJSON ? JSON.parse(styleJSON) : [];
            styleModels = _.map(styles, function (style) {
                return new StyleModel(style);
            });
            while (this.collection.length) {
                this.collection.first().destroy();
            }
            this.collection.reset(styleModels);
            // make sure we have at least a default style
            if (!this.collection.get(this._defaultGroup)) {
                this.collection.push(new StyleModel({id: this._defaultGroup}));
            }
            this.model.set(this.collection.at(0).toJSON());
            if (oldid && this.collection.get(oldid)) {
                this.model.set(this.collection.get(oldid).toJSON());
            }
            this.collection.each((model) => { model.save(); });
            this._newStyle = false;
            this.render();
        });
    },

    _setDefaults(evt) {
        return restRequest({
            method: 'PUT',
            url: 'system/setting',
            data: {
                list: JSON.stringify([{
                    key: 'histomicsui.default_draw_styles',
                    value: JSON.stringify(this.collection.toJSON())
                }])
            }
        }).done(() => {
            events.trigger('g:alert', {
                icon: 'ok',
                text: 'Settings saved.',
                type: 'success',
                timeout: 4000
            });
        });
    },

    _exportGroups(evt) {
        this.collection.add(this.model.toJSON(), {merge: true});
        var data = new Blob([JSON.stringify(this.collection.toJSON(), undefined, 2)], {type: 'text/plain'});
        var url = window.URL.createObjectURL(data);
        this.$el.find('#h-export-link').attr('href', url);
        this.$el.find('#h-export-link')[0].click();
    },

    _selectImportGroups(evt) {
        this.$el.find('#h-import-groups').click();
    },

    _toggleImportReplace(evt) {
        evt.stopPropagation();
    },

    _importGroups(evt) {
        // disable the UI until we succeed or fail
        this.$el.find('input').girderEnable(false);
        var replace = this.$el.find('#h-import-replace').prop('checked');
        var files = evt.target.files;
        if (files.length === 1) {
            var fr = new FileReader();
            fr.onload = (evt) => {
                this.$el.find('input').girderEnable(true);
                try {
                    var groups = JSON.parse(evt.target.result);
                    var styleModels = groups.map((group) => {
                        return new StyleModel(group);
                    });
                } catch (err) {
                    this.$('.g-validation-failed-message').text('Failed to parse style specifications.').removeClass('hidden');
                    return;
                }
                if (replace) {
                    // remove all if we are replacing
                    while (this.collection.length) {
                        this.collection.first().destroy();
                    }
                    this.collection.reset(styleModels);
                } else {
                    // For merge, completely replace existing styles
                    for (var i = this.collection.length - 1; i >= 0; i -= 1) {
                        if (styleModels.some((model) => model.id === this.collection.at(i).id)) {
                            this.collection.at(i).destroy();
                        }
                    }
                    this.collection.add(styleModels, {merge: true});
                }
                // make sure we have at least a default style
                if (!this.collection.get(this._defaultGroup)) {
                    this.collection.push(new StyleModel({id: this._defaultGroup}));
                }
                this.model.set(this.collection.at(0).toJSON());
                this.collection.each((model) => { model.save(); });
                this._newStyle = false;
                this.$('.g-validation-failed-message').addClass('hidden');
                this.render();
            };
            fr.onerror = (evt) => {
                this.$el.find('input').girderEnable(true);
                this.$('.g-validation-failed-message').text('Failed to read file').removeClass('hidden');
            };
            fr.readAsText(files[0]);
        }
    }
});

const EditStyleGroupsDialog = View.extend({
    events: {
        'click .h-submit': '_submit',
        'click .h-cancel': '_cancelChanges'
    },

    initialize() {
        // save the collection and current model so we can restore everything
        // when we cancel
        this.originalCollectionData = this.collection.toJSON();
        this.originalModelData = this.model.toJSON();
        this.originalModelId = this.model.id;
        this.form = new EditStyleGroups({
            parentView: this,
            model: new StyleModel(this.model.toJSON()),
            collection: this.collection
        });
    },

    render() {
        this.$el.html('<div class="h-style-editor"/>');
        this.form.setElement(this.$('.h-style-editor')).render();
        this.$el.girderModal(this);
        return this;
    },

    _submit(evt) {
        evt.preventDefault();
        this.model.set(this.form.model.toJSON());
        this.collection.add(this.form.model.toJSON(), {merge: true});
        this.collection.get(this.model.id).save();
        this.$el.modal('hide');
    },

    _cancelChanges(evt) {
        var styleModels = _.map(this.originalCollectionData, function (style) {
            return new StyleModel(style);
        });
        while (this.collection.length) {
            this.collection.first().destroy();
        }
        this.collection.reset(styleModels, {merge: true});
        this.model.set(this.originalModelData);
        this.collection.each((model) => { model.save(); });
    }
});

/**
 * Show the edit dialog box.  Watch for change events on the passed
 * `ElementModel` to respond to user submission of the form.
 *
 * @param {StyleGroupCollection} collection
 * @returns {EditStyleGroup} The dialog's view
 */
function show(style, groups, defaultGroup) {
    const dialog = new EditStyleGroupsDialog({
        parentView: null,
        collection: groups,
        model: style,
        el: $('#g-dialog-container')
    });
    dialog.form._defaultGroup = defaultGroup || 'default';
    return dialog.render();
}

export default show;
