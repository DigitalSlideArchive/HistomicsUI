/* global huiTest girderTest describe it runs $ expect waitsFor */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScript('/static/built/plugins/histomicsui/huiTest.js');

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('Metadata panel tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });
            it('open image', function () {
                huiTest.openImage('image');
            });
        });
        describe('Add and edit metadata', function () {
            it('No metadata to start', function () {
                expect($('.g-widget-metadata-header-key-value').length).toBe(0);
            });
            it('Expand the panel and add some simple metadata', function () {
                runs(function () {
                    $('#h-metadata-panel .s-panel-content').addClass('in');
                    $('#h-metadata-panel .s-panel-controls .icon-down-open').removeClass('icon-down-open').addClass('icon-up-open');
                }, 'expand the panel');
                runs(function () {
                    expect($('.g-add-simple-metadata:visible').length).toBe(0);
                    $('.g-widget-metadata-add-button').click();
                    expect($('.g-add-simple-metadata:visible').length).toBe(1);
                    $('.g-add-simple-metadata:visible').click();
                    expect($('.g-widget-metadata-key-input:visible').length).toBe(1);
                    $('.g-widget-metadata-key-input').val('Key');
                    $('.g-widget-metadata-value-input').val('Value');
                    $('.g-widget-metadata-save-button').click();
                });
                waitsFor(function () {
                    return $('.g-widget-metadata-header-key-value').length;
                }, 'the metadata to be in the title');
                runs(function () {
                    expect($('.g-widget-metadata-row .g-widget-metadata-key').text()).toEqual('Key');
                });
            });
            it('edit metadata', function () {
                runs(function () {
                    $('.g-widget-metadata-edit-button').click();
                    expect($('.g-widget-metadata-toggle-button').length).toBe(1);
                    $('.g-widget-metadata-toggle-button').click();
                    expect($('.g-json-editor').length).toBe(0);
                    $('.g-widget-metadata-value-input').val('["Value"]');
                    $('.g-widget-metadata-toggle-button').click();
                    expect($('.g-json-editor').length).toBe(1);
                    $('.g-widget-metadata-toggle-button').click();
                    expect($('.g-json-editor').length).toBe(0);
                    $('.g-widget-metadata-save-button').click();
                });
                waitsFor(function () {
                    return $('.g-json-editor').length === 0;
                }, 'the editor to close');
            });
            it('cancel edit', function () {
                runs(function () {
                    $('.g-widget-metadata-edit-button').click();
                    expect($('.g-widget-metadata-toggle-button').length).toBe(1);
                    $('.g-widget-metadata-cancel-button').click();
                });
                waitsFor(function () {
                    return $('.g-json-editor').length === 0;
                }, 'the editor to close');
            });
            it('delete', function () {
                runs(function () {
                    $('.g-widget-metadata-edit-button').click();
                    expect($('.g-widget-metadata-toggle-button').length).toBe(1);
                    $('.g-widget-metadata-delete-button').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    $('#g-confirm-button').click();
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.g-json-editor').length === 0 && $('.g-widget-metadata-header-key-value').length === 0;
                }, 'the editor to close');
                runs(function () {
                    expect($('.g-widget-metadata-header-key-value').length).toBe(0);
                });
            });
        });
    });
});
