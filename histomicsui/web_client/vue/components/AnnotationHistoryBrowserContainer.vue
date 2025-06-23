<script>
import _ from 'underscore';
import Vue from 'vue';

import AnnotationHistoryBrowser from './AnnotationHistoryBrowser.vue';
import UserModel from '@girder/core/models/UserModel';
import {getCurrentUser} from '@girder/core/auth';
import {restRequest} from '@girder/core/rest';

export default Vue.extend({
    components: {
        AnnotationHistoryBrowser,
    },
    props: ['annotationId', 'parentView', 'defaultGroup'],
    data() {
        return {
            annotationCopy: _.clone(this.annotation || {}),
            history: null,
            loading: false,
            userIdToLogin: null,
        };
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
            this.history.forEach((annotation) => {
                if (!uniqueUserIds.has(annotation.updatedId)) {
                    uniqueUserIds.add(annotation.updatedId);
                    const user = new UserModel()
                    user.id = annotation.updatedId;
                    userRequestPromises.push(user.fetch());
                }
            });
            Promise.all(userRequestPromises).then((users) => {
                users.forEach((user) => {
                    userMap[user._id] = user.login;
                });
                this.userIdToLogin = userMap;
                this.loading = false;
            });
        },
        updateAnnotationHistory() {
            this.loading = true;
            restRequest({
                url: `annotation/${this.annotationId}/history`,
                method: 'GET',
                error: null,
            }).done((annotationHistory) => {
                this.history = annotationHistory;
                this.makeUserMap();
            });
        },
        onRevert(version) {
            this.loading = true;
            restRequest({
                url: `annotation/${this.annotationId}/history/revert`,
                method: 'PUT',
                data: { version },
                error: null,
            }).done((resp) => {
                this.updateAnnotationHistory();
            })
        },
    },
    mounted() {
        this.updateAnnotationHistory();
    }
});
</script>

<template>
    <div>
        <annotation-history-browser
            :annotation-history="history"
            :loading="loading"
            :user-map="userIdToLogin"
            :default-group="defaultGroup"
            @revert="onRevert"
        />
    </div>
</template>
