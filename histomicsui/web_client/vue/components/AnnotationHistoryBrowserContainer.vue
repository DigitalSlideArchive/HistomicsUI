<script>
import _ from 'underscore';
import Vue from 'vue';

import AnnotationHistoryBrowser from './AnnotationHistoryBrowser.vue';

export default Vue.extend({
    components: {
        AnnotationHistoryBrowser,
    },
    props: ['annotation', 'parentView'],
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
        <span>This is the annotation browser history container</span>
        <annotation-history-browser
            :annotation-data="annotationCopy"
        />
    </div>
</template>
