<script>
import AnnotationHistoryGroup from './AnnotationHistoryGroup.vue';
export default {
    components: {
        AnnotationHistoryGroup
    },
    props: ['annotationHistory', 'loading', 'userMap', 'defaultGroup'],
    emits: ['revert'],
    data() {
        return {
            collapsed: true
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
                    currentGroup.push(annotation);
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
    methods: {
        handleRevert(version) {
            this.$emit('revert', version);
        }
    }
};
</script>

<template>
  <div>
    <div class="history-header">
      <span
        class="history-container-toggle"
        @click="collapsed = !collapsed"
      >
        <i :class="collapsed ? 'icon-down-open' : 'icon-up-open'" />
        Annotation Edit History
      </span>
    </div>
    <div
      v-if="!collapsed && userMap"
      class="history-body"
    >
      <div v-if="!annotationHistory || loading">
        <i class="icon-spin4 animate-spin" />
        Loading...
      </div>
      <div v-else>
        <annotation-history-group
          v-for="(group, index) in annotationGroups"
          :key="index"
          :history-group="group"
          :user-id-map="userMap"
          :allow-revert-initial="index !== 0"
          :default-group="defaultGroup"
          @revertToAnnotation="handleRevert"
        />
      </div>
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
