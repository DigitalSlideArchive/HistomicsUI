<script>
/* global geo */
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';

import store from './store.js';

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
        'apiRoot'
    ],
    data() {
        return {
            currentImageId: '',
            imageItemsById: {},
            annotationsByImage: {},
            superpixelsToTrain: [],
            currentImageMetadata: {},
            map: null,
            page: 0,
            selectedImageId: this.sortedSuperpixelIndices[0].imageId
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
                // add layer for annotation
                this.updateMapBoundsForSelection();
            });
        },
        drawPixelmapAnnotation() {
            console.log('drawing pixelmap annotation...');
        },
        updateMapBoundsForSelection() {
            console.log('updating map bounds for selection...');
            const superpixel = this.superpixelsToDisplay[this.selectedIndex];
            const bbox = superpixel.bbox;
            const bboxWidth = bbox[2] - bbox[0];
            const bboxHeight = bbox[3] - bbox[1];
            const scaleX = Math.abs((2 * bboxWidth) / this.currentImageMetadata.sizeX);
            const scaleY = Math.abs((2 * bboxHeight) / this.currentImageMetadata.sizeY);
            const zoom = this.map.zoom() - Math.log2(Math.max(scaleX, scaleY));
            const center = {
                x: (bbox[0] + bbox[2]) / 2,
                y: (bbox[1] + bbox[3]) / 2
            };
            console.log({map: this.map, zoom, center, scaleX, scaleY, bboxWidth, bboxHeight});
            this.map.zoom(zoom);
            this.map.center(center);
        }
    },
    watch: {
        selectedIndex() {
            // clear and update the map
            console.log('selected index changed');
            // see if we need to update which image is displayed
            const newImageId = this.superpixelsToDisplay[this.selectedIndex].imageId;
            if (newImageId !== this.currentImageId) {
                this.updateMapBaseImage();
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
        this.updateMapBaseImage();
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <div ref="map" class="h-active-learning-map"></div>
        <active-learning-film-strip
            :superpixelsToDisplay="this.superpixelsToDisplay"
            :apiRoot="this.apiRoot"
            :selectedIndex="this.selectedIndex"
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
