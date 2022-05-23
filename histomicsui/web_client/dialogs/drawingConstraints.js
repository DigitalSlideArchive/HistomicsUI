import $ from 'jquery';

import View from '@girder/core/views/View';

import drawingConstraintsTemplate from '../templates/dialogs/drawingConstraints.pug';

const DrawingConstraints = View.extend({
    events: {
        'submit form': 'save'
    },

    initialize(settings) {
        this.type = settings.type;
    },

    save(evt) {
        evt.preventDefault();
        const {type} = this;
        const selectedElem = $('.h-draw-constraint:checked');
        localStorage.setItem(`h-${type}-mode`, selectedElem.parent().text() || 'Unconstrained');
        // TODO: set width/height on submission
        localStorage.setItem(`h-${type}-constraint`, {});
    },

    render() {
        this.$el.html(drawingConstraintsTemplate).girderModal(this);
        return this;
    }

});

/**
 * Create a singleton instance of this widget that will be rendered
 * when `show` is called.
 */
var dialog = new DrawingConstraints({
    parentView: null
});

/**
 * Show the set constraints box.
 */
function show() {
    dialog.setElement('#g-dialog-container').render();
    return dialog;
}

export default show;
