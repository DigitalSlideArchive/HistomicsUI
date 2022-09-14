<script>
import Vue from 'vue';
import _ from 'underscore';

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
        };
    },
    computed: {
        superpixelsToDisplay() {
            return this.sortedSuperpixelIndices.slice(0, 8);
        }
    },
    methods: {
        // getWsiRegionUrl(superPixel) {
            // const imageId = superPixel.imageId;
            // const bbox = superPixel.bbox;
            // const regionWidth = bbox[2] - bbox[0];
            // const regionHeight = bbox[3] - bbox[1];
            // const scaleFactor = Math.max(regionWidth, regionHeight);
            // const thumbnailWidth = Math.floor(100 * regionWidth / scaleFactor);
            // const thumbnailHeight = Math.floor(100 * regionHeight / scaleFactor);
            // const params = `?left=${bbox[0]}&top=${bbox[1]}&right=${bbox[2]}&bottom=${bbox[3]}&width=${thumbnailWidth}&height=${thumbnailHeight}`;
            // return `${this.apiRoot}/item/${imageId}/tiles/region${params}`;
        // },
        // getSuperpixelRegionUrl(superPixel) {
            // const imageId = superPixel.superpixelImageId;
            // const index = superPixel.index;
            // const pixelVals = superPixel.boundaries ? [index * 2, index * 2 + 1] : [index];
            // const bbox = superPixel.bbox;
            // const scale = superPixel.scale;
            // const regionWidth = bbox[2] - bbox[0];
            // const regionHeight = bbox[3] - bbox[1];
            // const scaleFactor = Math.max(regionWidth, regionHeight);
            // const thumbnailWidth = Math.floor(100 * regionWidth / scaleFactor);
            // const thumbnailHeight = Math.floor(100 * regionHeight / scaleFactor);
            // console.log({ scale });
            // const params = `?left=${bbox[0] / scale}&top=${bbox[1] / scale}&right=${bbox[2] / scale}&bottom=${bbox[3] / scale}&width=${thumbnailWidth}&height=${thumbnailHeight}&encoding=PNG`;
            // const functionJson = JSON.stringify({
                // function: {
                    // name: 'large_image.tilesource.stylefuncs.maskPixelValues',
                    // context: true,
                    // parameters: {
                        // values: pixelVals,
                        // positive: [0, 0, 0, 0],
                        // negative: [255, 255, 255, 255]
                    // }
                // },
                // bands: []
            // });
            // const functionParam = `&style=${encodeURIComponent(functionJson)}`;
            // return `${this.apiRoot}/item/${imageId}/tiles/region${params}${functionParam}`;
        // }
    },
    mounted() {
        console.log('vue component mounted...');
    }
});
</script>

<template>
    <div>
        <span>Active Learning</span>
        <!-- <div
            v-for="superPixel in superpixelsToDisplay"
            :key="`${superPixel.imageId}_${superPixel.index}`"
            class="h-superpixel-container"
        >
            <img
                class="h-superpixel-img h-wsi-region"
                :src="getWsiRegionUrl(superPixel)"
            />
            <img
                class="h-superpixel-img h-superpixel-region"
                :src="getSuperpixelRegionUrl(superPixel)"
            />
        </div> -->
        <active-learning-film-strip
            :superpixelsToDisplay="this.superpixelsToDisplay"
            :apiRoot="this.apiRoot"
        />
    </div>
</template>

<style scoped>
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
