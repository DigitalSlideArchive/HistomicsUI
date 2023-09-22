import $ from 'jquery';
import View from '@girder/core/views/View';

if (View.__super__ && View.__super__.initialize) {
    const oldInitialize = View.__super__.initialize;

    View.__super__.initialize = function () {
        const result = oldInitialize.apply(this, arguments);

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

        return result;
    };

    const oldGirderModal = $.fn.girderModal;
    $.fn.girderModal = function (view) {
        const result = oldGirderModal.call(this, view);
        result.on('shown.bs.modal', () => {
            result.off('click.dismiss.bs.modal');
            result.off('mouseup.dismiss.bs.modal');
            $('.btn', '#g-dialog-container').prop('tabindex', '0');
        });
        return result;
    };
}

export default View;
