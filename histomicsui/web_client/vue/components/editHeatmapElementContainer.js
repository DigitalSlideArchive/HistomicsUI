import _ from 'underscore';

import EditHeatmapElement from './editHeatmapElement';
import EditHeatmapElementSfc from './EditHeatmapElementSfc.vue';

export default {
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
        EditHeatmapElement,
        EditHeatmapElementSfc
    },
    template: `
        <div>
            <!-- <edit-heatmap-element ref="presentation"
                :elementData="this.attributes"
                @submit="handleSubmit"
                @cancel="close"
            >
            </edit-heatmap-element> -->
            <edit-heatmap-element-sfc ref="sfcpresentation"
                :elementData="this.attributes"
                @submit="handleSubmit"
                @cancel="close"
            >
            </edit-heatmap-element-sfc>
        </div>
    `
};
