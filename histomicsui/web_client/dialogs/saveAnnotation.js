import _ from 'underscore';
import $ from 'jquery';
import tinycolor from 'tinycolor2';

import AccessWidget from '@girder/core/views/widgets/AccessWidget';
import View from '@girder/core/views/View';
import { AccessType } from '@girder/core/constants';

import saveAnnotation from '../templates/dialogs/saveAnnotation.pug';
import '../stylesheets/dialogs/saveAnnotation.styl';

/**
 * Create a modal dialog with fields to edit the properties of
 * an annotation before POSTing it to the server.
 */
var SaveAnnotation = View.extend({
    events: {
        'click .h-access': 'access',
        'click .h-cancel': 'cancel',
        'submit form': 'save'
    },

    render() {
        // clean up old colorpickers when rerendering
        this.$('.h-colorpicker').colorpicker('destroy');

        let elementTypes = [];
        if (this.annotation.get('annotation').elements) {
            elementTypes = this.annotation.get('annotation').elements
                .map((element) => element.type)
                .filter((type, index, types) => types.indexOf(type) === index);
        }
        // should be updated when additional shape elements are supported
        const styleEditableElementTypes = ['point', 'polyline', 'rectangle', 'arrow', 'circle', 'ellipse'];
        const annotationHasEditableElements = _.filter(elementTypes, (type) => styleEditableElementTypes.includes(type)).length > 0;
        const showStyleEditor = this.annotation.get('annotation').elements && !this.annotation._pageElements && annotationHasEditableElements;

        const defaultStyles = {};

        if (showStyleEditor) {
            const elements = this.annotation.get('annotation').elements;
            console.assert(elements.length > 0); // otherwise we wouldn't show the style editor
            const firstElement = elements[0];
            if (elements.every((d) => d.lineWidth === firstElement.lineWidth)) {
                defaultStyles.lineWidth = firstElement.lineWidth;
            }
            if (elements.every((d) => d.lineColor === firstElement.lineColor)) {
                defaultStyles.lineColor = firstElement.lineColor;
            }
            if (elements.every((d) => d.fillColor === firstElement.fillColor)) {
                defaultStyles.fillColor = firstElement.fillColor;
            }
        }

        this.$el.html(
            saveAnnotation({
                title: this.options.title,
                hasAdmin: this.annotation.get('_accessLevel') >= AccessType.ADMIN,
                annotation: this.annotation.toJSON().annotation,
                showStyleEditor,
                defaultStyles
            })
        ).girderModal(this);
        this.$('.h-colorpicker').colorpicker();
        return this;
    },

    access(evt) {
        evt.preventDefault();
        this.annotation.off('g:accessListSaved');
        new AccessWidget({
            el: $('#g-dialog-container'),
            type: 'annotation',
            hideRecurseOption: true,
            parentView: this,
            model: this.annotation
        }).on('g:accessListSaved', () => {
            this.annotation.fetch();
        });
    },

    cancel(evt) {
        evt.preventDefault();
        this.$el.modal('hide');
    },

    /**
     * Respond to form submission.  Triggers a `g:save` event on the
     * AnnotationModel.
     */
    save(evt) {
        evt.preventDefault();

        let validation = '';

        if (!this.$('#h-annotation-name').val()) {
            this.$('#h-annotation-name').parent().addClass('has-error');
            validation += 'Please enter a name. ';
        }

        const setFillColor = !!this.$('#h-annotation-fill-color').val();
        const fillColor = tinycolor(this.$('#h-annotation-fill-color').val()).toRgbString();
        const setLineColor = !!this.$('#h-annotation-line-color').val();
        const lineColor = tinycolor(this.$('#h-annotation-line-color').val()).toRgbString();
        const setLineWidth = !!this.$('#h-annotation-line-width').val();
        const lineWidth = parseFloat(this.$('#h-annotation-line-width').val());

        if (setLineWidth && (lineWidth < 0 || !isFinite(lineWidth))) {
            validation += 'Invalid line width. ';
            this.$('#h-annotation-line-width').parent().addClass('has-error');
        }

        if (validation) {
            this.$('.g-validation-failed-message').text(validation.trim())
                .removeClass('hidden');
            return;
        }

        // all valid

        if (setFillColor || setLineColor || setLineWidth) {
            this.annotation.elements().each((element) => { /* eslint-disable backbone/no-silent */
                if (setFillColor) {
                    element.set('fillColor', fillColor, {silent: true});
                }
                if (setLineColor) {
                    element.set('lineColor', lineColor, {silent: true});
                }
                if (setLineWidth) {
                    element.set('lineWidth', lineWidth, {silent: true});
                }
            });
            const annotationData = _.extend({}, this.annotation.get('annotation'));
            annotationData.elements = this.annotation.elements().toJSON();
            this.annotation.set('annotation', annotationData);
        }

        _.extend(this.annotation.get('annotation'), {
            name: this.$('#h-annotation-name').val(),
            description: this.$('#h-annotation-description').val()
        });
        this.trigger('g:submit');
        this.$el.modal('hide');
    },

    destroy() {
        this.$('.h-colorpicker').colorpicker('destroy');
        SaveAnnotation.prototype.destroy.call(this);
    }
});

/**
 * Create a singleton instance of this widget that will be rendered
 * when `show` is called.
 */
var dialog = new SaveAnnotation({
    parentView: null
});

/**
 * Show the save dialog box.  Watch for the `g:submit` event on the
 * view to respond to user submission of the form.
 *
 * @param {AnnotationModel} annotationElement The element to edit
 * @returns {SaveAnnotation} The dialog's view
 */
function show(annotation, options) {
    _.defaults(options, { title: 'Create annotation' });
    dialog.annotation = annotation;
    dialog.options = options;
    dialog.setElement('#g-dialog-container').render();

    // Bootstrap 3's default behavior is to close the modal when a
    // `click` event occurs outside of the modal. By using the `click`
    // event, the following scenario could occur -
    // The user clicks and holds down the mouse button when the cursor
    // is inside the modal, but releases when the mouse cursor is
    // outside the modal. The browser will recognize this as a `click`
    // event and will close the modal.
    //
    // Instead, we want this behavior to happen on a `mousedown` event.
    // So, below we disable the auto-closing behavior and attach our
    // own event listener to do it:
    const dialogContainer = $('#g-dialog-container');

    // Disable the auto-closing of the modal on `click`
    // (see https://getbootstrap.com/docs/3.4/javascript/#modals-options)
    dialogContainer.modal({backdrop: 'static'});

    // Attach our own event listener to handle auto-closing the modal
    dialogContainer.on('mousedown', (evt) => {
        if (!evt.target.closest('.modal-content')) {
            dialogContainer.modal('hide');
        }
    });

    return dialog;
}

export default show;
