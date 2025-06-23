<script>
import {getCurrentUser} from '@girder/core/auth';
import AnnotationHistoryGroup from './AnnotationHistoryGroup.vue';
import UserModel from '@girder/core/models/UserModel';
export default {
    props: ['annotationHistory'],
    emits: ['revertToPreviousVersion'],
    components: {
        AnnotationHistoryGroup,
    },
    data() {
        return {
            collapsed: true,
            userIdToLogin: null,
            loading: false,
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
    methods: {
        makeUserMap() {
            this.loading = true;
            const userMap = {};
            // First, see if we can use the logged in user
            const currentUser = getCurrentUser();
            userMap[currentUser.id] = currentUser.get('login');
            // Then, get all annotation editor IDs that aren't the logged in user
            const userRequestPromises = [];
            const uniqueUserIds = new Set([currentUser.id]);
            this.annotationHistory.forEach((annotation) => {
                if (!uniqueUserIds.has(annotation.updatedId)) {
                    uniqueUserIds.add(annotation.updatedId);
                    const user = new UserModel()
                    user.id = annotation.updatedId;
                    userRequestPromises.push(user.fetch());
                }
            });
            Promise.all(userRequestPromises).then((users) => {
                users.forEach((user) => {
                    console.log(user);
                    userMap[user._id] = user.login;
                });
                this.userIdToLogin = userMap;
                this.loading = false;
            });
        },
        handleRevert(version) {
            console.log('revert clicked: ', version);
        }
    },
    mounted() {
        this.makeUserMap();
    }
}
</script>

<template>
    <div>
        <div class="history-header">
            <span
                class="history-container-toggle"
                @click="collapsed = !collapsed"
            >
                <i :class="collapsed ? 'icon-down-open' : 'icon-up-open'" />
                Annotation edit history
            </span>
        </div>
        <div
            v-if="!collapsed && userIdToLogin"
            class="history-body"
        >
            <div v-if="loading">
                Loading...
            </div>
            <div v-else>
                <annotation-history-group
                    v-for="group in annotationGroups"
                    :history-group="group"
                    :user-id-map="userIdToLogin"
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
