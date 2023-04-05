import $ from 'jquery';

import View from '../View';

import template from '../../templates/popover/pixelmapContextMenu.pug';
import '../../stylesheets/popover/annotationContextMenu.styl';
import StyleCollection from '../../collections/StyleCollection';

const PixelmapContextMenu = View.extend({
    events: {
        'click .h-set-category': '_setCategory'
    },

    initialize(settings) {
        this.pixelmap = null;
        this.dtaIndex = -1;
        this.styles = new StyleCollection();
        this.styles.fetch().done(() => this.render);
    },

    render() {
        this.$el.html(template({categories: this.styles.map((style) => style.id)}));
        return this;
    },

    refetchStyles() {
        this.styles.fetch().done(() => this.render);
    },

    updatePixelmap(pixelmapElement, dataIndex) {
        this.pixelmap = pixelmapElement;
        this.dataIndex = dataIndex;
        this.render();
    },

    _setCategory(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        const category = $(evt.currentTarget).data('category');
        this.trigger('h:update', this.pixelmap, this.dataIndex, category);
        this.trigger('h:close');
    }
});

export default PixelmapContextMenu;
