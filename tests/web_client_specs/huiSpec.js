/* globals girder, girderTest, describe, it, expect, waitsFor, runs */

girderTest.importPlugin('jobs', 'worker', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');

girderTest.startApp();

describe('Test the HistomicsUI plugin', function () {
    it('change the HistomicsUI settings', function () {
        var styles = [{'lineWidth': 8, 'id': 'Sample Group'}];
        var styleJSON = JSON.stringify(styles);

        girderTest.login('admin', 'Admin', 'Admin', 'password')();
        waitsFor(function () {
            return $('a.g-nav-link[g-target="admin"]').length > 0;
        }, 'admin console link to load');
        runs(function () {
            $('a.g-nav-link[g-target="admin"]').click();
        });
        waitsFor(function () {
            return $('.g-plugins-config').length > 0;
        }, 'the admin console to load');
        runs(function () {
            $('.g-plugins-config').click();
        });
        girderTest.waitForLoad();
        waitsFor(function () {
            return $('.g-plugin-config-link').length > 0;
        }, 'the plugins page to load');
        runs(function () {
            expect($('.g-plugin-config-link[g-route="plugins/histomicsui/config"]').length > 0);
            $('.g-plugin-config-link[g-route="plugins/histomicsui/config"]').click();
        });
        girderTest.waitForLoad();
        waitsFor(function () {
            return $('#g-hui-form input').length > 0;
        }, 'settings to be shown');
        runs(function () {
            $('#g-hui-default-draw-styles').val(styleJSON);
            $('.g-hui-buttons .btn-primary').click();
        });
        waitsFor(function () {
            var resp = girder.rest.restRequest({
                url: 'system/setting',
                method: 'GET',
                data: {
                    list: JSON.stringify([
                        'histomicsui.default_draw_styles'
                    ])
                },
                async: false
            });
            var settings = resp.responseJSON;
            var settingsStyles = settings && JSON.parse(settings['histomicsui.default_draw_styles']);
            return (settingsStyles && settingsStyles.length === 1 &&
                    settingsStyles[0].lineWidth === styles[0].lineWidth);
        }, 'HistomicsUI settings to change');
        girderTest.waitForLoad();
        runs(function () {
            $('#g-hui-default-draw-styles').val('not a json list');
            $('.g-hui-buttons .btn-primary').click();
        });
        waitsFor(function () {
            return $('#g-hui-error-message').text().substr('must be a JSON list') >= 0;
        });
        runs(function () {
            $('#g-hui-brand-color').val('#ffffff');
            $('#g-hui-brand-default-color').click();
            expect($('#g-hui-brand-color').val() === '#777777');
            $('#g-hui-banner-color').val('#ffffff');
            $('#g-hui-banner-default-color').click();
            expect($('#g-hui-banner-color').val() === '#f8f8f8');
        });
        /* test the quarantine folder */
        runs(function () {
            $('.g-open-browser').click();
        });
        girderTest.waitForDialog();
        runs(function () {
            $('#g-root-selector').val($('#g-root-selector')[0].options[1].value).trigger('change');
        });
        waitsFor(function () {
            return $('.g-folder-list-link').length >= 2;
        });
        runs(function () {
            $('.g-folder-list-link').click();
        });
        waitsFor(function () {
            return $('#g-selected-model').val() !== '';
        });
        runs(function () {
            $('.g-submit-button').click();
        });
        girderTest.waitForLoad();
        /* Cancel the changes */
        runs(function () {
            $('.g-hui-buttons #g-hui-cancel').click();
        });
        waitsFor(function () {
            return $('.g-plugin-config-link').length > 0;
        }, 'the plugins page to load');
        girderTest.waitForLoad();
    });
});
