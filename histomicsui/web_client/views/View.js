import $ from 'jquery';
import View from '@girder/core/views/View';

export default View.extend({
    initialize() {
        // Bootstrap 3's default behavior is to close dialogs when a
        // `click` event occurs outside of it. By using the `click`
        // event, the following scenario could occur -
        // The user clicks and holds down the mouse button when the cursor
        // is inside the dialog, but releases when the mouse cursor is
        // outside the dialog. The browser will recognize this as a `click`
        // event and will close the dialog.
        //
        // Instead, we want this behavior to happen on a `mousedown` event
        // for all dialogs when the HistomicsUI plugin is present.
        // So, below we attach our own event listener that disables the
        // auto-closing behavior on `click` and does it instead on `mousedown`:
        $(document).on('mousedown', '#g-dialog-container', (evt) => {
            const dialogContainer = $('#g-dialog-container');
            // Disable the `click` event listener. This works because the
            // `mousedown` event is always fired before `click`.
            dialogContainer.off('click', '#g-dialog-container');
            // Close the dialog if the `mousedown` event was outside of it.
            if (!evt.target.closest('.modal-content')) {
                dialogContainer.modal('hide');
            }
        });

        // Whenever a new dialog is rendered in the DOM, set the tabindex
        // of its buttons to 0 so they can be selected with the Tab key.
        $(document).on('DOMNodeInserted', '#g-dialog-container', () => {
            $('.btn', '#g-dialog-container').prop('tabindex', '0');
        });
    }
});
