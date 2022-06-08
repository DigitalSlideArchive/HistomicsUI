import _ from 'underscore';

import EditHeatmapElement from './editHeatmapElement';

export default {
    props: ['element'],
    data() {
        return {
            attributes: _.clone(this.element.attributes)
        };
    },
    methods: {
        handleSubmit(propsToSave) {
            this.element.set(propsToSave);
        }
    },
    components: {
        EditHeatmapElement
    },
    template: `
        <edit-heatmap-element ref="presentation"
            :elementData="this.attributes"
            @submit="handleSubmit"
        >
        </edit-heatmap-element>
    `
};
