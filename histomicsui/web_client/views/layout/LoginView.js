import {wrap} from '@girder/core/utilities/PluginUtils';
import LoginView from '@girder/core/views/layout/LoginView';

import {HuiSettings} from '../utils';

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
