<script>
/* global geo */
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';

import store from './store.js';
import { getOverlayRelativeScale, getOverlayTransformProjString } from './utils';

export default Vue.extend({
    components: {
        ActiveLearningFilmStrip
    },
    props: [
        'router',
        'trainingDataFolderId',
        'annotationsByImageId',
        'annotationBaseName',
        'sortedSuperpixelIndices',
        'apiRoot',
        'backboneParent'
    ],
    data() {
        return {
            currentImageId: '',
            imageItemsById: {},
            annotationsByImage: {},
            superpixelsToTrain: [],
            currentImageMetadata: {},
            map: null,
            featureLayer: null,
            boundingBoxFeature: null,
            page: 0,
            selectedImageId: this.sortedSuperpixelIndices[0].imageId,
            viewerWidget: null,
            initialZoom: 1
        };
    },
    computed: {
        superpixelsToDisplay() {
            const startIndex = this.page * 8;
            const endIndex = Math.min(startIndex + 8, this.sortedSuperpixelIndices.length);
            return this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        },
        selectedIndex() {
            return store.selectedIndex;
        }
    },
    methods: {
        updateMapBaseImage() {
            if (this.map && this.map.exit) {
                this.map.exit();
            }
            restRequest({
                url: `item/${this.selectedImageId}/tiles`
            }).done((resp) => {
                this.currentImageMetadata = resp;
                const params = geo.util.pixelCoordinateParams(
                    this.$refs.map,
                    resp.sizeX,
                    resp.sizeY,
                    resp.tileWidth,
                    resp.tileHeight
                );
                this.map = geo.map(params.map);
                params.layer.url = `${this.apiRoot}/item/${this.selectedImageId}/tiles/zxy/{z}/{x}/{y}`;
                this.map.createLayer('osm', params.layer);
                this.featureLayer = this.map.createLayer('feature', { features: ['polygon']})
                this.boundingBoxFeature = this.featureLayer.createFeature('polygon');
                this.boundingBoxFeature.style({
                    fillOpacity: 0,
                    stroke: true,
                    strokeWidth: 2,
                    strokeColor: { r: 0, g: 0, b: 0 }
                });
                // add layer for annotation
                this.drawPixelmapAnnotation(resp);
                this.updateMapBoundsForSelection();
            });
        },
        drawPixelmapAnnotation(baseImageMetadata) {
            const annotation = this.annotationsByImageId[this.selectedImageId].predictions;
            const pixelmapElement = annotation.annotation.elements[0];
            restRequest({
                url: `item/${pixelmapElement.girderId}/tiles`
            }).done((resp) => {
                const params = geo.util.pixelCoordinateParams(
                    this.$refs.map,
                    resp.sizeX,
                    resp.sizeY,
                    resp.tileWidth,
                    resp.tileHeight
                );
                params.layer.url = `${this.apiRoot}/item/${pixelmapElement.girderId}/tiles/zxy/{z}/{x}/{y}?encoding=PNG`;
                params.layer.autoshareRenderer = false;
                const transformMatrix = (pixelmapElement.transform || {}).matrix || [[1, 0], [0, 1]];
                let scale = Math.sqrt(Math.abs(transformMatrix[0][0] * transformMatrix[1][1] - transformMatrix[0][1] * transformMatrix[1][0])) || 1;
                scale = Math.floor(Math.log2(scale));
                let levelDifference = baseImageMetadata.levels - resp.levels;
                levelDifference -= scale;
                if (resp.levels !== baseImageMetadata.levels) {
                    params.layer.url = (x, y, z) => this.apiRoot + `/item/${pixelmapElement.girderId}/tiles/zxy/${z - levelDifference}/${x}/${y}?encoding=PNG`;
                    params.layer.minLevel = levelDifference;
                    params.layer.maxLevel += levelDifference;

                    params.layer.tilesMaxBounds = (level) => {
                        var scale = Math.pow(2, params.layer.maxLevel - level);
                        return {
                            x: Math.floor(resp.sizeX / scale),
                            y: Math.floor(resp.sizeY / scale)
                        };
                    };
                    params.layer.tilesAtZoom = (level) => {
                        var scale = Math.pow(2, params.layer.maxLevel - level);
                        return {
                            x: Math.ceil(resp.sizeX / resp.tileWidth / scale),
                            y: Math.ceil(resp.sizeY / resp.tileHeight / scale)
                        };
                    };
                }
                let pixelmapData = pixelmapElement.values;
                if (pixelmapElement.boundaries) {
                    const valuesWithBoundaries = new Array(pixelmapData.length * 2);
                    for (let i = 0; i < pixelmapData.length; i++) {
                        valuesWithBoundaries[i * 2] = valuesWithBoundaries[i * 2 + 1] = pixelmapData[i];
                    }
                    pixelmapData = valuesWithBoundaries;
                }
                params.layer.data = pixelmapData;
                params.layer.opacity = 1;
                const categoryMap = pixelmapElement.categories;
                const boundaries = pixelmapElement.boundaries;
                params.layer.style = {
                    color: (d, i) => {
                        if (d < 0 || d >= categoryMap.length) {
                            console.warn(`No category found at index ${d} in the category map.`);
                            return 'rgba(0, 0, 0, 0)';
                        }
                        let color;
                        let category = categoryMap[d];
                        if (boundaries) {
                            color = (i % 2 === 0) ? category.fillColor : category.strokeColor;
                        } else {
                            color = category.fillColor;
                        }
                        return color;
                    }
                };
                const projString = getOverlayTransformProjString(pixelmapElement);
                console.log(projString);
                console.log(params.layer);
                const overlayLayer = this.map.createLayer('pixelmap', Object.assign({}, params.layer)); // , { gcs: projString }));
            });
        },
        updateMapBoundsForSelection() {
            const superpixel = this.superpixelsToDisplay[this.selectedIndex];
            const bbox = superpixel.bbox;
            const bboxWidth = bbox[2] - bbox[0];
            const bboxHeight = bbox[3] - bbox[1];
            const scaleX = Math.abs((2 * bboxWidth) / this.currentImageMetadata.sizeX);
            const scaleY = Math.abs((2 * bboxHeight) / this.currentImageMetadata.sizeY);
            const zoom = this.initialZoom - Math.log2(Math.max(scaleX, scaleY));
            const center = {
                x: (bbox[0] + bbox[2]) / 2,
                y: (bbox[1] + bbox[3]) / 2
            };
            // this.map.zoom(zoom - 1);
            // this.map.center(center);
            this.viewerWidget.viewer.zoom(zoom);
            this.viewerWidget.viewer.center(center);
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        createImageViewer() {
            this.viewerWidget = new ViewerWidget.geojs({
                parentView: this.backboneParent,
                el: this.$refs.map,
                itemId: this.selectedImageId,
                hoverEvents: false,
                highlightFeatureSizeLimit: 5000,
                scale: { position: { bottom: 20, right: 10} }
            });
            this.viewerWidget.on('g:imageRendered', () => {
                this.featureLayer = this.viewerWidget.viewer.createLayer('feature', { features: ['polygon'] });
                this.boundingBoxFeature = this.featureLayer.createFeature('polygon');
                this.boundingBoxFeature.style({
                    fillOpacity: 0,
                    stroke: true,
                    strokeWidth: 2,
                    strokeColor: { r: 0, g: 0, b: 0 }
                });
                this.initialZoom = this.viewerWidget.viewer.zoom();
                this.updateMapBoundsForSelection();
                // this.viewerWidget.viewer.zoom(5);
                // this.viewerWidget.viewer.center({x: 10000, y:10000});
            });
        }
    },
    watch: {
        selectedIndex() {
            // see if we need to update which image is displayed
            const newImageId = this.superpixelsToDisplay[this.selectedIndex].imageId;
            if (newImageId !== this.selectedImageId) {
                // this.updateMapBaseImage();
                console.log('image id changed');
            } else {
                // same base image, different selection
                this.updateMapBoundsForSelection();
            }
            // calculate which bounds to set
            // draw a new bounding box?
        }
    },
    mounted() {
        store.apiRoot = this.apiRoot;
        // this.updateMapBaseImage();
        restRequest({
            url: `item/${this.selectedImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
            this.createImageViewer();
        });
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <div ref="map" class="h-active-learning-map"></div>
        <active-learning-film-strip
            :superpixelsToDisplay="this.superpixelsToDisplay"
        />
    </div>
</template>

<style scoped>
.h-active-learning-container {
    width: 100%;
    height: calc(100vh - 52px);
    position: absolute;
}

.h-active-learning-map {
    width: 100%;
    height: 100%;
}

.h-superpixel-container {
    position: relative;
    height: 100px;
    width: 100px;
}

.h-wsi-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 10;

}

.h-superpixel-region {
    position: absolute;
    left: 0px;
    top: 0px;
    z-index: 20;

}
</style>
