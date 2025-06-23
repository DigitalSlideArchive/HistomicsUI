<script>
import {formatDate, DATE_SECOND} from '@girder/core/misc';
export default {
    props: ['historyGroup', 'userIdMap', 'allowRevertInitial', 'defaultGroup'],
    emits: ['revertToAnnotation'],
    data() {
        return {
            collapsed: true,
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
            return (
                this.userIdMap &&
                this.userIdMap[userId]
            ) ? this.userIdMap[userId] : userId;
        }
    },
}
</script>

<template>
    <div>
        <span class="history-group-header">
            <i
                v-if="hiddenAnnotations.length"
                :class="iconClass"
                @click="collapsed = !collapsed"
            />
            <span v-else class="hidden-version-toggle"></span>
            <span>Edited: {{ displayDate(startingAnnotation.updated) }}</span>
            <span>Author: {{ getUser(startingAnnotation.updatedId) }}</span>
            <span>Version: {{ startingAnnotation._version }}</span>
            <span>Groups: {{ displayGroups(startingAnnotation) }}</span>
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
                class="hidden-version-entry"
            >
                <span class="hidden-version-toggle"></span>
                <span>Version: {{ entry._version }}</span>
                <span>Author: {{ getUser(entry.updatedId) }}</span>
                <span>Edited: {{ displayDate(entry.updated) }}</span>
                <span>Groups: {{ displayGroups(entry) }}</span>
                <i
                    class="revert-button icon-ccw"
                    @click="$emit('revertToAnnotation', entry._version)"
                ></i>
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
.display-none {
    display: none;
}
</style>
