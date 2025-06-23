<script>
import {formatDate, DATE_SECOND} from '@girder/core/misc';
export default {
    props: ['historyGroup', 'userIdMap'],
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
            <span>Version: {{ startingAnnotation._version }}</span>
            <span>Author: {{ getUser(startingAnnotation.updatedId) }}</span>
            <span>Edited: {{ displayDate(startingAnnotation.updated) }}</span>
            <!--This shouldn't appear for the very first (most recent) annotation!-->
            <i
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
