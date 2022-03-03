import tinycolor from 'tinycolor2';

import View from '@girder/core/views/View'

import addPixelmapCategory from '../templates/dialogs/addPixelmapCategory.pug';
import '@girder/core/utilities/jquery/girderModal';

var AddPixelmapCategory = View.extend({
    events: {
        'click .h-submit': 'addCategory',
        'submit form': 'addCategory'
    },

    render() {
        this.$el.html(
            addPixelmapCategory({
                pixelmap: this.pixelmap.toJSON()
            })
        ).girderModal(this);
        this.$('.h-colorpicker').colorpicker();
        return this;
    },

    /**
     * Run validation on the form and create the category if
     * possible.
     * @param {object} evt information about the submit event
     */
    addCategory(evt) {
        evt.preventDefault();

        let newCategory = {};
        let validation = '';

        const label = this.$('#h-category-label').val();
        newCategory.label = label;
        if (!label) {
            validation += 'Label cannot be empty. ';
            this.$('#h-category-label').parent().addClass('has-error');
        }

        const strokeColor = this.$('#h-category-stroke-color').val();
        if (!strokeColor && this.pixelmap.get('boundaries')) {
            validation += 'This pixelmap contains boundaries. Stroke color cannot be empty. '
            this.$('#h-category-stroke-color').parent().addClass('has-error');
        } else {
            newCategory.strokeColor = this.convertColor(strokeColor);
        }

        const fillColor = this.$('#h-category-fill-color').val();
        if (!fillColor) {
            validation += 'Fill color cannot be empty. ';
            this.$('#h-category-fill-color').parent().addClass('has-error');
        } else {
            newCategory.fillColor = this.convertColor(fillColor);
        }

        if (validation) {
            this.$('.g-validation-failed-message').text(validation).removeClass('hidden');
            return;
        }

        // add the category to the pixelmap element
        const categories = JSON.parse(JSON.stringify(this.pixelmap.get('categories')));
        categories.push(newCategory);
        this.pixelmap.set('categories', categories);
        this.trigger('h:addPixelmapCategory', this.pixelmap);
        this.$el.modal('hide');
    },

    /**
     * Convert a string to an rbg/a string.
     * @param {string} val input string to be converted
     * @returns an rgb color string
     */
    convertColor(val) {
        if (!val) {
            return 'rgba(0, 0, 0, 0)';
        }
        return tinycolor(val).toRgbString();
    }
});

/**
 * Create a singleton of this widget to render when `show` is called
 */
var dialog = new AddPixelmapCategory({
    parentView: null
});

/**
 * Show the dialog box
 * @param {object} pixelmap the pixelmap element associated with the dialog
 * @returns the dialog's view
 */
function show(pixelmap) {
    dialog.pixelmap = pixelmap;
    dialog.setElement('#g-dialog-container').render();
    return dialog;
}

export default show;
