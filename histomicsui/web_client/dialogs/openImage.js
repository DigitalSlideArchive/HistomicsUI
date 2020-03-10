import $ from 'jquery';

import BrowserWidget from '@girder/core/views/widgets/BrowserWidget';

import events from '../events';
import router from '../router';

var dialog;

function createDialog(imageModel) {
    console.log(imageModel);
    console.log(imageModel.parent.get('collection'));
    var widget = new BrowserWidget({
        parentView: null,
        titleText: 'Select a slide...',
        submitText: 'Open',
        showItems: true,
        selectItem: true,
        root: imageModel.parent,
        helpText: 'Click on a slide item to open.',
        rootSelectorSettings: {
            selected: imageModel.parent.get('collection'),
            pageLimit: 50
        },
        validate: function (item) {
            if (!item.has('largeImage')) {
                return $.Deferred().reject('Please select a "large image" item.').promise();
            }
            return $.Deferred().resolve().promise();
        }
    });

    setTimeout(() => {
        console.log(widget._rootSelectionView);
        console.log(imageModel);
        console.log(widget._rootSelectionView.groups);
        console.log(`baseParentType: ${imageModel.get('baseParentType')}`);
        console.log(`parentID: ${imageModel.parent.get('baseParentId')}`);
        if (imageModel.get('baseParentType') === 'collection') {
            console.log(widget._rootSelectionView.groups['Collections'].get(imageModel.parent.get('baseParentId')));
            widget._rootSelectionView.selected = widget._rootSelectionView.groups['Collections'].get(imageModel.parent.get('baseParentId'));
            widget._rootSelectionView.render();
        }
        console.log(widget._hierarchyView);
        console.log(widget.selectItem);
        widget._selectItem(imageModel);
    }, 1000);
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
        console.log(imageModel);
        dialog = createDialog(imageModel);
    }
    dialog.setElement($('#g-dialog-container')).render();
});
