<script>
import {formatDate, DATE_SECOND} from '@girder/core/misc';
export default {
    props: ['historyGroup', 'userIdMap', 'allowRevertInitial', 'defaultGroup'],
    emits: ['revertToAnnotation'],
    data() {
        return {
            collapsed: this.allowRevertInitial
        };
    },
    computed: {
        startingAnnotation() {
            return this.historyGroup[0];
        },
        hiddenAnnotations() {
            return this.historyGroup.slice(1);
        },
        iconClass() {
            const classes = ['hidden-version-toggle'];
            if (this.collapsed) {
                classes.push('icon-right-open');
            } else {
                classes.push('icon-down-open');
            }
            if (!this.hiddenAnnotations.length) {
                classes.push('display-none');
            }
            return classes;
        }
    },
    methods: {
        displayDate(dateString) {
            return formatDate(dateString, DATE_SECOND);
        },
        displayGroups(annotationVersion) {
            return annotationVersion.groups.map((group) => (
                group === null ? this.defaultGroup : group
            )).join(', ');
        },
        getUser(userId) {
            return (this.userIdMap && this.userIdMap[userId]) ? this.userIdMap[userId] : userId;
        }
    }
};
</script>

<template>
  <div>
    <span class="history-group-header attribute-block">
      <i
        v-if="hiddenAnnotations.length"
        :class="iconClass"
        @click="collapsed = !collapsed"
      />
      <span
        v-else
        class="hidden-version-toggle"
      />
      <span class="attribute-display">Edited: {{ displayDate(startingAnnotation.updated) }}</span>
      <span class="attribute-display">Author: {{ getUser(startingAnnotation.updatedId) }}</span>
      <span class="attribute-display">Version: {{ startingAnnotation._version }}</span>
      <span
        class="attribute-display"
        :title="displayGroups(startingAnnotation)"
      >
        Groups: {{ displayGroups(startingAnnotation) }}
      </span>
      <i
        v-if="allowRevertInitial"
        class="revert-button icon-ccw"
        @click="$emit('revertToAnnotation', startingAnnotation._version)"
      />
    </span>
    <div
      v-if="!collapsed && hiddenAnnotations.length"
      class="hidden-version-container"
    >
      <div
        v-for="entry in hiddenAnnotations"
        :key="entry._version"
        class="hidden-version-entry attribute-block"
      >
        <span class="hidden-version-toggle" />
        <span class="attribute-display">Edited: {{ displayDate(entry.updated) }}</span>
        <span class="attribute-display">Author: {{ getUser(entry.updatedId) }}</span>
        <span class="attribute-display">Version: {{ entry._version }}</span>
        <span
          class="attribute-display"
          :title="displayGroups(startingAnnotation)"
        >
          Groups: {{ displayGroups(entry) }}
        </span>
        <i
          class="revert-button icon-ccw"
          @click="$emit('revertToAnnotation', entry._version)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.hidden-version-toggle {
  display: inline-block;
  min-width: 20px;
}
.hidden-version-toggle:hover {
  cursor: pointer;
}
.revert-button:hover {
  cursor:pointer;
}
.attribute-block > span, i {
  max-width: 250px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipses;
}
.attribute-block {
  display: flex;
}
.attribute-block > span {
  padding-right: 8px;
}
.display-none {
  display: none;
}
</style>
