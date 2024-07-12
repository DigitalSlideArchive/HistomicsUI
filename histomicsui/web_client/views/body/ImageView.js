/* global geo */
import _ from 'underscore';
import $ from 'jquery';

import {restRequest} from '@girder/core/rest';
import {getCurrentUser} from '@girder/core/auth';
import {AccessType} from '@girder/core/constants';
import ItemModel from '@girder/core/models/ItemModel';
import FileModel from '@girder/core/models/FileModel';
import FolderCollection from '@girder/core/collections/FolderCollection';
import {ViewerWidget} from '@girder/large_image_annotation/views';

import SlicerPanelGroup from '@girder/slicer_cli_web/views/PanelGroup';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';
import AnnotationCollection from '@girder/large_image_annotation/collections/AnnotationCollection';

import {convert as convertToGeojson} from '@girder/large_image_annotation/annotations';
import {convert as convertFromGeojson} from '@girder/large_image_annotation/annotations/geojs';

import StyleCollection from '../../collections/StyleCollection';
import StyleModel from '../../models/StyleModel';

import AnnotationContextMenu from '../popover/AnnotationContextMenu';
import AnnotationPopover from '../popover/AnnotationPopover';
import PixelmapContextMenu from '../popover/PixelmapContextMenu';
import AnnotationSelector from '../../panels/AnnotationSelector';
import OverviewWidget from '../../panels/OverviewWidget';
import ZoomWidget from '../../panels/ZoomWidget';
import FrameSelectorWidget from '../../panels/FrameSelectorWidget';
import MetadataWidget from '../../panels/MetadataWidget';
import MetadataPlot from '../../panels/MetadataPlot';
import DrawWidget from '../../panels/DrawWidget';
import editElement from '../../dialogs/editElement';
import router from '../../router';
import events from '../../events';
import {HuiSettings} from '../utils';
import View from '../View';

import imageTemplate from '../../templates/body/image.pug';
import '../../stylesheets/body/image.styl';

