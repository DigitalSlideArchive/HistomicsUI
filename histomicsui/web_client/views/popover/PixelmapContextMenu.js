import $ from 'jquery';

import View from '../View';

import template from '../../templates/popover/pixelmapContextMenu.pug';
import '../../stylesheets/popover/annotationContextMenu.styl';

const PixelmapContextMenu = View.extend({
    events: {
        'click .h-set-category': '_setCategory'
    },

    render() {
        let categories = [];
        if (this.pixelmap) {
            categories = this.pixelmap.get('categories').map((category, index) => ({
                label: category.label,
                index
            }));
        }
        this.$el.html(template({ categories }));
        return this;
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
        this.trigger('h:update', this.pixelmap, this.dataIndex, category.index);
        this.trigger('h:close');
    }
});

export default PixelmapContextMenu;
