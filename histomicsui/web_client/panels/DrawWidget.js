/* globals geo */
import _ from 'underscore';
import $ from 'jquery';

import events from '@girder/core/events';
import Panel from '@girder/slicer_cli_web/views/Panel';
import {getCurrentUser} from '@girder/core/auth';

import convertAnnotation from '@girder/large_image_annotation/annotations/geojs/convert';
import convertRectangle from '@girder/large_image_annotation/annotations/geometry/rectangle';
import convertEllipse from '@girder/large_image_annotation/annotations/geometry/ellipse';
import convertCircle from '@girder/large_image_annotation/annotations/geometry/circle';

import StyleCollection from '../collections/StyleCollection';
import StyleModel from '../models/StyleModel';
import editElement from '../dialogs/editElement';
import editStyleGroups from '../dialogs/editStyleGroups';
import drawWidget from '../templates/panels/drawWidget.pug';
import drawWidgetElement from '../templates/panels/drawWidgetElement.pug';
import '../stylesheets/panels/drawWidget.styl';

/**
 * Create a panel with controls to draw and edit
 * annotation elements.
 */
var DrawWidget = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .h-edit-element': 'editElement',
        'click .h-view-element': 'viewElement',
        'click .h-delete-element': 'deleteElement',
        'click .h-draw': 'drawElement',
        'click .h-group-count-option .h-group-count-select': 'selectElementsInGroup',
        'change .h-style-group': '_setToSelectedStyleGroup',
        'change .h-brush-shape,.h-brush-size,.h-brush-screen': '_changeBrush',
        'change .h-fixed-shape,.h-fixed-height,.h-fixed-width': '_changeShapeConstraint',
        'click .h-configure-style-group': '_styleGroupEditor',
        'mouseenter .h-element': '_highlightElement',
        'mouseleave .h-element': '_unhighlightElement',
        'click .h-dropdown-title': '_dropdownControlClick'
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
        this.newElementDisplayIdStart = this.collection.length;
        this.viewer = settings.viewer;
        this.setViewer(settings.viewer);
        this.setAnnotationSelector(settings.annotationSelector);
        this._drawingType = settings.drawingType || null;

        this._localId = (getCurrentUser() || {}).id || 'local';
        this._editOptions = this._getEditOptions()[this._localId] || {};
        this._verifyEditOptions(this._editOptions, false);

        this._highlighted = {};
        this._groups = new StyleCollection();
        this._style = new StyleModel({id: this.parentView._defaultGroup});
        this.listenTo(this._groups, 'add change', this._handleStyleGroupsUpdate);
        this.listenTo(this._groups, 'remove', this.render);
        this.listenTo(this.collection, 'add remove reset', this._recalculateGroupAggregation);
        this.listenTo(this.collection, 'change update reset', this.render);
        this._groups.fetch().done(() => {
            // ensure the default style exists
            if (this._groups.has(this.parentView._defaultGroup)) {
                this._style.set(this._groups.get(this.parentView._defaultGroup).toJSON());
            } else {
                this._groups.add(this._style.toJSON());
                this._groups.get(this._style.id).save();
            }
            if (this._editOptions.style && this._groups.get(this._editOptions.style)) {
                this._setStyleGroup(this._groups.get(this._editOptions.style).toJSON());
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
                defaultGroup: this.parentView._defaultGroup,
                highlighted: this._highlighted,
                name,
                opts: this._editOptions,
                drawingType: this._drawingType,
                collapsed: this.$('.s-panel-content.collapse').length && !this.$('.s-panel-content').hasClass('in'),
                firstRender: true,
                displayIdStart: 0
            }));
            this.$('.h-dropdown-content').collapse({toggle: false});
        }
        this.$('button.h-draw[data-type]').removeClass('active');
        if (this.$('.h-group-count-option').length > 0) {
            this.$('.h-group-count-options').append(this.$('.h-group-count-option'));
        } else {
            this.$('.h-group-count').hide();
        }
        if (this.$('.h-group-count-option.pixelmap').length > 0) {
            this.$('.h-group-count-option.pixelmap').remove();
            for (const element of this.collection.models) {
                if (element.attributes.type === 'pixelmap') {
                    this.countPixelmap(element, 1);
                }
            }
        }
        if (this._drawingType) {
            this.$('button.h-draw[data-type="' + this._drawingType + '"]').addClass('active');
            this.drawElement(undefined, this._drawingType);
        }
        this._bindHUIModeChange();
        this._updateConstraintValueInputs();
        return this;
    },

    _bindHUIModeChange() {
        if (this.viewer.annotationLayer && this.viewer.annotationLayer._boundHUIModeChange !== this) {
            this.viewer.annotationLayer._boundHUIModeChange = this;
            this.viewer.annotationLayer.geoOff(geo.event.annotation.mode);
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
    },

    /**
     * When a region should be drawn that isn't caused by a drawing button,
     * toggle off the drawing mode.
     *
     * @param {event} Girder event that triggered drawing a region.
     */
    _widgetDrawRegion(evt) {
        if (this._drawingType) {
            this.viewer.annotationLayer.mode(null);
            this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
        }
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
        this.stopListening(events, 's:widgetDrawRegionEvent', this._widgetDrawRegion);
        if (viewer) {
            this.listenTo(events, 's:widgetDrawRegionEvent', this._widgetDrawRegion);
            viewer.stopListening(events, 's:widgetDrawRegionEvent', viewer.drawRegion);
            viewer.listenTo(events, 's:widgetDrawRegionEvent', viewer.drawRegion);
        }
        return this;
    },

    /**
     * Set the image 'annotationSelector' instance.
     */
    setAnnotationSelector(annotationSelector) {
        this.annotationSelector = annotationSelector;
        return this;
    },

    /**
     * Respond to a click on the "edit" button by rendering
     * the EditAnnotation modal dialog.
     */
    editElement(evt) {
        var origGroup = this.collection.get(this._getId(evt)).attributes.group;
        var dialog = editElement(this.collection.get(this._getId(evt)));
        this.listenToOnce(dialog, 'h:editElement', (obj) => {
            if (obj.edited) {
                // update the html immediately instead of rerendering it
                const id = obj.element.id,
                    label = (obj.data.label || {}).value,
                    elemType = obj.element.get('type'),
                    group = obj.data.group;
                let newLabel = '';
                const labelElement = this.$(`.h-element[data-id="${id}"] .h-element-label`);
                const oldLabel = labelElement.text().split(' ');
                if (label) {
                    newLabel = label;
                } else if (['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(elemType)) {
                    let oldnum = parseInt(oldLabel[oldLabel.length - 1] || '');
                    if (!_.isFinite(oldnum)) {
                        oldnum = '';
                    }
                    newLabel = `${group || this.parentView._defaultGroup} ${elemType} ${oldnum}`;
                } else {
                    newLabel = oldLabel;
                }
                this.$(`.h-element[data-id="${id}"] .h-element-label`).text(newLabel).attr('title', label);
                if (origGroup !== group && ['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(elemType)) {
                    this.updateCount(origGroup || this.parentView._defaultGroup, -1);
                    this.updateCount(group || this.parentView._defaultGroup, 1);
                }
            }
            this._skipRenderHTML = true;
        });
    },

    /**
     * Respond to a click on the "view" button by changing the
     * viewer location and zoom level to focus on one annotation
     */
    viewElement(evt) {
        const annot = this.collection._byId[$(evt.target).parent().attr('data-id')];
        let points;
        let pointAnnot = false;
        switch (annot.get('type')) {
            case 'point':
                points = [annot.get('center')];
                pointAnnot = true;
                break;
            case 'polyline':
                points = annot.get('points');
                break;
            case 'rectangle':
                points = convertRectangle(annot.attributes).coordinates[0];
                break;
            case 'ellipse':
                points = convertEllipse(annot.attributes).coordinates[0];
                break;
            case 'circle':
                points = convertCircle(annot.attributes).coordinates[0];
                break;
        }
        const xCoords = points.map((point) => point[0]);
        const yCoords = points.map((point) => point[1]);
        const bounds = {
            left: Math.min(...xCoords),
            top: Math.min(...yCoords),
            right: Math.max(...xCoords),
            bottom: Math.max(...yCoords)
        };
        const map = this.parentView.viewer;
        const originalZoomRange = map.zoomRange();
        map.zoomRange({
            min: Number.NEGATIVE_INFINITY,
            max: Number.POSITIVE_INFINITY
        });
        const newView = pointAnnot
            ? {
                center: {
                    x: bounds.left,
                    y: bounds.top
                },
                zoom: false
            }
            : map.zoomAndCenterFromBounds(bounds, map.rotation());
        map.zoomRange({
            min: originalZoomRange.origMin,
            max: originalZoomRange.max
        });
        if (Math.abs(newView.zoom - 1.5 - map.zoom()) <= 0.5 && map.zoom() < newView.zoom) {
            newView.zoom = false;
        }
        const distance = ((newView.center.x - map.center().x) ** 2 + (newView.center.y - map.center().y) ** 2) ** 0.5;
        map.transition({
            center: newView.center,
            zoom: newView.zoom === false ? map.zoom() : newView.zoom - 1.5,
            duration: Math.min(1000, Math.max(100, distance)),
            endClamp: false,
            interp: distance < 500 ? undefined : window.d3.interpolateZoom,
            ease: window.d3.easeExpInOut
        });
        this._skipRenderHTML = true;
    },

    /**
     * Respond to a click on the "delete" button by removing
     * the element from the element collection.
     */
    deleteElement(evt, id, opts) {
        if (evt) {
            id = this._getId(evt);
        }
        if (['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(this.collection.get(id).attributes.type)) {
            this.updateCount(this.collection.get(id).attributes.group || this.parentView._defaultGroup, -1);
        } else if (this.collection.get(id).attributes.type === 'pixelmap') {
            this.countPixelmap(this.collection.get(id), -1);
        }
        this.$(`.h-element[data-id="${id}"]`).remove();
        this._skipRenderHTML = true;
        this.collection.remove(id, opts);
        this.newElementDisplayIdStart = +(this.$el.find('.h-element>span.h-element-label[display_id]').last().attr('display_id') || 0);
    },

    /**
     * Add a list of elements, updating the element container efficiently.
     *
     * @params {object[]} elements The list of elements to add to the
     *    collection.
     */
    addElements(elements) {
        this._skipRenderHTML = true;
        elements = this.collection.add(elements);
        this.$el.find('.h-elements-container').append(
            drawWidgetElement({
                elements,
                style: this._style.id,
                defaultGroup: this.parentView._defaultGroup,
                highlighted: this._highlighted,
                firstRender: false,
                updateCount: this.updateCount,
                displayIdStart: this.newElementDisplayIdStart
            })
        );
        this.newElementDisplayIdStart += elements.length;
        if (this.$('.h-group-count-option.pixelmap').length > 0) {
            this.$('.h-group-count-option.pixelmap').remove();
            for (const element of this.collection.models) {
                if (element.attributes.type === 'pixelmap') {
                    this.countPixelmap(element, 1);
                }
            }
        }
    },

    /**
     * Specify how precise ellipses are when converted to polygons.
     */
    _pixelTolerance() {
        /* null : use default,1/10 pixel at max map zoom */
        // return null;
        /* number : pixel tolerance at current screen resolution */
        return 0.25;
        /* number / unitsPerPixel(zoom) : pixel tolerance on base image */
        // return 0.5 / this.viewer.viewer.unitsPerPixel(this.viewer.viewer.zoom();
    },

    /**
     * Apply a boolean operation to the existign polygons.
     *
     * @param {geo.annotation[]} annotations The list of specified geojs
     *      annotations.
     * @param {object} opts An object with the current boolean operation.
     * @returns {boolean} true if the operation was handled.
     */
    _applyBooleanOp(annotations, evtOpts) {
        if (!evtOpts.asPolygonList && (annotations.length !== 1 || !annotations[0].toPolygonList)) {
            return false;
        }
        const op = evtOpts.currentBooleanOperation;
        const existing = this.viewer._annotations[this.annotation.id].features.filter((f) => ['polygon', 'marker'].indexOf(f.featureType) >= 0);
        const polylist = evtOpts.asPolygonList ? annotations : annotations[0].toPolygonList({pixelTolerance: this._pixelTolerance()});
        if (!existing.length && polylist.length < 2) {
            return false;
        }
        const searchPoly = [];
        polylist.forEach((poly) => poly[0].forEach((pt) => searchPoly.push({x: pt[0], y: pt[1]})));
        const near = existing.map((f) => f.polygonSearch(
            searchPoly,
            {partial: true}, null));
        if (!near.some((n) => n.found.length) && polylist.length < 2) {
            return false;
        }
        const oldids = {};
        const geojson = {type: 'FeatureCollection', features: []};
        near.forEach((n) => n.found.forEach((element) => {
            // filter to match current style group
            if (element.properties.element && element.properties.element.group !== this._style.get('group')) {
                return;
            }
            element.properties.annotationId = element.properties.annotation;
            geojson.features.push(element);
            oldids[element.id] = true;
        }));
        if (!geojson.features.length && polylist.length < 2) {
            return false;
        }
        this.viewer.annotationLayer.removeAllAnnotations(undefined, false);
        this.viewer.annotationLayer.geojson(geojson);
        const opts = {
            correspond: {},
            keepAnnotations: 'exact',
            style: this.viewer.annotationLayer,
            pixelTolerance: this._pixelTolerance()
        };
        geo.util.polyops[op](this.viewer.annotationLayer, polylist, opts);
        const newAnnot = this.viewer.annotationLayer.annotations();

        this.viewer.annotationLayer.removeAllAnnotations(undefined, false);
        const elements = newAnnot.map((annot) => {
            const result = convertAnnotation(annot);
            if (!result.id) {
                result.id = this.viewer._guid();
            }
            return result;
        }).filter((annot) => !annot.points || annot.points.length);
        Object.keys(oldids).forEach((id) => this.deleteElement(undefined, id, {silent: elements.length}));
        this.addElements(
            _.map(elements, (el) => {
                el = _.extend(el, _.omit(this._style.toJSON(), 'id'));
                if (!this._style.get('group')) {
                    delete el.group;
                }
                return el;
            })
        );
        return true;
    },

    /**
     * When the brish is set to a specific screen size, adjust the size on zoom
     * events.
     */
    _brushPan() {
        const zoom = this.viewer.viewer.zoom();
        if (zoom !== this._brushZoom) {
            this._brushZoom = zoom;
            let size = parseFloat(this._editOptions.brush_size) || 50;
            size *= this.viewer.viewer.unitsPerPixel(this._brushZoom);
            this._setBrushCoordinates(this.viewer.annotationLayer.annotations()[0], size);
            this.viewer.viewer.draw();
        }
    },

    /**
     * Based on the current mouse position, compute the size and position of
     * the current brush.
     *
     * @param {geo.annotation} annot The annotation to adjust.
     * @param {number} size The size of the brush.
     */
    _setBrushCoordinates(annot, size) {
        const center = this.viewer.viewer.interactor().mouse().mapgcs || {x: 0, y: 0};
        annot._coordinates([
            {x: center.x - size / 2, y: center.y - size / 2},
            {x: center.x - size / 2, y: center.y + size / 2},
            {x: center.x + size / 2, y: center.y + size / 2},
            {x: center.x + size / 2, y: center.y - size / 2}]);
        annot.modified();
    },

    /**
     * Handle a click or drag action for the current brush.
     *
     * @param {geo.event} evt The event that trigger this.  This will either be
     *    a cursor_action or cursor_click event.  If no boolean operation is
     *    specified, it is a union operation.
     */
    _brushAction(evt) {
        let annotations = this.viewer.annotationLayer.toPolygonList({pixelTolerance: this._pixelTolerance()});
        let elements = [convertAnnotation(this.viewer.annotationLayer.annotations()[0])];
        if (!elements[0].id) {
            elements[0].id = this.viewer._guid();
        }
        const opts = {
            currentBooleanOperation: evt.operation || 'union',
            asPolygonList: true
        };
        if (evt.event === geo.event.annotation.cursor_action) {
            if (evt.operation && evt.operation !== 'union' && evt.operation !== 'difference') {
                return;
            }
            // if this is the same action as the previous one, "blur" the brush
            // shapes along the direction of travel
            if (this._lastBrushState && this._lastBrushState.stateId && this._lastBrushState.stateId === evt.evt.state.stateId) {
                const shape = this._editOptions.brush_shape || 'square';
                let size = parseFloat(this._editOptions.brush_size) || 50;
                if (this._editOptions.brush_screen) {
                    size *= this.viewer.viewer.unitsPerPixel(this._brushZoom);
                }
                const bbox1 = this.viewer.annotationLayer.annotations()[0]._coordinates();
                const bbox2 = this._lastBrushState.bbox;
                if (bbox1[0].x !== bbox2[0].x || bbox1[0].y !== bbox2[0].y) {
                    let blur;
                    if (shape === 'square') {
                        const order = (bbox1[0].x - bbox2[0].x) * (bbox1[0].y - bbox2[0].y) < 0 ? 0 : 1;
                        blur = [[[
                            [bbox1[order].x, bbox1[order].y],
                            [bbox1[order + 2].x, bbox1[order + 2].y],
                            [bbox2[order + 2].x, bbox2[order + 2].y],
                            [bbox2[order].x, bbox2[order].y]
                        ]]];
                    } else {
                        const c1x = (bbox1[0].x + bbox1[2].x) * 0.5;
                        const c1y = (bbox1[0].y + bbox1[2].y) * 0.5;
                        const c2x = (bbox2[0].x + bbox2[2].x) * 0.5;
                        const c2y = (bbox2[0].y + bbox2[2].y) * 0.5;
                        const ang = Math.atan2(c2y - c1y, c2x - c1x) + Math.PI / 2;
                        blur = [[[
                            [c1x + size / 2 * Math.cos(ang), c1y + size / 2 * Math.sin(ang)],
                            [c1x - size / 2 * Math.cos(ang), c1y - size / 2 * Math.sin(ang)],
                            [c2x - size / 2 * Math.cos(ang), c2y - size / 2 * Math.sin(ang)],
                            [c2x + size / 2 * Math.cos(ang), c2y + size / 2 * Math.sin(ang)]
                        ]]];
                    }
                    annotations = geo.util.polyops.union(annotations, blur);
                    elements = [{
                        type: 'polyline',
                        closed: true,
                        points: annotations[0][0].map((pt) => ({x: pt[0], y: -pt[1], z: 0})),
                        id: this.viewer._guid()
                    }];
                }
            }
            this._lastBrushState = evt.evt.state;
            this._lastBrushState.bbox = this.viewer.annotationLayer.annotations()[0]._coordinates();
        } else {
            this._lastBrushState = null;
        }
        this._addDrawnElements(elements, annotations, opts);
        this._setBrushMode(true);
        // update sooner so that the hit test will work
        this.viewer.drawAnnotation(this.annotation);
    },

    /**
     * Switch to or update brush mode.
     *
     * @param {boolean} [forceRefresh] If true, update the annotation mode even
     *      if it hasn't changed.
     */
    _setBrushMode(forceRefresh) {
        if (!this._brushPanBound) {
            this._brushPanBound = _.bind(this._brushPan, this);
        }
        this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
        this.viewer.annotationLayer.geoOff(geo.event.annotation.cursor_click);
        this.viewer.annotationLayer.geoOff(geo.event.annotation.cursor_action);
        this.viewer.annotationLayer.geoOff(geo.event.pan, this._brushPanBound);
        this.viewer.annotationLayer.removeAllAnnotations();
        this.viewer.annotationLayer.geoOn(geo.event.annotation.cursor_click, (evt) => this._brushAction(evt));
        this.viewer.annotationLayer.geoOn(geo.event.annotation.cursor_action, (evt) => this._brushAction(evt));
        const shape = this._editOptions.brush_shape || 'square';
        let size = parseFloat(this._editOptions.brush_size) || 50;
        const scale = this._editOptions.brush_screen;
        if (scale) {
            this.viewer.annotationLayer.geoOn(geo.event.pan, this._brushPanBound);
            this._brushZoom = this.viewer.viewer.zoom();
            size *= this.viewer.viewer.unitsPerPixel(this._brushZoom);
        }
        const annot = geo.registries.annotations[shape === 'square' ? 'rectangle' : shape].func({layer: this.viewer.annotationLayer});
        this.viewer.annotationLayer.addAnnotation(annot);
        this._setBrushCoordinates(annot, size);
        this.viewer.annotationLayer.mode(this.viewer.annotationLayer.modes.cursor, annot);
        this._drawingType = 'brush';
        this.viewer.viewer.draw();
    },

    /**
     * After determining the elements intended by the current shape, add them
     * to the existing annotations with the appropriate boolean operation.
     *
     * @param {object[]} element An array of elements in our jsonschema format.
     * @param {geo.annotation[]|geo.polygonList} annotations The annotations to
     *    add in a geojs format.
     */
    _addDrawnElements(element, annotations, opts) {
        opts = opts || {};
        if (opts.currentBooleanOperation) {
            const processed = this._applyBooleanOp(annotations, opts);
            if (processed || ['difference', 'intersect'].indexOf(opts.currentBooleanOperation) >= 0) {
                this.drawElement(undefined, this._drawingType);
                return undefined;
            }
        }
        // add current style group information
        this.addElements(
            _.map(element, (el) => {
                el = _.extend(el, _.omit(this._style.toJSON(), 'id'));
                if (!this._style.get('group')) {
                    delete el.group;
                }
                return el;
            })
        );
        this.drawElement(undefined, this._drawingType);
        return undefined;
    },

    /**
     * Respond to clicking an element type by putting the image viewer into
     * "draw" mode.
     *
     * @param {jQuery.Event} [evt] The button click that triggered this event.
     *      `undefined` to use a passed-in type.
     * @param {string|null} [type] If `evt` is `undefined`, switch to this draw
     *      mode.
     * @param {boolean} [forceRefresh] If true, update the annotation mode even
     *      if it hasn't changed.
     */
    drawElement(evt, type, forceRefresh) {
        if (type) {
            this._bindHUIModeChange();
        }
        var $el;
        if (evt) {
            $el = this.$(evt.currentTarget);
            $el.tooltip('hide');
            type = $el.hasClass('active') ? null : $el.data('type');
        } else {
            $el = this.$('button.h-draw[data-type="' + type + '"]');
        }
        if (this.viewer.annotationLayer.mode() === type && this._drawingType === type && (!type || this.viewer.annotationLayer.currentAnnotation) && !forceRefresh) {
            return;
        }
        if (this.viewer.annotationLayer.mode()) {
            this._drawingType = null;
            this.viewer.annotationLayer.mode(null);
            this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
            if (this._brushPanBound) {
                this.viewer.annotationLayer.geoOff(geo.event.pan, this._brushPanBound);
            }
            this.viewer.annotationLayer.removeAllAnnotations();
        }
        if (type === 'brush') {
            this._setBrushMode(forceRefresh);
        } else if (type) {
            this.parentView._resetSelection();
            // always show the active annotation when drawing a new element
            this.annotation.set('displayed', true);
            this._drawingType = type;

            const options = {modeOptions: {}};
            if (this._editOptions.size_mode === 'fixed_aspect_ratio') {
                options.modeOptions.constraint = this._editOptions.fixed_width / this._editOptions.fixed_height;
            } else if (this._editOptions.size_mode === 'fixed_size') {
                options.modeOptions.constraint = {width: this._editOptions.fixed_width, height: this._editOptions.fixed_height};
            }

            this.viewer.startDrawMode(type, options)
                .then((element, annotations, opts) => this._addDrawnElements(element, annotations, opts))
                .fail(() => {
                    if (this._drawingType && this._drawingType !== this.viewer.annotationLayer.mode() && this.viewer.annotationLayer.mode() !== 'edit') {
                        this.drawElement(undefined, this._drawingType, !!this._drawingType);
                    }
                });
        }
        this.$('button.h-draw[data-type]').removeClass('active');
        if (this._drawingType) {
            if (this.parentView.annotationSelector) {
                this.parentView.annotationSelector.selectAnnotationByRegionCancel();
            }
            this.$('button.h-draw[data-type="' + this._drawingType + '"]').addClass('active');
        }
    },

    cancelDrawMode() {
        this.drawElement(undefined, null);
        this.viewer.annotationLayer._boundHUIModeChange = false;
        this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
        this.viewer.annotationLayer.geoOff(geo.event.annotation.mode);
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

    /**
     * Fetch the current edit options from browser local storage.  This is for
     * all users.
     *
     * @returns {object} The current edit options for all users.
     */
    _getEditOptions() {
        let hui = {};
        try {
            hui = JSON.parse(window.localStorage.getItem('histomicsui') || '{}');
        } catch (err) { }
        if (!_.isObject(hui)) {
            hui = {};
        }
        return hui;
    },

    /**
     * Set the current edit options for the current user.
     *
     * @param {object} [opts] A dictionary of options to update the existing
     *      options.  If unspecified, just store the current options.
     */
    _saveEditOptions(opts) {
        let update = false;
        if (opts) {
            Object.entries(opts).forEach(([key, value]) => {
                if (this._editOptions[key] !== value) {
                    this._editOptions[key] = value;
                    update = true;
                }
            });
        }
        if (update || !opts) {
            this._verifyEditOptions(this._editOptions);
            try {
                const hui = this._getEditOptions();
                hui[this._localId] = this._editOptions;
                window.localStorage.setItem('histomicsui', JSON.stringify(hui));
            } catch (err) {
                console.warn('Failed to write localStorage');
                console.log(err);
            }
        }
    },

    /**
     * Validate a set of edit options.  Optional raise on error.
     *
     * @param {object} opts The options to validate and fix.
     * @param {boolean} [raiseOnError] If true, throw an error if validation
     *      fails.
     */
    _verifyEditOptions(opts, raiseOnError) {
        if (raiseOnError && opts.brush_shape && ['square', 'circle'].indexOf(opts.brush_shape) < 0) {
            throw new Error('Brush is not a valid shape');
        }
        if (!opts.brush_shape || ['square', 'circle'].indexOf(opts.brush_shape) < 0) {
            opts.brush_shape = 'square';
        }
        if (raiseOnError && opts.brush_size && !(parseFloat(opts.brush_size) > 0)) {
            throw new Error('Brush size is not a positive number');
        }
        if (!opts.brush_size || !(parseFloat(opts.brush_size) > 0)) {
            opts.brush_size = 50;
        }
        if (!opts.size_mode) {
            opts.size_mode = 'unconstrained';
        }
    },

    updateCount(groupName, change) {
        const groupElem = $('.h-group-count-options > [data-group="' + groupName + '"]');
        if (groupElem.length > 0) {
            const newCount =  parseInt(groupElem.attr('data-count')) + change;
            groupElem.attr('data-count', newCount);
            if (newCount > 0) {
                for (const group of $('.h-group-count-option').toArray()) {
                    const count = parseInt($(group).attr('data-count'));
                    if (newCount > count) {
                        $(group).before(groupElem);
                        break;
                    } else if (group !== groupElem[0] && newCount === count) {
                        if ($(group).attr('data-group') < groupName) {
                            $(group).after(groupElem);
                        } else {
                            $(group).before(groupElem);
                        }
                        break;
                    } else if (group === $('.h-group-count-options:last-child')[0]) {
                        $(group).after(groupElem);
                    }
                }
                groupElem.find('.h-group-count-value').html(newCount + ' ' + groupName).show();
            } else {
                groupElem.remove();
            }
        } else if (change !== 0) {
            const span = ($('.h-group-count-option:first span.h-group-count-select')[0] || {}).outerHTML || '';
            const newrecord = '<div class="h-group-count-option" data-group="' + groupName + '" data-count=' + change + '><span class="h-group-count-value">' + change + ' ' + groupName + '</span>' + span + '</div>';
            for (const group of $('.h-group-count-option').toArray().reverse()) {
                if ($(group).attr('data-count') > change || ($(group).attr('data-count') === change && $(group).attr('data-group') < groupName)) {
                    $(group).after(newrecord);
                    break;
                } else if (group === $('.h-group-count-options:first-child')[0]) {
                    $(group).before(newrecord);
                }
            }
            if ($('.h-group-count-options > [data-group="' + groupName + '"]').length === 0) {
                $('.h-group-count-options').append(newrecord);
            }
        }
        if ($('.h-group-count-option').length === 0) {
            $('.h-group-count').hide();
        } else {
            $('.h-group-count').show();
        }
    },

    countPixelmap(pixelmap, operation) {
        const toChange = {};
        for (let ix = 0; ix < pixelmap.get('values').length; ix++) {
            const groupName = (pixelmap.get('categories')[pixelmap.get('values')[ix]]).label || this.parentView._defaultGroup;
            if (toChange[groupName]) {
                toChange[groupName]++;
            } else {
                toChange[groupName] = 1;
            }
        }
        for (const group in toChange) {
            this.updateCount(group, operation * toChange[group]);
        }
    },

    /**
     * Set the current style group.  This should take a plain object, not a
     * backbone object.  Given a group name, this can be obtained by something
     * like
     *   this._setStyleGroup(this._groups.get(groupName).toJSON());
     *
     * @param {object} group The new group.
     */
    _setStyleGroup(group) {
        group = Object.assign({}, group);
        Object.keys(group).forEach((k) => {
            if (!['fillColor', 'lineColor', 'lineWidth', 'label', 'group', 'id'].includes(k)) {
                delete group[k];
            }
        });
        this._style.set(group);
        if (!group.group && this._style.id !== this.parentView._defaultGroup) {
            this._style.set('group', this._style.id);
        } else if (this._style.get('group') && this._style.id === this.parentView._defaultGroup) {
            this._style.unset('group');
        }
        if (!group.label && this._style.get('label')) {
            this._style.unset('label');
        }
        this.$('.h-style-group').val(group.id);
        this._saveEditOptions({style: group.id});
    },

    /**
     * Set the current style group based on the current controls.
     */
    _setToSelectedStyleGroup() {
        this._setStyleGroup(this._groups.get(this.$('.h-style-group').val()).toJSON());
    },

    selectElementsInGroup(evt) {
        const group = $(evt.target).closest('[data-group]').attr('data-group');
        this.parentView._selectElementsByGroup(group);
    },

    /**
     * For a dropdown control widget, handle expanding and collapsing.
     *
     * @param {jquery.Event} e The event that triggered this toggle.
     */
    _dropdownControlClick(e) {
        e.stopImmediatePropagation();
        const content = $(e.target).parent().find('.h-dropdown-content');
        const isCollapsed = !content.hasClass('in');
        const buttons = $(e.target).closest('.h-draw-tools').find('.btn-group');
        buttons.find('.h-dropdown-content').each((idx, dropdown) => {
            dropdown = $(dropdown);
            if (!dropdown.is(content) && dropdown.hasClass('in')) {
                dropdown.collapse('toggle');
                dropdown.parent().find('.icon-up-open').removeClass('icon-up-open').addClass('icon-down-open');
            }
        });
        content.collapse('toggle');
        $(e.target).find('.icon-down-open,.icon-up-open').removeClass(
            isCollapsed ? 'icon-down-open' : 'icon-up-open').addClass(
            isCollapsed ? 'icon-up-open' : 'icon-down-open');
        // Select the corresponding radio button for the current size_mode
        $(`input[mode="${this._editOptions.size_mode || 'unconstrained'}"]`, $(e.target.parentNode)).trigger('click');
    },

    /**
     * Change the size, shape, or screen flag on the current brush.
     */
    _changeBrush(e) {
        const opts = {
            brush_shape: this.$('.h-brush-shape:checked').attr('shape'),
            brush_size: parseFloat(this.$('.h-brush-size').val()),
            brush_screen: this.$('.h-brush-screen').is(':checked')
        };
        this._saveEditOptions(opts);
        this.$('.h-draw[data-type="brush"]').attr('shape', this._editOptions.brush_shape);
        if (this._drawingType === 'brush') {
            this.drawElement(undefined, 'brush', true);
        }
    },

    /**
     * Show or hide width/height input depending on the currently selected drawing mode.
     */
    _updateConstraintValueInputs() {
        if (['fixed_aspect_ratio', 'fixed_size'].includes(this.$('.h-fixed-shape:checked').attr('mode'))) {
            this.$('.h-fixed-values').show();
        } else {
            this.$('.h-fixed-values').hide();
        }
    },

    /**
     * Update the width/height constraint for a shape being drawn with a fixed
     * aspect ratio or fixed size.
     */
    _changeShapeConstraint(evt) {
        const opts = {
            size_mode: this.$('.h-fixed-shape:checked').attr('mode'),
            fixed_width: parseFloat(this.$('.h-fixed-width').val()),
            fixed_height: parseFloat(this.$('.h-fixed-height').val())
        };
        this._saveEditOptions(opts);

        this._updateConstraintValueInputs();

        this.drawElement(null, this._drawingType, true);
    },

    /**
     * Cycle through available brush shapes.
     */
    nextBrushShape() {
        this.$('.h-brush-shape[name="h-brush-shape"][shape="' + this.$('.h-brush-shape[name="h-brush-shape"]:checked').attr('next_shape') + '"]').prop('checked', true);
        this._changeBrush();
    },

    /**
     * Change the current brush size.
     *
     * @param {number} A number to add to the current size.
     */
    adjustBrushSize(delta) {
        const newval = Math.max(1, parseFloat(this.$('.h-brush-size').val()) + delta);
        this.$('.h-brush-size').val(newval);
        this._changeBrush();
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
        var dlg = editStyleGroups(this._style, this._groups, this.parentView._defaultGroup);
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
        const annotType = this.collection._byId[id].get('type');
        if (this.annotationSelector._interactiveMode && ['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(annotType)) {
            $(evt.currentTarget).find('.h-view-element').show();
        }
        this.parentView.trigger('h:highlightAnnotation', this.annotation.id, id);
    },

    _unhighlightElement(evt) {
        $(evt.currentTarget).find('.h-view-element').hide();
        this.parentView.trigger('h:highlightAnnotation');
    },

    _recalculateGroupAggregation() {
        const groups = [];
        const used = {};
        this.collection.forEach((el) => {
            const group = el.get('group') || '__null__';
            if (!used[group]) {
                used[group] = true;
                if (group !== '__null__') {
                    groups.push(group);
                }
            }
        });
        if (used.__null__) {
            groups.push(null);
        }
        this.annotation.set('groups', groups);
    }
});

export default DrawWidget;
