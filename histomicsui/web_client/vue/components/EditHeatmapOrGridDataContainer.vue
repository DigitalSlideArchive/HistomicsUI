<script>
import _ from 'underscore';
import Vue from 'vue';

import EditHeatmapOrGridData from './EditHeatmapOrGridData.vue';
export default Vue.extend({
    components: {
        EditHeatmapOrGridData
    },
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
    }
});
</script>

<template>
  <div>
    <edit-heatmap-or-grid-data
      :element-data="attributes"
      @submit="handleSubmit"
      @cancel="close"
    />
  </div>
</template>
