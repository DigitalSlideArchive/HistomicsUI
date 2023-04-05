import tinycolor from 'tinycolor2';

import View from '@girder/core/views/View';

import EditHeatmapOrGridDataContainer from '../vue/components/EditHeatmapOrGridDataContainer.vue';

import editElement from '../templates/dialogs/editElement.pug';
import '@girder/core/utilities/jquery/girderModal';

/**
 * Create a modal dialog with fields to edit the properties of
 * an annotation element.
 */
var EditElement = View.extend({
    events: {
        'click .h-submit': 'getData',
        'submit form': 'getData',
        'hide.bs.modal ': 'endEdit'
    },

    render() {
        this.$el.html(
            editElement({
                element: this.annotationElement.toJSON()
            })
        ).girderModal(this);
        this.createVueModal();
        return this;
    },

    createVueModal() {
        const el = this.$('.vue-component-heatmap').get(0);
        const vm = new EditHeatmapOrGridDataContainer({
            el,
            propsData: {
                element: this.annotationElement,
                parentView: this
            }
        });
        this.vueApp = vm;
    },

    closeVueModal() {
        this.$el.modal('hide');
        this.vueApp.$destroy();
    },

    /**
     * Get all data from the form and set the attributes of the
     * attached ElementModel (triggering a change event).
     */
    getData(evt) {
        evt.preventDefault();

        var data = {};
        var validation = '';

        var label = this.$('#h-element-label').val();
        data.label = label ? {value: label} : {};
        var group = this.$('#h-group-name').val();
        data.group = group && group !== this._defaultGroup ? group : undefined;

        var lineWidth = this.$('#h-element-line-width').val();
        if (lineWidth) {
            data.lineWidth = parseFloat(lineWidth);
            if (data.lineWidth < 0 || !isFinite(data.lineWidth)) {
                validation += 'Invalid line width. ';
                this.$('#h-element-line-width').parent().addClass('has-error');
            }
        }

        var lineColor = this.$('#h-element-line-color').val();
        if (lineColor) {
            data.lineColor = this.convertColor(lineColor);
        }

        var fillColor = this.$('#h-element-fill-color').val();
        if (fillColor) {
            data.fillColor = this.convertColor(fillColor);
        }

        if (validation) {
            this.$('.g-validation-failed-message').text(validation)
                .removeClass('hidden');
            return;
        }

        this.trigger('h:editElement', {element: this.annotationElement, data, edited: true});
        this.annotationElement.set(data);
        this.$el.modal('hide');
    },

    /**
     * Trigger the draw widget's edit element event listener when the form isn't
     * submitted, to prevent later edits from being considered multiple times
     */
    endEdit() {
        this.trigger('h:editElement', {edited: false});
    },

    /**
     * A helper function converting a string into normalized rgb/rgba
     * color value.  If no value is given, then it returns a color
     * with opacity 0.
     */
    convertColor(val) {
        if (!val) {
            return 'rgba(0,0,0,0)';
        }
        return tinycolor(val).toRgbString();
    }
});

/**
 * Create a singleton instance of this widget that will be rendered
 * when `show` is called.
 */
var dialog = new EditElement({
    parentView: null
});

/**
 * Show the edit dialog box.  Watch for change events on the passed
 * `ElementModel` to respond to user submission of the form.
 *
 * @param {ElementModel} annotationElement The element to edit
 * @returns {EditAnnotation} The dialog's view
 */
function show(annotationElement, defaultGroup) {
    dialog.annotationElement = annotationElement;
    dialog._defaultGroup = defaultGroup || 'default';
    dialog.setElement('#g-dialog-container').render();
    return dialog;
}

export default show;
