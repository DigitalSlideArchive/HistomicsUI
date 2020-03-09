import { restRequest } from '@girder/core/rest';

// Utility items for HistomicUI views
class HuiSettings {
    static getSettings() {
        return new Promise((resolve, reject) => {
            if (!HuiSettings._hui_settings) {
                restRequest({
                    type: 'GET',
                    url: 'histomicsui/settings'
                }).then((resp) => {
                    HuiSettings._hui_settings = resp;
                    resolve(HuiSettings._hui_settings);
                    return HuiSettings._hui_settings;
                });
            } else {
                resolve(HuiSettings._hui_settings);
            }
        });
    }
    static clearSettingsCache() {
        delete HuiSettings._hui_settings;
    }
}

HuiSettings._hui_settings = null;

export default HuiSettings;
