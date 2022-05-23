/* globals geo */
import _ from 'underscore';
import $ from 'jquery';

import events from '@girder/core/events';
import Panel from '@girder/slicer_cli_web/views/Panel';

import StyleCollection from '../collections/StyleCollection';
import StyleModel from '../models/StyleModel';
import editElement from '../dialogs/editElement';
import editStyleGroups from '../dialogs/editStyleGroups';
import setConstraints from '../dialogs/setConstraints';
import drawWidget from '../templates/panels/drawWidget.pug';
import '../stylesheets/panels/drawWidget.styl';

const CONSTRAINTS = {
    unconstrained: 'Unconstrained',
    fixedAspectRatio: 'Fixed Aspect Ratio',
    fixedSize: 'Fixed Size'
};

/**
 * Create a panel with controls to draw and edit
 * annotation elements.
 */
var DrawWidget = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .h-edit-element': 'editElement',
        'click .h-delete-element': 'deleteElement',
        'click .h-draw': 'drawElement',
        'change .h-style-group': '_setToSelectedStyleGroup',
        'click .h-configure-style-group': '_styleGroupEditor',
        'change .h-drawing-constraints': '_setDrawingConstraint',
        'click .h-configure-h-drawing-constraints': '_drawingConstraintEditor',
        'mouseenter .h-element': '_highlightElement',
        'mouseleave .h-element': '_unhighlightElement'
    }),

    /**
     * Create the panel.
     *
     * @param {object} settings
     * @param {ItemModel} settings.image
     *     The associate large_image "item"
     */
    initialize(settings) {
        this.image = settings.image;
        this.annotation = settings.annotation;
        this.collection = this.annotation.elements();
        this.viewer = settings.viewer;
        this.setViewer(settings.viewer);
        this._drawingType = settings.drawingType || null;

        this._highlighted = {};
        this._groups = new StyleCollection();
        this._style = new StyleModel({id: 'default'});
        this.listenTo(this._groups, 'add change', this._handleStyleGroupsUpdate);
        this.listenTo(this._groups, 'remove', this.render);
        this.listenTo(this.collection, 'add remove reset', this._recalculateGroupAggregation);
        this.listenTo(this.collection, 'change update reset', this.render);
        this._groups.fetch().done(() => {
            // ensure the default style exists
            if (this._groups.has('default')) {
                this._style.set(this._groups.get('default').toJSON());
            } else {
                this._groups.add(this._style.toJSON());
                this._groups.get(this._style.id).save();
            }
        });
        this.on('h:mouseon', (model) => {
            if (model && model.id) {
                this._highlighted[model.id] = true;
                this.$(`.h-element[data-id="${model.id}"]`).addClass('h-highlight-element');
            }
        });
        this.on('h:mouseoff', (model) => {
            if (model && model.id) {
                this._highlighted[model.id] = false;
                this.$(`.h-element[data-id="${model.id}"]`).removeClass('h-highlight-element');
            }
        });
    },

    render(updatedElement) {
        this.$('[data-toggle="tooltip"]').tooltip('destroy');
        if (!this.viewer) {
            this.$el.empty();
            delete this._skipRenderHTML;
            return;
        }
        const name = (this.annotation.get('annotation') || {}).name || 'Untitled';
        if (!updatedElement || (updatedElement.attributes && updatedElement.get('type') !== 'pixelmap')) {
            this.trigger('h:redraw', this.annotation);
        }
        if (this._skipRenderHTML) {
            delete this._skipRenderHTML;
        } else {
            this.$el.html(drawWidget({
                title: 'Draw',
                elements: this.collection.models,
                groups: this._groups,
                style: this._style.id,
                highlighted: this._highlighted,
                name,
                collapsed: this.$('.s-panel-content.collapse').length && !this.$('.s-panel-content').hasClass('in'),
                // Enable constraints dropdown if rectangle or ellipse is selected
                constraints: ['rectangle', 'ellipse'].includes(this.drawingType()) ? Object.values(CONSTRAINTS) : [],
                selectedConstraint: localStorage.getItem(`h-${this.drawingType()}-mode` || CONSTRAINTS.unconstrained)
            }));
        }
        this.$('button.h-draw[data-type]').removeClass('active');
        if (this._drawingType) {
            this.$('button.h-draw[data-type="' + this._drawingType + '"]').addClass('active');
            this.drawElement(undefined, this._drawingType);
        }
        this.$('[data-toggle="tooltip"]').tooltip({container: 'body'});
        if (this.viewer.annotationLayer && this.viewer.annotationLayer._boundHUIModeChange === undefined) {
            this.viewer.annotationLayer._boundHUIModeChange = true;
            this.viewer.annotationLayer.geoOn(geo.event.annotation.mode, (event) => {
                if (event.mode === this.viewer.annotationLayer.modes.edit || event.oldmode === this.viewer.annotationLayer.modes.edit) {
                    return;
                }
                this.$('button.h-draw').removeClass('active');
                if (this._drawingType) {
                    this.$('button.h-draw[data-type="' + this._drawingType + '"]').addClass('active');
                }
                if (event.mode !== this._drawingType && this._drawingType) {
                    /* This makes the draw modes stay on until toggled off.
                     * To turn off drawing after each annotation, add
                     *  this._drawingType = null;
                     */
                    this.drawElement(undefined, this._drawingType);
                }
            });
        }
        return this;
    },

    /**
     * When a region should be drawn that isn't caused by a drawing button,
     * toggle off the drawing mode.
     *
     * @param {event} Girder event that triggered drawing a region.
     */
    _widgetDrawRegion(evt) {
        this._drawingType = null;
        this.$('button.h-draw').removeClass('active');
    },

    /**
     * Set the image "viewer" instance.  This should be a subclass
     * of `large_image/imageViewerWidget` that is capable of rendering
     * annotations.
     */
    setViewer(viewer) {
        this.viewer = viewer;
        // make sure our listeners are in the correct order.
        this.stopListening(events, 's:widgetDrawRegion', this._widgetDrawRegion);
        if (viewer) {
            this.listenTo(events, 's:widgetDrawRegion', this._widgetDrawRegion);
            viewer.stopListening(events, 's:widgetDrawRegion', viewer.drawRegion);
            viewer.listenTo(events, 's:widgetDrawRegion', viewer.drawRegion);
        }
        return this;
    },

    /**
     * Respond to a click on the "edit" button by rendering
     * the EditAnnotation modal dialog.
     */
    editElement(evt) {
        var dialog = editElement(this.collection.get(this._getId(evt)));
        this.listenTo(dialog, 'h:editElement', (obj) => {
            // update the html immediately instead of rerendering it
            let id = obj.element.id,
                label = (obj.data.label || {}).value,
                elemType = obj.element.get('type');
            label = label || (elemType === 'polyline' ? (obj.element.get('closed') ? 'polygon' : 'line') : elemType);
            this.$(`.h-element[data-id="${id}"] .h-element-label`).text(label).attr('title', label);
            this._skipRenderHTML = true;
        });
    },

    /**
     * Respond to a click on the "delete" button by removing
     * the element from the element collection.
     */
    deleteElement(evt) {
        let id = this._getId(evt);
        this.$(`.h-element[data-id="${id}"]`).remove();
        this._skipRenderHTML = true;
        this.collection.remove(id);
    },

    /**
     * Respond to clicking an element type by putting the image
     * viewer into "draw" mode.
     *
     * @param {jQuery.Event} [evt] The button click that triggered this event.
     *      `undefined` to use a passed-in type.
     * @param {string|null} [type] If `evt` is `undefined`, switch to this draw
     *      mode.
     */
    drawElement(evt, type) {
        var $el;
        if (evt) {
            $el = this.$(evt.currentTarget);
            $el.tooltip('hide');
            type = $el.hasClass('active') ? null : $el.data('type');
        } else {
            $el = this.$('button.h-draw[data-type="' + type + '"]');
        }
        if (this.viewer.annotationLayer.mode() === type && this._drawingType === type) {
            return;
        }
        if (this.viewer.annotationLayer.mode()) {
            this._drawingType = null;
            this.viewer.annotationLayer.mode(null);
            this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
            this.viewer.annotationLayer.removeAllAnnotations();
        }
        if (type) {
            // always show the active annotation when drawing a new element
            this.annotation.set('displayed', true);

            this._drawingType = type;
            this.viewer.startDrawMode(type)
                .then((element) => {
                    this.collection.add(
                        _.map(element, (el) => _.extend(el, _.omit(this._style.toJSON(), 'id')))
                    );
                    return undefined;
                });
        }
        this.$('button.h-draw[data-type]').removeClass('active');
        if (this._drawingType) {
            this.$('button.h-draw[data-type="' + this._drawingType + '"]').addClass('active');
        }
        this.render();
    },

    cancelDrawMode() {
        this.drawElement(undefined, null);
        this.viewer.annotationLayer._boundHUIModeChange = false;
        this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
    },

    drawingType() {
        return this._drawingType;
    },

    /**
     * Get the element id from a click event.
     */
    _getId(evt) {
        return this.$(evt.currentTarget).parent('.h-element').data('id');
    },

    _setStyleGroup(group) {
        this._style.set(group);
        if (!this._style.get('group') && this._style.id !== 'default') {
            this._style.set('group', this._style.id);
        }
        this.$('.h-style-group').val(group.id);
    },

    _setToSelectedStyleGroup() {
        this._setStyleGroup(this._groups.get(this.$('.h-style-group').val()).toJSON());
    },

    /**
     * Set the style group to the next available group in the dropdown.
     *
     * If the currently selected group is the last group in the dropdown,
     * the first group in the dropdown is selected instead.
     */
    setToNextStyleGroup() {
        let nextGroup = this.$('.h-style-group option:selected').next().val();
        // A style group can have an empty string for a name, so we must explicitly
        // test if this is undefined instead of just testing truthiness.
        if (nextGroup === undefined) {
            nextGroup = this.$('.h-style-group option:first').val();
        }
        this._setStyleGroup(this._groups.get(nextGroup).toJSON());
    },

    /**
     * Set the style group to the previous available group in the dropdown.
     *
     * If the currently selected group is the first group in the dropdown,
     * the last group in the dropdown is selected instead.
     */
    setToPrevStyleGroup() {
        let prevGroup = this.$('.h-style-group option:selected').prev().val();
        // A style group can have an empty string for a name, so we must explicitly
        // test if this is undefined instead of just testing truthiness.
        if (prevGroup === undefined) {
            prevGroup = this.$('.h-style-group option:last-child').val();
        }
        this._setStyleGroup(this._groups.get(prevGroup).toJSON());
    },

    getStyleGroup() {
        return this._style;
    },

    _styleGroupEditor() {
        var dlg = editStyleGroups(this._style, this._groups);
        dlg.$el.on('hidden.bs.modal', () => {
            this.render();
            this.parentView.trigger('h:styleGroupsEdited', this._groups);
        });
    },

    _handleStyleGroupsUpdate() {
        this.render();
        this.trigger('h:styleGroupsUpdated', this._groups);
    },

    _highlightElement(evt) {
        const id = $(evt.currentTarget).data('id');
        this.parentView.trigger('h:highlightAnnotation', this.annotation.id, id);
    },

    _unhighlightElement() {
        this.parentView.trigger('h:highlightAnnotation');
    },

    _recalculateGroupAggregation() {
        const groups = _.invoke(
            this.collection.filter((el) => el.get('group')),
            'get', 'group'
        );
        this.annotation.set('groups', groups);
    },

    _setDrawingConstraint(evt) {
        const constraintType = evt.target.value;
        localStorage.setItem(`h-${this.drawingType()}-mode`, constraintType);
        if (constraintType === CONSTRAINTS.fixedAspectRatio || constraintType === CONSTRAINTS.fixedSize) {
            setConstraints();
        }
    },

    _drawingConstraintEditor() {
        setConstraints();
    }
});

export default DrawWidget;
