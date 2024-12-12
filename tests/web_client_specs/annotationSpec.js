/* global huiTest girderTest beforeEach girder describe it waitsFor runs $ afterEach expect waits _ */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScript('/static/built/plugins/histomicsui/huiTest.js');

function asciiToUint8Array(text) {
    var l = text.length, arr = new Uint8Array(l), i;
    for (i = 0; i < l; i += 1) {
        arr[i] = text.charCodeAt(i);
    }
    return arr;
}

/**
 * This is a test helper method to make assertions about the last autosaved
 * annotation.  The autosaved annotation is assumed to be the last annotation
 * returned by the `/api/v1/annotation` endpoint.
 *
 * @param {string} imageId The id of the currently opened image
 * @param {number} annotationName An annotation name expected to be in the result
 * @param {number|null} numberOfElements
 *      If a number, the number of elements to expect in the annotation.
 * @param {object}
 *      The annotations loaded from the server will be set in this object for
 *      further use by the caller.
 */
function checkAutoSave(annotationName, numberOfElements, annotationInfo) {
    var annotations;
    var annotation;
    var imageId = huiTest.imageId();

    girderTest.waitForLoad();

    // If the next rest request happens too quickly after saving the
    // annotation, the database might not be synced.  Ref:
    // https://travis-ci.org/DigitalSlideArchive/HistomicsTK/builds/283691041
    waits(100);
    runs(function () {
        girder.rest.restRequest({
            url: 'annotation',
            data: {
                itemId: imageId,
                userId: girder.auth.getCurrentUser().id
            }
        }).then(function (a) {
            annotations = a;
            return null;
        });
    });

    waitsFor(function () {
        return annotations !== undefined;
    }, 'saved annotations to load');
    runs(function () {
        var i, foundIndex = -1;
        for (i = 0; i < annotations.length; i += 1) {
            if (annotations[i].annotation.name === annotationName) {
                foundIndex = i;
            }
        }
        expect(foundIndex).toBeGreaterThan(-1);
        annotationInfo.annotations = annotations;
        girder.rest.restRequest({
            url: 'annotation/' + annotations[foundIndex]._id
        }).done(function (a) {
            annotationInfo.annotation = a;
            annotation = a;
        });
    });

    waitsFor(function () {
        return annotation !== undefined;
    }, 'annotation to load');
    runs(function () {
        if (numberOfElements !== null) {
            expect(annotation.annotation.elements.length).toBe(numberOfElements);
        }
    });
}

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('Annotation tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });

            it('open image', function () {
                huiTest.openImage('image');
            });
        });

        describe('Download view and region of interest', function () {
            it('check href attribute of \'Download View\' link', function () {
                runs(function () {
                    $('#download-view-link').bind('click', function (event) {
                        event.preventDefault();
                    });
                    $('.h-download-button-view').click();
                });

                waitsFor(function () {
                    return $('#download-view-link').attr('href') !== undefined;
                }, 'to be the url');

                runs(function () {
                    expect($('#download-view-link').attr('href')).toMatch(/\/item\/[0-9a-f]{24}\/tiles\/region\?width=[0-9-]+&height=[0-9-]+&left=[0-9-]+&top=[0-9-]+&right=[0-9-]+&bottom=[0-9-]+&contentDisposition=attachment/);
                });
            });

            it('open the download dialog', function () {
                var interactor = huiTest.geojsMap().interactor();
                $('.h-download-button-area').click();

                interactor.simulateEvent('mousedown', {
                    map: {x: 100, y: 100},
                    button: 'left'
                });
                interactor.simulateEvent('mousemove', {
                    map: {x: 200, y: 200},
                    button: 'left'
                });
                interactor.simulateEvent('mouseup', {
                    map: {x: 200, y: 200},
                    button: 'left'
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('.modal-title').text()).toBe('Edit Area');
                });
            });

            it('test modifying form elements', function () {
                const oldSettings = [];
                const elements = [];
                elements.push($('#h-element-width'), $('#h-element-height'),
                    $('#h-nb-pixel'), $('#h-size-file'));
                oldSettings.push($('#h-element-width').val(), $('#h-element-height').val(),
                    $('#h-nb-pixel').val(), $('#h-size-file').val());
                runs(function () {
                    $('#h-element-mag').val(10).trigger('change');
                    var i = 0;
                    // Check all the setting labels change
                    for (var value in oldSettings) {
                        expect(elements[i].val()).not.toEqual(value);
                        i++;
                    }
                });
                runs(function () {
                    $('#h-download-image-format').val('TIFF').trigger('change');
                    // Check the size label change
                    expect($('#h-size-file').val()).not.toEqual(oldSettings[3]);
                });
            });

            it('ensure the download link is correct', function () {
                waitsFor(function () {
                    return $('#h-download-area-link').attr('href') !== undefined;
                }, 'to be the url');

                runs(function () {
                    expect($('#h-download-area-link').attr('href')).toMatch(/\/item\/[0-9a-f]{24}\/tiles\/region\?regionWidth=[0-9-]+&regionHeight=[0-9-]+&left=[0-9-]+&top=[0-9-]+&right=[0-9-]+&bottom=[0-9-]+&encoding=[EFGIJNPT]{3,4}&contentDisposition=attachment&magnification=[0-9-]+/);
                });
            });

            it('close the dialog', function () {
                $('#g-dialog-container').girderModal('close');
                waitsFor(function () {
                    return $('body.modal-open').length === 0;
                });
                girderTest.waitForLoad();
            });
        });

        describe('Draw panel', function () {
            var annotationInfo = {};

            it('create a new annotation', function () {
                runs(function () {
                    $('.h-create-annotation').click();
                });
                girderTest.waitForDialog();

                runs(function () {
                    var nameInput = $('#h-annotation-name');
                    expect(nameInput.length).toBe(1);

                    nameInput.val('drawn 1');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();

                runs(function () {
                    expect($('.h-draw-widget').hasClass('hidden')).toBe(false);
                });
            });

            it('draw a point', function () {
                runs(function () {
                    $('.h-draw[data-type="point"]').click();
                });

                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                });

                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === 1;
                }, 'point to be created');
                runs(function () {
                    expect($('.h-elements-container .h-element .h-element-label').text()).toBe('default point 1');
                    expect($('.h-draw[data-type="point"]').hasClass('active')).toBe(true);
                    // turn off point drawing.
                    $('.h-draw[data-type="point"]').click();
                });
                waitsFor(function () {
                    return !$('.h-draw[data-type="point"]').hasClass('active');
                }, 'point drawing to be off');

                checkAutoSave('drawn 1', 1, annotationInfo);
            });

            it('edit a point element', function () {
                runs(function () {
                    $('.h-elements-container .h-edit-element').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('#g-dialog-container .modal-title').text()).toBe('Edit annotation');
                    $('#g-dialog-container #h-element-label').val('test');
                    $('#g-dialog-container .h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-elements-container .h-element .h-element-label').text()).toBe('test');
                });
            });

            it('draw another point', function () {
                runs(function () {
                    $('.h-draw[data-type="point"]').click();
                });

                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                });

                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === 2;
                }, 'point to be created');
                runs(function () {
                    expect($('.h-elements-container .h-element:last .h-element-label').text()).toBe('default point 2');
                });
                checkAutoSave('drawn 1', 2, annotationInfo);
            });

            it('delete the second point', function () {
                $('.h-elements-container .h-element:last .h-delete-element').click();
                expect($('.h-elements-container .h-element').length).toBe(1);
                checkAutoSave('drawn 1', 1, annotationInfo);
            });

            it('draw another point', function () {
                runs(function () {
                    $('.h-draw[data-type="line"]').click();
                    $('.h-draw[data-type="point"]').click();
                });

                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                });

                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === 2;
                }, 'point to be created');
                runs(function () {
                    expect($('.h-elements-container .h-element:last .h-element-label').text()).toBe('default point 2');
                });
                checkAutoSave('drawn 1', 2, annotationInfo);
            });

            it('modify the location of the last point', function () {
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {
                        map: {x: 100, y: 100}
                    });
                    $('.h-image-body').trigger($.Event('keydown', {key: 'e'}));
                });
                waitsFor(function () {
                    var map = huiTest.geojsMap();
                    var layer = map.layers()[3];
                    return layer.mode() === 'edit';
                }, 'annotation to be in edit mode');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 150, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 150, y: 100},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    var map = huiTest.geojsMap();
                    var layer = map.layers()[3];
                    return layer.mode() !== 'edit';
                }, 'annotation to not be in edit mode');
            });

            it('delete the last point', function () {
                $('.h-elements-container .h-element:last .h-delete-element').click();
                expect($('.h-elements-container .h-element').length).toBe(1);

                // reset the draw state
                $('.h-draw[data-type="line"]').click();
                $('.h-draw[data-type="point"]').click();
            });

            it('check that the drawing type persists when switching annotatations', function () {
                runs(function () {
                    $('.h-annotation-selector .h-group-collapsed .h-annotation-group-name').click();
                    expect($('button.h-draw[data-type="point"]').hasClass('active')).toBe(true);
                    $('.h-create-annotation').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    $('#h-annotation-name').val('drawn b');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                // expect that the drawing type is the same as before
                runs(function () {
                    expect($('button.h-draw[data-type="point"]').hasClass('active')).toBe(true);
                });
                waitsFor(function () {
                    $('.h-annotation-selector .h-group-collapsed .h-annotation-group-name').click();
                    return $('.h-annotation-selector .h-annotation:contains("drawn b")').length;
                }, '"drawn b" control to be shown');

                // delete the annotation we just created.
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn b") .h-delete-annotation').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.h-annotation-selector .h-annotation:contains("drawn b")').length === 0;
                }, '"drawn b" to be deleted');
                // select the original annotation
                runs(function () {
                    expect($('.h-annotation-selector .h-annotation:contains("drawn 1") .h-annotation-name').length).toBe(1);
                    $('.h-annotation-selector .h-annotation:contains("drawn 1") .h-annotation-name').click();
                });
                waitsFor(function () {
                    return $('.h-draw-widget').not('.hidden').length;
                });
                girderTest.waitForLoad();
                // expect that the drawing type is the same as before
                runs(function () {
                    expect($('button.h-draw[data-type="point"]').hasClass('active')).toBe(true);
                });
            });
            it('test a boolean polygon operation', function () {
                var annotCount, toggle;
                // The system isn't always ready here.  A wait helps; it'd be
                // better to track down what we need to wait for.
                waits(500);
                runs(function () {
                    annotCount = $('.h-elements-container .h-element').length;
                    $('.h-draw[data-type="rectangle"]').click();
                });

                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'rectangle mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mousedown', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === annotCount + 1;
                }, 'one annotation to be added');
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'rectangle mode to activate again');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 210, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 210, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mousedown', {
                        map: {x: 300, y: 200},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 300, y: 200},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === annotCount + 2;
                }, 'a second annotation to be added');
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'rectangle mode to activate a third time');
                waitsFor(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    toggle = toggle ? 0 : 1;
                    interactor.simulateEvent('mousemove', {
                        map: {x: 140 + toggle, y: 110},
                        button: 'left',
                        modifiers: 'shift'
                    });
                    return $('.geojs-map.annotation-union').length > 0;
                }, 'boolean mode to be active');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 150, y: 110},
                        button: 'left',
                        modifiers: 'shift'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 150, y: 110},
                        button: 'left',
                        modifiers: 'shift'
                    });
                    interactor.simulateEvent('mousedown', {
                        map: {x: 250, y: 210},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 250, y: 210},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === annotCount + 1;
                }, 'two annotations to merge into one');
            });
            it('test a brush operation', function () {
                var annotCount;
                runs(function () {
                    annotCount = $('.h-elements-container .h-element').length;
                    $('.h-draw[data-type="brush"]').click();
                });
                waitsFor(function () {
                    return huiTest.geojsMap().layers()[3].annotations().length === 1;
                }, 'brush mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {
                        map: {x: 90, y: 100}
                    });
                    interactor.simulateEvent('mousemove', {
                        map: {x: 95, y: 100}
                    });
                    interactor.simulateEvent('mousedown', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 100, y: 100},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === annotCount + 1;
                }, 'one annotation to be added');
                girderTest.waitForLoad();
                waitsFor(function () {
                    return huiTest.geojsMap().layers()[3].annotations().length === 1;
                }, 'brush mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {
                        map: {x: 200, y: 100}
                    });
                    interactor.simulateEvent('mousedown', {
                        map: {x: 210, y: 100},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 210, y: 100},
                        button: 'left'
                    });
                });
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousedown', {
                        map: {x: 140, y: 110},
                        button: 'left'
                    });
                    interactor.simulateEvent('mousemove', {
                        map: {x: 180, y: 110},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 200, y: 110},
                        button: 'left'
                    });
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === annotCount + 1;
                }, 'two annotations to merge into one');
            });
            it('check that keyboard shortcuts behave correctly', function () {
                runs(function () {
                    // expect that hitting keyboard shortcut for each shape will
                    // switch the annotation mode to it, and hitting it again will
                    // turn off drawing mode.
                    $('.h-image-body').trigger($.Event('keydown', {key: 'r'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('rectangle');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'r'}));
                    expect($('.h-draw.active').length).toBe(0);

                    $('.h-image-body').trigger($.Event('keydown', {key: 'o'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('point');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'o'}));
                    expect($('.h-draw.active').length).toBe(0);

                    $('.h-image-body').trigger($.Event('keydown', {key: 'c'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('circle');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'c'}));
                    expect($('.h-draw.active').length).toBe(0);

                    $('.h-image-body').trigger($.Event('keydown', {key: 'i'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('ellipse');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'i'}));
                    expect($('.h-draw.active').length).toBe(0);

                    $('.h-image-body').trigger($.Event('keydown', {key: 'p'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('polygon');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'p'}));
                    expect($('.h-draw.active').length).toBe(0);

                    $('.h-image-body').trigger($.Event('keydown', {key: 'l'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('line');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'l'}));
                    expect($('.h-draw.active').length).toBe(0);
                });
            });
        });

        describe('Annotation styles', function () {
            it('create a new annotation', function () {
                $('.h-create-annotation').click();
                girderTest.waitForDialog();

                runs(function () {
                    var nameInput = $('#h-annotation-name');
                    expect(nameInput.length).toBe(1);

                    nameInput.val('drawn 2');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();

                runs(function () {
                    expect($('.h-draw-widget').hasClass('hidden')).toBe(false);
                });
            });

            it('open the style group dialog', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                waitsFor(function () {
                    return $('body.modal-open').length > 0;
                }, 'dialog to open');
                runs(function () {
                    // ensure the default style is created on load
                    expect($('.h-group-name :selected').val()).toBe('default');
                });
            });

            it('test reset to defaults as a regular user', function () {
                runs(function () {
                    $('#h-element-line-width').val('10');
                    $('#h-reset-defaults').click();
                });
                waitsFor(function () {
                    return $('#h-element-line-width').val() === '2';
                });
                runs(function () {
                    expect($('.h-group-name :selected').val()).toBe('default');
                });
            });

            it('create a new style group', function () {
                runs(function () {
                    $('.h-create-new-style').click();
                    $('.h-new-group-name').val('new');
                    $('.h-save-new-style').click();
                    expect($('.h-group-name :selected').val()).toBe('new');

                    $('#h-element-line-width').val(1).trigger('change');
                    $('#h-element-line-color').val('rgb(255,0,0)').trigger('change').trigger('input');
                    $('#h-element-fill-color').val('rgb(0,0,255)').trigger('change').trigger('input');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group').val()).toBe('new');
                });
            });

            it('draw a point', function () {
                runs(function () {
                    // The draw button must be clicked in the next event loop (not sure why).
                    window.setTimeout(function () {
                        $('.h-draw[data-type="point"]').click();
                    }, 0);
                });
                runs(function () {
                    $('.h-draw[data-type="point"]').removeClass('active').click();
                });

                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();

                    interactor.simulateEvent('mousedown', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                    interactor.simulateEvent('mouseup', {
                        map: {x: 200, y: 200},
                        button: 'left'
                    });
                });
                waitsFor(function () {
                    return huiTest.app.bodyView.drawWidget.collection.length > 0;
                }, 'collection to update');
                runs(function () {
                    var elements = huiTest.app.bodyView.drawWidget.collection;
                    expect(elements.length).toBe(1);

                    var point = elements.at(0);
                    expect(point.get('lineWidth')).toBe(1);
                    expect(point.get('lineColor')).toBe('rgb(255, 0, 0)');
                    expect(point.get('fillColor')).toBe('rgb(0, 0, 255)');
                });
            });

            it('change style group using keyboard shortcuts', function () {
                runs(function () {
                    // Pressing q should select the previous annotation group in the list
                    $('.h-draw-widget').trigger($.Event('keydown', {key: 'q'}));
                    expect($('.h-style-group').val()).toBe('default');

                    // Since the currently selected style group is the first
                    // one in the list, pressing q should cause it to wrap
                    // around and select the last style group in the list
                    $('.h-draw-widget').trigger($.Event('keydown', {key: 'q'}));
                    expect($('.h-style-group').val()).toBe('new');

                    // Pressing w should select the next annotation group in the list
                    $('.h-draw-widget').trigger($.Event('keydown', {key: 'w'}));
                    expect($('.h-style-group').val()).toBe('default');

                    // Since the currently selected style group is the last
                    // one in the list, pressing w should cause it to wrap
                    // around and select the first style group in the list
                    $('.h-draw-widget').trigger($.Event('keydown', {key: 'w'}));
                    expect($('.h-style-group').val()).toBe('new');
                });
            });

            it('open the style group dialog again', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                waitsFor(function () {
                    return $('body.modal-open').length > 0;
                }, 'dialog to open');
                runs(function () {
                    expect($('.h-group-name :selected').val()).toBe('new');
                });
            });

            it('delete a style group', function () {
                runs(function () {
                    $('.h-delete-style').click();
                    expect($('.h-group-name :selected').val()).toBe('default');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group').val()).toBe('default');
                });
            });
        });

        describe('Annotation panel', function () {
            it('panel is rendered', function () {
                expect($('.h-annotation-selector .s-panel-title').text()).toMatch(/Annotations/);

                // make sure all groups are expanded
                $('.h-annotation-selector .h-group-collapsed .h-annotation-group-name').click();
                waitsFor(function () {
                    return !$('.h-annotation-selector').hasClass('h-group-collapsed');
                }, 'groups to expand');
            });

            it('collapse an annotation group', function () {
                var $el = $('.h-annotation-selector .h-group-expanded[data-group-name="Other"]');
                expect($el.length).toBe(1);
                $el.find('.h-annotation-group-name').click();

                waitsFor(function () {
                    $el = $('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
                    return $el.hasClass('h-group-collapsed');
                }, 'group to collapse');
                runs(function () {
                    expect($el.hasClass('h-group-collapsed')).toBe(true);
                    expect($el.hasClass('h-group-expanded')).toBe(false);
                    expect($el.find('.h-annotation').length).toBe(0);
                });
            });

            it('expand an annotation group', function () {
                var $el = $('.h-annotation-selector .h-group-collapsed[data-group-name="Other"]');
                expect($el.length).toBe(1);
                $el.find('.h-annotation-group-name').click();

                waitsFor(function () {
                    $el = $('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
                    return $el.hasClass('h-group-expanded');
                }, 'group to expand');
                runs(function () {
                    expect($el.hasClass('h-group-collapsed')).toBe(false);
                    expect($el.hasClass('h-group-expanded')).toBe(true);
                    expect($el.find('.h-annotation').length).toBeGreaterThan(0);
                });
            });

            it('ensure user cannot remove the admin annotation', function () {
                var adminAnnotation = $('.h-annotation-selector .h-annotation:contains("admin annotation")');
                expect(adminAnnotation.length).toBe(1);
                expect(adminAnnotation.find('.h-delete-annotation').length).toBe(0);
            });

            it('hide all annotations', function () {
                $('.h-hide-all-annotations').click();
                girderTest.waitForLoad();

                runs(function () {
                    expect($('.h-annotation .icon-eye-off').length).toBe(3);
                    expect($('.h-annotation .icon-eye').length).toBe(0);
                });
            });

            it('show all annotations', function () {
                $('.h-show-all-annotations').click();
                girderTest.waitForLoad();

                waitsFor(function () {
                    var $el = $('.h-annotation-selector');
                    return $el.find('.icon-spin3').length === 0;
                }, 'loading spinners to disappear');
                runs(function () {
                    expect($('.h-annotation .icon-eye-off').length).toBe(0);
                    expect($('.h-annotation .icon-eye').length).toBe(3);
                });
            });

            it('set the global annotation opacity', function () {
                var opacity;
                var setGlobalAnnotationOpacityFunc = huiTest.app.bodyView.viewerWidget.setGlobalAnnotationOpacity;
                huiTest.app.bodyView.viewerWidget.setGlobalAnnotationOpacity = function (_opacity) {
                    opacity = _opacity;
                    return setGlobalAnnotationOpacityFunc.apply(this, arguments);
                };

                $('#h-annotation-opacity').val(0.5).trigger('input');
                expect(opacity).toBe('0.5');

                huiTest.app.bodyView.viewerWidget.setGlobalAnnotationOpacity = setGlobalAnnotationOpacityFunc;
            });

            it('set the global annotation fill opacity', function () {
                var opacity;
                var setGlobalAnnotationFillOpacityFunc = huiTest.app.bodyView.viewerWidget.setGlobalAnnotationFillOpacity;
                huiTest.app.bodyView.viewerWidget.setGlobalAnnotationFillOpacity = function (_opacity) {
                    opacity = _opacity;
                    return setGlobalAnnotationFillOpacityFunc.apply(this, arguments);
                };

                $('#h-annotation-fill-opacity').val(0.5).trigger('input');
                expect(opacity).toBe('0.5');

                huiTest.app.bodyView.viewerWidget.setGlobalAnnotationFillOpacity = setGlobalAnnotationFillOpacityFunc;
            });

            it('toggle visibility of an annotation', function () {
                runs(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("drawn 1")');
                    $el.find('.h-toggle-annotation').click();
                });
                waitsFor(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("drawn 1")');
                    return $el.find('.icon-eye-off.h-toggle-annotation').length === 1;
                }, 'annotation to toggle off');

                runs(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("drawn 1")');
                    $el.find('.h-toggle-annotation').click();
                });
                waitsFor(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("drawn 1")');
                    return $el.find('.icon-eye.h-toggle-annotation').length === 1;
                }, 'annotation to toggle on');
            });

            it('select annotations by rect - no hits', function () {
                var interactor = huiTest.geojsMap().interactor();
                expect($('.h-annotation-select-by-region').length).toBe(1);
                $('.h-annotation-select-by-region').click();

                interactor.simulateEvent('mousedown', {
                    map: {x: 100, y: 100},
                    button: 'left'
                });
                interactor.simulateEvent('mousemove', {
                    map: {x: 200, y: 200},
                    button: 'left'
                });
                interactor.simulateEvent('mouseup', {
                    map: {x: 200, y: 200},
                    button: 'left'
                });

                expect($('#h-annotation-context-menu').is(':hidden')).toBe(true);
            });

            it('getElementsInBox', function () {
                var viewer = huiTest.app.bodyView.viewerWidget;
                var boundingBox = {
                    left: 0,
                    top: 0,
                    width: viewer.$el.width(),
                    height: viewer.$el.height()
                };

                $('.h-show-all-annotations').click();
                girderTest.waitForLoad();

                waitsFor(function () {
                    var $el = $('.h-annotation-selector');
                    return $el.find('.icon-spin3').length === 0;
                }, 'load all annotations');

                runs(function () {
                    var elements = huiTest.app.bodyView.getElementsInBox(boundingBox);
                    var countExistingElements = huiTest.app.bodyView.annotations.reduce(function (acc, annotation) {
                        return acc + annotation.elements.length;
                    }, 0);
                    expect(elements.length).toBe(countExistingElements);
                });
            });

            it('edit annotation metadata', function () {
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 1") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('#h-annotation-name').val()).toBe('drawn 1');
                    $('#h-annotation-name').val('');
                    $('#h-annotation-description').val('description');
                    $('.h-submit').click();

                    var validationEl = $('.g-validation-failed-message');
                    expect(validationEl.length).toBe(1);
                    expect(validationEl.hasClass('hidden')).toBe(false);
                    expect(validationEl.text()).toBe('Please enter a name.');

                    $('#h-annotation-name').val('edited 1');
                    $('.h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("edited 1")');
                    expect($el.length).toBe(1);
                });
            });

            it('edit annotation style', function () {
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('#h-annotation-name').val()).toBe('drawn 2');
                    expect($('#h-annotation-line-width').length).toBe(1);
                    expect($('#h-annotation-line-color').length).toBe(1);
                    expect($('#h-annotation-fill-color').length).toBe(1);
                    $('#h-annotation-line-width').val(2);
                    $('#h-annotation-line-color').val('black');
                    $('#h-annotation-fill-color').val('white');
                    $('.h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').elements[0].lineWidth).toBe(2);
                    expect(annotation.get('annotation').elements[0].lineColor).toBe('rgb(0, 0, 0)');
                    expect(annotation.get('annotation').elements[0].fillColor).toBe('rgb(255, 255, 255)');
                });
            });

            it('set annotation permissions to WRITE', function () {
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("edited 1") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('#g-dialog-container .h-access').length).toBe(1);
                    $('#g-dialog-container .h-access').click();
                });
                waitsFor(function () {
                    return $('#g-access-public').length;
                });
                girderTest.waitForDialog();
                runs(function () {
                    var $el = $('#g-dialog-container');
                    expect($el.find('.modal-title').text()).toBe('Access control');

                    // set edit-only access
                    expect($el.find('.g-user-access-entry').length).toBe(1);
                    $el.find('.g-user-access-entry .g-access-col-right select').val(1);
                    $el.find('.g-save-access-list').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    // the user should still have the edit button
                    expect($('.h-annotation-selector .h-annotation:contains("edited 1") .h-edit-annotation-metadata').length).toBe(1);
                    $('.h-annotation-selector .h-annotation:contains("edited 1") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    // admin access should be removed
                    expect($('#g-dialog-container .h-access').length).toBe(0);
                });
            });

            it('delete an annotation', function () {
                var annotations = null;
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("edited 1") .h-delete-annotation').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    $('.h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-annotation-selector .h-annotation:contains("edited 1")').length).toBe(0);
                    girder.rest.restRequest({
                        url: 'annotation',
                        data: {
                            itemId: huiTest.imageId(),
                            userId: girder.auth.getCurrentUser().id
                        }
                    }).then(function (a) {
                        annotations = a;
                        return null;
                    });
                });

                waitsFor(function () {
                    return annotations !== null;
                }, 'get annotations from server');
                runs(function () {
                    expect(annotations.length).toBe(1);
                });
            });

            it('cannot edit an annotation as a non-admin', function () {
                var trigger = girder.events.trigger;
                var alertTriggered;
                girder.events.trigger = _.wrap(girder.events.trigger, function (func, event, options) {
                    if (event === 'g:alert') {
                        alertTriggered = options;
                    }
                    return func.apply(arguments);
                });

                $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-toggle-annotation').click();
                $('.h-annotation-selector .h-annotation:contains("admin annotation") .h-annotation-name').click();

                girderTest.waitForLoad();
                runs(function () {
                    expect(alertTriggered).toBeDefined();
                    expect(alertTriggered.text).toBe('You do not have write access to this annotation.');
                    girder.events.trigger = trigger;
                });
            });

            it('close the open draw panel', function () {
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-annotation-name').click();
                });
                waitsFor(function () {
                    return $('.h-elements-container').length;
                }, 'the panel to be shown');
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-elements-container').length).toBe(1);
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-annotation-name').click();
                });
                girderTest.waitForLoad();
                waitsFor(function () {
                    return !$('.h-elements-container').length;
                }, 'the panel to be hidden');
                runs(function () {
                    expect($('.h-elements-container').length).toBe(0);
                });
            });

            it('open the draw panel for an editable annotation', function () {
                $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-annotation-name').click();
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-elements-container').length).toBe(1);
                    expect($('.h-annotation-selector .h-annotation:contains("drawn 2") .icon-eye').length).toBe(1);
                    expect($('.h-draw-widget .h-panel-name').text()).toBe('drawn 2');
                });
            });

            it('trigger a mouseon event on an element with interactivity off', function () {
                var annotation = $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id');
                var element = huiTest.app.bodyView.annotations.get(annotation).elements().get($('.h-draw-widget .h-element').data('id'));
                huiTest.app.bodyView.viewerWidget.trigger('g:mouseOnAnnotation', element, annotation);
                expect($('.h-annotation-selector .h-annotation:contains("drawn 2")').hasClass('h-highlight-annotation')).toBe(false);
                expect($('.h-draw-widget .h-element').hasClass('h-highlight-element')).toBe(false);
            });

            it('trigger a mouseon event and then turn interactivity off', function () {
                $('#h-toggle-interactive').click(); // interactive on
                var annotation = $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id');
                var element = huiTest.app.bodyView.annotations.get(annotation).elements().get($('.h-draw-widget .h-element').data('id'));
                huiTest.app.bodyView.viewerWidget.trigger('g:mouseOnAnnotation', element, annotation);
                expect($('.h-annotation-selector .h-annotation:contains("drawn 2")').hasClass('h-highlight-annotation')).toBe(true);
                expect($('.h-draw-widget .h-element').hasClass('h-highlight-element')).toBe(true);

                $('#h-toggle-interactive').click(); // interactive off
                expect($('.h-annotation-selector .h-annotation:contains("drawn 2")').hasClass('h-highlight-annotation')).toBe(false);
                expect($('.h-draw-widget .h-element').hasClass('h-highlight-element')).toBe(false);
            });

            it('turn on interactivity and trigger a mouseon event', function () {
                $('#h-toggle-interactive').click(); // interactive on
                var annotation = $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id');
                var element = huiTest.app.bodyView.annotations.get(annotation).elements().get($('.h-draw-widget .h-element').data('id'));
                huiTest.app.bodyView.viewerWidget.trigger('g:mouseOnAnnotation', element, annotation);
                expect($('.h-annotation-selector .h-annotation:contains("drawn 2")').hasClass('h-highlight-annotation')).toBe(true);
                expect($('.h-draw-widget .h-element').hasClass('h-highlight-element')).toBe(true);
            });

            it('trigger a mouseoff event', function () {
                var annotation = $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id');
                var element = huiTest.app.bodyView.annotations.get(annotation).elements().get($('.h-draw-widget .h-element').data('id'));
                huiTest.app.bodyView.viewerWidget.trigger('g:mouseOffAnnotation', element, annotation);
                expect($('.h-annotation-selector .h-annotation:contains("drawn 2")').hasClass('h-highlight-annotation')).toBe(false);
                expect($('.h-draw-widget .h-element').hasClass('h-highlight-element')).toBe(false);
            });

            it('mouseover an annotation in the AnnotationSelector', function () {
                var called;
                var highlightAnnotation = huiTest.app.bodyView.viewerWidget.highlightAnnotation;
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = function (annotation, element) {
                    called = true;
                    expect(annotation).toBe($('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id'));
                    expect(element).toBeUndefined();
                };
                huiTest.app.bodyView.annotationSelector.$('.h-annotation:contains("drawn 2")').trigger('mouseenter');
                expect(called).toBe(true);
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = highlightAnnotation;
            });

            it('mouseover an annotation in the Draw widget', function () {
                var called;
                var highlightAnnotation = huiTest.app.bodyView.viewerWidget.highlightAnnotation;
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = function (annotation, element) {
                    called = true;
                    expect(annotation).toBe($('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id'));
                    expect(element).toBe($('.h-element').data('id'));
                };
                $('.h-element').trigger('mouseenter');
                expect(called).toBe(true);
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = highlightAnnotation;
            });

            it('mouseout to reset the highlight state', function () {
                var called;
                var highlightAnnotation = huiTest.app.bodyView.viewerWidget.highlightAnnotation;
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = function (annotation, element) {
                    called = true;
                    expect(annotation).toBeUndefined();
                    expect(element).toBeUndefined();
                };
                $('.h-element').trigger('mouseout');
                expect(called).toBe(true);
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = highlightAnnotation;
            });

            it('mouseover a hidden annotation should be a no-op', function () {
                var highlightAnnotation = huiTest.app.bodyView.viewerWidget.highlightAnnotation;
                huiTest.app.bodyView.viewerWidget.highlightAnnotation = function (annotation, element) {
                    throw new Error('should not be called');
                };
                $('.h-annotation-selector .h-annotation:contains("admin annotation") .icon-eye').click();

                girderTest.waitForLoad();
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("admin annotation")').trigger('mouseenter');
                    huiTest.app.bodyView.viewerWidget.highlightAnnotation = highlightAnnotation;
                });
            });

            it('show new annotations during job events', function () {
                var uploaded = false;

                runs(function () {
                    var rect = {
                        name: 'rectangle',
                        description: 'the description',
                        elements: [
                            {
                                center: [
                                    2000,
                                    2000,
                                    0
                                ],
                                height: 4000,
                                rotation: 0,
                                type: 'rectangle',
                                width: 4000
                            }
                        ]
                    };

                    girder.rest.restRequest({
                        url: 'annotation?itemId=' + huiTest.imageId(),
                        contentType: 'application/json',
                        processData: false,
                        data: JSON.stringify(rect),
                        method: 'POST'
                    }).then(function () {
                        uploaded = true;
                        return null;
                    });
                });

                waitsFor(function () {
                    return uploaded;
                }, 'annotation to be uploaded');
                runs(function () {
                    girder.utilities.eventStream.trigger('g:event.job_status', {
                        data: {status: 3}
                    });
                });

                waitsFor(function () {
                    return $('.h-annotation-selector .h-annotation:contains("rectangle")').length === 1;
                }, 'new annotation to appear');
                waitsFor(function () {
                    var $el = $('.h-annotation-selector');
                    return $el.find('.icon-spin3').length === 0;
                }, 'loading spinners to disappear');
                waitsFor(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("rectangle")');
                    return $el.find('.icon-eye.h-toggle-annotation').length === 1;
                }, 'annotation list to render');
                runs(function () {
                    var $el = $('.h-annotation-selector .h-annotation:contains("rectangle")');
                    expect($el.find('.icon-eye.h-toggle-annotation').length).toBe(1);
                });
            });

            it('hover over annotation with labels off', function () {
                girderTest.waitForLoad();
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {
                        map: {x: 50, y: 50}
                    });
                    expect($('#h-annotation-popover-container').hasClass('hidden')).toBe(true);
                });
            });

            it('hover over annotation with labels on', function () {
                var done = false;
                runs(function () {
                    $('#h-toggle-labels').click();

                    // Ensure the next mouse move event happens asynchronously.
                    // Without doing this, the hover event occasionally fails to
                    // fire.
                    window.setTimeout(function () {
                        done = true;
                    }, 35);
                });

                waitsFor(function () {
                    return done;
                }, 'next event loop');

                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {
                        map: {x: 45, y: 45}
                    });
                });

                waitsFor(function () {
                    var $el = $('#h-annotation-popover-container');
                    return $el.find('.h-annotation-name').text() !== '';
                }, 'popup window to update');

                runs(function () {
                    var $el = $('#h-annotation-popover-container');
                    expect($el.hasClass('hidden')).toBe(false);
                    expect($el.find('.h-annotation-name').text()).toBe('rectangle');
                    expect($el.find('.h-annotation-description').text()).toMatch(/the description/);
                });
            });

            it('open and close the context menu', function () {
                var interactor = huiTest.geojsMap().interactor();
                interactor.simulateEvent('mousedown', {
                    map: {x: 50, y: 50},
                    button: 'right'
                });
                interactor.simulateEvent('mouseup', {
                    map: {x: 50, y: 50},
                    button: 'right'
                });

                waitsFor(function () {
                    return $('#h-annotation-context-menu').hasClass('hidden') === false;
                }, 'context menu to be shown');
                runs(function () {
                    $(document).trigger('mousedown');
                    $(document).trigger('mouseup');
                    expect($('#h-annotation-context-menu').hasClass('hidden')).toBe(true);
                });
            });

            it('delete an element from the context menu', function () {
                var interactor = huiTest.geojsMap().interactor();
                interactor.simulateEvent('mousedown', {
                    map: {x: 50, y: 50},
                    button: 'right'
                });
                interactor.simulateEvent('mouseup', {
                    map: {x: 50, y: 50},
                    button: 'right'
                });

                waitsFor(function () {
                    return $('#h-annotation-context-menu').hasClass('hidden') === false;
                }, 'context menu to be shown');

                // wait for the next animation frame so that the highlighting is finished
                waits(30);
                runs(function () {
                    $('#h-annotation-context-menu .h-remove-elements').click();
                    expect($('#h-annotation-context-menu').hasClass('hidden')).toBe(true);
                });
                girderTest.waitForLoad();
            });

            it('open a different image', function () {
                huiTest.waitsForPromise(
                    huiTest.openImage('copy').done(function () {
                        expect($('.h-annotation-selector .h-annotation').length).toBe(0);
                    }), 'Annotation selector to appear'
                );
            });

            it('open the original image', function () {
                huiTest.waitsForPromise(
                    huiTest.openImage('image').done(function () {
                        expect($('.h-annotation-selector .h-annotation').length).toBe(3);
                    }), 'Annotation selector to appear'
                );
            });
        });
    });

    describe('Open recently annotated image', function () {
        var restPromise = null;
        var girderRestRequest = null;

        beforeEach(function () {
            restPromise = $.Deferred();
            girderRestRequest = girder.rest.restRequest;
            // Wrap girder's restRequest method to notify the testing code below
            // that the image list endpoint has returned.
            girder.rest.restRequest = function (opts) {
                var promise = girderRestRequest.apply(this, arguments);
                if (opts.url === 'annotation/images') {
                    promise.done(function () {
                        restPromise.resolve(opts);
                    });
                }
                return promise;
            };
        });

        afterEach(function () {
            girder.rest.restRequest = girderRestRequest;
            restPromise = null;
        });

        it('open the dialog', function () {
            runs(function () {
                $('.h-open-annotated-image').click();
            });

            waitsFor(function () {
                var imageId = huiTest.imageId();
                var $el = $('.h-annotated-image[data-id="' + imageId + '"]');
                return $el.length === 1;
            });
            runs(function () {
                var imageId = huiTest.imageId();
                var $el = $('.h-annotated-image[data-id="' + imageId + '"]');
                expect($el.find('.media-left img').prop('src'))
                    .toMatch(/item\/[0-9a-f]*\/tiles\/thumbnail/);
                expect($el.find('.media-heading').text()).toBe('image');
            });
        });

        it('assert user list exists', function () {
            var options = $('#h-annotation-creator option');
            expect(options.length).toBe(3);
            expect(options[0].text).toBe('Any user');
            expect(options[1].text).toBe('admin');
            expect(options[2].text).toBe('user');
        });

        it('filter by creator', function () {
            var select = $('#h-annotation-creator');
            var userid = select.find('option:nth(1)').val();
            select.val(userid).trigger('change');

            huiTest.waitsForPromise(
                restPromise.done(function (opts) {
                    expect(opts.data.creatorId).toBe(userid);
                }),
                'Creator filter to update'
            );

            waitsFor(function () {
                return $('.h-annotated-image').length === 1;
            }, 'Dialog to rerender');
        });

        it('filter by name', function () {
            $('#h-image-name').val('invalid name').trigger('keyup');

            huiTest.waitsForPromise(
                restPromise.done(function (opts) {
                    expect(opts.data.imageName).toBe('invalid name');
                }),
                'Name filter to update'
            );

            waitsFor(function () {
                return $('.h-annotated-image').length === 0;
            }, 'Dialog to rerender');
        });

        it('reset filter', function () {
            $('#h-image-name').val('').trigger('keyup');
            huiTest.waitsForPromise(restPromise, 'Name filter to reset');

            waitsFor(function () {
                return $('.h-annotated-image').length === 1;
            }, 'Dialog to rerender');
        });

        it('click on the image', function () {
            runs(function () {
                var imageId = huiTest.imageId();
                var $el = $('.h-annotated-image[data-id="' + imageId + '"]');
                $el.click();
            });
            girderTest.waitForLoad();
            runs(function () {
                var imageId = huiTest.imageId();
                expect(girder.plugins.histomicsui.router.getQuery('image')).toBe(imageId);
            });
        });
    });

    describe('Annotation tests as admin', function () {
        describe('setup', function () {
            it('logout regular user', girderTest.logout());
            it('login', function () {
                // close any open dialog; this can happen if downloads are
                // restricted -- the login dialog will have automatically
                // appeared
                $('.modal-dialog .modal-footer .btn-default').click();
                huiTest.login('admin', 'password');
            });

            it('open the dialog', function () {
                runs(function () {
                    $('.h-open-annotated-image').click();
                });
                waitsFor(function () {
                    var $el = $('.h-annotated-image[data-id="' + huiTest.imageId() + '"]');
                    return $el.length === 1;
                }, 'here');
                girderTest.waitForDialog();
                runs(function () {
                    var $el = $('.h-annotated-image[data-id="' + huiTest.imageId() + '"]');
                    expect($el.length).toBe(1);
                    // remock Webgl
                    huiTest.app.bodyView.once('h:viewerWidgetCreated', function (viewerWidget) {
                        viewerWidget.once('g:beforeFirstRender', function () {
                            try {
                                window.geo.util.mockWebglRenderer();
                            } catch (err) {
                                // if this is already mocked, do nothing.
                            }
                        });
                    });
                    $el.click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    var imageId = huiTest.imageId();
                    expect(girder.plugins.histomicsui.router.getQuery('image')).toBe(imageId);
                });
            });
        });

        describe('style group tests', function () {
            it('open an annotation in the draw panel', function () {
                waitsFor(function () {
                    return $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-toggle-annotation').length;
                }, 'annotations to appear');
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("admin annotation") .h-annotation-name').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-annotation-name').click();
                });

                girderTest.waitForLoad();
                waitsFor(function () {
                    return $('.icon-spin3').length === 0;
                }, 'loading spinners to disappear');
                runs(function () {
                    expect($('.h-elements-container').length).toBe(1);
                    expect($('.h-annotation-selector .h-annotation:contains("drawn 2") .icon-eye').length).toBe(1);
                    expect($('.h-draw-widget .h-panel-name').text()).toBe('drawn 2');
                });
            });

            it('open the style group dialog', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
            });

            it('set the default style groups', function () {
                runs(function () {
                    $('#h-set-defaults').click();
                });
                waitsFor(function () {
                    var resp = girder.rest.restRequest({
                        url: 'system/setting',
                        method: 'GET',
                        data: {list: JSON.stringify(['histomicsui.default_draw_styles'])},
                        async: false
                    });
                    var settings = resp.responseJSON;
                    var settingsStyles = settings && JSON.parse(settings['histomicsui.default_draw_styles']);
                    if (!settingsStyles || !settingsStyles.length) {
                        return false;
                    }
                    return settingsStyles[0].group === 'new';
                });
            });
            it('reset the style groups', function () {
                runs(function () {
                    $('.h-group-name').val('new'); // select the 'new' style
                    $('#h-element-line-width').val('10');
                    $('#h-element-label').val('newlabel');
                    $('#h-reset-defaults').click();
                });
                waitsFor(function () {
                    return $('#h-element-label').val() === '';
                }, 'label to reset');
                girderTest.waitForDialog();
                runs(function () {
                    expect($('#h-element-line-width').val()).toBe('2');
                });
            });
            it('cancel changes', function () {
                runs(function () {
                    $('.h-cancel').click();
                });
                girderTest.waitForLoad();
            });

            it('export style groups', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    $('#h-export').click();
                    expect($('#h-export-link').attr('href').substr(0, 5)).toBe('blob:');
                });
                runs(function () {
                    $('.h-cancel').click();
                });
                girderTest.waitForLoad();
            });

            it('import style groups', function () {
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['default']);
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    var contents = [{
                        lineWidth: 2,
                        lineColor: 'rgb(0,0,0)',
                        fillColor: 'rgba(0,0,0,0)',
                        id: 'Black 2'
                    }, {
                        lineWidth: 4,
                        lineColor: 'rgb(0, 0, 255)',
                        fillColor: 'rgba(0, 0, 255, 0)',
                        id: 'Blue 4'
                    }];
                    var file = new Blob(
                        [asciiToUint8Array(JSON.stringify(contents))],
                        {lastModified: null, type: 'application/json'});
                    file.name = 'test1.json';
                    // in the test environment, we can't actually upload a file
                    // by clicking or setting the FileList of the upload
                    // element.  click gratuitiously, then reach into the
                    // jQuery event list and trigger the upload event manually.
                    // We rely on the handler we want being the first
                    // registered change event in the dialog.
                    $('#h-import').click();
                    $._data($('.h-style-editor')[0], 'events').change[0].handler({target: {files: [file]}});
                });
                waitsFor(function () {
                    return $('.h-style-editor input.disabled').length === 0;
                });
                runs(function () {
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['Black 2', 'Blue 4', 'default']);
                });
            });
            it('import style groups, merging with existing', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    var contents = [{
                        lineWidth: 4,
                        lineColor: 'rgb(128, 128, 255)',
                        fillColor: 'rgba(0, 0, 255, 0)',
                        id: 'Blue 4'
                    }, {
                        lineWidth: 8,
                        lineColor: 'rgb(255,0,0)',
                        fillColor: 'rgba(255,0,0,0.25)',
                        id: 'Red 8'
                    }];
                    var file = new Blob(
                        [asciiToUint8Array(JSON.stringify(contents))],
                        {lastModified: null, type: 'application/json'});
                    file.name = 'test1.json';
                    $._data($('.h-style-editor')[0], 'events').change[0].handler({target: {files: [file]}});
                });
                waitsFor(function () {
                    return $('.h-style-editor input.disabled').length === 0;
                });
                runs(function () {
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['Black 2', 'Blue 4', 'Red 8', 'default']);
                });
            });
            it('import style groups, replacing existing', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    var contents = [{
                        lineWidth: 4,
                        lineColor: 'rgb(128, 128, 255)',
                        fillColor: 'rgba(0, 0, 255, 0)',
                        id: 'Blue 4'
                    }, {
                        lineWidth: 8,
                        lineColor: 'rgb(255,0,0)',
                        fillColor: 'rgba(255,0,0,0.25)',
                        id: 'Red 8'
                    }];
                    var file = new Blob(
                        [asciiToUint8Array(JSON.stringify(contents))],
                        {lastModified: null, type: 'application/json'});
                    file.name = 'test1.json';
                    $('#h-import-replace').click();
                    $._data($('.h-style-editor')[0], 'events').change[0].handler({target: {files: [file]}});
                });
                waitsFor(function () {
                    return $('.h-style-editor input.disabled').length === 0;
                });
                runs(function () {
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['Blue 4', 'Red 8', 'default']);
                });
            });
            it('import style groups, cancel', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    var contents = [{
                        lineWidth: 6,
                        lineColor: 'rgb(0, 255, 0)',
                        fillColor: 'rgba(0, 255, 0, 0)',
                        id: 'Green 6'
                    }];
                    var file = new Blob(
                        [asciiToUint8Array(JSON.stringify(contents))],
                        {lastModified: null, type: 'application/json'});
                    file.name = 'test1.json';
                    $._data($('.h-style-editor')[0], 'events').change[0].handler({target: {files: [file]}});
                });
                waitsFor(function () {
                    return $('.h-style-editor input.disabled').length === 0;
                });
                runs(function () {
                    $('.h-cancel').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['Blue 4', 'Red 8', 'default']);
                });
            });
            it('import style groups, error', function () {
                runs(function () {
                    $('.h-configure-style-group').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    var file = new Blob(
                        [asciiToUint8Array(JSON.stringify('this is not json'))],
                        {lastModified: null, type: 'application/json'});
                    file.name = 'test1.json';
                    $._data($('.h-style-editor')[0], 'events').change[0].handler({target: {files: [file]}});
                });
                waitsFor(function () {
                    return $('.h-style-editor input.disabled').length === 0;
                });
                runs(function () {
                    expect($('.g-validation-failed-message').text().indexOf('parse') >= 0);
                    $('.h-cancel').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-style-group option').map(function () { return $(this).val(); }).get()).toEqual(['Blue 4', 'Red 8', 'default']);
                });
            });
        });
    });

    describe('Effect of config file', function () {
        it('logout', girderTest.logout());
        it('login', function () {
            $('.modal-dialog .modal-footer .btn-default').click();
            huiTest.login();
        });
        it('open image', function () {
            huiTest.openImage('image.svs', ['subfolder']);
        });
        it('create a new annotation', function () {
            girderTest.waitForLoad();
            runs(function () {
                $('.h-create-annotation').click();
            });
            girderTest.waitForDialog();
            runs(function () {
                var nameInput = $('#h-annotation-name');
                expect(nameInput.length).toBe(1);

                nameInput.val('drawn c1');
                $('.h-submit').click();
            });
            girderTest.waitForLoad();
            runs(function () {
                expect($('.h-style-group option[value="Red"]').length).toBe(1);
            });
        });
        it('delete the annotation we just created', function () {
            runs(function () {
                $('.h-annotation-selector .h-annotation:contains("drawn c1") .h-delete-annotation').click();
            });
            girderTest.waitForDialog();
            runs(function () {
                $('.h-submit').click();
            });
            girderTest.waitForLoad();
            waitsFor(function () {
                return $('.h-annotation-selector .h-annotation:contains("drawn c1")').length === 0;
            }, '"drawn c1" to be deleted');
        });
        it('open original image', function () {
            huiTest.openImage('image');
        });
    });
});
