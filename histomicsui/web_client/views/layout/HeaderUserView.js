import events from '../../events';
import editHotkeys from '../../dialogs/editHotkeys';

import headerUserTemplate from '../../templates/layout/headerUser.pug';

const {getCurrentUser} = girder.auth;
const GirderHeaderUserView = girder.views.layout.HeaderUserView;

var HeaderUserView = GirderHeaderUserView.extend({
    events() {
        return Object.assign({}, GirderHeaderUserView.prototype.events, {
            'click a.h-edit-hotkeys': '_editHotkeys'
        });
    },

    _editHotkeys() {
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
