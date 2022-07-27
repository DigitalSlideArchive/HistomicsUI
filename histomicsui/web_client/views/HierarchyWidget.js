import $ from 'jquery';

import { wrap } from '@girder/core/utilities/PluginUtils';
import { restRequest } from '@girder/core/rest';
import AccessWidget from '@girder/core/views/widgets/AccessWidget';
import HierarchyWidget from '@girder/core/views/widgets/HierarchyWidget';
import ItemCollection from '@girder/core/collections/ItemCollection';
import UserCollection from '@girder/core/collections/UserCollection';
import AnnotationCollection from '@girder/large_image_annotation/collections/AnnotationCollection';

wrap(HierarchyWidget, 'initialize', function (initialize, settings) {
    settings = settings || {};
    if (settings.paginated === undefined) {
        settings.paginated = true;
    }
    restRequest({
        type: 'GET',
        url: 'annotation/folder/' + settings.parentModel.id + '/present',
        data: {
            id: settings.parentModel.id,
            checkSubfolders: true
        }
    }).done((resp) => {
        if (resp[0]) {
            this.users = new UserCollection();
            this.collection = new AnnotationCollection([], {comparator: null});
            this.collection.altUrl = 'annotation/folder/' + settings.parentModel.id;
            this.collection.fetch({
                id: settings.parentModel.id,
                sort: 'created',
                sortDir: -1,
                checkSubfolders: true
            }).done(() => {
                this.collection.each((model) => {
                    this.users.add({'_id': model.get('creatorId')});
                });
                $.when.apply($, this.users.map((model) => {
                    return model.fetch();
                })).always(() => {
                    this.render();
                })
            });
        }
    });

    return initialize.call(this, settings);
});

wrap(HierarchyWidget, 'render', function (render) {
    render.call(this);

    function editAnnotAccess(evt) {
        const model = this.collection.at(0).clone();
        model.get('annotation').name = 'All Annotations';
        model.save = () => {};
        model.updateAccess = () => {
            const access = {
                access: model.get('access'),
                public: model.get('public'),
                publicFlags: model.get('publicFlags')
            };
            this.collection.each((loopModel) => {
                loopModel.set(access);
                loopModel.updateAccess();
            });
            this.collection.fetch(null, true);
            model.trigger('g:accessListSaved');
        };
        model.fetchAccess(true)
            .done(() => {
                new AccessWidget({
                    el: $('#g-dialog-container'),
                    modelType: 'annotation',
                    model,
                    hideRecurseOption: true,
                    parentView: this
                }).on('g:accessListSaved', () => {
                    this.collection.fetch(null, true);
                });
            });
    }

    if (this.parentModel.get('_modelType') === 'folder' && this.collection) {
        this.$('.g-folder-header-buttons > .btn-group').before('<button class="g-folder-annotation-access-button ' +
            'btn btn-sm btn-warning" title ="Annotation access control"> <i class="icon-pencil"></i>' +
            '<i class="icon-lock"></i></button>'
        );
        this.events['click .g-folder-annotation-access-button'] = editAnnotAccess;
        this.delegateEvents();
    }
});

ItemCollection.prototype.pageLimit = Math.max(250, ItemCollection.prototype.pageLimit);
