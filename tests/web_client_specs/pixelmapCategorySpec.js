/* globals beforeEach, describe, it, expect, waitsFor, runs, huiTest, $, girderTest, sinon */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');
girderTest.addScripts([
    '/static/built/plugins/histomicsui/huiTest.js',
    '/static/built/plugins/histomicsui/extra/sinon.js'
]);

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('pixelmap category tests', function () {
        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });

            it('open image', function () {
                huiTest.openImage('image');
            });
        });
        describe('pixelmap behavior', function () {
            var girder, largeImageAnnotation, histomicsUI, pixelmapId, pixelmapAnnotation, pixelmapElement, fetched, newCategory, newGroup;
            var stubDebounce;
            beforeEach(function () {
                girder = window.girder;
                largeImageAnnotation = girder.plugins.large_image_annotation;
                histomicsUI = girder.plugins.histomicsui;
            });

            it('creates a pixelmap annotation', function () {
                runs(function () {
                    girder.rest.restRequest({
                        url: 'annotation?itemId=' + huiTest.imageId(),
                        contentType: 'application/json',
                        processData: false,
                        type: 'POST',
                        data: JSON.stringify({
                            name: 'test pixelmap annotation',
                            elements: [{
                                type: 'pixelmap',
                                girderId: huiTest.imageId(),
                                values: [0, 1, 0, 1, 0, 1, 0, 1],
                                categories: [
                                    {
                                        label: 'default',
                                        strokeColor: 'rgb(0, 0, 0)',
                                        fillColor: 'rgb(0, 0, 0)'
                                    },
                                    {
                                        label: 'category1',
                                        strokeColor: 'rgb(0, 0, 0)',
                                        fillColor: 'rgb(0, 0, 0)'
                                    }
                                ],
                                boundaries: true
                            }]
                        })
                    }).then(function (resp) {
                        pixelmapId = resp._id;
                        return null;
                    });
                });
                waitsFor(function () {
                    return pixelmapId !== undefined;
                });
                girderTest.waitForLoad();
                runs(function () {
                    pixelmapAnnotation = new largeImageAnnotation.models.AnnotationModel({
                        _id: pixelmapId
                    });
                    pixelmapAnnotation.fetch().then(function () {
                        fetched = true;
                        return null;
                    });
                });
                waitsFor(function () {
                    return fetched;
                });
            });

            it('initializes the draw widget', function () {
                huiTest.app.bodyView.annotations.add(pixelmapAnnotation);
                huiTest.app.bodyView._editAnnotation(pixelmapAnnotation);
                runs(function () {
                    expect($('.h-draw-widget').hasClass('hidden')).toBe(false);
                });
            });

            it('creates a new style group for categories', function () {
                pixelmapElement = pixelmapAnnotation.elements().first();
                var groups = huiTest.app.bodyView.drawWidget._groups;
                expect(groups.get('category1')).toBeUndefined();
                huiTest.app.bodyView._reconcilePixelmapCategories(pixelmapElement, groups, pixelmapAnnotation);
                newCategory = groups.get('category1');
                expect(newCategory).toBeDefined();
            });

            it('creates a new category for style groups', function () {
                pixelmapElement = pixelmapAnnotation.elements().first();
                var groups = huiTest.app.bodyView.drawWidget._groups;
                newGroup = new histomicsUI.models.StyleModel({
                    id: 'category2',
                    fillColor: 'rgb(255, 0, 0)',
                    lineColor: 'rgb(255, 0, 0)'
                });
                groups.push(newGroup);
                huiTest.app.bodyView._reconcilePixelmapCategories(pixelmapElement, groups, pixelmapAnnotation);
                expect(pixelmapElement.get('categories').length).toEqual(3);
            });

            it('updates category to match existing style group', function () {
                newGroup.set('fillColor', 'rgb(0, 255, 0)');
                var groups = huiTest.app.bodyView.drawWidget._groups;
                huiTest.app.bodyView._reconcilePixelmapCategories(pixelmapElement, groups, pixelmapAnnotation);
                var category2 = pixelmapElement.get('categories').find(function (category) {
                    return category.label === newGroup.id;
                });
                expect(category2.fillColor).toEqual('rgb(0, 255, 0)');
            });

            it('moves the default category to index 0', function () {
                pixelmapElement.set('categories', [
                    {
                        label: 'category1',
                        fillColor: 'rgb(0, 0, 0)',
                        strokeColor: 'rgb(0, 0, 0)'
                    },
                    {
                        label: 'default',
                        fillColor: 'rgb(0, 0, 0)',
                        strokeColor: 'rgb(0, 0, 0)'
                    },
                    {
                        label: 'category2',
                        fillColor: 'rgb(0, 255, 0)',
                        strokeColor: 'rgb(0, 0, 0)'
                    }
                ]);
                pixelmapElement.set('values', [0, 1, 0, 1, 0, 1, 0, 2]);
                var groups = huiTest.app.bodyView.drawWidget._groups;
                huiTest.app.bodyView._reconcilePixelmapCategories(pixelmapElement, groups, pixelmapAnnotation);
                var categories = pixelmapElement.get('categories');
                var values = pixelmapElement.get('values');
                expect(categories[0].label).toEqual('default');
                expect(values[0]).toEqual(1);
                expect(values[1]).toEqual(0);
                expect(values[values.length - 1]).toEqual(2);
            });

            it('updates layer data on left click', function () {
                pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                var layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                var clickEvent = {
                    index: 0,
                    mouse: {
                        buttonsDown: {
                            left: true
                        },
                        modifiers: {}
                    }
                };
                var mockLayer = {
                    data: function (newData) {
                        if (newData) {
                            layerData = newData;
                        }
                        return layerData;
                    },
                    indexModified: function (min, max) { return null; },
                    draw: function () { return null; }
                };
                var stubIndexModified = sinon.stub(mockLayer, 'indexModified');
                stubIndexModified.returns(mockLayer);
                var stubDraw = sinon.stub(mockLayer, 'draw');
                stubDebounce = sinon.stub(huiTest.app.bodyView, '_debounceUpdatePixelmapValues');
                huiTest.app.bodyView.mouseClickOverlay(pixelmapElement, mockLayer, clickEvent);
                expect(layerData[0]).toEqual(0);
                expect(layerData[1]).toEqual(0);
                sinon.assert.called(stubDraw);
                sinon.assert.called(stubDebounce);
            });

            it('allows click shift and drag', function () {
                pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                var layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                var clickEvent = {
                    index: 1,
                    mouse: {
                        buttons: {
                            left: true
                        },
                        modifiers: {
                            shift: true
                        }
                    }
                };
                var mockLayer = {
                    data: function () {
                        return layerData;
                    },
                    indexModified: function (min, max) { return null; },
                    draw: function () { return null; }
                };
                var stubIndexModified = sinon.stub(mockLayer, 'indexModified');
                stubIndexModified.returns(mockLayer);
                var stubDraw = sinon.stub(mockLayer, 'draw');
                huiTest.app.bodyView.mouseOverOverlay(pixelmapElement, mockLayer, clickEvent);
                expect(layerData[0]).toEqual(0);
                expect(layerData[1]).toEqual(0);
                sinon.assert.called(stubDraw);
                sinon.assert.calledTwice(stubDebounce);
            });
            it('does nothing on left click if no draw widget', function () {
                huiTest.app.bodyView._removeDrawWidget();
                pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                var layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                var clickEvent = {
                    index: 0,
                    mouse: {
                        buttonsDown: {
                            left: true
                        },
                        modifiers: {}
                    }
                };
                var mockLayer = {
                    data: function (newData) {
                        if (newData) {
                            layerData = newData;
                        }
                        return layerData;
                    },
                    indexModified: function (min, max) { return null; },
                    draw: function () { return null; }
                };
                var stubIndexModified = sinon.stub(mockLayer, 'indexModified');
                stubIndexModified.returns(mockLayer);
                var stubDraw = sinon.stub(mockLayer, 'draw');
                huiTest.app.bodyView.mouseClickOverlay(pixelmapElement, mockLayer, clickEvent);
                expect(layerData[0]).toEqual(1);
                expect(layerData[1]).toEqual(1);
                sinon.assert.notCalled(stubDraw);
                sinon.assert.calledTwice(stubDebounce);
            });

            it('does nothing on click and drag if no draw widget', function () {
                pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                var layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                var clickEvent = {
                    index: 1,
                    mouse: {
                        buttons: {
                            left: true
                        },
                        modifiers: {
                            shift: true
                        }
                    }
                };
                var mockLayer = {
                    data: function () {
                        return layerData;
                    },
                    indexModified: function (min, max) { return null; },
                    draw: function () { return null; }
                };
                var stubIndexModified = sinon.stub(mockLayer, 'indexModified');
                stubIndexModified.returns(mockLayer);
                var stubDraw = sinon.stub(mockLayer, 'draw');
                huiTest.app.bodyView.mouseOverOverlay(pixelmapElement, mockLayer, clickEvent);
                expect(layerData[0]).toEqual(1);
                expect(layerData[1]).toEqual(1);
                sinon.assert.notCalled(stubDraw);
                sinon.assert.calledTwice(stubDebounce);
            });

            it('opens context menu for right click', function () {
                pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                var layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                var clickEvent = {
                    index: 0,
                    mouse: {
                        buttonsDown: {
                            right: true
                        },
                        page: {
                            x: 100,
                            y: 100
                        }
                    }
                };
                var mockLayer = {
                    data: function (newData) {
                        if (newData) {
                            layerData = newData;
                        }
                        return layerData;
                    },
                    indexModified: function (min, max) { return null; },
                    draw: function () { return null; }
                };
                runs(function () {
                    var spyQueueMouse = sinon.spy(huiTest.app.bodyView, '_queueMouseClickAction');
                    huiTest.app.bodyView.mouseClickOverlay(pixelmapElement, mockLayer, clickEvent);
                    sinon.assert.called(spyQueueMouse);
                });
                waitsFor(function () {
                    return huiTest.app.bodyView._pixelmapContextMenuActive === true;
                });
            });
        });
    });
});
