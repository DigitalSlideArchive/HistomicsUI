/* global geo */
import overviewWidget from '../templates/panels/overviewWidget.pug';
import '../stylesheets/panels/overviewWidget.styl';

const _ = girder._;
const Panel = girder.plugins.slicer_cli_web.views.Panel;

var OverviewWidget = Panel.extend({
    render() {
        this.$el.html(overviewWidget({
            id: 'overview-panel-container',
            collapsed: this.$('.s-panel-content.collapse').length && !this.$('.s-panel-content').hasClass('in')
        }));
        window.setTimeout(() => {
            this._createOverview();
        }, 1);
        return this;
    },

    /**
     * Set the viewer instance and set several internal variables used
     * to convert between magnification and zoom level.
     */
    setViewer(viewer) {
        if (viewer !== this.parentViewer) {
            if (this.parentViewer && this.parentViewer.viewer && this._boundOnParentPan) {
                this.parentViewer.viewer.geoOff(geo.event.pan, this._boundOnParentPan);
                this._boundOnParentPan = null;
            }
            this.parentViewer = viewer;
            this._createOverview();
        }
        return this;
    },

    setImage(tiles) {
        if (!_.isEqual(tiles, this._tiles)) {
            this._tiles = tiles;
            this._createOverview();
        }
        return this;
    },

    _createOverview() {
        if (!this._tiles || !this.parentViewer || !this.parentViewer.viewer || !this.$el.find('.h-overview-image').length) {
            if (this.viewer) {
                this.viewer.exit();
                this.viewer = null;
            }
            return;
        }
        const tiles = this._tiles;

        const params = geo.util.pixelCoordinateParams(
            this.$el.find('.h-overview-image'), tiles.sizeX, tiles.sizeY, tiles.tileWidth, tiles.tileHeight);
        params.layer.useCredentials = true;
        params.layer.url = this.parentViewer.getFrameAndUrl().url;
        if (tiles.tileWidth > 8192 || tiles.tileHeight > 8192) {
            params.layer.renderer = 'canvas';
        }
        /* We want the actions to trigger on the overview, but affect the main
         * image, so we have to rerig all of the actions */
        params.map.interactor = geo.mapInteractor({
            actions: [{
                action: 'overview_pan',
                input: 'left',
                modifiers: {shift: false, ctrl: false},
                owner: 'histomicsui.overview',
                name: 'button pan'
            }, {
                action: 'overview_zoomselect',
                input: 'left',
                modifiers: {shift: true, ctrl: false},
                selectionRectangle: geo.event.zoomselect,
                owner: 'histomicsui.overview',
                name: 'drag zoom'
            }],
            keyboard: {
                actions: {}
            }
        });
        this.viewer = geo.map(params.map);

        if (window.ResizeObserver) {
            this._observer = new window.ResizeObserver(() => {
                if (this.viewer.node().width()) {
                    this.viewer.size({width: this.viewer.node().width(), height: this.viewer.node().height()});
                }
            });
            this._observer.observe(this.viewer.node()[0]);
        }

        params.layer.autoshareRenderer = false;
        this._tileLayer = this.viewer.createLayer('osm', params.layer);
        if (this.parentViewer._layer && this.parentViewer._layer.setFrameQuad) {
            const setFrameQuad = girder.plugins.large_image.utils.setFrameQuad;
            setFrameQuad((this.parentViewer._layer.setFrameQuad.status || {}).tileinfo, this._tileLayer, (this.parentViewer._layer.setFrameQuad.status || {}).options);
            this._tileLayer.setFrameQuad(0);
        }
        this._featureLayer = this.viewer.createLayer('feature', {features: ['polygon']});
        this._outlineFeature = this._featureLayer.createFeature('polygon', {
            style: {
                stroke: true,
                strokeColor: 'black',
                strokeWidth: 2,
                fill: false
            }
        });
        this._panOutlineDistance = 5;
        /* Clicking in the overview recenters to that spot */
        this._featureLayer.geoOn(geo.event.mouseclick, (evt) => {
            this.parentViewer.viewer.center(evt.geo);
        });
        this._featureLayer.geoOn(geo.event.actiondown, (evt) => {
            this._downState = {
                state: evt.state,
                mouse: evt.mouse,
                center: this.parentViewer.viewer.center(),
                zoom: this.parentViewer.viewer.zoom(),
                rotate: this.parentViewer.viewer.rotation(),
                distanceToOutline: geo.util.distanceToPolygon2d(evt.mouse.geo, this._outlineFeature.data()[0]) / this.viewer.unitsPerPixel(this.viewer.zoom())
            };
        });
        this._featureLayer.geoOn(geo.event.actionmove, (evt) => {
            switch (evt.state.action) {
                case 'overview_pan': {
                    if (!this._downState || this._downState.distanceToOutline < -this._panOutlineDistance) {
                        return;
                    }
                    const delta = {
                        x: evt.mouse.geo.x - this._downState.mouse.geo.x,
                        y: evt.mouse.geo.y - this._downState.mouse.geo.y
                    };
                    const center = this.parentViewer.viewer.center();
                    delta.x -= center.x - this._downState.center.x;
                    delta.y -= center.y - this._downState.center.y;
                    if (delta.x || delta.y) {
                        this.parentViewer.viewer.center({
                            x: center.x + delta.x,
                            y: center.y + delta.y
                        });
                    }
                }
                    break;
            }
        });
        this._featureLayer.geoOn(geo.event.actionselection, (evt) => {
            if (evt.lowerLeft.x === evt.upperRight.x || evt.lowerLeft.y === evt.upperRight.y) {
                return;
            }
            const map = this.parentViewer.viewer;
            const mapsize = map.size();
            const lowerLeft = map.gcsToDisplay(this.viewer.displayToGcs(evt.lowerLeft));
            const upperRight = map.gcsToDisplay(this.viewer.displayToGcs(evt.upperRight));
            const scaling = {
                x: Math.abs((upperRight.x - lowerLeft.x) / mapsize.width),
                y: Math.abs((upperRight.y - lowerLeft.y) / mapsize.height)
            };
            const center = map.displayToGcs({
                x: (lowerLeft.x + upperRight.x) / 2,
                y: (lowerLeft.y + upperRight.y) / 2
            }, null);
            const zoom = map.zoom() - Math.log2(Math.max(scaling.x, scaling.y));
            map.zoom(zoom);
            map.center(center, null);
        });
        this.viewer.draw();
        this._boundOnParentPan = _.bind(this._onParentPan, this);
        this.parentViewer.viewer.geoOn(geo.event.pan, this._boundOnParentPan);
        this._onParentPan();
        this.parentViewer.on('g:imageFrameChanged', () => {
            this._tileLayer.url(this.parentViewer.getFrameAndUrl().url);
            if (this.parentViewer._layer && this.parentViewer._layer.setFrameQuad) {
                this._tileLayer.setFrameQuad((this.parentViewer._layer.setFrameQuad.status || {}).frame);
            }
        });
    },

    _onParentPan() {
        const parent = this.parentViewer.viewer;
        if (parent.rotation() !== this.viewer.rotation()) {
            this.viewer.rotation(parent.rotation());
            this.viewer.zoom(this.viewer.zoom() - 1);
        }
        const size = parent.size();
        this._outlineFeature.data([[
            parent.displayToGcs({x: 0, y: 0}),
            parent.displayToGcs({x: size.width, y: 0}),
            parent.displayToGcs({x: size.width, y: size.height}),
            parent.displayToGcs({x: 0, y: size.height})
        ]]).draw();
    }
});

export default OverviewWidget;
