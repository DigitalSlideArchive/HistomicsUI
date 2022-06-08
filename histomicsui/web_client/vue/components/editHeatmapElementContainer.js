import _ from 'underscore';

import EditHeatmapElement from './editHeatmapElement';

export default {
    props: ['element'],
    data() {
        return {
            attributes: _.clone(this.element.attributes)
        };
    },
    components: {
        EditHeatmapElement
    },
    template: `
        <edit-heatmap-element ref="presentation"
            :elementData="this.attributes"
            @validate="this.updateCanSubmit()"
        >
        </edit-heatmap-element>
    `
};
