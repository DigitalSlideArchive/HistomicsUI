/* globals girder, girderTest, describe, it, expect, waitsFor, runs */

girderTest.importPlugin('jobs', 'worker', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');

girderTest.startApp();

describe('Test the HistomicsUI itemUI screen', function () {
    var brandName = 'TestBrandName';
    var webRootPath = 'TestRootPath';

    it('login', function () {
        girderTest.login('admin', 'Admin', 'Admin', 'password')();
    });
    it('change the HistomicsUI settings', function () {
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
            $('#g-hui-webroot-path').val(webRootPath);
            $('#g-hui-brand-name').val(brandName);
            $('.g-hui-buttons .btn-primary').click();
        });
        waitsFor(function () {
            var resp = girder.rest.restRequest({
                url: 'histomicsui/settings',
                method: 'GET',
                async: false
            });
            var settings = resp.responseJSON;
            var settingsBrandName = (settings && settings['histomicsui.brand_name']);
            var settingsWebRootPath = (settings && settings['histomicsui.webroot_path']);

            return settingsBrandName === brandName && settingsWebRootPath === webRootPath;
        }, 'HistomicsUI settings to change');
    });
    it('mock Webgl', function () {
        var GeojsViewer = window.girder.plugins.large_image.views.imageViewerWidget.geojs;
        window.girder.utilities.PluginUtils.wrap(GeojsViewer, 'initialize', function (initialize) {
            this.once('g:beforeFirstRender', function () {
                window.geo.util.mockWebglRenderer();
            });
            initialize.apply(this, _.rest(arguments));
        });
    });
    it('go to user item', function () {
        runs(function () {
            $("a.g-nav-link[g-target='users']").click();
        });
        waitsFor(function () {
            return $('a.g-user-link').length > 0;
        });
        runs(function () {
            $('a.g-user-link').last().click();
        });
        waitsFor(function () {
            return $('a.g-folder-list-link').length > 0;
        });
        runs(function () {
            $('.g-folder-list-link:contains("Public")').click();
        });
        waitsFor(function () {
            return $('a.g-item-list-link:contains("image")').length > 0;
        });
        runs(function () {
            $('a.g-item-list-link:contains("image")').click();
        });
        girderTest.waitForLoad();
        waitsFor(function () {
            return $('.g-item-actions-button').length > 0;
        });
        runs(function () {
            $('.g-item-actions-button').click();
        });
        waitsFor(function () {
            return $('.g-item-actions-menu').is(':visible');
        });
        girderTest.waitForLoad();
    });
    it('has a Open HistomicsUI button with TestBrandName', function () {
        runs(function () {
            expect($('.g-hui-open-item').text().indexOf(brandName) !== -1).toBe(true);
        });
    });
    it('has a Open HistomicsUI button with link to webRootPath', function () {
        runs(function () {
            expect($('.g-hui-open-item').attr('href').indexOf(webRootPath) !== -1).toBe(true);
        });
    });
    it('has a Quarantine Item button', function () {
        runs(function () {
            expect($('.g-hui-quarantine-item').length).toBe(1);
        });
    });
});
