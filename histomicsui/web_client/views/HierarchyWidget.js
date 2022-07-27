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
            recurse: true
        }
    }).done((resp) => {
        if (resp[0]) {
            this.users = new UserCollection();
            
            this.recurseCollection = new AnnotationCollection([], {comparator: null});
            this.recurseCollection.altUrl = 'annotation/folder/' + settings.parentModel.id;
            this.recurseCollection.fetch({
                id: settings.parentModel.id,
                sort: 'created',
                sortDir: -1,
                recurse: true
            }).done(() => {
                this.recurseCollection.each((model) => {
                    this.users.add({'_id': model.get('creatorId')});
                });
                $.when.apply($, this.users.map((model) => {
                    return model.fetch();
                })).always(() => {
                    this.render();
                })
            });

            this.collection = new AnnotationCollection([], {comparator: null});
            this.collection.altUrl = 'annotation/folder/' + settings.parentModel.id;
            this.collection.fetch({
                id: settings.parentModel.id,
                sort: 'created',
                sortDir: -1,
                recurse: false
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
        const model = this.recurseCollection.at(0).clone();
        model.get('annotation').name = 'All Annotations';
        model.save = () => {};
        model.updateAccess = (settings) => {
            const access = {
                access: model.get('access'),
                public: model.get('public'),
                publicFlags: model.get('publicFlags')
            };
            if (settings.recurse) {
                this.recurseCollection.each((loopModel) => {
                    loopModel.set(access);
                    loopModel.updateAccess();
                });
            } else {
                this.collection.each((loopModel) => {
                    loopModel.set(access);
                    loopModel.updateAccess();
                });
            }

            this.collection.fetch(null, true);
            this.recurseCollection.fetch(null, true);
            model.trigger('g:accessListSaved');
        };
        model.fetchAccess(true)
            .done(() => {
                new AccessWidget({
                    el: $('#g-dialog-container'),
                    modelType: 'annotation',
                    model,
                    hideRecurseOption: false,
                    parentView: this
                }).on('g:accessListSaved', () => {
                    this.collection.fetch(null, true);
                    this.recurseCollection.fetch(null, true);
                });
            });
    }

    if (this.parentModel.get('_modelType') === 'folder' && this.recurseCollection) {
        this.$('.g-folder-actions-menu > .divider').before(
            '<li role="presentation">' +
                '<a class="g-edit-annotation-access" role="menuitem">' +
                    '<i class="icon-lock"></i>' +
                    'Annotation access control' +
                '</a>' +
            '</li>'
        )
        this.events['click .g-edit-annotation-access'] = editAnnotAccess;
        this.delegateEvents();
    }
});

ItemCollection.prototype.pageLimit = Math.max(250, ItemCollection.prototype.pageLimit);
