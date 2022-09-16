<script>
import Vue from 'vue';
import _ from 'underscore';

export default Vue.extend({
    props: ['superpixel', 'apiRoot'],
    data() {
        return {
            agreeChoice: undefined,
            selectedCategory: undefined,
            predictedCategory: this.superpixel.categories[this.superpixel.prediction]
        };
    },
    computed: {
        headerStyle() {
            return {
                'font-size': '80%',
                'background-color': this.superpixel.categories[this.superpixel.prediction].fillColor
            };
        },
        headerTitle() {
            return `Prediction: ${this.predictedCategory.label}`;
        },
        validNewCategories() {
            const categories = this.superpixel.categories;
            return _.filter(categories, (c, index) => index !== this.superpixel.prediction);
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
        console.log('film strip card mounted...');
        this.selectedCategory = this.validNewCategories[0];
    }
});
</script>

<template>
    <div class="h-superpixel-card">
        <div
            class="h-superpixel-card-header"
            :style="headerStyle"
            :title="headerTitle"
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
            <div class="h-superpixel-card-agree h-superpixel-card-footer-content">
                <label>Agree? </label>
                <label for="radio-yes">Yes</label>
                <input id="radio-yes" type="radio" value="Yes" v-model="agreeChoice" />
                <label for="radio-no">No</label>
                <input id="radio-no" type="radio" value="No" v-model="agreeChoice" />
            </div>
            <div
                v-if="agreeChoice === 'No'"
                class="h-superpixel-card-footer-content"
            >
                <select
                    v-model="selectedCategory"
                    class="h-superpixel-card-select"
                >
                    <option
                        v-for="category in validNewCategories"
                        :key="category.label"
                        :value="category"
                    >
                        Class: {{ category.label }}
                    </option>
                </select>
            </div>
            <div
                v-else
                class="h-superpixel-card-footer-content"
            >
                <select
                    disabled="true"
                    class="h-superpixel-card-select"
                >
                    <option :value="predictedCategory">
                        Class: {{ predictedCategory.label }}
                    </option>
                </select>
            </div>
        </div>
    </div>
</template>

<style scoped>
.h-superpixel-card {
    display: flex;
    flex-direction: column;
    column-gap: 0px;
    background-color: white;
    border-radius: 5px;
    width: 140px;
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

.h-superpixel-card-header {
    border-top-left-radius: 5px;
    border-top-right-radius: 5px;
}

.h-superpixel-body {
    display: flex;
    justify-content: center;
}

.h-superpixel-card-footer {
    display: flex;
    flex-direction: column;
    justify-content: space-around;

}

.h-superpixel-card-footer > * {
    font-size: 80%;
}

.h-superpixel-card-footer-content {
    display: flex;
    flex-direction: row;
    justify-content: center;
    gap: 2px;
}

.h-superpixel-card-select {
    width: 90%;
}
</style>
