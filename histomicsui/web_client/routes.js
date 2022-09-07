import events from './events';
import ImageView from './views/body/ImageView';
import ActiveLearningView from './views/body/ActiveLearningView';

import Router from './router';

function bindRoutes() {
    Router.route('', 'index', function () {
        events.trigger('g:navigateTo', ImageView, {});
    });

    Router.route('active-learning', 'active-learning', function () {
        events.trigger('g:navigateTo', ActiveLearningView, {});
    });
    return Router;
}

export default bindRoutes;
