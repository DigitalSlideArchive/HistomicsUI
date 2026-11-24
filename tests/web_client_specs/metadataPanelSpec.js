/* global huiTest girderTest girder describe it runs $ expect waitsFor */

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
        describe('Edit metadata access flag', function () {
            var imageId;

            function createUser(login) {
                girder.rest.restRequest({
                    url: 'user',
                    method: 'POST',
                    data: {
                        login: login,
                        email: login + '@nowhere.com',
                        firstName: login,
                        lastName: 'User',
                        password: 'password'
                    },
                    async: false
                });
                return girder.rest.restRequest({
                    url: 'user',
                    method: 'GET',
                    data: {text: login},
                    async: false
                }).responseJSON[0];
            }

            function openImageById(id) {
                runs(function () {
                    girder.plugins.histomicsui.router.setQuery('image', id, {trigger: true});
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.geojs-layer.active').length > 0 &&
                        $('a.g-item-breadcrumb-link[data-id="' + id + '"]').length === 1 &&
                        $('#h-metadata-panel .g-widget-metadata-container').length === 1;
                }, 'image and metadata panel to load');
                girderTest.waitForLoad();
            }

            it('share the image folder with read-only users', function () {
                runs(function () {
                    imageId = huiTest.imageId();
                    var item = girder.rest.restRequest({
                        url: 'item/' + imageId,
                        method: 'GET',
                        async: false
                    }).responseJSON;
                    var noFlagUser = createUser('noflaguser');
                    var flagUser = createUser('flaguser');
                    var access = girder.rest.restRequest({
                        url: 'folder/' + item.folderId + '/access',
                        method: 'GET',
                        async: false
                    }).responseJSON;
                    access.users.push({
                        id: noFlagUser._id,
                        level: girder.constants.AccessType.READ,
                        flags: []
                    });
                    access.users.push({
                        id: flagUser._id,
                        level: girder.constants.AccessType.READ,
                        flags: ['edit_item_metadata']
                    });
                    girder.rest.restRequest({
                        url: 'folder/' + item.folderId + '/access',
                        method: 'PUT',
                        data: {access: JSON.stringify(access)},
                        async: false
                    });
                });
            });
            it('logout', girderTest.logout());
            it('login as a read-only user without the flag', function () {
                huiTest.login('noflaguser', 'password');
            });
            it('open image', function () {
                openImageById(imageId);
            });
            it('metadata cannot be edited without the flag', function () {
                runs(function () {
                    expect($('#h-metadata-panel .g-widget-metadata-add-button').length).toBe(0);
                });
            });
            it('logout', girderTest.logout());
            it('login as a read-only user with the flag', function () {
                huiTest.login('flaguser', 'password');
            });
            it('open image', function () {
                openImageById(imageId);
            });
            it('metadata can be added with the flag', function () {
                runs(function () {
                    expect($('#h-metadata-panel .g-widget-metadata-add-button').length).toBe(1);
                    $('#h-metadata-panel .s-panel-content').addClass('in');
                    $('.g-widget-metadata-add-button').click();
                    $('.g-add-simple-metadata:visible').click();
                    $('.g-widget-metadata-key-input').val('FlagKey');
                    $('.g-widget-metadata-value-input').val('FlagValue');
                    $('.g-widget-metadata-save-button').click();
                });
                waitsFor(function () {
                    return $('.g-widget-metadata-header-key-value').length;
                }, 'the metadata to be in the title');
                runs(function () {
                    expect($('.g-widget-metadata-row .g-widget-metadata-key').text()).toEqual('FlagKey');
                    var item = girder.rest.restRequest({
                        url: 'item/' + imageId,
                        method: 'GET',
                        async: false
                    }).responseJSON;
                    expect(item.meta.FlagKey).toBe('FlagValue');
                });
            });
        });
    });
});
