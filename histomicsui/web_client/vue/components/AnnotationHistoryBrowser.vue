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
            let lastTime = new Date(this.annotationHistory[0].updated);
            let lastUserId = this.annotationHistory[0].updatedId || this.annotationHistory[0].creatorId;
            this.annotationHistory.slice(1).forEach((annotation) => {
                const updatedTime = new Date(annotation.updated);
                const timeDiff = Math.abs(updatedTime - lastTime);
                const userId = annotation.updatedId || annotation.creatorId;
                if (timeDiff >= 15 * 60 * 1000 || userId !== lastUserId) {
                    // Start a new group
                    annotationGroups.push(currentGroup);
                    currentGroup = [annotation];
                } else {
                    currentGroup.push(annotation);
                }
                lastTime = updatedTime;
                lastUserId = userId;
            });
            annotationGroups.push(currentGroup);
            return annotationGroups;
        },
        annotationHistoryEnabled() {
            if (!this.annotationHistory || this.annotationHistory.length === 0) {
                return undefined;
            }
            if (this.annotationHistory.length > 1) {
                return true;
            }
            const firstVersion = this.annotationHistory[0];
            return firstVersion.created === firstVersion.updated;
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
        <i :class="collapsed ? 'icon-right-open' : 'icon-down-open'" />
        Annotation Edit History
      </span>
    </div>
    <div v-if="!collapsed">
      <div v-if="!annotationHistoryEnabled">
        <span>Ensure annotation history is turned on to track previous versions.</span>
      </div>
      <div v-else>
        <div
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
    </div>
  </div>
</template>

<style scoped>
.history-container-toggle:hover {
  cursor: pointer;
}

.history-body {
  margin-left: 20px;
}
</style>