var ImageView = View.extend({
    events: {
        'keydown .h-image-body': '_onKeyDown',
        click: '_clearTooltips',
        'click .h-control-panel-container .s-close-panel-group': '_closeAnalysis',
        'mousemove .geojs-map': '_trackMousePosition'
    },
    initialize(settings) {
        this._defaultGroup = 'default';
        this.viewerWidget = null;
        this._mouseClickQueue = [];
        this._openId = null;
        this._displayedRegion = null;
        this._currentMousePosition = null;
        this._selectElementsByRegionCanceled = false;
        this._debounceUpdatePixelmapValues = _.debounce(this._updatePixelmapValues, 500);
        this._overlayLayers = {};
        this.selectedAnnotation = new AnnotationModel({_id: 'selected'});
        this.selectedElements = this.selectedAnnotation.elements();

        // Allow zooming this many powers of 2 more than native pixel resolution
        this._increaseZoom2x = 1;
        this._increaseZoom2xRange = {min: 1, max: 4};

        if (!this.model) {
            this.model = new ItemModel();
        }
        this.listenTo(this.model, 'g:fetched', this.render);
        this.listenTo(events, 'h:analysis:rendered', this._setImageInput);
        this.listenTo(events, 'h:analysis:rendered', this._allowRootSelection);
        this.listenTo(events, 'h:analysis:rendered', this._setDefaultFileOutputs);
        this.listenTo(events, 'h:analysis:rendered', this._resetRegion);
        this.listenTo(this.selectedElements, 'add remove reset', this._redrawSelection);
        this.listenTo(events, 's:widgetDrawRegionEvent', this._widgetDrawRegion);
        this.listenTo(events, 'li:drawRegionUpdate', this._drawRegionUpdate);
        this.listenTo(events, 'li:drawModeChange', this._drawModeChange);
        events.trigger('h:imageOpened', null);
        this.listenTo(events, 'query:image', this.openImage);
        this.annotations = new AnnotationCollection();

        this.controlPanel = new SlicerPanelGroup({
            parentView: this,
            closeButton: true
        });
        this.overviewWidget = new OverviewWidget({
            parentView: this
        });
        this.zoomWidget = new ZoomWidget({
            parentView: this
        });
        this.frameSelectorWidget = new FrameSelectorWidget({
            parentView: this
        });
        this.metadataWidget = new MetadataWidget({
            parentView: this
        });
        this.annotationSelector = new AnnotationSelector({
            parentView: this,
            collection: this.annotations,
            image: this.model
        });
        /* Should be after annotationSelector */
        this.metadataPlot = new MetadataPlot({
            parentView: this
        });
        this.popover = new AnnotationPopover({
            parentView: this
        });
        this.contextMenu = new AnnotationContextMenu({
            parentView: this,
            collection: this.selectedElements
        });
        this.pixelmapContextMenu = new PixelmapContextMenu({
            parentView: this
        });
        this.listenTo(this, 'h:styleGroupsEdited', () => {
            this.contextMenu.refetchStyles();
            this.pixelmapContextMenu.refetchStyles();
        });

        this.listenTo(this.annotationSelector, 'h:groupCount', (obj) => {
            this.contextMenu.setGroupCount(obj);
        });
        this.listenTo(events, 'h:submit', (data) => {
            this.$('.s-jobs-panel .s-panel-controls .icon-down-open').click();
            events.trigger('g:alert', {type: 'success', text: 'Analysis job submitted.'});
        });
        this.listenTo(events, 'h:select-region', this.showRegion);
        this.listenTo(this.annotationSelector.collection, 'add update change:displayed', this.toggleAnnotation);
        this.listenTo(this.annotationSelector, 'h:toggleLabels', this.toggleLabels);
        this.listenTo(this.annotationSelector, 'h:toggleInteractiveMode', this._toggleInteractiveMode);
        this.listenTo(this.annotationSelector, 'h:editAnnotation', this._editAnnotation);
        this.listenTo(this.annotationSelector, 'h:deleteAnnotation', this._deleteAnnotation);
        this.listenTo(this.annotationSelector, 'h:annotationOpacity', this._setAnnotationOpacity);
        this.listenTo(this.annotationSelector, 'h:annotationFillOpacity', this._setAnnotationFillOpacity);
        this.listenTo(this.annotationSelector, 'h:redraw', this._redrawAnnotation);
        this.listenTo(this, 'h:highlightAnnotation', this._highlightAnnotationForInteractiveMode);
        this.listenTo(this, 'h:selectElementsByRegion', this._selectElementsByRegion);
        this.listenTo(this, 'h:selectElementsByRegionCancel', this._selectElementsByRegionCancel);
        this.listenTo(this.contextMenu, 'h:edit', this._editElement);
        this.listenTo(this.contextMenu, 'h:editShape', this._editElementShape);
        this.listenTo(this.contextMenu, 'h:redraw', this._redrawAnnotation);
        this.listenTo(this.contextMenu, 'h:close', this._closeContextMenu);
        this.listenTo(this.pixelmapContextMenu, 'h:update', this._handlePixelmapContextMenu);
        this.listenTo(this.pixelmapContextMenu, 'h:close', this._closePixelmapContextMenu);
        this.listenTo(this.selectedElements, 'h:save', this._saveSelection);
        this.listenTo(this.selectedElements, 'h:remove', this._removeSelection);
        this.listenTo(this, 'h:deselectAnnotationElements', this._deselectAnnotationElements);

        this.listenTo(events, 's:widgetChanged:region', this.widgetRegion);
        this.listenTo(events, 'g:login g:logout.success g:logout.error', () => {
            this._openId = null;
            this.model.set({_id: null});
            this._knownPanels = {};
            HuiSettings.clearSettingsCache();
        });
        $(document).on('mousedown.h-image-view', (evt) => {
            // let the context menu close itself
            if ($(evt.target).parents('#h-annotation-context-menu').length) {
                return;
            }
            this._closeContextMenu();

            if ($(evt.target).parents('#h-pixelmap-context-menu').length) {
                return;
            }
            this._closePixelmapContextMenu();
        });
        $(document).on('keydown.h-image-view', (evt) => {
            if (evt.keyCode === 27) {
                this._closeContextMenu();
            }
        });
        this.render();
    },
    render() {
        // Ensure annotations are removed from the popover widget on rerender.
        // This can happen when opening a new image while an annotation is
        // being hovered.
        this.mouseResetAnnotation();
        this._removeDrawWidget();

        if (this.model.id === this._openId) {
            this.controlPanel.setElement('#h-analysis-panel').render();
            this._orderPanels();
            return;
        }
        this.$el.html(imageTemplate());
        this.contextMenu.setElement(this.$('#h-annotation-context-menu')).render();
        this.pixelmapContextMenu.setElement(this.$('#h-pixelmap-context-menu')).render();

        if (this.model.id) {
            this._getConfig(this.model.id);
            this._openId = this.model.id;
            if (this.viewerWidget) {
                this.viewerWidget.destroy();
            }
            /* eslint-disable new-cap */
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this,
                el: this.$('.h-image-view-container'),
                itemId: this.model.id,
                hoverEvents: true,
                // it is very confusing if this value is smaller than the
                // AnnotationSelector MAX_ELEMENTS_LIST_LENGTH
                highlightFeatureSizeLimit: 5000,
                scale: {position: {bottom: 20, right: 10}}
            });
            // Don't unclamp bounds for the image even if image overlays are present.
            if (this.viewerWidget.setUnclampBoundsForOverlay) {
                this.viewerWidget.setUnclampBoundsForOverlay(false);
            }
            this.trigger('h:viewerWidgetCreated', this.viewerWidget);

            // handle annotation mouse events
            this.listenTo(this.viewerWidget, 'g:mouseOverAnnotation', this.mouseOverAnnotation);
            this.listenTo(this.viewerWidget, 'g:mouseOutAnnotation', this.mouseOutAnnotation);
            this.listenTo(this.viewerWidget, 'g:mouseOnAnnotation', this.mouseOnAnnotation);
            this.listenTo(this.viewerWidget, 'g:mouseOffAnnotation', this.mouseOffAnnotation);
            this.listenTo(this.viewerWidget, 'g:mouseClickAnnotation', this.mouseClickAnnotation);
            this.listenTo(this.viewerWidget, 'g:mouseResetAnnotation', this.mouseResetAnnotation);

            // handle overlay events
            this.listenTo(this.viewerWidget, 'g:mouseClickAnnotationOverlay', this.mouseClickOverlay);
            this.listenTo(this.viewerWidget, 'g:mouseOverAnnotationOverlay', this.mouseOverOverlay);
            this.listenTo(this.viewerWidget, 'g:mouseDownAnnotationOverlay', this.mouseOverOverlay);
            this.listenTo(this.viewerWidget, 'g:drawOverlayAnnotation', this.overlayLayerDrawn);
            this.listenTo(this.viewerWidget, 'g:removeOverlayAnnotation', this.overlayLayerRemoved);

            this.viewerWidget.on('g:imageRendered', () => {
                events.trigger('h:imageOpened', this.model);
                // store a reference to the underlying viewer
                this.viewer = this.viewerWidget.viewer;
                this.viewer.interactor().removeAction(geo.geo_action.zoomselect);

                const currentOptions = this.viewer.interactor().options();
                currentOptions.click.cancelOnMove = 10; // a click can move up to 10 pixels before it is considered a move
                this.viewer.interactor().options(currentOptions);

                this.imageWidth = this.viewer.maxBounds().right;
                this.imageHeight = this.viewer.maxBounds().bottom;
                // allow panning off the image slightly
                var extraPanWidth = 0.1, extraPanHeight = 0;
                this.viewer.maxBounds({
                    left: -this.imageWidth * extraPanWidth,
                    right: this.imageWidth * (1 + extraPanWidth),
                    top: -this.imageHeight * extraPanHeight,
                    bottom: this.imageHeight * (1 + extraPanHeight)
                });

                // set the viewer bounds on first load
                this.setImageBounds();

                // also set the query string
                this.setBoundsQuery();

                this.viewer._originalZoomRange = this.viewer.zoomRange().max;
                this.viewer.zoomRange({max: this.viewer.zoomRange().max + this._increaseZoom2x});

                // update the query string on pan events
                this.viewer.geoOn(geo.event.pan, () => {
                    this.setBoundsQuery();
                });

                // update the coordinate display on mouse move
                this.viewer.geoOn(geo.event.mousemove, (evt) => {
                    this.showCoordinates(evt);
                });

                // remove the hidden class from the coordinates display
                this.$('.h-image-coordinates-container').removeClass('hidden');

                // show the right side control container
                this.$('#h-annotation-selector-container').removeClass('hidden');

                this.overviewWidget
                    .setViewer(this.viewerWidget)
                    .setElement('.h-overview-widget').render();

                this.zoomWidget
                    .setViewer(this.viewerWidget)
                    .setElement('.h-zoom-widget').render();

                this.frameSelectorWidget
                    .setViewer(this.viewerWidget)
                    .setElement('.h-frame-selector-widget').render();

                this.metadataWidget
                    .setItem(this.model)
                    .setElement('.h-metadata-widget').render();

                this.metadataPlot
                    .setItem(this.model)
                    .setElement('.h-metadata-plot').render();

                this.annotationSelector
                    .setViewer(this.viewerWidget)
                    .setElement('.h-annotation-selector').render();

                if (this.drawWidget) {
                    this.$('.h-draw-widget').removeClass('hidden');
                    this.drawWidget
                        .setViewer(this.viewerWidget)
                        .setAnnotationSelector(this.annotationSelector)
                        .setElement('.h-draw-widget').render();
                }
                this._orderPanels();
            });
            this.annotationSelector.setItem(this.model);

            this.annotationSelector
                .setViewer(null)
                .setElement('.h-annotation-selector').render();

            if (this.drawWidget) {
                this.$('.h-draw-widget').removeClass('hidden');
                this.drawWidget
                    .setViewer(null)
                    .setAnnotationSelector(this.annotationSelector)
                    .setElement('.h-draw-widget').render();
            }
        }
        this.controlPanel.setElement('#h-analysis-panel').render();
        this.popover.setElement('#h-annotation-popover-container').render();
        this._orderPanels();
        return this;
    },
    destroy() {
        if (this.viewerWidget) {
            this.viewerWidget.destroy();
        }
        this.viewerWidget = null;
        events.trigger('h:imageOpened', null);
        $(document).off('.h-image-view');
        return View.prototype.destroy.apply(this, arguments);
    },
    openImage(id) {
        /* eslint-disable backbone/no-silent */
        this._resetSelection();
        this.model.clear({silent: true});
        delete this.model.parent;
        if (id) {
            this.model.set({_id: id}).fetch().then(() => {
                this._setImageInput();
                return null;
            });
        } else {
            this.model.set({_id: null});
            this.render();
            this._openId = null;
            events.trigger('h:imageOpened', null);
        }
    },
    /**
     * Set any input image parameters to the currently open image.
     * The jobs endpoints expect file id's rather than item id's,
     * so we have to choose an appropriate file id for a number of
     * scenarios.
     *
     *  * A normal item: Pick the first file id.  Here we have
     *    to make another rest call to get the files contained
     *    in the item.
     *
     *  * A large image item: choose fileId over originalId.
     *
     *  After getting the file id we have to make another rest
     *  call to fetch the full file model from the server.  Once
     *  this is complete, set the widget value.
     */
    _setImageInput() {
        if (!this.model.id) {
            return;
        }

        // helper functions passed through promises
        var getItemFile = (itemId) => {
            return restRequest({
                url: 'item/' + itemId + '/files',
                data: {
                    limit: 1,
                    offset: 0
                }
            }).then((files) => {
                if (!files.length) {
                    throw new Error('Item does not contain a file.');
                }
                return new FileModel(files[0]);
            });
        };

        var getTilesDef = (itemId) => {
            return restRequest({
                url: 'item/' + itemId + '/tiles'
            }).then((tiles) => {
                this.zoomWidget.setMaxMagnification(tiles.magnification || 20, this._increaseZoom2x, this._increaseZoom2xRange);
                this.zoomWidget.render();
                this.overviewWidget.setImage(tiles);
                this.frameSelectorWidget.setImage(itemId, tiles);
                return null;
            });
        };

        var getFileModel = (fileId) => {
            return restRequest({
                url: 'file/' + fileId
            }).then((file) => {
                return new FileModel(file);
            });
        };
        var largeImage = this.model.get('largeImage');
        var promise;

        if (largeImage) {
            // Prefer the fileId, expecting that jobs can handle tiled input
            promise = $.when(
                getTilesDef(this.model.id),
                getFileModel(largeImage.fileId || largeImage.originalId)
            ).then((a, b) => b); // resolve with the file model
        } else {
            promise = getItemFile(this.model.id);
        }

        // set control panel models that use relative paths
        this.controlPanel.models().forEach((model) => {
            if (model.get('defaultRelativePath') && model.get('channel') === 'input') {
                model.set('defaultRelativePath_id', this.model.id);
                model.set('defaultRelativePath_type', this.model.get('_modelType'));
                Object.values((this.controlPanel._panelViews || {})).forEach((panel) => {
                    if (panel._widgets && panel._widgets[model.id]) {
                        panel._widgets[model.id]._getDefaultInputResource(model).then((resource) => {
                            if (!resource) {
                                return null;
                            }
                            panel._widgets[model.id].model.set({
                                path: resource._path,
                                value: resource
                            });
                            return null;
                        });
                    }
                });
            }
        });

        return promise.then((file) => {
            _.each(this.controlPanel.models(), (model) => {
                if (model.get('type') === 'image') {
                    model.set('value', file, {trigger: true});
                }
            });
            return null;
        });
    },

    _getDefaultOutputFolder() {
        const user = getCurrentUser();
        if (!user) {
            return $.Deferred().resolve().promise();
        }
        const userFolders = new FolderCollection();
        return userFolders.fetch({
            parentId: user.id,
            parentType: 'user',
            name: 'Private',
            limit: 1
        }).then(() => {
            if (userFolders.isEmpty()) {
                throw new Error('Could not find the user\'s private folder when setting defaults');
            }
            return userFolders.at(0);
        });
    },

    _allowRootSelection() {
        /* It would be better to adjust hierarchy widgets to start where
         * current selections are located, but showing the root selector is a
         * start. */
        _.chain(this.controlPanel._panelViews).pluck('_childViews').flatten().each((entry) => {
            entry._rootPath = entry._rootPath === undefined ? false : entry._rootPath;
        });
    },

    _setDefaultFileOutputs() {
        return this._getDefaultOutputFolder().done((folder) => {
            if (folder && router.getQuery('analysis')) {
                _.each(
                    this.controlPanel.models().filter((model) => model.get('type') === 'new-file'),
                    (model) => {
                        var analysis = _.last(router.getQuery('analysis').split('/'));
                        analysis = this.controlPanel.$el.find('.s-panel-title:first').text() || analysis;
                        var extension = (model.get('extensions') || '').split('|')[0];
                        var name = `${analysis}-${model.id}${extension}`;
                        if (model.get('required') !== false || (model.get('reference') && extension)) {
                            model.set({
                                path: [folder.get('name'), name],
                                parent: folder,
                                value: new ItemModel({
                                    name,
                                    folderId: folder.id
                                })
                            });
                        }
                    }
                );
            }
        });
    },

    _clearTooltips() {
        $('.tooltip[role="tooltip"]').remove();
    },

    _closeAnalysis(evt) {
        evt.preventDefault();
        router.setQuery('analysis', null, {trigger: false});
        this.controlPanel.$el.addClass('hidden');
        events.trigger('query:analysis', null);
    },

    /**
     * Set the view (image bounds) of the current image as a
     * query string parameter.
     */
    setBoundsQuery() {
        var bounds, left, right, top, bottom, rotation;
        if (this.viewer) {
            bounds = this.viewer.bounds();
            rotation = (this.viewer.rotation() * 180 / Math.PI).toFixed();
            left = bounds.left.toFixed();
            right = bounds.right.toFixed();
            top = bounds.top.toFixed();
            bottom = bounds.bottom.toFixed();
            router.setQuery('bounds', [
                left, top, right, bottom, rotation
            ].join(','), {replace: true});
        }
    },

    /**
     * Get the view from the query string and set it on the image.
     */
    setImageBounds() {
        var bounds = router.getQuery('bounds');
        if (!bounds || !this.viewer) {
            return;
        }
        bounds = bounds.split(',');
        this.viewer.bounds({
            left: parseFloat(bounds[0]),
            top: parseFloat(bounds[1]),
            right: parseFloat(bounds[2]),
            bottom: parseFloat(bounds[3])
        });
        var rotation = parseFloat(bounds[4]) || 0;
        this.viewer.rotation(rotation * Math.PI / 180);
    },

    _updatePixelmapElements(pixelmapElements, annotation) {
        const groups = new StyleCollection();
        const defaultStyle = new StyleModel({id: this._defaultGroup});
        groups.fetch().done(() => {
            if (!groups.has(this._defaultGroup)) {
                groups.add(defaultStyle.toJSON());
                groups.get(this._defaultGroup).save();
            }
            _.each(pixelmapElements, (pixelmap) => {
                this._reconcilePixelmapCategories(pixelmap.get('id'), groups, annotation);
            });
            this.viewerWidget.drawAnnotation(annotation);
        });
    },

    _updatePixelmapsWithCategories(groups) {
        const pixelmapElements = _.pluck(this._overlayLayers, 'element');
        _.each(pixelmapElements, (element) => {
            const annotation = _.find(this.annotations.models, (annotation) => annotation.elements().get(element.id));
            this._reconcilePixelmapCategories(element.id, groups, annotation);
            this._redrawAnnotation(annotation);
        });
    },

    _reconcilePixelmapCategories(pixelmapId, groups, annotation) {
        if (!annotation || !annotation.elements()) {
            return;
        }
        const pixelmap = annotation.elements().get(pixelmapId);
        const existingCategories = pixelmap.get('categories') || [];
        const newCategories = [];
        const newStyleGroups = [];
        _.each(existingCategories, (category) => {
            const correspondingStyle = groups.get(category.label);
            if (!correspondingStyle) {
                const newStyle = new StyleModel({
                    id: category.label,
                    lineColor: category.strokeColor,
                    fillColor: category.fillColor
                });
                newStyleGroups.push(newStyle);
            } else {
                if (category.strokeColor !== correspondingStyle.get('lineColor')) {
                    category.strokeColor = correspondingStyle.get('lineColor');
                }
                if (category.fillColor !== correspondingStyle.get('fillColor')) {
                    category.fillColor = correspondingStyle.get('fillColor');
                }
            }
            newCategories.push(category);
        });

        groups.each((group) => {
            const correspondingCategory = existingCategories.find((category) => (
                category.label === group.get('id')));
            if (!correspondingCategory) {
                newCategories.push({
                    label: group.get('id'),
                    strokeColor: group.get('lineColor'),
                    fillColor: group.get('fillColor')
                });
            }
        });

        _.each(newStyleGroups, (group) => {
            groups.add(group);
            groups.get(group.get('id')).save();
        });

        // move the default category to index 0 and adjust data array if needed
        const originalDefaultIndex = _.findIndex(newCategories, {label: this._defaultGroup});
        const updatedCategories = _.where(newCategories, {label: this._defaultGroup})
            .concat(_.reject(newCategories, {label: this._defaultGroup}));
        pixelmap.set('categories', updatedCategories);
        if (originalDefaultIndex !== 0) {
            const originalData = pixelmap.get('values');
            const newData = _.map(originalData, (value) => {
                if (value === originalDefaultIndex) {
                    return 0;
                }
                if (value < originalDefaultIndex) {
                    return value + 1;
                }
                return value;
            });
            pixelmap.set('values', newData);
        }
    },

    toggleAnnotation(annotation) {
        if (!this.viewerWidget) {
            // We may need a way to queue annotation draws while viewer
            // initializes, but for now ignore them.
            return;
        }
        if (annotation.get('displayed')) {
            var viewer = this.viewerWidget.viewer || {};
            if (viewer.zoomRange && annotation._pageElements === true) {
                annotation.setView(viewer.bounds(), viewer.zoom(), viewer.zoomRange().max, true);
            }
            annotation.set('loading', true);
            annotation.once('g:fetched', () => {
                annotation.unset('loading');
            });
            annotation.fetch().then(() => {
                // abandon this if the annotation should not longer be shown
                // or we are now showing a different image.
                if (!annotation.get('displayed') || annotation.get('itemId') !== this.model.id) {
                    return null;
                }
                // update pixelmaps based on styles
                const pixelmapElements = annotation.elements().where({type: 'pixelmap'});
                if (pixelmapElements.length > 0) {
                    this._updatePixelmapElements(pixelmapElements, annotation);
                    return null;
                }
                this.viewerWidget.drawAnnotation(annotation);
                return null;
            });
        } else {
            this.viewerWidget.removeAnnotation(annotation);
        }
    },

    _redrawAnnotation(annotation) {
        if (!this.viewerWidget || !annotation.get('displayed')) {
            // We may need a way to queue annotation draws while viewer
            // initializes, but for now ignore them.
            return;
        }
        this.viewerWidget.drawAnnotation(annotation);
    },

    _highlightAnnotationForInteractiveMode(annotation, element) {
        if (!this.annotationSelector.interactiveMode()) {
            return;
        }
        this._closeContextMenu();
        this.viewerWidget.highlightAnnotation(annotation, annotation === false ? undefined : element);
    },

    widgetRegion(model) {
        var value = model.get('value');
        if (!this.viewerWidget || !this.viewerWidget.viewer) {
            model.set('value', '-1,-1,-1,-1');
            return;
        }
        this._displayedRegion = value.slice();
        if (value.length === 4) {
            this.showRegion({
                left: parseFloat(value[0]),
                right: parseFloat(value[0]) + parseFloat(value[2]),
                top: parseFloat(value[1]),
                bottom: parseFloat(value[1]) + parseFloat(value[3])
            });
        } else if (value.length === 6) {
            this.showRegion({
                left: parseFloat(value[0]) - parseFloat(value[3]),
                right: parseFloat(value[0]) + parseFloat(value[3]),
                top: parseFloat(value[1]) - parseFloat(value[4]),
                bottom: parseFloat(value[1]) + parseFloat(value[4])
            });
        } else if (value.length >= 2) {
            const points = [[]];
            for (let idx = 0; idx < value.length - 1; idx += 2) {
                if (parseFloat(value[idx]) === -1 && parseFloat(value[idx + 1]) === -1) {
                    points.push([]);
                } else {
                    points[points.length - 1].push([parseFloat(value[idx]), parseFloat(value[idx + 1])]);
                }
            }
            const elements = [];
            points.forEach((pts) => {
                if (!pts.length) {
                    return;
                }
                let closed = true;
                while (pts[pts.length - 1][0] === -2 && pts[pts.length - 1][1] === -2) {
                    pts = pts.slice(0, pts.length - 1);
                    closed = false;
                }
                if (pts.length === 1) {
                    elements.push({type: 'point', center: pts[0]});
                } else {
                    elements.push({type: 'polyline', closed: closed, points: pts});
                }
            });
            this.showRegion({elements: elements});
        }
    },

    _resetRegion() {
        var hasRegionParameter;
        if (!this._displayedRegion) {
            return;
        }
        _.each(
            this.controlPanel.models().filter((model) => model.get('type') === 'region'),
            (model) => {
                model.set('value', this._displayedRegion);
                hasRegionParameter = true;
            }
        );
        if (!hasRegionParameter) {
            this._displayedRegion = null;
            this.showRegion(null);
        }
    },

    showRegion(region) {
        if (!this.viewerWidget) {
            return;
        }

        this.viewerWidget.removeAnnotation(
            new AnnotationModel({_id: 'region-selection'})
        );
        if (!region) {
            return;
        }

        var fillColor = 'rgba(255,255,255,0)';
        var lineColor = 'rgba(0,0,0,1)';
        var lineWidth = 2;
        var annotation;
        if (region.elements) {
            annotation = new AnnotationModel({
                _id: 'region-selection',
                name: 'Region',
                annotation: {
                    elements: region.elements.map((entry) => _.extend({}, entry, {
                        fillColor,
                        lineColor,
                        lineWidth
                    }))
                }
            });
        } else {
            var center = [
                (region.left + region.right) / 2,
                (region.top + region.bottom) / 2,
                0
            ];
            var width = region.right - region.left;
            var height = region.bottom - region.top;
            var rotation = 0;
            annotation = new AnnotationModel({
                _id: 'region-selection',
                name: 'Region',
                annotation: {
                    elements: [{
                        type: 'rectangle',
                        center,
                        width,
                        height,
                        rotation,
                        fillColor,
                        lineColor,
                        lineWidth
                    }]
                }
            });
        }
        this.viewerWidget.drawAnnotation(annotation, {fetch: false});
    },

    showCoordinates(evt) {
        if (this.viewer) {
            var pt = evt.geo;
            this.$('.h-image-coordinates').text(
                pt.x.toFixed() + ', ' + pt.y.toFixed()
            );
        }
    },

    mouseOnAnnotation(element, annotationId) {
        if (annotationId === 'region-selection' || annotationId === 'selected') {
            return;
        }
        this._lastMouseOnElement = {element, annotationId};
        if (!this.annotationSelector.interactiveMode()) {
            return;
        }
        const annotation = this.annotations.get(annotationId);
        const elementModel = annotation.elements().get(element.id);
        annotation.set('highlight', true);
        if (this.drawWidget) {
            this.drawWidget.trigger('h:mouseon', elementModel);
        }
    },

    mouseOffAnnotation(element, annotationId) {
        this._lastMouseOnElement = null;
        if (annotationId === 'region-selection' || annotationId === 'selected' || !this.annotationSelector.interactiveMode()) {
            return;
        }
        const annotation = this.annotations.get(annotationId);
        const elementModel = annotation.elements().get(element.id);
        annotation.unset('highlight');
        if (this.drawWidget) {
            this.drawWidget.trigger('h:mouseoff', elementModel);
        }
    },

    mouseOverAnnotation(element, annotationId) {
        if (annotationId === 'region-selection' || annotationId === 'selected') {
            return;
        }
        element.annotation = this.annotations.get(annotationId);
        if (element.annotation) {
            this.popover.collection.add(element);
        }
    },

    mouseOutAnnotation(element, annotationId) {
        if (annotationId === 'region-selection' || annotationId === 'selected') {
            return;
        }
        element.annotation = this.annotations.get(annotationId);
        if (element.annotation) {
            this.popover.collection.remove(element);
        }
    },

    mouseResetAnnotation() {
        if (this.popover.collection.length) {
            this.popover.collection.reset();
        }
    },

    getPixelmapElements() {
        let allPixelmaps = [];
        this.annotations.each((annotation) => {
            const pixelmaps = annotation.elements().filter((element) => element.get('type') === 'pixelmap');
            allPixelmaps = allPixelmaps.concat(pixelmaps);
        });
        return allPixelmaps;
    },

    _getCategoryIndexFromStyleGroup(annotationElement, styleGroup) {
        const categories = annotationElement.get('categories');
        const groupId = styleGroup.get('id');
        const newIndex = _.findIndex(categories, {label: groupId});
        return (newIndex < 0) ? 0 : newIndex;
    },

    _updatePixelmapValues(pixelmapElementModel, layer, annotation) {
        let newData = layer.data();
        if (pixelmapElementModel.get('boundaries')) {
            newData = newData.filter((d, i) => i % 2 === 0);
        }
        pixelmapElementModel.set('values', newData);
        if (annotation) {
            this._redrawAnnotation(annotation);
        }
    },

    _closePixelmapContextMenu() {
        if (!this._pixelmapContextMenuActive) {
            return;
        }
        this.pixelmapContextMenu.updatePixelmap();
        this.$('#h-pixelmap-context-menu').addClass('hidden');
        this._pixelmapContextMenuActive = false;
    },

    _handlePixelmapContextMenu(pixelmap, dataIndex, group) {
        const categoryIndex = _.findIndex(pixelmap.get('categories'), {label: group});
        const pixelmapLayer = this.viewer.layers().find((layer) => layer.id() === pixelmap.get('id'));
        if (!pixelmapLayer || dataIndex < 0) {
            return;
        }
        const layerDataIndex = pixelmap.get('boundaries') ? (dataIndex - dataIndex % 2) : dataIndex;
        const offset = pixelmap.get('boundaries') ? 1 : 0;
        const data = pixelmapLayer.data();
        const categories = pixelmap.get('categories');
        const newValue = (categoryIndex < 0 || categoryIndex >= categories.length) ? 0 : categoryIndex;
        data[layerDataIndex] = data[layerDataIndex + offset] = newValue;
        pixelmapLayer.indexModified(layerDataIndex, layerDataIndex + offset).draw();
        this._debounceUpdatePixelmapValues(pixelmap, pixelmapLayer);
    },

    mouseClickOverlay(overlayElement, overlayLayer, event) {
        if (overlayElement.get('type') !== 'pixelmap') { return; }
        const overlayAnnotationIsSelected = this.activeAnnotation && this.activeAnnotation.elements().get(overlayElement.id);
        const index = overlayElement.get('boundaries') ? (event.index - event.index % 2) : event.index;
        if (event.mouse.buttonsDown.left && !event.mouse.modifiers.shift && this.drawWidget && overlayAnnotationIsSelected) {
            // left click. check what the active style is and if it applies
            const style = this.drawWidget.getStyleGroup();
            const newIndex = this._getCategoryIndexFromStyleGroup(overlayElement, style);

            const offset = overlayElement.get('boundaries') ? 1 : 0;
            const data = overlayLayer.data();
            const categories = overlayElement.get('categories');
            const newValue = (newIndex < 0 || newIndex >= categories.length) ? 0 : newIndex;
            data[index] = data[index + offset] = newValue;
            overlayLayer.indexModified(index, index + offset).draw();
            this._debounceUpdatePixelmapValues(overlayElement, overlayLayer);
        } else if (event.mouse.buttonsDown.right) {
            const annotation = this.annotations.find((annotation) => annotation.elements().get(overlayElement.id));
            if (!annotation) {
                return;
            }
            this._queueMouseClickAction(overlayElement, annotation.id, null, null);
            window.requestAnimationFrame(() => {
                const data = this._processMouseClickQueue();
                if (!data || data.element.id !== overlayElement.id) {
                    return;
                }
                if (!this._canOpenContextMenu()) {
                    return;
                }
                this.pixelmapContextMenu.updatePixelmap(overlayElement, event.index);
                // show pixelmap context menu
                window.setTimeout(() => {
                    const $window = $(window);
                    const menu = this.$('#h-pixelmap-context-menu');
                    const position = event.mouse.page;
                    menu.removeClass('hidden');
                    // adjust the vertical position of the context menu
                    const belowWindow = Math.min(0, $window.height() - position.y - menu.height() + 20);
                    const top = Math.max(0, position.y + belowWindow);

                    const windowWidth = $window.width();
                    const menuWidth = menu.width();
                    let left = position.x;
                    if (left + menuWidth > windowWidth) {
                        left -= menuWidth;
                    }
                    left = Math.max(left, 0);

                    menu.css({left, top});
                    this._pixelmapContextMenuActive = true;
                }, 1);
            });
        }
    },

    mouseOverOverlay(overlayElement, overlayLayer, event) {
        const overlayAnnotationIsSelected = this.activeAnnotation && this.activeAnnotation.elements().get(overlayElement.id);
        if (event.mouse.buttons.left && event.mouse.modifiers.shift && this.drawWidget && overlayAnnotationIsSelected) {
            const style = this.drawWidget.getStyleGroup();
            const newIndex = this._getCategoryIndexFromStyleGroup(overlayElement, style);

            const index = overlayElement.get('boundaries') ? (event.index - event.index % 2) : event.index;
            const offset = overlayElement.get('boundaries') ? 1 : 0;
            const data = overlayLayer.data();
            const categories = overlayElement.get('categories');
            const newValue = (newIndex < 0 || newIndex >= categories.length) ? 0 : newIndex;
            data[index] = data[index + offset] = newValue;
            overlayLayer.indexModified(index, index + offset).draw();
            this._debounceUpdatePixelmapValues(overlayElement, overlayLayer);
        }
    },

    overlayLayerDrawn(element, layer) {
        this._overlayLayers[element.id] = {
            layer,
            element
        };
    },

    overlayLayerRemoved(element, layer) {
        if (this._overlayLayers[element.id]) {
            delete this._overlayLayers[element.id];
        }
    },

    mouseClickAnnotation(element, annotationId, evt) {
        if (!element.annotation) {
            // This is an instance of "selectedElements" and should be ignored.
            return;
        }

        /*
         * Click events on geojs features are triggered once per feature in a single animation frame.
         * Here we collect all click events occurring in a single animation frame and defer processing.
         * On the next frame, the queue is processed and the action is only performed on the "closest"
         * feature.  Here "closest" is determined by a fast heuristic--the one with a vertex closest
         * to the point clicked.  We can improve this heuristic as necessary.
         */
        this._queueMouseClickAction(element, annotationId, evt.data.geometry, evt.mouse.geo);
        if (this._mouseClickQueue.length > 1) {
            return;
        }

        window.requestAnimationFrame(() => {
            const {element, annotationId} = this._processMouseClickQueue();
            if (!evt.mouse.modifiers.shift && (!evt.sourceEvent || !evt.sourceEvent.handled)) {
                if (evt.mouse.buttonsDown.right) {
                    this._openContextMenu(element.annotation.elements().get(element.id), annotationId, evt);
                } else if (evt.mouse.modifiers.ctrl && !this.viewerWidget.annotationLayer.mode()) {
                    this._toggleSelectElement(element.annotation.elements().get(element.id));
                } else if (evt.mouse.buttonsDown.left && !this.viewerWidget.annotationLayer.mode() && this.allowClickSelection) {
                    this._selectSingleElement(element.annotation.elements().get(element.id));
                }
            }
        });
    },

    toggleLabels(options) {
        this.popover.toggle(options.show);
    },

    _queueMouseClickAction(element, annotationId, geometry, center) {
        let minimumDistance = Number.POSITIVE_INFINITY;
        if (geometry) {
            if (geometry.type !== 'Polygon') {
                // We don't current try to resolve any other geometry type, for the moment,
                // any point or line clicked on will always be chosen over a polygon.
                minimumDistance = 0;
            } else {
                const points = geometry.coordinates[0];
                // use an explicit loop for speed
                for (let index = 0; index < points.length; index += 1) {
                    const point = points[index];
                    const dx = point[0] - center.x;
                    const dy = point[1] - center.y;
                    const distance = dx * dx + dy * dy;
                    minimumDistance = Math.min(minimumDistance, distance);
                }
            }
        }
        this._mouseClickQueue.push({element, annotationId, value: minimumDistance});
    },

    _processMouseClickQueue(evt) {
        const sorted = _.sortBy(this._mouseClickQueue, _.property('value'));
        this._mouseClickQueue = [];
        return sorted[0];
    },

    _toggleInteractiveMode(interactive) {
        if (!interactive) {
            this.viewerWidget.highlightAnnotation();
            this.annotations.each((annotation) => {
                annotation.unset('highlight');
                if (this.drawWidget) {
                    annotation.elements().each((element) => {
                        this.drawWidget.trigger('h:mouseoff', element);
                    });
                }
            });
        }
    },

    _removeDrawWidget() {
        if (this.drawWidget) {
            this._lastDrawingType = this.drawWidget.drawingType();
            this.drawWidget.cancelDrawMode();
            this.stopListening(this.drawWidget);
            this.drawWidget.remove();
            this.drawWidget = null;
            $('<div/>').addClass('h-draw-widget s-panel hidden').attr('id', 'h-draw-panel')
                .appendTo(this.$('#h-annotation-selector-container'));
            this._orderPanels();
        }
    },

    _editAnnotation(model) {
        if (this.activeAnnotation === model) {
            return;
        }
        this.activeAnnotation = model;
        this.annotationSelector.$('.h-annotation').removeClass('h-active-annotation');
        this._removeDrawWidget();
        if (model) {
            this.annotationSelector.$('.h-annotation[data-id="' + model.id + '"]').addClass('h-active-annotation');
            this.drawWidget = new DrawWidget({
                parentView: this,
                image: this.model,
                annotation: this.activeAnnotation,
                drawingType: this._lastDrawingType,
                el: this.$('.h-draw-widget'),
                viewer: this.viewerWidget,
                annotationSelector: this.annotationSelector
            }).render();
            this.listenTo(this.drawWidget, 'h:redraw', this._redrawAnnotation);
            this.listenTo(this.drawWidget, 'h:styleGroupsUpdated', this._updatePixelmapsWithCategories);
            this.$('.h-draw-widget').removeClass('hidden');
        }
    },

    _deleteAnnotation(model) {
        if (this.activeAnnotation && this.activeAnnotation.id === model.id) {
            this._removeDrawWidget();
        }
        this.annotationSelector._deselectAnnotationElements(model);
    },

    _setAnnotationOpacity(opacity) {
        this.viewerWidget.setGlobalAnnotationOpacity(opacity);
    },

    _setAnnotationFillOpacity(opacity) {
        this.viewerWidget.setGlobalAnnotationFillOpacity(opacity);
    },

    _onKeyDown(evt) {
        /* Don't trigger keys if we are in an input field. */
        if (/^(input|textarea|select)$/.test((document.activeElement.tagName || '').toLowerCase())) {
            return;
        }
        const drawModes = {
            o: 'point',
            r: 'rectangle',
            i: 'ellipse',
            c: 'circle',
            p: 'polygon',
            l: 'line',
            b: 'brush'
        };
        switch (evt.key) {
            case 'a':
                this._showOrHideAnnotations();
                break;
            case 'e':
                if (this._lastMouseOnElement) {
                    const annotation = this.annotations.get(this._lastMouseOnElement.annotationId);
                    const elementModel = annotation.elements().get(this._lastMouseOnElement.element.id);
                    this._editElementShape(elementModel, annotation.id);
                }
                break;
            case 's':
                this.annotationSelector.selectAnnotationByRegion();
                break;
            case 'S':
                this.annotationSelector.selectAnnotationByRegion(true);
                break;
            case 'C':
                this._resetSelection();
                break;
            case 'm':
                if (this._currentMousePosition && (this.selectedElements.length > 0 || this._lastMouseOnElement)) {
                    let annotationId, element;
                    if (this.selectedElements.length > 0) {
                        element = this.selectedElements.models[0];
                        annotationId = element.originalAnnotation.id;
                    } else {
                        annotationId = this._lastMouseOnElement.annotationId;
                        element = this.annotations.get(annotationId).elements().get(this._lastMouseOnElement.element.id);
                    }
                    this._openContextMenu(element, annotationId, {
                        mouse: this._currentMousePosition
                    });
                }
                break;
            case ' ': // pressing space bar creates a new annotation
                this.annotationSelector.createAnnotation();
                break;
            case 'B':
                if (this.activeAnnotation) {
                    this.drawWidget.nextBrushShape();
                }
                break;
            case '[':
                if (this.activeAnnotation) {
                    this.drawWidget.adjustBrushSize(-1);
                }
                break;
            case ']':
                if (this.activeAnnotation) {
                    this.drawWidget.adjustBrushSize(1);
                }
                break;
            case 'q':
                if (this.activeAnnotation) {
                    this.drawWidget.setToPrevStyleGroup();
                }
                break;
            case 'w':
                if (this.activeAnnotation) {
                    this.drawWidget.setToNextStyleGroup();
                }
                break;
            case 'Enter':
                {
                    const drawingType = this.drawWidget && this.drawWidget._drawingType;
                    if (this.activeAnnotation && ['polygon', 'line'].includes(drawingType)) {
                        const annotation = this.viewerWidget.annotationLayer.annotations()[0];

                        // The current mouse position is included as the last vertex, so remove
                        // it before saving it
                        annotation.options('vertices').pop();

                        // Only save the annotation if there are enough vertices for it to form
                        // a line or polygon
                        if (
                            (drawingType === 'polygon' && annotation.options('vertices').length > 2) ||
                        (drawingType === 'line' && annotation.options('vertices').length > 1)
                        ) {
                            annotation.state(geo.annotation.state.done).modified().draw();
                        }

                        this.drawWidget.cancelDrawMode();
                    }
                }
                break;
            default:
                if (this.drawWidget && drawModes[evt.key] && this.activeAnnotation) {
                    const mode = drawModes[evt.key];
                    if (this.drawWidget._drawingType === mode) {
                        this.drawWidget.cancelDrawMode();
                    } else {
                        this.drawWidget.drawElement(undefined, mode);
                    }
                }
                break;
        }
    },

    _trackMousePosition(evt) {
        this._currentMousePosition = {
            page: {
                x: evt.pageX,
                y: evt.pageY
            },
            client: {
                x: evt.clientX,
                y: evt.clientY
            }
        };
    },

    _showOrHideAnnotations() {
        if (this.annotations.any((a) => a.get('displayed'))) {
            this.annotationSelector.hideAllAnnotations();
        } else {
            this.annotationSelector.showAllAnnotations();
        }
    },

    _selectElementsByRegion(evt) {
        if (this.drawWidget && this.drawWidget.drawingType()) {
            this.drawWidget.cancelDrawMode();
        }
        this._selectElementsByRegionCanceled = false;
        this.viewerWidget.drawRegion(undefined, evt && evt.polygon ? 'polygon' : undefined).then((coord) => {
            if (this._selectElementsByRegionCanceled) {
                return this;
            }
            this._resetSelection();
            let found;
            if (coord.length === 4) {
                const boundingBox = {
                    left: coord[0],
                    top: coord[1],
                    width: coord[2],
                    height: coord[3]
                };
                found = this.getElementsInBox(boundingBox);
            } else {
                const polygon = coord.slice(0, coord.length / 2).map((c, idx) => ({x: coord[idx * 2], y: coord[idx * 2 + 1], z: 0}));
                found = this.getElementsInPolygon(polygon);
            }
            found.forEach(({element}, idx) => this._selectElement(element, {silent: idx !== found.length - 1}));
            if (this.selectedElements.length > 0 && this._currentMousePosition && this.autoRegionContextMenu) {
                // fake an open context menu
                const {element, annotationId} = found[0];
                this._openContextMenu(element, annotationId, {
                    mouse: this._currentMousePosition
                }, true);
            }
            this.trigger('h:selectedElementsByRegion', this.selectedElements);
            return this;
        });
    },

    _selectElementsByRegionCancel() {
        this.viewerWidget.annotationLayer.mode(null);
        this._selectElementsByRegionCanceled = true;
        this.trigger('h:selectedElementsByRegion', []);
    },

    getElementsInBox(boundingBox) {
        const poly = [
            {x: boundingBox.left, y: boundingBox.top + boundingBox.height},
            {x: boundingBox.left + boundingBox.width, y: boundingBox.top + boundingBox.height},
            {x: boundingBox.left + boundingBox.width, y: boundingBox.top},
            {x: boundingBox.left, y: boundingBox.top}
        ];
        return this.getElementsInPolygon(poly);
    },

    getElementsInPolygon(poly) {
        const results = [];
        this.viewerWidget.featureLayer.features().forEach((feature) => {
            const r = feature.polygonSearch(poly, {partial: false});
            r.found.forEach((feature) => {
                const annotationId = feature.properties ? feature.properties.annotation : null;
                const element = feature.properties ? feature.properties.element : null;
                if (element && element.id && annotationId) {
                    const annotation = this.annotations.get(annotationId);
                    results.push({
                        element: annotation.elements().get(element.id),
                        annotationId
                    });
                }
            });
        });
        return results;
    },

    _canOpenContextMenu() {
        return !this._contextMenuActive && !this._pixelmapContextMenuActive;
    },

    _openContextMenu(element, annotationId, evt, force) {
        if (!this._canOpenContextMenu() || !element || (!force && this.annotationSelector.selectAnnotationByRegionActive())) {
            return;
        }
        if (!this.selectedElements.get(element.id)) {
            this._resetSelection();
            this._selectElement(element);
        }

        if (!this.selectedElements.get(element.id)) {
            // If still not selected, then the user does not have access.
            return;
        }

        // Defer the context menu action into the next animation frame
        // to work around a problem with preventDefault on Windows
        window.setTimeout(() => {
            const $window = $(window);
            const menu = this.$('#h-annotation-context-menu');
            const position = evt.mouse.page;
            menu.removeClass('hidden');

            // adjust the vertical position of the context menu
            // == 0, above the bottom; < 0, number of pixels below the bottom
            // the menu height is bigger by 20 pixels due to extra padding
            const belowWindow = Math.min(0, $window.height() - position.y - menu.height() + 20);
            // ensure the top is not above the top of the window
            const top = Math.max(0, position.y + belowWindow);

            // Put the context menu to the left of the cursor if it is too close
            // to the right edge.
            const windowWidth = $window.width();
            const menuWidth = menu.width();
            let left = position.x;
            if (left + menuWidth > windowWidth) {
                left -= menuWidth;
            }
            left = Math.max(left, 0);

            menu.css({left, top});
            if (this.popover.collection.length) {
                this.popover.collection.reset();
            }
            this._contextMenuActive = true;
        }, 1);
    },

    _closeContextMenu() {
        if (!this._contextMenuActive) {
            return;
        }
        this.$('#h-annotation-context-menu').addClass('hidden');
        this._resetSelection();
        if (this.popover.collection.length) {
            this.popover.collection.reset();
        }
        this._contextMenuActive = false;
        this.viewerWidget.viewer.node().focus();
    },

    _editElement(element) {
        const annotation = this.annotations.get(element.originalAnnotation);
        this._editAnnotation(annotation);
        editElement(annotation.elements().get(element.id), this._defaultGroup);
    },

    _editElementShape(element, annotationId) {
        this._preeditDrawMode = this.drawWidget ? this.drawWidget.drawingType() : undefined;
        this.drawWidget.cancelDrawMode();
        const annotation = this.annotations.get(element.originalAnnotation || annotationId);
        this._editAnnotation(annotation);
        const geojson = convertToGeojson(element);
        this._currentAnnotationEditShape = {
            annotation,
            element: annotation.elements().get(element.id)
        };
        this.viewerWidget.hideAnnotation(annotation.id, element.id);
        this.viewerWidget.annotationLayer.removeAllAnnotations();
        const count = this.viewerWidget.annotationLayer.geojson(geojson);
        if (count !== 1) {
            return;
        }
        const annot = this.viewerWidget.annotationLayer.annotations();
        if (annot.length !== 1) {
            return;
        }
        // geoOff state so the annotation isn't added by large_image_annotation
        this.viewerWidget.annotationLayer.geoOff(geo.event.annotation.state);
        this.viewerWidget.annotationLayer.mode(this.viewerWidget.annotationLayer.modes.edit, annot[0]).draw();
        if (!this._editElementShapeFinishBound) {
            this._editElementShapeFinishBound = _.bind(this._editElementShapeFinish, this);
        }
        this.viewerWidget.annotationLayer.geoOn(geo.event.annotation.state, this._editElementShapeFinishBound);
    },

    _editElementShapeFinish(event) {
        if (event.annotation.state() !== geo.annotation.state.done) {
            return;
        }
        this.viewerWidget.annotationLayer.geoOff(geo.event.annotation.state, this._editElementShapeFinishBound);
        const annot = convertFromGeojson(event.annotation);
        var update = {};
        ['points', 'center', 'width', 'height', 'rotation'].forEach((key) => {
            if (annot[key] !== undefined) {
                update[key] = annot[key];
            }
        });
        this._currentAnnotationEditShape.element.set(update);
        this._currentAnnotationEditShape = null;
        this.viewerWidget.annotationLayer.removeAllAnnotations();
        this.viewerWidget.hideAnnotation();
        if (this.drawWidget) {
            this.drawWidget.cancelDrawMode();
            if (this._preeditDrawMode) {
                window.setTimeout(() => {
                    this.drawWidget.drawElement(undefined, this._preeditDrawMode);
                }, 0);
            }
        }
    },

    _redrawSelection() {
        this.viewerWidget.removeAnnotation(this.selectedAnnotation);
        this.viewerWidget.drawAnnotation(this.selectedAnnotation, {fetch: false});
    },

    _selectElement(element, options) {
        // don't allow selecting annotations with no write access or
        // elements not associated with a real annotation.
        const annotation = (element.collection || {}).annotation;
        if (!annotation || annotation.get('_accessLevel') < AccessType.WRITE) {
            return;
        }

        var elementModel = this.selectedElements.add(element.attributes, options);
        elementModel.originalAnnotation = annotation;
        this.viewerWidget.highlightAnnotation(this.selectedAnnotation.id);
    },

    _unselectElement(element) {
        this.selectedElements.remove(element.id);
        if (!this.selectedElements.length) {
            this.viewerWidget.highlightAnnotation();
        }
    },

    _selectSingleElement(element) {
        if ((this.selectedElements.length > (element ? 1 : 0)) || (this.selectedElements.length === 1 && !this.selectedElements.get(element.id))) {
            this._resetSelection();
        }
        this._toggleSelectElement(element);
    },

    _toggleSelectElement(element) {
        if (element) {
            if (this.selectedElements.get(element.id)) {
                this._unselectElement(element);
            } else {
                this._selectElement(element);
            }
        }
    },

    _resetSelection() {
        if (this.viewerWidget && this.viewerWidget._highlightAnnotation) {
            this.viewerWidget.highlightAnnotation();
        }
        if (this.selectedElements && this.selectedElements.length) {
            this.selectedElements.reset();
        }
    },

    _selectElementsByGroup(group) {
        if (!this.activeAnnotation) {
            return;
        }
        this._resetSelection();
        let last;
        this.activeAnnotation.elements().forEach((element) => {
            if (element.get('group') === group || (group === this._defaultGroup && element.get('group') === undefined)) {
                if (last !== undefined) {
                    this._selectElement(last, {silent: true});
                }
                last = element;
            }
        });
        if (last !== undefined) {
            this._selectElement(last);
        }
    },

    _saveSelection() {
        const groupedAnnotations = this.selectedElements.groupBy((element) => element.originalAnnotation.id);
        _.each(groupedAnnotations, (elements, annotationId) => {
            const annotation = this.annotations.get(annotationId);
            _.each(elements, (element) => { /* eslint-disable backbone/no-silent */
                const annotationElement = annotation.elements().get(element.id);
                // silence the event because we want to make one save call for each annotation.
                annotationElement.set(element.toJSON(), {silent: true});
                if (!element.get('group')) {
                    annotationElement.unset('group', {silent: true});
                }
            });
            if (!elements.length) {
                return;
            }
            const annotationData = _.extend({}, annotation.get('annotation'));
            annotationData.elements = annotation.elements().toJSON();
            annotation.set('annotation', annotationData);
        });
    },
    _removeSelection() {
        const groupedAnnotations = this.selectedElements.groupBy((element) => element.originalAnnotation.id);
        _.each(groupedAnnotations, (elements, annotationId) => { /* eslint-disable backbone/no-silent */
            // silence the event because we want to make one save call for each annotation.
            const elementsCollection = this.annotations.get(annotationId).elements();
            elementsCollection.remove(elements, {silent: true});
            elementsCollection.trigger('reset', elementsCollection);
        });
    },
    _deselectAnnotationElements(evt) {
        const model = (evt || {}).model;
        if (this.selectedElements && this.selectedElements.length) {
            const elements = this.selectedElements.models.filter((el) => el.originalAnnotation.id === model.id);
            if (elements.length) {
                if (elements.length === this.selectedElements.length) {
                    this._resetSelection();
                } else {
                    elements.forEach((el, idx) => {
                        this.selectedElements.remove(el.id, {silent: idx !== elements.length - 1});
                    });
                }
            }
        }
    },
    _orderPanels() {
        if (!this._knownPanels) {
            this._knownPanels = {};
        }
        HuiSettings.getSettings().then((settings) => {
            let layout = settings['histomicsui.panel_layout'];
            if (this._folderConfig && this._folderConfig.panelLayout && this._folderConfig.panelLayout !== 'default') {
                layout = this._folderConfig.panelLayout;
            }
            if (!layout) {
                return null;
            }
            if (typeof layout === 'string') {
                layout = JSON.parse(layout);
            }
            const panels = this.$('[id^=h-][id$=-panel]');
            panels.each((idx, panel) => {
                panel = $(panel);
                const info = {
                    name: panel.attr('id').substr(2, panel.attr('id').length - 8),
                    position: 'left',
                    state: 'open'
                };
                if (!panel.closest('.h-panel-group-left').length) {
                    info.position = 'right';
                }
                if (!panel.find('.s-panel-content.collapse.in').length) {
                    info.state = 'closed';
                }
                this._knownPanels[info.name] = info;
            });
            layout = layout.filter((spec) => this.$(`#h-${spec.name}-panel`).length).reverse();
            layout.forEach((spec) => {
                const panel = this.$(`#h-${spec.name}-panel`);
                const info = this._knownPanels[spec.name];

                if (spec.position === 'hidden') {
                    panel.addClass('hidden');
                    return;
                }
                const parent = spec.position === 'left' || (spec.position !== 'right' && info.position === 'left') ? '.h-panel-group-left' : '.h-panel-group-right';
                panel.prependTo(parent);
                if (!info.processed && panel.find('.s-panel-content').length) {
                    if (spec.state === 'open') {
                        panel.find('.s-panel-content').addClass('in');
                        panel.find('.s-panel-controls .icon-down-open').removeClass('icon-down-open').addClass('icon-up-open');
                    }
                    if (spec.state === 'closed') {
                        panel.find('.s-panel-content').removeClass('in');
                        panel.find('.s-panel-controls .icon-up-open').removeClass('icon-up-open').addClass('icon-down-open');
                    }
                    info.processed = true;
                }
            });
            return null;
        });
    },
    _getConfig(modelId) {
        if (modelId !== this._folderConfigId) {
            this._folderConfigId = modelId;
            this._folderConfig = {};
        }
        restRequest({
            url: `folder/${this.model.get('folderId')}/yaml_config/.histomicsui_config.yaml`
        }).done((val) => {
            $('body').attr('view-mode', (val || {}).viewMode || '');
            if (!val || this.model.id !== modelId) {
                return;
            }
            this._folderConfig = val;
            if (val.annotationGroups) {
                const groups = new StyleCollection();
                groups.fetch().done(() => {
                    if (!val || this.model.id !== modelId) {
                        return;
                    }
                    this._defaultGroup = val.annotationGroups.defaultGroup || 'default';
                    if ((val.annotationGroups.groups || []).length) {
                        if (val.annotationGroups.replaceGroups) {
                            while (groups.length) {
                                groups.first().destroy();
                            }
                        }
                        val.annotationGroups.groups.forEach((group) => {
                            group.label = group.label ? {value: group.label} : undefined;
                            groups.add(group);
                        });
                        groups.each((model) => { model.save(); });
                    }
                });
            }
        });
    },

    _widgetDrawRegion(evt) {
        if (evt.model && evt.event) {
            const target = $(evt.event.target).closest('.s-select-region-button');
            target.closest('.input-group-btn').find('.s-select-region-button').removeClass('active');
            if (evt.mode) {
                target.addClass('active');
            }
        }
    },

    _drawModeChange(evt) {
        if (this._drawingType) {
            this.viewer.annotationLayer.mode(null);
            this.viewer.annotationLayer.geoOff(geo.event.annotation.state);
        }
        this._drawingType = null;
        $('#h-analysis-panel .input-group-btn').find('.s-select-region-button').removeClass('active');
    },

    _drawRegionUpdate(evt) {
        if (evt.submit && evt.submit.hasClass('enabled')) {
            $('#h-analysis-panel .s-info-panel-submit').trigger('click');
            if (evt.originalEvent) {
                $(`#h-analysis-panel .s-select-region-button[shape="${$(evt.originalEvent.target).attr('shape')}"][multi="${$(evt.originalEvent.target).attr('multi')}"][parent-id="${$(evt.originalEvent.target).attr('parent-id')}"]`).eq(0).trigger('click');
            }
        }
    }
});
export default ImageView;
