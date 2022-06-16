<script>
import _ from 'underscore';
import Vue from 'vue/dist/vue.js';

import EditHeatmapElementSfc from './EditHeatmapElementSfc.vue';
export default Vue.extend({
    props: ['element', 'parentView'],
    data() {
        return {
            attributes: _.clone(this.element.attributes || {})
        };
    },
    methods: {
        handleSubmit(propsToSave) {
            this.element.set(propsToSave);
            this.close();
        },
        close() {
            this.parentView.closeVueModal();
        }
    },
    components: {
        EditHeatmapElementSfc
    }
})
</script>

<template>
    <div>
        <edit-heatmap-element-sfc
            :elementData="this.attributes"
            @submit="handleSubmit"
            @cancel="close"
        >
        </edit-heatmap-element-sfc>
    </div>
</template>
