<script>
/* global geo */
import Vue from 'vue';
import _ from 'underscore';
import { restRequest } from '@girder/core/rest';

import ActiveLearningFilmStrip from './ActiveLearningFilmStrip.vue';

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
            selectedIndex: 0,
            currentImageMetadata: {},
            map: null
        };
    },
    computed: {
        superpixelsToDisplay() {
            return this.sortedSuperpixelIndices.slice(0, 8);
        },
        selectedImageId() {
            return this.superpixelsToDisplay[0].imageId;
        }
    },
    methods: {
    },
    watch: {
        selectedIndex(newValue) {
            // clear and update the map
        },
        currentImageMetadata(newValue) {
            console.log(newValue);
            this.map.exit();
            const params = geo.util.pixelCoordinateParams(
                this.$refs.map,
                newValue.sizeX,
                newValue.sizeY,
                newValue.tileWidth,
                newValue.tileHeight
            );
            this.map = geo.map(params.map);
            params.layer.url = `${this.apiRoot}/item/${this.selectedImageId}/tiles/zxy/{z}/{x}/{y}`;
            this.map.createLayer('osm', params.layer);
        }
    },
    mounted() {
        console.log('vue component mounted...');
        const mapContainer = this.$refs.map;
        const map = geo.map({ node: mapContainer });
        this.map = map;
        restRequest({
            url: `item/${this.selectedImageId}/tiles`
        }).done((resp) => {
            this.currentImageMetadata = resp;
        });
    }
});
</script>

<template>
    <div class="h-active-learning-container">
        <div ref="map" class="h-active-learning-map"></div>
        <active-learning-film-strip
            :superpixelsToDisplay="this.superpixelsToDisplay"
            :apiRoot="this.apiRoot"
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
