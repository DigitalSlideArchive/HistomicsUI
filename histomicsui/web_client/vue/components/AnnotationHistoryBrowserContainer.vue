<script>
import _ from 'underscore';
import Vue from 'vue';

import UserModel from '@girder/core/models/UserModel';
import {getCurrentUser} from '@girder/core/auth';
import {restRequest} from '@girder/core/rest';

import AnnotationHistoryBrowser from './AnnotationHistoryBrowser.vue';

const Promise = require('bluebird');

export default Vue.extend({
    components: {
        AnnotationHistoryBrowser
    },
    props: ['annotationId', 'parentView', 'defaultGroup'],
    data() {
        return {
            annotationCopy: _.clone(this.annotation || {}),
            history: null,
            loading: false,
            userIdToLogin: null,
            waitingForRevert: false
        };
    },
    mounted() {
        this.positionShield();
        this.updateAnnotationHistory();
    },
    methods: {
        makeUserMap(shouldRefresh) {
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
                    const user = new UserModel();
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
                this.waitingForRevert = false;
                if (shouldRefresh) {
                    this.parentView.onRevert();
                }
                return true;
            });
        },
        updateAnnotationHistory(shouldRefresh) {
            if (!this.annotationId) {
                return;
            }
            this.loading = true;
            restRequest({
                url: `annotation/${this.annotationId}/history`,
                method: 'GET',
                error: null
            }).done((annotationHistory) => {
                this.history = annotationHistory;
                this.makeUserMap(shouldRefresh);
            });
        },
        positionShield() {
            const shield = this.$refs.shield;
            if (shield && shield.parentNode !== document.body) {
                document.body.appendChild(shield);
            }
        },
        onRevert(version) {
            this.loading = true;
            // If an annotation takes > 1 second to be reverted, throw up a loading screen
            setTimeout(() => {
                if (this.loading) {
                    this.waitingForRevert = true;
                    this.$nextTick(() => {
                        this.positionShield();
                    });
                }
            }, 1000);
            restRequest({
                url: `annotation/${this.annotationId}/history/revert`,
                method: 'PUT',
                data: {version},
                error: null
            }).done(() => {
                this.updateAnnotationHistory(true);
            });
        }
    }
});
</script>

<template>
  <div>
    <div
      v-if="waitingForRevert"
      ref="shield"
      class="loading-shield"
    >
      <div class="shield-content">
        <i class="icon-spin3 animate-spin" />
        Reverting to previous version. This may some time...
      </div>
    </div>
    <annotation-history-browser
      :annotation-history="history"
      :loading="loading"
      :user-map="userIdToLogin"
      :default-group="defaultGroup"
      @revert="onRevert"
    />
  </div>
</template>

<style scoped>
.loading-shield {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background-color: rgba(0, 0, 0, 0.4);
  z-index: 9999;
  pointer-events: all;
  cursor: wait;
  display: flex;
  align-items: center;
  justify-content: center;

  animation: fadeIn 0.3s ease-out;
}
.shield-content {
  padding: 24px;
  background-color: white;
}
.loading-shield > i, span {
  font-size: 24px;
  z-index: 9999;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
