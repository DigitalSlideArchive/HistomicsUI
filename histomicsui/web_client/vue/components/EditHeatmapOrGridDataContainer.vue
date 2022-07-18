<script>
import _ from 'underscore';
import Vue from 'vue';

import EditHeatmapOrGridData from './EditHeatmapOrGridData.vue';
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
        EditHeatmapOrGridData
    }
})
</script>

<template>
    <div>
        <edit-heatmap-or-grid-data
            :elementData="this.attributes"
            @submit="handleSubmit"
            @cancel="close"
        >
        </edit-heatmap-or-grid-data>
    </div>
</template>
