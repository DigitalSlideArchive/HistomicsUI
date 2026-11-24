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

            it('respects the showDownload setting', function () {
                var originalShowDownlaod;

                runs(function () {
                    originalShowDownlaod = huiTest.app.showDownload;
                    huiTest.app.showDownload = function () { return false; };
                    huiTest.app.bodyView.zoomWidget.render();
                });

                runs(function () {
                    expect($('.h-download-button-container').length).toBe(0);
                });

                runs(function () {
                    huiTest.app.showDownload = originalShowDownlaod;
                    huiTest.app.bodyView.zoomWidget.render();
                    expect($('.h-download-button-container').length).toBe(1);
                });
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

            it('keep element edits when the annotation list refreshes while editing', function () {
                var refreshes = 0, annotationId, labels;
                function countRefresh() {
                    refreshes += 1;
                }
                function fetchLabels() {
                    labels = undefined;
                    girder.rest.restRequest({url: 'annotation/' + annotationId}).done(function (resp) {
                        labels = resp.annotation.elements.map(function (element) {
                            return (element.label || {}).value;
                        });
                    });
                }

                runs(function () {
                    annotationId = huiTest.app.bodyView.annotationSelector._activeAnnotation.id;
                    huiTest.app.bodyView.annotations.on('g:changed', countRefresh);
                    $('.h-elements-container .h-edit-element').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    // a notification that asks to refresh the annotation list
                    girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                        data: {itemId: huiTest.app.bodyView.annotationSelector.parentItem.id}
                    });
                });
                waitsFor(function () {
                    return girder.rest.numberOutstandingRestRequests() === 0;
                }, 'rest requests to finish');
                runs(function () {
                    expect(refreshes).toBe(0);
                    $('#g-dialog-container #h-element-label').val('edited during a refresh');
                    $('#g-dialog-container .h-submit').click();
                });
                girderTest.waitForLoad();
                // the refresh happens once the dialog is closed
                waitsFor(function () {
                    return refreshes > 0;
                }, 'annotation list to refresh');
                girderTest.waitForLoad();
                runs(function () {
                    huiTest.app.bodyView.annotations.off('g:changed', countRefresh);
                    fetchLabels();
                });
                waitsFor(function () {
                    return labels !== undefined;
                }, 'annotation to be fetched');
                waitsFor(function () {
                    return $('.h-elements-container .h-element .h-element-label').text() === 'edited during a refresh';
                }, 'element list to show the new label');
                runs(function () {
                    expect(labels).toEqual(['edited during a refresh']);
                    // restore the label for the following tests
                    $('.h-elements-container .h-edit-element').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    $('#g-dialog-container #h-element-label').val('test');
                    $('#g-dialog-container .h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect($('.h-elements-container .h-element .h-element-label').text()).toBe('test');
                });
            });

            it('keep shape edits when the annotation list refreshes while editing', function () {
                var refreshes = 0, annotationId, element, original, moved, centers;
                function countRefresh() {
                    refreshes += 1;
                }

                runs(function () {
                    var bodyView = huiTest.app.bodyView;
                    annotationId = bodyView.annotationSelector._activeAnnotation.id;
                    element = bodyView.annotations.get(annotationId).elements().at(0);
                    original = element.get('center').slice();
                    bodyView.annotations.on('g:changed', countRefresh);
                    bodyView._editElementShape(element, annotationId);
                    expect(bodyView.viewerWidget.annotationLayer.mode()).toBe('edit');
                    // a notification that asks to refresh the annotation list
                    girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                        data: {itemId: bodyView.annotationSelector.parentItem.id}
                    });
                });
                waitsFor(function () {
                    return girder.rest.numberOutstandingRestRequests() === 0;
                }, 'rest requests to finish');
                runs(function () {
                    var map = huiTest.geojsMap();
                    var layer = huiTest.app.bodyView.viewerWidget.annotationLayer;
                    expect(refreshes).toBe(0);
                    expect(layer.mode()).toBe('edit');
                    // move the point and finish editing
                    moved = [original[0] + 50, original[1] + 25, original[2]];
                    layer.annotations()[0].options('position', window.geo.transform.transformCoordinates(
                        map.ingcs(), map.gcs(), {x: moved[0], y: moved[1]}));
                    layer.annotations()[0].state(window.geo.annotation.state.done);
                });
                // the refresh happens once the shape is no longer being edited
                waitsFor(function () {
                    return refreshes > 0;
                }, 'annotation list to refresh');
                girderTest.waitForLoad();
                runs(function () {
                    huiTest.app.bodyView.annotations.off('g:changed', countRefresh);
                    girder.rest.restRequest({url: 'annotation/' + annotationId}).done(function (resp) {
                        centers = resp.annotation.elements.map(function (element) {
                            return element.center;
                        });
                    });
                });
                waitsFor(function () {
                    return centers !== undefined;
                }, 'annotation to be fetched');
                runs(function () {
                    var current = huiTest.app.bodyView.annotations.get(annotationId).elements().at(0);
                    expect(centers.length).toBe(1);
                    expect(centers[0][0]).toBeCloseTo(moved[0], 3);
                    expect(centers[0][1]).toBeCloseTo(moved[1], 3);
                    expect(current.get('center')[0]).toBeCloseTo(moved[0], 3);
                    // a later refresh is not deferred
                    refreshes = 0;
                    huiTest.app.bodyView.annotations.on('g:changed', countRefresh);
                    girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                        data: {itemId: huiTest.app.bodyView.annotationSelector.parentItem.id}
                    });
                });
                waitsFor(function () {
                    return refreshes > 0;
                }, 'annotation list to refresh again');
                girderTest.waitForLoad();
                runs(function () {
                    huiTest.app.bodyView.annotations.off('g:changed', countRefresh);
                    // restore the location for the following tests
                    huiTest.app.bodyView.annotations.get(annotationId).elements().at(0).set('center', original);
                });
                girderTest.waitForLoad();
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
                    // Elements are sorted lexically by label, so target the newly drawn point by
                    // its label rather than by position.
                    expect($('.h-elements-container .h-element .h-element-label').filter(function () {
                        return $(this).text() === 'default point 2';
                    }).length).toBe(1);
                });
                checkAutoSave('drawn 1', 2, annotationInfo);
            });

            it('delete the second point', function () {
                // Elements are sorted lexically by label, so delete the just drawn point by its
                // label rather than by position.
                $('.h-elements-container .h-element').filter(function () {
                    return $(this).find('.h-element-label').text() === 'default point 2';
                }).find('.h-delete-element').click();
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
                    // Elements are sorted lexically by label, so target the newly drawn point by
                    // its label rather than by position.
                    expect($('.h-elements-container .h-element .h-element-label').filter(function () {
                        return $(this).text() === 'default point 2';
                    }).length).toBe(1);
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
                // Elements are sorted lexically by label, so delete the just drawn point by its
                // label rather than by position.
                $('.h-elements-container .h-element').filter(function () {
                    return $(this).find('.h-element-label').text() === 'default point 2';
                }).find('.h-delete-element').click();
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
            describe('customize keyboard shortcuts', function () {
                function openHotkeysDialog() {
                    runs(function () {
                        $('.h-user-dropdown-link').click();
                        $('a.h-edit-hotkeys').click();
                    });
                    girderTest.waitForDialog();
                    waitsFor(function () {
                        return $('.h-hotkey-row[data-action="draw.rectangle"]').length > 0;
                    }, 'hotkey dialog to render');
                }
                function pressKey(key) {
                    // the dialog listens with a native capture listener
                    var evt;
                    try {
                        evt = new KeyboardEvent('keydown', {key: key, bubbles: true, cancelable: true});
                    } catch (err) {
                        evt = document.createEvent('Event');
                        evt.initEvent('keydown', true, true);
                        Object.defineProperty(evt, 'key', {value: key});
                    }
                    document.dispatchEvent(evt);
                }

                openHotkeysDialog();
                it('rebind draw rectangle to x', function () {
                    runs(function () {
                        expect($('.h-hotkey-row[data-action="draw.rectangle"] kbd').text()).toBe('R');
                        var enter = $.Event('keydown', {key: 'Enter'});
                        $('.h-hotkeys-filter').trigger(enter);
                        expect(enter.isDefaultPrevented()).toBe(true);
                        $('.h-hotkey-row[data-action="draw.rectangle"] .h-hotkey-change').click();
                        expect($('.h-hotkey-capturing').length).toBe(1);
                        pressKey('x');
                        expect($('.h-hotkey-row[data-action="draw.rectangle"] kbd').text()).toBe('X');
                        expect($('.h-hotkey-row[data-action="draw.rectangle"] .h-hotkey-source').text()).toBe('custom');
                        $('.h-submit').click();
                    });
                    girderTest.waitForLoad();
                    runs(function () {
                        $('.h-image-body').trigger($.Event('keydown', {key: 'x'}));
                        expect($('.h-draw.active').attr('data-type')).toBe('rectangle');
                        $('.h-image-body').trigger($.Event('keydown', {key: 'x'}));
                        expect($('.h-draw.active').length).toBe(0);
                        $('.h-image-body').trigger($.Event('keydown', {key: 'r'}));
                        expect($('.h-draw.active').length).toBe(0);
                        expect($('button.h-draw[data-type="rectangle"]').attr('title')).toBe('Draw a new rectangle (keyboard shortcut: X)');
                    });
                    var userConfig;
                    runs(function () {
                        girder.rest.restRequest({
                            url: 'user/' + girder.auth.getCurrentUser().id + '/yaml_config/.histomicsui_user_config.yaml'
                        }).done(function (result) {
                            userConfig = result;
                        });
                    });
                    waitsFor(function () {
                        return userConfig !== undefined;
                    }, 'user config to load');
                    runs(function () {
                        expect(userConfig.hotkeys).toEqual([{action: 'draw.rectangle', key: 'x'}]);
                    });
                });
                openHotkeysDialog();
                it('reset all keyboard shortcuts', function () {
                    runs(function () {
                        var list = $('.h-hotkeys-list');
                        expect(list[0].scrollHeight).toBeGreaterThan(list.innerHeight());
                        list.scrollTop(200);
                        $('.h-hotkey-row[data-action="layer.20"] .h-hotkey-clear').click();
                        expect($('.h-hotkeys-list').scrollTop()).toBe(200);
                        $('.h-hotkey-row[data-action="layer.20"] .h-hotkey-change').click();
                        pressKey('x');
                        expect($('.h-hotkeys-message').text()).toBe('X was removed from "Draw a rectangle".');
                        expect($('.modal-footer')[0].getBoundingClientRect().bottom).not.toBeGreaterThan(window.innerHeight);
                        $('.h-hotkeys-reset-all').click();
                        expect($('.h-hotkey-row[data-action="draw.rectangle"] kbd').text()).toBe('R');
                        $('.h-submit').click();
                    });
                    girderTest.waitForLoad();
                    runs(function () {
                        $('.h-image-body').trigger($.Event('keydown', {key: 'r'}));
                        expect($('.h-draw.active').attr('data-type')).toBe('rectangle');
                        $('.h-image-body').trigger($.Event('keydown', {key: 'r'}));
                        expect($('.h-draw.active').length).toBe(0);
                    });
                });
            });
        });

        describe('Text elements', function () {
            var baseCount, textId, annotationInfo = {};

            function textElements() {
                return huiTest.app.bodyView.drawWidget.collection.filter(function (model) {
                    return model.get('type') === 'text';
                });
            }

            function editor() {
                return $('.h-image-view-body .g-li-annotation-text-edit');
            }

            function clickMap(x, y) {
                var interactor = huiTest.geojsMap().interactor();
                interactor.simulateEvent('mousedown', {map: {x: x, y: y}, button: 'left'});
                interactor.simulateEvent('mouseup', {map: {x: x, y: y}, button: 'left'});
            }

            function mover() {
                return $('.h-image-view-body .g-li-annotation-text-move');
            }

            /* Start the "Edit Shape" action on the text element.  This shows
             * the text so it can be moved; if edit is true, click on it to
             * edit the text. */
            function editShape(edit) {
                runs(function () {
                    var element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    huiTest.app.bodyView._editElementShape(element, huiTest.app.bodyView.activeAnnotation.id);
                });
                waitsFor(function () {
                    return mover().length === 1;
                }, 'the movable text to be shown');
                runs(function () {
                    expect(editor().length).toBe(0);
                    // the drawn text is hidden while it is edited
                    expect(huiTest.app.bodyView.viewerWidget._hideElement).toBe(textId);
                    if (edit) {
                        mover().trigger($.Event('mousedown', {which: 1, pageX: 10, pageY: 10}));
                        mover().trigger($.Event('mouseup', {which: 1, pageX: 10, pageY: 10}));
                        expect(mover().length).toBe(0);
                        expect(editor().length).toBe(1);
                    }
                });
            }

            function finishEditor(text) {
                editor().val(text).trigger('input');
                editor().trigger($.Event('keydown', {key: 'Enter', ctrlKey: true}));
            }

            it('draw text', function () {
                runs(function () {
                    baseCount = $('.h-elements-container .h-element').length;
                    expect($('.h-draw[data-type="text"]').length).toBe(1);
                    $('.h-draw[data-type="text"]').click();
                });
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(true);
                    clickMap(150, 150);
                });
                waitsFor(function () {
                    return editor().length === 1;
                }, 'the text editor to be shown');
                runs(function () {
                    // re-rendering the draw panel, such as after another
                    // change is saved, doesn't discard what is being typed
                    var input = editor()[0];
                    editor().val('Still here').trigger('input');
                    huiTest.app.bodyView.drawWidget.render();
                    expect(editor().length).toBe(1);
                    expect(editor()[0]).toBe(input);
                    expect(editor().val()).toBe('Still here');
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(true);
                    huiTest.app.bodyView.drawWidget.drawElement(undefined, 'text');
                    expect(editor()[0]).toBe(input);
                    expect(editor().val()).toBe('Still here');
                    expect(document.activeElement).toBe(editor()[0]);
                    // keys typed in the editor are not keyboard shortcuts
                    editor().trigger($.Event('keydown', {key: 'r'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('text');
                    finishEditor('  A comment\twith a tab\nand a second line  ');
                });
                waitsFor(function () {
                    return $('.h-elements-container .h-element').length === baseCount + 1;
                }, 'text to be created');
                runs(function () {
                    var elements = textElements();
                    expect(editor().length).toBe(0);
                    expect(elements.length).toBe(1);
                    textId = elements[0].id;
                    expect(elements[0].get('text')).toBe('A comment with a tab\nand a second line');
                    expect(elements[0].get('lineColor')).toBe('rgb(0,0,0)');
                    expect(elements[0].get('fontSize')).toBe(16);
                    expect(elements[0].get('fillColor')).toBe(undefined);
                    expect(elements[0].get('lineWidth')).toBe(undefined);
                    expect(elements[0].get('pattern')).toBe(undefined);
                    expect($('.h-elements-container .h-element[data-id="' + textId + '"] .h-element-label').text()).toMatch(/^default text \d+$/);
                    // text drawing stays on
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(true);
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    var saved = annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    });
                    expect(saved.length).toBe(1);
                    expect(saved[0].text).toBe('A comment with a tab\nand a second line');
                    expect(saved[0].center.length).toBe(3);
                });
            });

            it('empty text is discarded', function () {
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to be active');
                runs(function () {
                    clickMap(250, 150);
                });
                waitsFor(function () {
                    return editor().length === 1;
                }, 'the text editor to be shown');
                runs(function () {
                    finishEditor('  \n ');
                    expect(editor().length).toBe(0);
                    expect(textElements().length).toBe(1);
                    expect($('.h-elements-container .h-element').length).toBe(baseCount + 1);
                    // still in text mode
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(true);
                });
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to be active again');
                runs(function () {
                    // escape while typing cancels the text
                    clickMap(250, 150);
                });
                waitsFor(function () {
                    return editor().length === 1;
                }, 'the text editor to be shown again');
                runs(function () {
                    editor().val('Canceled').trigger('input');
                    editor().trigger($.Event('keydown', {key: 'Escape'}));
                    expect(editor().length).toBe(0);
                    expect(textElements().length).toBe(1);
                });
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to be active after canceling');
                runs(function () {
                    clickMap(250, 150);
                });
                waitsFor(function () {
                    return editor().length === 1;
                }, 'the text editor to be shown a third time');
                runs(function () {
                    // clicking the button while typing keeps the text and
                    // turns off text mode
                    editor().val('Kept when the tool is turned off').trigger('input');
                    editor().trigger('blur');
                    $('.h-draw[data-type="text"]').click();
                });
                waitsFor(function () {
                    return textElements().length === 2;
                }, 'the text to be added');
                runs(function () {
                    expect(textElements()[1].get('text')).toBe('Kept when the tool is turned off');
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(false);
                    expect(huiTest.app.bodyView.drawWidget.drawingType()).toBe(null);
                    expect($('.geojs-map.annotation-input').length).toBe(0);
                    huiTest.app.bodyView.drawWidget.deleteElement(undefined, textElements()[1].id);
                    expect(textElements().length).toBe(1);
                    expect($('.h-elements-container .h-element').length).toBe(baseCount + 1);
                });
            });

            it('toggle text mode with a keyboard shortcut', function () {
                $('.h-image-body').trigger($.Event('keydown', {key: 't'}));
                expect($('.h-draw.active').attr('data-type')).toBe('text');
                $('.h-image-body').trigger($.Event('keydown', {key: 't'}));
                expect($('.h-draw.active').length).toBe(0);
            });

            it('edit text in place', function () {
                var element, center;
                editShape(true);
                runs(function () {
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    center = element.get('center').slice();
                    expect(editor().val()).toBe('A comment with a tab\nand a second line');
                    expect(editor().attr('rows')).toBe('2');
                    finishEditor('Edited in place');
                    // the text wasn't moved
                    expect(element.get('center')).toEqual(center);
                    expect(editor().length).toBe(0);
                    expect(element.get('text')).toBe('Edited in place');
                    expect(huiTest.app.bodyView.viewerWidget._hideElement).toBe(undefined);
                    expect($('.h-elements-container .h-element').length).toBe(baseCount + 1);
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    var saved = annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    });
                    expect(saved[0].text).toBe('Edited in place');
                });
            });

            it('canceling an in place edit keeps the text', function () {
                var element;
                editShape(true);
                runs(function () {
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    editor().val('Not kept').trigger('input');
                    editor().trigger($.Event('keydown', {key: 'Escape'}));
                    expect(editor().length).toBe(0);
                    expect(element.get('text')).toBe('Edited in place');
                    expect(huiTest.app.bodyView.viewerWidget._hideElement).toBe(undefined);
                });
            });

            it('move text by dragging it', function () {
                var element, center, display;
                editShape(false);
                runs(function () {
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    center = element.get('center').slice();
                    display = huiTest.geojsMap().gcsToDisplay({x: center[0], y: center[1]});
                    expect(mover().text()).toBe('Edited in place');
                    mover().trigger($.Event('mousedown', {which: 1, pageX: 100, pageY: 100}));
                    $(document).trigger($.Event('mousemove', {which: 1, pageX: 140, pageY: 75}));
                    $(document).trigger($.Event('mouseup', {which: 1, pageX: 140, pageY: 75}));
                    // dragging doesn't start editing or change the element yet
                    expect(mover().length).toBe(1);
                    expect(editor().length).toBe(0);
                    expect(element.get('center')).toEqual(center);
                    // clicking elsewhere finishes
                    mover().trigger('blur');
                    expect(mover().length).toBe(0);
                    var moved = huiTest.geojsMap().gcsToDisplay({x: element.get('center')[0], y: element.get('center')[1]});
                    expect(moved.x).toBeCloseTo(display.x + 40, 0);
                    expect(moved.y).toBeCloseTo(display.y - 25, 0);
                    expect(element.get('center')[2]).toBe(center[2]);
                    expect(element.get('text')).toBe('Edited in place');
                    expect(huiTest.app.bodyView.viewerWidget._hideElement).toBe(undefined);
                    center = element.get('center').slice();
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    var saved = annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    });
                    expect(saved[0].center[0]).toBeCloseTo(center[0], 3);
                    expect(saved[0].center[1]).toBeCloseTo(center[1], 3);
                    expect(saved[0].text).toBe('Edited in place');
                });
                // escape cancels a move
                editShape(false);
                runs(function () {
                    mover().trigger($.Event('mousedown', {which: 1, pageX: 100, pageY: 100}));
                    $(document).trigger($.Event('mousemove', {which: 1, pageX: 160, pageY: 160}));
                    $(document).trigger($.Event('mouseup', {which: 1, pageX: 160, pageY: 160}));
                    mover().trigger($.Event('keydown', {key: 'Escape'}));
                    expect(mover().length).toBe(0);
                    expect(element.get('center')).toEqual(center);
                    expect(huiTest.app.bodyView.viewerWidget._hideElement).toBe(undefined);
                });
            });

            it('keep text edits when the annotation list refreshes while editing', function () {
                var refreshes = 0, annotationId, saved;
                function countRefresh() {
                    refreshes += 1;
                }
                function requestRefresh() {
                    // a notification that asks to refresh the annotation list
                    girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                        data: {itemId: huiTest.app.bodyView.annotationSelector.parentItem.id}
                    });
                }
                editShape(false);
                runs(function () {
                    annotationId = huiTest.app.bodyView.annotationSelector._activeAnnotation.id;
                    huiTest.app.bodyView.annotations.on('g:changed', countRefresh);
                    requestRefresh();
                });
                waitsFor(function () {
                    return girder.rest.numberOutstandingRestRequests() === 0;
                }, 'rest requests to finish');
                runs(function () {
                    // nothing was refreshed while the text could be moved
                    expect(refreshes).toBe(0);
                    expect(mover().length).toBe(1);
                    mover().trigger($.Event('mousedown', {which: 1, pageX: 10, pageY: 10}));
                    mover().trigger($.Event('mouseup', {which: 1, pageX: 10, pageY: 10}));
                    requestRefresh();
                });
                waitsFor(function () {
                    return girder.rest.numberOutstandingRestRequests() === 0;
                }, 'rest requests to finish again');
                runs(function () {
                    // or while it is being typed
                    expect(refreshes).toBe(0);
                    expect(editor().length).toBe(1);
                    finishEditor('Edited during a refresh');
                });
                // the refresh happens once the text is no longer being edited
                waitsFor(function () {
                    return refreshes > 0;
                }, 'annotation list to refresh');
                girderTest.waitForLoad();
                runs(function () {
                    huiTest.app.bodyView.annotations.off('g:changed', countRefresh);
                    girder.rest.restRequest({url: 'annotation/' + annotationId}).done(function (resp) {
                        saved = resp.annotation.elements.filter(function (element) {
                            return element.type === 'text';
                        });
                    });
                });
                waitsFor(function () {
                    return saved !== undefined;
                }, 'annotation to be fetched');
                runs(function () {
                    expect(saved.length).toBe(1);
                    expect(saved[0].text).toBe('Edited during a refresh');
                    expect(textElements().length).toBe(1);
                    expect(textElements()[0].get('text')).toBe('Edited during a refresh');
                    // put the text back for the following tests
                    textElements()[0].set('text', 'Edited in place');
                });
                girderTest.waitForLoad();
            });

            it('the config file can make enter finish the text', function () {
                var element, config;
                runs(function () {
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    config = huiTest.app.bodyView._folderConfig;
                    expect(huiTest.app.bodyView._textEditOptions()).toEqual({enterKey: 'newline'});
                });
                editShape(true);
                runs(function () {
                    // by default, enter doesn't finish
                    editor().val('Enter is a new line').trigger('input');
                    editor().trigger($.Event('keydown', {key: 'Enter'}));
                    expect(editor().length).toBe(1);
                    editor().trigger($.Event('keydown', {key: 'Escape'}));
                    expect(element.get('text')).toBe('Edited in place');
                    huiTest.app.bodyView._folderConfig = _.extend({}, config, {textAnnotations: {enterKey: 'finish'}});
                    expect(huiTest.app.bodyView._textEditOptions()).toEqual({enterKey: 'finish'});
                });
                editShape(true);
                runs(function () {
                    editor().val('Finished with enter').trigger('input');
                    editor().trigger($.Event('keydown', {key: 'Enter', shiftKey: true}));
                    expect(editor().length).toBe(1);
                    editor().trigger($.Event('keydown', {key: 'Enter'}));
                    expect(editor().length).toBe(0);
                    expect(element.get('text')).toBe('Finished with enter');
                    // put things back
                    element.set('text', 'Edited in place');
                    huiTest.app.bodyView._folderConfig = config;
                });
                // new text uses the setting, too
                runs(function () {
                    huiTest.app.bodyView._folderConfig = _.extend({}, config, {textAnnotations: {enterKey: 'finish'}});
                    $('.h-draw[data-type="text"]').click();
                });
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'draw mode to activate');
                runs(function () {
                    clickMap(300, 250);
                });
                waitsFor(function () {
                    return editor().length === 1;
                }, 'the text editor to be shown');
                runs(function () {
                    editor().val('New with enter').trigger('input');
                    editor().trigger($.Event('keydown', {key: 'Enter'}));
                    expect(editor().length).toBe(0);
                });
                waitsFor(function () {
                    return textElements().length === 2;
                }, 'the text to be added');
                runs(function () {
                    expect(textElements()[1].get('text')).toBe('New with enter');
                    huiTest.app.bodyView._folderConfig = config;
                    $('.h-draw[data-type="text"]').click();
                    huiTest.app.bodyView.drawWidget.deleteElement(undefined, textElements()[1].id);
                    expect(textElements().length).toBe(1);
                    expect($('.h-draw[data-type="text"]').hasClass('active')).toBe(false);
                });
            });

            it('edit text properties', function () {
                var element;
                runs(function () {
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                    $('.h-elements-container .h-element[data-id="' + textId + '"] .h-edit-element').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    expect($('#g-dialog-container #h-element-text').val()).toBe('Edited in place');
                    expect($('#g-dialog-container #h-element-font-size').val()).toBe('16');
                    expect($('#g-dialog-container #h-element-line-color').length).toBe(1);
                    // text doesn't have these properties
                    expect($('#g-dialog-container #h-element-line-width').length).toBe(0);
                    expect($('#g-dialog-container #h-element-fill-color').length).toBe(0);
                    expect($('#g-dialog-container #h-element-fill-pattern').length).toBe(0);
                    // empty text and bad sizes are not allowed
                    $('#g-dialog-container #h-element-text').val('   ');
                    $('#g-dialog-container #h-element-font-size').val('-3');
                    $('#g-dialog-container .h-submit').click();
                    expect($('#g-dialog-container .g-validation-failed-message').hasClass('hidden')).toBe(false);
                    expect($('#g-dialog-container .g-validation-failed-message').text()).toMatch(/text cannot be empty/);
                    expect($('#g-dialog-container .g-validation-failed-message').text()).toMatch(/Invalid font size/);
                    expect(element.get('text')).toBe('Edited in place');
                    $('#g-dialog-container #h-element-text').val(' From the dialog\r\nline two\u0007 ');
                    $('#g-dialog-container #h-element-font-size').val('24');
                    $('#g-dialog-container #h-element-line-color').val('#ff0000');
                    $('#g-dialog-container .h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect(element.get('text')).toBe('From the dialog\nline two');
                    expect(element.get('fontSize')).toBe(24);
                    expect(element.get('lineColor')).toBe('rgb(255, 0, 0)');
                    expect(element.get('fillColor')).toBe(undefined);
                    expect(element.get('lineWidth')).toBe(undefined);
                    expect(element.get('pattern')).toBe(undefined);
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    var saved = annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    });
                    expect(saved[0].text).toBe('From the dialog\nline two');
                    expect(saved[0].fontSize).toBe(24);
                });
            });

            it('a long comment can be edited', function () {
                var element, lines = [], longText;
                runs(function () {
                    for (var i = 0; i < 200; i += 1) {
                        var words = [];
                        for (var j = 0; j < 15; j += 1) {
                            words.push('word' + (i * 15 + j));
                        }
                        lines.push(words.join(' '));
                    }
                    longText = lines.join('\n');
                    element = huiTest.app.bodyView.drawWidget.collection.get(textId);
                });
                editShape(true);
                runs(function () {
                    finishEditor(longText);
                    expect(element.get('text')).toBe(longText);
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    var saved = annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    });
                    expect(saved[0].text).toBe(longText);
                    expect(saved[0].text.split(/\s+/).length).toBe(3000);
                });
            });

            it('removing all of the text deletes the element', function () {
                editShape(true);
                runs(function () {
                    finishEditor(' \n ');
                    expect(editor().length).toBe(0);
                    expect(textElements().length).toBe(0);
                    expect($('.h-elements-container .h-element').length).toBe(baseCount);
                });
                checkAutoSave('drawn 1', null, annotationInfo);
                runs(function () {
                    expect(annotationInfo.annotation.annotation.elements.filter(function (element) {
                        return element.type === 'text';
                    }).length).toBe(0);
                });
            });
        });

        describe('Exclusive groups', function () {
            it('is off by default and is stored when toggled', function () {
                var drawWidget = huiTest.app.bodyView.drawWidget;
                expect($('.h-exclusive-groups').is(':checked')).toBe(false);
                expect(drawWidget._editOptions.exclusive_groups).toBeFalsy();

                $('.h-exclusive-groups').prop('checked', true).trigger('change');
                expect(drawWidget._editOptions.exclusive_groups).toBe(true);
                var stored = JSON.parse(window.localStorage.getItem('histomicsui'));
                expect(stored[drawWidget._localId].exclusive_groups).toBe(true);

                $('.h-exclusive-groups').prop('checked', false).trigger('change');
                expect(drawWidget._editOptions.exclusive_groups).toBe(false);
            });

            // shapes are drawn at x 400-850, y 300-600, clear of the earlier
            // draw panel tests
            var drawWidget, startIds;

            function groupElements(group) {
                return drawWidget.collection.filter(function (el) {
                    return el.get('group') === group;
                });
            }

            function ringArea(pts) {
                var sum = 0;
                for (var i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
                    sum += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
                }
                return Math.abs(sum) / 2;
            }

            function elementArea(el) {
                if (el.get('type') === 'rectangle') {
                    return el.get('width') * el.get('height');
                }
                var area = ringArea(el.get('points'));
                (el.get('holes') || []).forEach(function (hole) {
                    area -= ringArea(hole);
                });
                return area;
            }

            function groupArea(group) {
                return groupElements(group).reduce(function (total, el) {
                    return total + elementArea(el);
                }, 0);
            }

            function setGroup(group) {
                runs(function () {
                    drawWidget._setStyleGroup({id: group});
                });
            }

            function drawRectangle(x1, y1, x2, y2, op) {
                var toggle;
                var modifiers = {union: ['shift'], xor: ['shift', 'alt']}[op];
                waitsFor(function () {
                    return $('.geojs-map.annotation-input').length > 0;
                }, 'rectangle mode to be active');
                if (op) {
                    waitsFor(function () {
                        toggle = toggle ? 0 : 1;
                        huiTest.geojsMap().interactor().simulateEvent('mousemove', {
                            map: {x: x1 - 10 + toggle, y: y1},
                            button: 'left',
                            modifiers: modifiers
                        });
                        return $('.geojs-map.annotation-' + op).length > 0;
                    }, op + ' mode to be active');
                }
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    var first = {map: {x: x1, y: y1}, button: 'left'};
                    if (op) {
                        first.modifiers = modifiers;
                    }
                    interactor.simulateEvent('mousedown', first);
                    interactor.simulateEvent('mouseup', first);
                    interactor.simulateEvent('mousedown', {map: {x: x2, y: y2}, button: 'left'});
                    interactor.simulateEvent('mouseup', {map: {x: x2, y: y2}, button: 'left'});
                });
                girderTest.waitForLoad();
            }

            it('turn on exclusive groups and select the rectangle tool', function () {
                runs(function () {
                    drawWidget = huiTest.app.bodyView.drawWidget;
                    startIds = drawWidget.collection.pluck('id');
                    $('.h-exclusive-groups').prop('checked', true).trigger('change');
                    $('.h-draw[data-type="rectangle"]').click();
                });
            });

            it('cuts the other group on a union', function () {
                var areaA;
                setGroup('exclusiveA');
                drawRectangle(400, 300, 500, 400);
                waitsFor(function () {
                    return groupElements('exclusiveA').length === 1;
                }, 'group A rectangle to be added');
                runs(function () {
                    areaA = groupArea('exclusiveA');
                });
                setGroup('exclusiveB');
                drawRectangle(450, 350, 550, 450, 'union');
                waitsFor(function () {
                    return groupElements('exclusiveB').length === 1;
                }, 'group B shape to be added');
                runs(function () {
                    var cut = groupElements('exclusiveA');
                    expect(cut.length).toBe(1);
                    expect(cut[0].get('type')).toBe('polyline');
                    // a quarter of the rectangle is covered
                    expect(elementArea(cut[0]) / areaA).toBeGreaterThan(0.7);
                    expect(elementArea(cut[0]) / areaA).toBeLessThan(0.8);
                });
            });

            it('removes a fully covered element of the other group', function () {
                setGroup('exclusiveA');
                drawRectangle(600, 300, 620, 320);
                waitsFor(function () {
                    return groupElements('exclusiveA').length === 2;
                }, 'second group A rectangle to be added');
                setGroup('exclusiveB');
                drawRectangle(580, 280, 640, 340, 'union');
                waitsFor(function () {
                    return groupElements('exclusiveB').length === 2;
                }, 'second group B shape to be added');
                runs(function () {
                    expect(groupElements('exclusiveA').length).toBe(1);
                });
            });

            it('cuts other groups with the brush, including from no group', function () {
                var areaA;
                setGroup('exclusiveA');
                drawRectangle(400, 500, 500, 600);
                waitsFor(function () {
                    return groupElements('exclusiveA').length === 2;
                }, 'group A rectangle to be added for the brush');
                runs(function () {
                    areaA = groupArea('exclusiveA');
                    drawWidget._setStyleGroup({id: drawWidget.parentView._defaultGroup});
                    $('.h-draw[data-type="brush"]').click();
                });
                waitsFor(function () {
                    return huiTest.geojsMap().layers()[3].annotations().length === 1;
                }, 'brush mode to activate');
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {map: {x: 445, y: 550}});
                    interactor.simulateEvent('mousemove', {map: {x: 450, y: 550}});
                    interactor.simulateEvent('mousedown', {map: {x: 450, y: 550}, button: 'left'});
                    interactor.simulateEvent('mouseup', {map: {x: 450, y: 550}, button: 'left'});
                });
                waitsFor(function () {
                    return groupArea('exclusiveA') < areaA;
                }, 'brush to cut the group A rectangle');
                girderTest.waitForLoad();
                runs(function () {
                    groupElements('exclusiveA').forEach(function (el) {
                        expect(el.get('type')).toBe('polyline');
                    });
                    $('.h-draw[data-type="rectangle"]').click();
                });
            });

            it('cuts other groups only where an xor adds area', function () {
                var countB, oldIds, rectA, totalA;
                setGroup('exclusiveB');
                runs(function () {
                    countB = groupElements('exclusiveB').length;
                });
                drawRectangle(600, 480, 680, 580);
                waitsFor(function () {
                    return groupElements('exclusiveB').length === countB + 1;
                }, 'group B rectangle to be added for the xor');
                runs(function () {
                    oldIds = drawWidget.collection.pluck('id');
                });
                setGroup('exclusiveA');
                drawRectangle(660, 480, 760, 580);
                waitsFor(function () {
                    rectA = groupElements('exclusiveA').filter(function (el) {
                        return oldIds.indexOf(el.id) < 0;
                    })[0];
                    return rectA;
                }, 'overlapping group A rectangle to be added');
                runs(function () {
                    totalA = groupArea('exclusiveA');
                });
                setGroup('exclusiveB');
                drawRectangle(640, 500, 720, 560, 'xor');
                waitsFor(function () {
                    return groupArea('exclusiveA') < totalA;
                }, 'xor to cut the group A rectangle');
                runs(function () {
                    var lost = (totalA - groupArea('exclusiveA')) / elementArea(rectA);
                    expect(lost).toBeGreaterThan(0.2);
                    expect(lost).toBeLessThan(0.28);
                });
            });

            it('leaves other groups alone when turned off', function () {
                var areaA, countB;
                runs(function () {
                    $('.h-exclusive-groups').prop('checked', false).trigger('change');
                    countB = groupElements('exclusiveB').length;
                });
                setGroup('exclusiveA');
                drawRectangle(700, 300, 800, 400);
                waitsFor(function () {
                    return groupElements('exclusiveA').filter(function (el) {
                        return el.get('type') === 'rectangle';
                    }).length === 1;
                }, 'group A rectangle to be added with the option off');
                runs(function () {
                    areaA = groupArea('exclusiveA');
                });
                setGroup('exclusiveB');
                drawRectangle(750, 350, 850, 450, 'union');
                waitsFor(function () {
                    return groupElements('exclusiveB').length === countB + 1;
                }, 'group B shape to be added with the option off');
                runs(function () {
                    expect(groupArea('exclusiveA')).toBe(areaA);
                });
            });

            it('remove the test elements', function () {
                runs(function () {
                    $('.h-draw[data-type="rectangle"]').click();
                    drawWidget._setStyleGroup({id: drawWidget.parentView._defaultGroup});
                    drawWidget.collection.remove(drawWidget.collection.filter(function (el) {
                        return startIds.indexOf(el.id) < 0;
                    }));
                });
                waitsFor(function () {
                    return drawWidget.collection.length === startIds.length;
                }, 'test elements to be removed');
                girderTest.waitForLoad();
            });
        });

        describe('Reassign', function () {
            var bodyView, drawWidget, startIds, oldBrush;
            var ids = {};

            function toImage(x, y) {
                return huiTest.geojsMap().displayToGcs({x: x, y: y});
            }

            function imageSize(size) {
                return Math.abs(toImage(size, 0).x - toImage(0, 0).x);
            }

            function imagePolygon(points) {
                return points.map(function (pt) {
                    return toImage(pt[0], pt[1]);
                });
            }

            function circle(name, x, y, r, group) {
                var center = toImage(x, y);
                ids[name] = bodyView.viewerWidget._guid();
                return {id: ids[name], type: 'circle', center: [center.x, center.y, 0], radius: imageSize(r), group: group};
            }

            function square(name, x, y, size, group) {
                var center = toImage(x, y);
                ids[name] = bodyView.viewerWidget._guid();
                return {id: ids[name], type: 'rectangle', center: [center.x, center.y, 0], width: imageSize(size), height: imageSize(size), group: group};
            }

            function text(name, x, y, group) {
                var center = toImage(x, y);
                ids[name] = bodyView.viewerWidget._guid();
                return {id: ids[name], type: 'text', center: [center.x, center.y, 0], text: 'Reassign', group: group};
            }

            function group(name) {
                return drawWidget.collection.get(ids[name]).get('group');
            }

            function foundIds(points, partial) {
                return bodyView.getElementsInPolygon(imagePolygon(points), partial).map(function (result) {
                    return result.element.id;
                });
            }

            function waitForReassignMode() {
                waitsFor(function () {
                    return bodyView.viewerWidget.annotationLayer.annotations().length === 1;
                }, 'reassign mode to be ready');
            }

            function drag(points, y) {
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {map: {x: points[0], y: y}});
                    interactor.simulateEvent('mousedown', {map: {x: points[0], y: y}, button: 'left'});
                    points.slice(1).forEach(function (x) {
                        interactor.simulateEvent('mousemove', {map: {x: x, y: y}, button: 'left'});
                    });
                    interactor.simulateEvent('mouseup', {map: {x: points[points.length - 1], y: y}, button: 'left'});
                });
            }

            it('add elements to reassign', function () {
                runs(function () {
                    bodyView = huiTest.app.bodyView;
                    drawWidget = bodyView.drawWidget;
                    startIds = drawWidget.collection.pluck('id');
                    oldBrush = {size: $('.h-brush-size').val(), screen: $('.h-brush-screen').is(':checked')};
                    $('.h-brush-size').val(6);
                    $('.h-brush-screen').prop('checked', true).trigger('change');
                    drawWidget.addElements([
                        circle('A', 500, 350, 120, 'reassignA'),
                        circle('B', 440, 350, 30, 'reassignB'),
                        circle('C', 490, 350, 30, 'reassignB'),
                        circle('D', 540, 350, 30, 'reassignB'),
                        square('E', 700, 350, 20, 'reassignB'),
                        text('F', 700, 420, 'reassignB')
                    ]);
                });
                waitsFor(function () {
                    var found = foundIds([[370, 220], [730, 220], [730, 480], [370, 480]], true);
                    return Object.keys(ids).every(function (name) {
                        return found.indexOf(ids[name]) >= 0;
                    });
                }, 'reassign elements to be drawn');
                girderTest.waitForLoad();
            });

            it('finds elements partly inside a polygon', function () {
                runs(function () {
                    var box = [[400, 345], [420, 345], [420, 355], [400, 355]];
                    expect(foundIds(box, true)).toContain(ids.B);
                    expect(foundIds(box, false)).not.toContain(ids.B);
                });
            });

            it('turns on with the button and the hotkey', function () {
                runs(function () {
                    expect($('button.h-draw[data-type="reassign"]').attr('title')).toBe(
                        'Brush over elements to move them to the current group (keyboard shortcut: G)');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'g'}));
                    expect($('.h-draw.active').attr('data-type')).toBe('reassign');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'g'}));
                    expect($('.h-draw.active').length).toBe(0);
                    expect(bodyView.viewerWidget.annotationLayer.annotations().length).toBe(0);
                    $('.h-draw[data-type="reassign"]').click();
                    expect($('.h-draw.active').attr('data-type')).toBe('reassign');
                    drawWidget._setStyleGroup({id: 'reassignT'});
                });
                waitForReassignMode();
            });

            it('reassigns the innermost element on a click', function () {
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {map: {x: 425, y: 350}});
                    interactor.simulateEvent('mousemove', {map: {x: 430, y: 350}});
                    interactor.simulateEvent('mousedown', {map: {x: 430, y: 350}, button: 'left'});
                    interactor.simulateEvent('mouseup', {map: {x: 430, y: 350}, button: 'left'});
                });
                waitsFor(function () {
                    return group('B') === 'reassignT';
                }, 'a click to reassign the inner circle');
                girderTest.waitForLoad();
                runs(function () {
                    expect(group('A')).toBe('reassignA');
                    expect(group('C')).toBe('reassignB');
                    expect(bodyView.selectedElements.length).toBe(0);
                });
            });

            it('leaves the outer element when dragging through inner ones', function () {
                waitForReassignMode();
                drag([445, 446, 555], 350);
                waitsFor(function () {
                    return group('C') === 'reassignT' && group('D') === 'reassignT';
                }, 'a drag to reassign the inner circles');
                girderTest.waitForLoad();
                runs(function () {
                    expect(group('A')).toBe('reassignA');
                });
            });

            it('reassigns the outer element when only it is brushed', function () {
                waitForReassignMode();
                drag([500, 501, 520], 430);
                waitsFor(function () {
                    return group('A') === 'reassignT';
                }, 'a drag to reassign the outer circle');
                girderTest.waitForLoad();
            });

            it('reassigns text with only its color', function () {
                waitForReassignMode();
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    interactor.simulateEvent('mousemove', {map: {x: 695, y: 420}});
                    interactor.simulateEvent('mousemove', {map: {x: 700, y: 420}});
                    interactor.simulateEvent('mousedown', {map: {x: 700, y: 420}, button: 'left'});
                    interactor.simulateEvent('mouseup', {map: {x: 700, y: 420}, button: 'left'});
                });
                waitsFor(function () {
                    return group('F') === 'reassignT';
                }, 'a click to reassign the text');
                girderTest.waitForLoad();
                runs(function () {
                    var element = drawWidget.collection.get(ids.F);
                    expect(element.get('fillColor')).toBeUndefined();
                    expect(element.get('lineWidth')).toBeUndefined();
                });
            });

            it('applies nothing and removes the cursor on escape', function () {
                waitForReassignMode();
                runs(function () {
                    var interactor = huiTest.geojsMap().interactor();
                    var layer = bodyView.viewerWidget.annotationLayer;
                    interactor.simulateEvent('mousemove', {map: {x: 700, y: 350}});
                    interactor.simulateEvent('mousedown', {map: {x: 700, y: 350}, button: 'left'});
                    interactor.simulateEvent('mousemove', {map: {x: 701, y: 350}, button: 'left'});
                    expect(bodyView.selectedElements.length).toBe(1);
                    layer.mode(null, undefined, undefined, 'escape');
                    $('.h-image-body').trigger($.Event('keydown', {key: 'Escape'}));
                    interactor.simulateEvent('mouseup', {map: {x: 701, y: 350}, button: 'left'});
                    expect($('.h-draw.active').length).toBe(0);
                    expect(layer.annotations().length).toBe(0);
                    expect(bodyView.selectedElements.length).toBe(0);
                });
                girderTest.waitForLoad();
                runs(function () {
                    expect(group('E')).toBe('reassignB');
                });
            });

            it('remove the reassign test elements', function () {
                runs(function () {
                    $('.h-brush-size').val(oldBrush.size);
                    $('.h-brush-screen').prop('checked', oldBrush.screen).trigger('change');
                    drawWidget._setStyleGroup({id: drawWidget.parentView._defaultGroup});
                    drawWidget.collection.remove(drawWidget.collection.filter(function (el) {
                        return startIds.indexOf(el.id) < 0;
                    }));
                });
                waitsFor(function () {
                    return drawWidget.collection.length === startIds.length;
                }, 'reassign test elements to be removed');
                girderTest.waitForLoad();
            });
        });

        describe('Sort By', function () {
            var drawWidget;
            var testLabels = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
            var testIds = ['sort-test-alpha', 'sort-test-bravo', 'sort-test-charlie', 'sort-test-delta'];

            function testElementLabels() {
                return $('.h-elements-container .h-element-label').map(function () {
                    return $(this).text();
                }).get().filter(function (text) {
                    return testLabels.indexOf(text) !== -1;
                });
            }

            it('add elements with distinct labels, groups, and shapes', function () {
                runs(function () {
                    drawWidget = huiTest.app.bodyView.drawWidget;
                    drawWidget.collection.add([
                        // give each element valid geometry; the viewer may redraw the
                        // annotation and fails on shapes without coordinates
                        {id: 'sort-test-charlie', type: 'point', center: [100, 100, 0], label: {value: 'Charlie'}, group: 'rareGroup'},
                        {id: 'sort-test-alpha', type: 'point', center: [120, 100, 0], label: {value: 'Alpha'}, group: 'commonGroup'},
                        {id: 'sort-test-bravo', type: 'rectangle', center: [140, 100, 0], width: 10, height: 10, rotation: 0, label: {value: 'Bravo'}, group: 'commonGroup'},
                        {id: 'sort-test-delta', type: 'polyline', points: [[160, 100, 0], [170, 110, 0]], closed: false, label: {value: 'Delta'}, group: 'commonGroup'}
                    ]);
                });
                waitsFor(function () {
                    return testElementLabels().length === testLabels.length;
                }, 'test elements to be added');
            });

            it('defaults to sorting by label, ascending', function () {
                runs(function () {
                    expect($('.h-sort-mode').val()).toBe('label');
                    expect($('.h-sort-order i').hasClass('icon-sort-alt-up')).toBe(true);
                    expect(testElementLabels()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
                });
            });

            it('toggles to descending order', function () {
                runs(function () {
                    $('.h-sort-order').click();
                });
                runs(function () {
                    expect($('.h-sort-order i').hasClass('icon-sort-alt-down')).toBe(true);
                    expect($('.h-sort-order').attr('title')).toMatch(/^Sort descending/);
                    expect(testElementLabels()).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
                });
            });

            it('toggles back to ascending order', function () {
                runs(function () {
                    $('.h-sort-order').click();
                });
                runs(function () {
                    expect($('.h-sort-order i').hasClass('icon-sort-alt-up')).toBe(true);
                    expect($('.h-sort-order').attr('title')).toMatch(/^Sort ascending/);
                    expect(testElementLabels()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
                });
            });

            it('sorts by group', function () {
                runs(function () {
                    $('.h-sort-mode').val('group').trigger('change');
                });
                runs(function () {
                    var order = testElementLabels();
                    // "commonGroup" sorts before "rareGroup" lexically.
                    expect(order.indexOf('Charlie')).toBe(order.length - 1);
                });
            });

            it('sorts by shape', function () {
                runs(function () {
                    $('.h-sort-mode').val('shape').trigger('change');
                });
                runs(function () {
                    var order = testElementLabels();
                    expect(order.indexOf('Delta')).toBeLessThan(order.indexOf('Bravo'));
                });
            });

            it('sorts by count, rare groups first', function () {
                runs(function () {
                    $('.h-sort-mode').val('count').trigger('change');
                });
                runs(function () {
                    var order = testElementLabels();
                    expect(order[0]).toBe('Charlie');
                });
            });

            it('removes the test elements and restores label sort', function () {
                runs(function () {
                    drawWidget.collection.remove(testIds);
                    $('.h-sort-mode').val('label').trigger('change');
                });
                waitsFor(function () {
                    return testElementLabels().length === 0;
                }, 'test elements to be removed');
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
                expect(opacity).toBe(0.5);

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

            it('annotation opacities are locked by default', function () {
                var id = $('.h-annotation-selector .h-annotation:contains("drawn 1")').data('id');
                expect($('.h-annotation[data-id="' + id + '"] .h-toggle-layer-opacity').length).toBe(0);
                expect($('.h-layer-opacity-slider').length).toBe(0);

                $('.h-annotation-opacity-lock.icon-lock').click();
                expect($('.h-annotation-opacity-lock.icon-lock-open').length).toBe(1);
                expect($('.h-annotation[data-id="' + id + '"] .h-toggle-layer-opacity.icon-ajust').length).toBe(1);
                expect($('.h-layer-opacity-slider').length).toBe(0);
            });

            it('set an annotation opacity', function () {
                var widget = huiTest.app.bodyView.viewerWidget;
                var setAnnotationOpacityFunc = widget.setAnnotationOpacity;
                var call;
                widget.setAnnotationOpacity = function (id, opacity) {
                    call = [id, opacity];
                    return setAnnotationOpacityFunc.apply(this, arguments);
                };

                var id = $('.h-annotation-selector .h-annotation:contains("drawn 1")').data('id');
                var row = '.h-annotation[data-id="' + id + '"] ';
                // an annotation that matches the global opacity opens on click
                $(row + '.h-toggle-layer-opacity').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(1);
                expect($(row + '.h-layer-opacity-slider').val()).toBe('0.5');
                expect($(row + '.h-reset-layer-opacity').length).toBe(0);
                $(row + '.h-layer-opacity-slider').val(0.75).trigger('input').trigger('change');
                expect(call).toEqual([id, 0.75]);
                expect($(row + '.h-reset-layer-opacity').length).toBe(1);

                // an annotation that differs from the global opacity can be closed
                $(row + '.h-toggle-layer-opacity').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(0);
                expect($(row + '.h-toggle-layer-opacity').hasClass('h-layer-opacity-changed')).toBe(true);
                $(row + '.h-toggle-layer-opacity').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(1);

                // the global opacity moves annotation opacities by the same amount
                $('#h-annotation-opacity').val(0.6).trigger('input');
                expect(call).toEqual([id, 0.85]);
                expect($(row + '.h-layer-opacity-slider').val()).toBe('0.85');
                $('#h-annotation-opacity').val(1).trigger('input');
                expect(call).toEqual([id, 1]);
                $('#h-annotation-opacity').val(0.5).trigger('input');
                expect(call).toEqual([id, 0.5]);

                widget.setAnnotationOpacity = setAnnotationOpacityFunc;
            });

            it('lock annotation opacities', function () {
                var widget = huiTest.app.bodyView.viewerWidget;
                var setAnnotationOpacityFunc = widget.setAnnotationOpacity;
                var call;
                widget.setAnnotationOpacity = function (id, opacity) {
                    call = [id, opacity];
                    return setAnnotationOpacityFunc.apply(this, arguments);
                };

                var id = $('.h-annotation-selector .h-annotation:contains("drawn 1")').data('id');
                var row = '.h-annotation[data-id="' + id + '"] ';
                if (!$(row + '.h-layer-opacity-slider').length) {
                    $(row + '.h-toggle-layer-opacity').click();
                }
                $(row + '.h-layer-opacity-slider').val(0.25).trigger('input').trigger('change');
                $('.h-annotation-opacity-lock.icon-lock-open').click();
                expect(call).toEqual([id, undefined]);
                expect($('.h-layer-opacity-slider').length).toBe(0);
                expect($('.h-toggle-layer-opacity').length).toBe(0);

                // locked annotation opacities don't move with the global opacity
                $('#h-annotation-opacity').val(0.7).trigger('input');
                $('.h-annotation-opacity-lock.icon-lock').click();
                expect(call).toEqual([id, 0.25]);
                // an annotation that differs from the global opacity shows its slider
                expect($(row + '.h-layer-opacity-slider').length).toBe(1);
                expect($(row + '.h-layer-opacity-slider').val()).toBe('0.25');

                // a closed slider opens again the next time opacities are unlocked
                $(row + '.h-toggle-layer-opacity').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(0);
                $('.h-annotation-opacity-lock.icon-lock-open').click();
                $('.h-annotation-opacity-lock.icon-lock').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(1);

                widget.setAnnotationOpacity = setAnnotationOpacityFunc;
            });

            it('highlight annotations with a different opacity', function () {
                var id = $('.h-annotation-selector .h-annotation:contains("drawn 1")').data('id');
                var row = '.h-annotation[data-id="' + id + '"] ';
                expect($(row + '.h-toggle-layer-opacity').hasClass('h-layer-opacity-changed')).toBe(true);
                $(row + '.h-layer-opacity-slider').val(0.7).trigger('input');
                expect($(row + '.h-toggle-layer-opacity').hasClass('h-layer-opacity-changed')).toBe(false);
                // an annotation that matches the global opacity closes when it isn't open
                $(row + '.h-layer-opacity-slider').trigger('change');
                expect($(row + '.h-layer-opacity-slider').length).toBe(0);

                $(row + '.h-toggle-layer-opacity').click();
                $(row + '.h-layer-opacity-slider').val(0.25).trigger('input').trigger('change');
                expect($(row + '.h-toggle-layer-opacity').hasClass('h-layer-opacity-changed')).toBe(true);
            });

            it('reset an annotation opacity', function () {
                var widget = huiTest.app.bodyView.viewerWidget;
                var setAnnotationOpacityFunc = widget.setAnnotationOpacity;
                var call;
                widget.setAnnotationOpacity = function (id, opacity) {
                    call = [id, opacity];
                    return setAnnotationOpacityFunc.apply(this, arguments);
                };

                var id = $('.h-annotation-selector .h-annotation:contains("drawn 1")').data('id');
                var row = '.h-annotation[data-id="' + id + '"] ';
                // relock so the slider is open because it differs, not because it was clicked
                $('.h-annotation-opacity-lock.icon-lock-open').click();
                $('.h-annotation-opacity-lock.icon-lock').click();
                expect($(row + '.h-layer-opacity-slider').length).toBe(1);
                $(row + '.h-reset-layer-opacity').click();
                expect(call).toEqual([id, undefined]);
                expect($(row + '.h-layer-opacity-slider').length).toBe(0);
                expect($(row + '.h-toggle-layer-opacity').hasClass('h-layer-opacity-changed')).toBe(false);

                $('.h-annotation-opacity-lock.icon-lock-open').click();
                expect($('.h-toggle-layer-opacity').length).toBe(0);

                widget.setAnnotationOpacity = setAnnotationOpacityFunc;
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

            it('toggle visibility of all annotations in a group', function () {
                var $group = $('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
                var wasExpanded = $group.hasClass('h-group-expanded');

                runs(function () {
                    expect($group.find('.icon-eye.h-toggle-group-annotations').length).toBe(1);
                    $group.find('.h-toggle-group-annotations').click();
                });
                waitsFor(function () {
                    $group = $('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
                    return $group.find('.icon-eye-off.h-toggle-group-annotations').length === 1 &&
                           $group.find('.icon-eye.h-toggle-annotation').length === 0;
                }, 'all annotations in group to hide');

                runs(function () {
                    // clicking the group toggle must not collapse/expand the group
                    expect($group.hasClass('h-group-expanded')).toBe(wasExpanded);
                    $group.find('.h-toggle-group-annotations').click();
                });
                waitsFor(function () {
                    $group = $('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
                    return $group.find('.icon-eye.h-toggle-group-annotations').length === 1 &&
                           $group.find('.icon-eye-off.h-toggle-annotation').length === 0;
                }, 'all annotations in group to show');
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

            it('edit annotation legend', function () {
                runs(function () {
                    expect($('.h-annotation-legend-container').hasClass('hidden')).toBe(true);
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('#h-annotation-name').val()).toBe('drawn 2');
                    expect($('.h-legend-entry').length).toBe(0);
                    $('.h-add-legend-entry').click();
                    $('.h-add-legend-entry').click();
                    expect($('.h-legend-entry').length).toBe(2);
                    $('.h-legend-entry:first .h-legend-label').val('High');
                    $('.h-legend-entry:first .h-legend-fill-color').val('red');
                    $('.h-legend-entry:last .h-legend-label').val('Low');
                    $('.h-legend-entry:last .h-legend-fill-color').val('blue');
                    $('.h-legend-entry:last .h-legend-line-color').val('black');
                    $('.h-legend-entry:last .h-legend-line-width').val(2);
                    // reorder the entries
                    $('.h-legend-entry:last .h-legend-move-up').click();
                    expect($('.h-legend-entry:first .h-legend-label').val()).toBe('Low');
                    $('.h-legend-entry:first .h-legend-move-up').click();
                    expect($('.h-legend-entry:first .h-legend-label').val()).toBe('Low');
                    $('.h-legend-entry:first .h-legend-move-down').click();
                    expect($('.h-legend-entry:first .h-legend-label').val()).toBe('High');
                    $('.h-legend-entry:last .h-legend-move-up').click();
                    expect($('.h-legend-entry:first .h-legend-label').val()).toBe('Low');
                    // entries without a label or with invalid colors are rejected
                    $('.h-add-legend-entry').click();
                    $('.h-legend-entry:last .h-legend-fill-color').val('not a color');
                    $('.h-submit').click();

                    var validationEl = $('.g-validation-failed-message');
                    expect(validationEl.hasClass('hidden')).toBe(false);
                    expect(validationEl.text()).toBe('Legend entries must have a label. Invalid legend color.');
                    expect($('.h-legend-entry:last .has-error').length).toBe(2);
                    expect($('.h-legend-entry:first .has-error').length).toBe(0);
                    // entries without any color are rejected
                    $('.h-legend-entry:last .h-legend-label').val('No color');
                    $('.h-legend-entry:last .h-legend-fill-color').val('');
                    $('.h-submit').click();
                    expect(validationEl.text()).toBe('Legend entries must have a fill or line color.');
                    expect($('.h-legend-entry:last .has-error').length).toBe(2);

                    $('.h-legend-entry:last .h-legend-remove').click();
                    expect($('.h-legend-entry').length).toBe(2);
                    $('.h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').legend).toEqual([
                        {label: 'Low', fillColor: 'rgb(0, 0, 255)', lineColor: 'rgb(0, 0, 0)', lineWidth: 2},
                        {label: 'High', fillColor: 'rgb(255, 0, 0)'}
                    ]);
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container:not(.hidden) .h-annotation-legend-entry').length === 2;
                }, 'legend to be shown');
                runs(function () {
                    var $legend = $('.h-annotation-legend-container');
                    expect($legend.find('.h-annotation-legend-name').text()).toBe('drawn 2');
                    expect($legend.find('.h-annotation-legend-label').first().text()).toBe('Low');
                    expect($legend.find('.h-annotation-legend-label').last().text()).toBe('High');
                    var swatch = $legend.find('.h-annotation-legend-swatch').first();
                    expect(swatch.css('background-color')).toBe('rgb(0, 0, 255)');
                    expect(swatch.css('border-top-color')).toBe('rgb(0, 0, 0)');
                    expect(swatch.css('border-top-width')).toBe('2px');
                    // collapse and expand the legend
                    $legend.find('.h-annotation-legend-header').click();
                    expect($legend.find('.h-annotation-legend-entry').length).toBe(0);
                    expect($legend.find('.icon-up-open').length).toBe(1);
                    $legend.find('.h-annotation-legend-header').click();
                    expect($legend.find('.h-annotation-legend-entry').length).toBe(2);
                    // hiding the annotation hides the legend
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-toggle-annotation').click();
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container').hasClass('hidden');
                }, 'legend to be hidden');
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-toggle-annotation').click();
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container:not(.hidden) .h-annotation-legend-entry').length === 2;
                }, 'legend to be shown again');
                // Showing the annotation refetches it.  Edits made while it
                // is loading are not saved, so wait for the fetch to finish.
                waitsFor(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    return annotation && !annotation.get('loading');
                }, 'annotation to finish loading');
                runs(function () {
                    // remove the legend
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    expect($('.h-legend-entry').length).toBe(2);
                    expect($('.h-legend-entry:first .h-legend-label').val()).toBe('Low');
                    expect($('.h-legend-entry:first .h-legend-fill-color').val()).toMatch(/^rgb\(0, ?0, ?255\)$/);
                    $('.h-legend-entry .h-legend-remove').click();
                    expect($('.h-legend-entry').length).toBe(0);
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').legend).toEqual([]);
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container').hasClass('hidden');
                }, 'legend to be removed');
            });

            it('edit annotation legend color range', function () {
                runs(function () {
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });

                girderTest.waitForDialog();
                runs(function () {
                    expect($('.h-legend-entry').length).toBe(0);
                    $('.h-add-legend-range').click();
                    expect($('.h-legend-entry.h-legend-range-entry').length).toBe(1);
                    expect($('.h-legend-stop').length).toBe(2);
                    $('.h-legend-range-entry .h-legend-label').val('Patch IoU');
                    $('.h-legend-stop:first .h-legend-stop-color').val('blue');
                    // every color must be filled in
                    $('.h-submit').click();
                    var validationEl = $('.g-validation-failed-message');
                    expect(validationEl.hasClass('hidden')).toBe(false);
                    expect(validationEl.text()).toBe('Invalid legend color.');
                    expect($('.h-legend-stop:last .has-error').length).toBe(1);
                    // a range needs at least two colors
                    $('.h-legend-stop:last .h-legend-remove-stop').click();
                    expect($('.h-legend-stop').length).toBe(1);
                    $('.h-submit').click();
                    expect(validationEl.text()).toBe('Color ranges need at least two colors.');
                    expect($('.h-legend-add-stop').hasClass('has-error')).toBe(true);
                    $('.h-legend-add-stop').click();
                    $('.h-legend-add-stop').click();
                    expect($('.h-legend-stop').length).toBe(3);
                    $('.h-legend-stop:eq(1) .h-legend-stop-color').val('white');
                    $('.h-legend-stop:last .h-legend-stop-color').val('rgb(255, 0, 0)');
                    $('.h-legend-stop:first .h-legend-stop-label').val('Low');
                    $('.h-legend-stop:last .h-legend-stop-label').val('High');
                    $('.h-legend-range-entry .h-legend-line-color').val('black');
                    $('.h-submit').click();
                });

                girderTest.waitForLoad();
                runs(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').legend).toEqual([{
                        label: 'Patch IoU',
                        fillColor: ['rgb(0, 0, 255)', 'rgb(255, 255, 255)', 'rgb(255, 0, 0)'],
                        labels: ['Low', '', 'High'],
                        lineColor: 'rgb(0, 0, 0)'
                    }]);
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container:not(.hidden) .h-annotation-legend-range').length === 1;
                }, 'legend range to be shown');
                runs(function () {
                    var $range = $('.h-annotation-legend-container .h-annotation-legend-range');
                    expect($range.find('.h-annotation-legend-label').text()).toBe('Patch IoU');
                    expect($range.find('.h-annotation-legend-bar').attr('style')).toMatch(/linear-gradient\(to right, rgb\(0, 0, 255\), rgb\(255, 255, 255\), rgb\(255, 0, 0\)\)/);
                    expect($range.find('.h-annotation-legend-bar').css('border-top-color')).toBe('rgb(0, 0, 0)');
                    var $labels = $range.find('.h-annotation-legend-range-label');
                    expect($labels.length).toBe(2);
                    expect($labels.first().text()).toBe('Low');
                    expect($labels.last().text()).toBe('High');
                    // remove the legend
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    expect($('.h-legend-range-entry').length).toBe(1);
                    expect($('.h-legend-stop').length).toBe(3);
                    expect($('.h-legend-stop:first .h-legend-stop-color').val()).toMatch(/^rgb\(0, ?0, ?255\)$/);
                    expect($('.h-legend-stop:first .h-legend-stop-label').val()).toBe('Low');
                    expect($('.h-legend-stop:eq(1) .h-legend-stop-label').val()).toBe('');
                    $('.h-legend-entry .h-legend-remove').click();
                    expect($('.h-legend-entry').length).toBe(0);
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                runs(function () {
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').legend).toEqual([]);
                });
                waitsFor(function () {
                    return $('.h-annotation-legend-container').hasClass('hidden');
                }, 'legend to be removed');
            });

            it('keep annotation edits when the list refreshes while editing', function () {
                var refreshes = 0;
                function countRefresh() {
                    refreshes += 1;
                }

                runs(function () {
                    huiTest.app.bodyView.annotations.on('g:changed', countRefresh);
                    $('.h-annotation-selector .h-annotation:contains("drawn 2") .h-edit-annotation-metadata').click();
                });
                girderTest.waitForDialog();
                runs(function () {
                    // a notification that asks to refresh the annotation list
                    girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                        data: {itemId: huiTest.app.bodyView.annotationSelector.parentItem.id}
                    });
                });
                waitsFor(function () {
                    return girder.rest.numberOutstandingRestRequests() === 0;
                }, 'rest requests to finish');
                runs(function () {
                    expect(refreshes).toBe(0);
                    $('#h-annotation-description').val('edited during a refresh');
                    $('.h-submit').click();
                });
                girderTest.waitForLoad();
                // the refresh happens once the dialog is closed
                waitsFor(function () {
                    return refreshes > 0;
                }, 'annotation list to refresh');
                girderTest.waitForLoad();
                runs(function () {
                    huiTest.app.bodyView.annotations.off('g:changed', countRefresh);
                    var annotation = huiTest.app.bodyView.annotations.filter(function (annotation) {
                        return annotation.get('annotation').name === 'drawn 2';
                    })[0];
                    expect(annotation.get('annotation').description).toBe('edited during a refresh');
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

            it('edit the user hotkey file directly', function () {
                var done;
                runs(function () {
                    girder.rest.restRequest({
                        url: 'user/' + girder.auth.getCurrentUser().id + '/yaml_config/.histomicsui_user_config.yaml',
                        method: 'PUT',
                        contentType: 'application/x-yaml',
                        processData: false,
                        data: 'hotkeys:\n  - action: draw.rectangle\n    key: y\n'
                    }).done(function () {
                        done = true;
                    });
                });
                waitsFor(function () {
                    return done;
                }, 'user config to save');
            });

            it('open a different image', function () {
                huiTest.waitsForPromise(
                    huiTest.openImage('copy').done(function () {
                        expect($('.h-annotation-selector .h-annotation').length).toBe(0);
                    }), 'Annotation selector to appear'
                );
            });

            it('loads the user hotkey file with the image', function () {
                var done;
                waitsFor(function () {
                    return girder.plugins.histomicsui.hotkeys.hotkeyText('draw.rectangle', huiTest.app.bodyView.hotkeys) === 'Y';
                }, 'user hotkeys to load');
                runs(function () {
                    girder.rest.restRequest({
                        url: 'user/' + girder.auth.getCurrentUser().id + '/yaml_config/.histomicsui_user_config.yaml',
                        method: 'PUT',
                        contentType: 'application/x-yaml',
                        processData: false,
                        data: '{}\n'
                    }).done(function () {
                        done = true;
                    });
                });
                waitsFor(function () {
                    return done;
                }, 'user config to reset');
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
        it('respects unselected opacity config', function () {
            girderTest.waitForLoad();
            expect(huiTest.app.bodyView._unselectedOpacityMultiplier).toBe(0.5);
            expect(huiTest.app.bodyView.viewerWidget._unselectedOpacityMultiplier).toBe(0.5);
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
        it('uses group hotkeys from the config', function () {
            waitsFor(function () {
                var bindings = huiTest.app.bodyView.hotkeys.bindings['group:Red'];
                return bindings && bindings.length === 1;
            }, 'config hotkeys to load');
            runs(function () {
                expect(girder.plugins.histomicsui.hotkeys.hotkeyText('group:Red', huiTest.app.bodyView.hotkeys)).toBe('Shift+R');
            });
        });
        it('open original image', function () {
            huiTest.openImage('image');
        });
        it('drops config hotkeys in a folder without a config', function () {
            waitsFor(function () {
                return huiTest.app.bodyView.hotkeys.bindings['group:Red'] === undefined;
            }, 'config hotkeys to be removed');
        });
    });
});
