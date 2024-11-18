import { HuiSettings } from '../utils';

const { wrap } = girder.utilities.PluginUtils;
const LoginView = girder.views.layout.LoginView;

wrap(LoginView, 'render', function (render) {
    render.call(this);
    HuiSettings.getSettings().then((settings) => {
        const loginText = (settings['histomicsui.login_text'] || '');
        if (loginText) {
            this.$('#g-login-form label[for="g-login"]').text(loginText);
        }
        return null;
    });
});

export default LoginView;
