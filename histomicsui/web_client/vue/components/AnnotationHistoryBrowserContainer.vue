<script>
import _ from 'underscore';
import Vue from 'vue';

import AnnotationHistoryBrowser from './AnnotationHistoryBrowser.vue';

export default Vue.extend({
    components: {
        AnnotationHistoryBrowser,
    },
    props: ['annotation', 'annotationHistory', 'parentView'],
    data() {
        return {
            annotationCopy: _.clone(this.annotation || {}),
        };
    },
    methods: {
        close() {
            this.parentView.closeVueModal();
        },
    },
    mounted() {
        console.log('mounted container');
    }
});
</script>

<template>
    <div>
        <annotation-history-browser
            :annotation-data="annotationCopy"
            :annotation-history="annotationHistory"
        />
    </div>
</template>
