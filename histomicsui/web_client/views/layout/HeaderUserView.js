import headerUserTemplate from '../../templates/layout/headerUser.pug';

const { getCurrentUser } = girder.auth;
const GirderHeaderUserView = girder.views.layout.HeaderUserView;

var HeaderUserView = GirderHeaderUserView.extend({
    render() {
        this.$el.html(headerUserTemplate({
            user: getCurrentUser()
        }));
        return this;
    }
});

export default HeaderUserView;
