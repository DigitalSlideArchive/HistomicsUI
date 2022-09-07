import View from '../View';

import learningTemplate from '../../templates/body/learning.pug';
import ActiveLearningContainer from '../../vue/components/ActiveLearning/ActiveLearningContainer.vue';

var ActiveLearningView = View.extend({
    initialize(settings) {
        this.render();
    },

    mountVueComponent() {
        const el = this.$('.h-active-learning-container').get(0);
        const vm = new ActiveLearningContainer({
            el,
        });
        this.vueApp = vm;
    },

    render() {
        this.$el.html(learningTemplate());
        this.mountVueComponent();
        return this;
    },
});

export default ActiveLearningView;
