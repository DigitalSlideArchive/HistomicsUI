<script>
import _ from 'underscore';

import ActiveLearningFilmStripCard from './ActiveLearningFilmStripCard.vue';
import store from './store.js';

export default {
    components: {
        ActiveLearningFilmStripCard
    },
    props: ['superpixelsToDisplay'],
    computed: {
        apiRoot() {
            return store.apiRoot;
        },
        selectedIndex() {
            return store.selectedIndex;
        }
    },
    methods: {
        getWsiRegionUrl(superPixel) {
            const imageId = superPixel.imageId;
            const bbox = superPixel.bbox;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor(125 * regionWidth / scaleFactor);
            const thumbnailHeight = Math.floor(125 * regionHeight / scaleFactor);
            const params = `?left=${bbox[0]}&top=${bbox[1]}&right=${bbox[2]}&bottom=${bbox[3]}&width=${thumbnailWidth}&height=${thumbnailHeight}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}`;
        },
        getSuperpixelRegionUrl(superPixel) {
            const imageId = superPixel.superpixelImageId;
            const index = superPixel.index;
            const pixelVals = superPixel.boundaries ? [index * 2, index * 2 + 1] : [index];
            const bbox = superPixel.bbox;
            const scale = superPixel.scale;
            const regionWidth = bbox[2] - bbox[0];
            const regionHeight = bbox[3] - bbox[1];
            const scaleFactor = Math.max(regionWidth, regionHeight);
            const thumbnailWidth = Math.floor(125 * regionWidth / scaleFactor);
            const thumbnailHeight = Math.floor(125 * regionHeight / scaleFactor);
            const params = `?left=${bbox[0] / scale}&top=${bbox[1] / scale}&right=${bbox[2] / scale}&bottom=${bbox[3] / scale}&width=${thumbnailWidth}&height=${thumbnailHeight}&encoding=PNG`;
            const functionJson = JSON.stringify({
                function: {
                    name: 'large_image.tilesource.stylefuncs.maskPixelValues',
                    context: true,
                    parameters: {
                        values: pixelVals,
                        positive: [0, 0, 0, 0],
                        negative: [255, 255, 255, 255]
                    }
                },
                bands: []
            });
            const functionParam = `&style=${encodeURIComponent(functionJson)}`;
            return `${this.apiRoot}/item/${imageId}/tiles/region${params}${functionParam}`;
        }

    },
    mounted() {
    }
}
</script>

<template>
    <div class="h-filmstrip">
        <!-- previous button -->
        <!-- create a component for these, probably -->
        <active-learning-film-strip-card
            v-for="superpixel, index in superpixelsToDisplay"
            :key="`${superpixel.imageId}_${superpixel.index}`"
            :superpixel="superpixel"
            :index="index"
        />
        <!-- <div
            v-for="superpixel, index in superpixelsToDisplay"
            :key="`${superpixel.imageId}_${superpixel.index}`"
            class="h-superpixel-card"
        >
            <div
                class="h-superpixel-card-header"
                :style="headerStyles[index]"
            >
                Confidence: {{ superpixel.confidence.toFixed(3) }}
            </div>
            <div class="h-superpixel-body">
                <div class="h-superpixel-container">
                    <img
                        class="h-superpixel-img h-wsi-region"
                        :src="getWsiRegionUrl(superpixel)"
                    />
                    <img
                        class="h-superpixel-img h-superpixel-region"
                        :src="getSuperpixelRegionUrl(superpixel)"
                    />
                </div>
            </div>
            <div class="h-superpixel-card-footer">
                <label :for="`${key}_radio`">Agree? </label>
            </div>
        </div> -->
        <!-- next button -->
    </div>
</template>

<style scoped>
.h-filmstrip {
    position: absolute;
    display: flex;
    flex-direction: row;
    justify-content: space-evenly;
    bottom: 0px;
    width: 100%;
    padding-top: 10px;
    padding-bottom: 10px;
    background-color: rgba(0, 0, 0, 0.6);
}

.h-superpixel-card {
    display: flex;
    flex-direction: column;
    column-gap: 0px;
    background-color: white;
}

.h-superpixel-container {
    position: relative;
    height: 125px;
    width: 125px;
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
