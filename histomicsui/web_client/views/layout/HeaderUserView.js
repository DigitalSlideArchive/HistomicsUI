import {getCurrentUser} from '@girder/core/auth';
import GirderHeaderUserView from '@girder/core/views/layout/HeaderUserView';

import events from '../../events';
import editHotkeys from '../../dialogs/editHotkeys';

import headerUserTemplate from '../../templates/layout/headerUser.pug';

var HeaderUserView = GirderHeaderUserView.extend({
    events() {
        return Object.assign({}, GirderHeaderUserView.prototype.events, {
            'click a.h-edit-hotkeys': '_editHotkeys'
        });
    },

    _editHotkeys() {
        // An open image view handles this so it can include folder config
        // hotkeys and apply the result.
        const handled = {};
        events.trigger('h:editHotkeys', handled);
        if (!handled.done) {
            editHotkeys();
        }
    },

    render() {
        this.$el.html(headerUserTemplate({
            user: getCurrentUser()
        }));
        return this;
    }
});

export default HeaderUserView;
