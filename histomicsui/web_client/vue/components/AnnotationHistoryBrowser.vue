<script>
import AnnotationHistoryGroup from './AnnotationHistoryGroup.vue';
export default {
    props: ['annotationData', 'annotationHistory'],
    emits: ['revertToPreviousVersion'],
    components: {
        AnnotationHistoryGroup,
    },
    data() {
        return {
            collapsed: true,
        };
    },
    computed: {
        annotationGroups() {
            if (!this.annotationHistory.length) {
                return [];
            }
            const annotationGroups = [];
            let currentGroup = [this.annotationHistory[0]];
            let currentStartTime = new Date(this.annotationHistory[0].updated);
            this.annotationHistory.slice(1).forEach((annotation) => {
                const updatedTime = new Date(annotation.updated);
                if (Math.abs(updatedTime - currentStartTime) < (60 * 60 * 1000)) {
                    currentGroup.push(annotation)
                } else {
                    annotationGroups.push(currentGroup);
                    currentGroup = [annotation];
                    currentStartTime = new Date(annotation.updated);
                }
            });
            annotationGroups.push(currentGroup);
            return annotationGroups;
        }
    },
    mounted() {
        console.log({
            data: this.annotationData,
            history: this.annotationHistory,
            groups: this.annotationGroups,
        });
    }
}
</script>

<template>
    <div>
        <div class="history-header">
            <span class="history-container-toggle">
                <i
                    :class="collapsed ? 'icon-down-open' : 'icon-up-open'"
                    @click="collapsed = !collapsed"
                />
                Annotation edit history
            </span>
        </div>
        <div
            v-if="!collapsed"
            class="history-body"
        >
            <annotation-history-group
                v-for="group in annotationGroups"
                :history-group="group"
            />
        </div>
    </div>
</template>

<style #scoped>
.history-container-toggle:hover {
    cursor: pointer;
}

.history-body {
    margin-left: 20px;
}
</style>
