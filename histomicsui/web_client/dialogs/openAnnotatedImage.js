import events from '../events';
import router from '../router';

import listTemplate from '../templates/dialogs/annotatedImageList.pug';
import template from '../templates/dialogs/openAnnotatedImage.pug';
import '../stylesheets/dialogs/openAnnotatedImage.styl';

const $ = girder.$;
const _ = girder._;
const Backbone = girder.Backbone;
const {restRequest} = girder.rest;
const ItemCollection = girder.collections.ItemCollection;
const UserCollection = girder.collections.UserCollection;
const View = girder.views.View;

let dialog;
const paths = {};

const AnnotatedImageList = View.extend({
    initialize() {
        this.listenTo(this.collection, 'reset', this.render);
    },

    render() {
        this.$el.html(listTemplate({
            items: this.collection.toJSON(),
            paths,
            inFetch: this.collection._inFetch
        }));
        return this;
    }
});

const OpenAnnotatedImage = View.extend({
    events: {
        'click .h-annotated-image': '_submit',
        'keyup input': '_updateQuery',
        'change select': '_updateQuery'
    },

    initialize() {
        this.collection = new ItemCollection();
        // disable automatic sorting of this collection
        this.collection.comparator = null;

        // This is a view model used to store the form state of the dialog.
        this._query = new Backbone.Model({
            imageName: '',
            creator: ''
        });

        // These properties are used to debounce rest calls, preventing a new
        // rest call from occurring until the previous one has finished.
        this._nextQuery = {};
        this.collection._inFetch = false;

        this._users = new UserCollection();
        this._users.sortField = 'login';
        this._users.pageLimit = 0;
        this._usersIsFetched = false;
        this._users.fetch().done(() => {
            this._usersIsFetched = true;
            this._fetchImages();
            this.render();
        });
        this.listenTo(this._query, 'change', this._queueFetchImages);
    },

    render() {
        if (!this._usersIsFetched) {
            return this;
        }
        this.$el.html(template({
            imageName: this._query.get('imageName'),
            creator: this._query.get('creator'),
            users: this._users
        })).girderModal(this);
        this.$el.tooltip();

        new AnnotatedImageList({
            parentView: this,
            collection: this.collection,
            el: this.$('.h-annotated-images-list-container')
        }).render();
        return this;
    },

    _fetchImages() {
        const data = this._nextQuery;
        let items;

        if (!this._nextQuery || this.collection._inFetch) {
            return;
        }
        this.collection._inFetch = true;
        delete this._nextQuery;

        data.limit = 10;
        restRequest({
            url: 'annotation/images',
            data
        }).then((_items) => {
            items = _items;
            const promises = _.map(items, (item) => {
                return this._getResourcePath(item);
            });
            return $.when(...promises);
        }).done(() => {
            this.collection._inFetch = false;
            this.collection.reset(items);
            this._fetchImages();
        });
    },

    _queueFetchImages() {
        const imageName = this._query.get('imageName');
        const creator = this._query.get('creator');
        this._nextQuery = {};

        if (imageName) {
            this._nextQuery.imageName = imageName;
        }
        if (creator) {
            this._nextQuery.creatorId = creator;
        }

        this._fetchImages();
    },

    _updateQuery() {
        this._query.set({
            creator: this.$('#h-annotation-creator').val(),
            imageName: (this.$('#h-image-name').val() || '').trim()
        });
    },

    _submit(evt) {
        const id = this.$(evt.currentTarget).data('id');
        router.setQuery('bounds', null, {trigger: false});
        router.setQuery('folder', null, {trigger: false});
        router.setQuery('image', id, {trigger: true});
        this.$el.modal('hide');
    },

    _getResourcePath(item) {
        if (_.has(paths, item._id)) {
            return $.Deferred().resolve(paths[item._id]).promise();
        }

        return restRequest({
            url: `resource/${item._id}/path`,
            data: {
                type: 'item'
            }
        }).done((path) => {
            paths[item._id] = path;
        });
    }
});

function createDialog() {
    return new OpenAnnotatedImage({
        parentView: null
    });
}

events.on('h:openAnnotatedImageUi', function () {
    if (!dialog) {
        dialog = createDialog();
    }
    dialog.setElement($('#g-dialog-container')).render();
});

export default createDialog;
