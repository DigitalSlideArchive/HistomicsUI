/* global girderTest describe it waitsFor runs $ expect _ */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');

girderTest.startApp();

describe('itemList', function () {
    it('mock Webgl', function () {
        var GeojsViewer = window.girder.plugins.large_image.views.imageViewerWidget.geojs;
        window.girder.utilities.PluginUtils.wrap(GeojsViewer, 'initialize', function (initialize) {
            this.once('g:beforeFirstRender', function () {
                try {
                    window.geo.util.mockWebglRenderer();
                } catch (err) {
                    // if this is already mocked, do nothing.
                }
            });
            initialize.apply(this, _.rest(arguments));
        });
    });
    it('login', function () {
        girderTest.login('admin', 'Admin', 'Admin', 'password')();
    });
    it('go to first public user item', function () {
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
    });
    it('has a Open HistomicsUI button', function () {
        runs(function () {
            expect($('.g-hui-open-item').length).toBe(1);
        });
    });
    it('has in Quarantine Item button', function () {
        runs(function () {
            expect($('.g-hui-quarantine-item').length).toBe(1);
        });
    });
});
