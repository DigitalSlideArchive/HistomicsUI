/* global huiTest girderTest describe it runs $ expect girder waitsFor */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScript('/static/built/plugins/histomicsui/huiTest.js');

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('Panel layout tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login('admin', 'password');
            });

            it('change settings', function () {
                runs(function () {
                    girder.rest.restRequest({
                        url: '/system/setting',
                        method: 'PUT',
                        data: {
                            key: 'histomicsui.panel_layout',
                            value: JSON.stringify([{
                                name: 'annotation',
                                state: 'closed'
                            }, {
                                name: 'metadata'
                            }, {
                                name: 'zoom',
                                position: 'left'
                            }])
                        },
                        async: false
                    });
                });
            });
            it('logout admin', girderTest.logout());
            it('login regular user', function () {
                huiTest.login();
            });
            it('open image', function () {
                huiTest.openImage('image');
            });
        });

        describe('Check panel locations', function () {
            it('check locations', function () {
                runs(function () {
                    var left = $('.h-panel-group-left [id^=h-][id$=-panel]');
                    var leftIds = left.map(function (idx, panel) {
                        return $(panel).attr('id');
                    });
                    expect(leftIds.toArray()).toEqual(['h-zoom-panel', 'h-analysis-panel']);

                    var right = $('.h-panel-group-right [id^=h-][id$=-panel]');
                    var rightIds = right.map(function (idx, panel) {
                        return $(panel).attr('id');
                    });
                    expect(rightIds.toArray()).toEqual(['h-annotation-panel', 'h-metadata-panel', 'h-overview-panel', 'h-frame-selector-panel', 'h-metadataplot-panel', 'h-draw-panel']);
                });
                waitsFor(function () {
                    return !$('#h-annotation-panel .s-panel-content').hasClass('in');
                }, 'panel to close');
                runs(function () {
                    expect($('#h-annotation-panel .s-panel-content').hasClass('in')).toBe(false);
                });
                runs(function () {
                    expect($('#h-zoom-panel .s-panel-content').hasClass('in')).toBe(true);
                });
            });
        });
    });
});
