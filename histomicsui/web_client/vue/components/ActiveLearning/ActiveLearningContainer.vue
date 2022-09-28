<script>
/* global geo */
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';
import { ViewerWidget } from '@girder/large_image_annotation/views';
import AnnotationModel from '@girder/large_image_annotation/models/AnnotationModel';

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
            return store.superpixelsToDisplay;
        },
        selectedIndex() {
            return store.selectedIndex;
       }
    },
    methods: {
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
            this.viewerWidget.viewer.zoom(zoom - 2);
            this.viewerWidget.viewer.center(center);
            this.boundingBoxFeature.data([[
                [bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]
            ]]);
            this.featureLayer.draw();
        },
        drawPredictions() {
            const predictions = this.annotationsByImageId[this.selectedImageId].superpixels;
            const predictionsModel = new AnnotationModel({ _id: predictions._id });
            predictionsModel.fetch().done(() => {
                this.viewerWidget.drawAnnotation(predictionsModel);
            });
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
                this.drawPredictions();
            });
        }
    },
    watch: {
        selectedIndex() {
            // see if we need to update which image is displayed
            const newImageId = this.superpixelsToDisplay[this.selectedIndex].imageId;
            if (newImageId !== this.selectedImageId) {
                console.log('image id changed');
                this.selectedImageId = newImageId;
            } else {
                this.updateMapBoundsForSelection();
            }
        },
        page(arg1, arg2) {
            console.log(arg1, arg2);
            const startIndex = this.page;
            const endIndex = Math.min(startIndex + 8, this.sortedSuperpixelIndices.length);
            store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
        }
    },
    mounted() {
        store.apiRoot = this.apiRoot;
        const startIndex = 0;
        const endIndex = Math.min(startIndex + 8, this.sortedSuperpixelIndices.length);
        store.superpixelsToDisplay = this.sortedSuperpixelIndices.slice(startIndex, endIndex);
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
        <active-learning-film-strip />
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
