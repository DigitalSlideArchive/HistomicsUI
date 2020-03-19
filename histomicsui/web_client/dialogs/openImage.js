import $ from 'jquery';

import BrowserWidget from '@girder/core/views/widgets/BrowserWidget';

import events from '../events';
import router from '../router';

var dialog;

function createDialog(imageModel) {
    var widget = new BrowserWidget({
        parentView: null,
        titleText: 'Select a slide...',
        submitText: 'Open',
        highlightItem: true,
        showItems: true,
        selectItem: true,
        defaultSelectedResource: imageModel,
        helpText: 'Click on a slide item to open.',
        rootSelectorSettings: {
            pageLimit: 50,
            selectbyResource: imageModel
        },
        validate: function (item) {
            if (!item.has('largeImage')) {
                return $.Deferred().reject('Please select a "large image" item.').promise();
            }
            return $.Deferred().resolve().promise();
        }
    });    
    widget.on('g:saved', (model) => {
        if (!model) {
            return;
        }
        let folderId = null;
        if (widget.root && widget.root.attributes.isVirtual) {
            // in case of a virtual parent folder keep the folder in the loop
            folderId = widget.root.id;
        }
        // reset image bounds when opening a new image
        router.setQuery('bounds', null, { trigger: false });
        router.setQuery('folder', folderId, { trigger: false });
        router.setQuery('image', model.id, { trigger: true });
        $('.modal').girderModal('close');
    });
    return widget;
}

events.on('h:openImageUi', function (imageModel) {
    if (!dialog) {
        dialog = createDialog(imageModel);
    }
    dialog.setElement($('#g-dialog-container')).render();
});
