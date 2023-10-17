import _ from 'underscore';
import Backbone from 'backbone';

import '@girder/fontello/dist/css/animation.css';
import '@girder/fontello/dist/css/fontello.css';

import GirderApp from '@girder/core/views/App';
import eventStream from '@girder/core/utilities/EventStream';
import {getCurrentUser, setCurrentToken} from '@girder/core/auth';
import {splitRoute} from '@girder/core/misc';

import router from './router';
import HeaderView from './views/layout/HeaderView';
import bindRoutes from './routes';

import layoutTemplate from './templates/layout/layout.pug';
import './stylesheets/layout/layout.styl';

function getQuery() {
    var query = document.location.search.replace(/(^\?)/, '').split('&').map(function (n) {
        n = n.split('=');
        if (n[0]) {
            this[decodeURIComponent(n[0].replace(/\+/g, '%20'))] = decodeURIComponent(n[1].replace(/\+/g, '%20'));
        }
        return this;
    }.bind({}))[0];
    return query;
}

var App = GirderApp.extend({
    initialize(settings) {
        if (getQuery().token) {
            setCurrentToken(getQuery().token);
        }
        this.settings = settings;
        return GirderApp.prototype.initialize.apply(this, arguments);
    },

    render() {
        this.$el.html(layoutTemplate());

        this.huiHeader = new HeaderView({
            el: this.$('#g-app-header-container'),
            parentView: this,
            settings: this.settings
        }).render();

        /* Only show job progress */
        const plv = this.progressListView;
        if (!plv._origHandleProgress) {
            plv._origHandleProgress = plv._handleProgress;
            plv._handleProgress = function (progress) {
                if (!_.has(plv._map, progress._id) && (progress.data || {}).resourceName !== 'job') {
                    return;
                }
                return plv._origHandleProgress(progress);
            };
            plv.stopListening(plv.eventStream, 'g:event.progress', plv._origHandleProgress, plv);
            plv.listenTo(plv.eventStream, 'g:event.progress', plv._handleProgress, plv);
        }
        plv.setElement(this.$('#g-app-progress-container')).render();

        return this;
    },

    /**
     * On login we re-render the current body view; whereas on
     * logout, we redirect to the front page.
     */
    login() {
        var route = splitRoute(Backbone.history.fragment).base;
        Backbone.history.fragment = null;
        eventStream.close();

        if (getCurrentUser()) {
            eventStream.open();
            router.navigate(route, {trigger: true});
        } else {
            router.navigate('/', {trigger: true});
        }
    },

    navigateTo(view) {
        if (this.bodyView instanceof view) {
            return this;
        }
        return GirderApp.prototype.navigateTo.apply(this, arguments);
    },

    bindRoutes
});

export default App;
