/* globals describe, it, expect, waitsFor, runs, huiTest, girderTest */

girderTest.importPlugin(
    'jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui'
);
girderTest.addScripts([
    '/static/built/plugins/histomicsui/huiTest.js',
    '/static/built/plugins/histomicsui/extra/sinon.js'
]);

girderTest.promise.done(function () {
    huiTest.startApp();

    describe('allowed_groups annotation metadata tests', function () {
        var girder, largeImageAnnotation, histomicsUI;

        /**
         * POST a new annotation with the given name/attributes/elements and fetch it back into a
         * fresh AnnotationModel, storing the result on `result.annotation`.
         */
        function createAnnotation(name, attributes, elements, result) {
            var annotationId;
            runs(function () {
                girder.rest.restRequest({
                    url: 'annotation?itemId=' + huiTest.imageId(),
                    contentType: 'application/json',
                    processData: false,
                    type: 'POST',
                    data: JSON.stringify({
                        name: name,
                        attributes: attributes,
                        elements: elements
                    })
                }).then(function (resp) {
                    annotationId = resp._id;
                    return null;
                });
            });
            waitsFor(function () {
                return annotationId !== undefined;
            });
            girderTest.waitForLoad();
            runs(function () {
                result.annotation = new largeImageAnnotation.models.AnnotationModel({
                    _id: annotationId
                });
                result.fetched = false;
                result.annotation.fetch().then(function () {
                    result.fetched = true;
                    return null;
                });
            });
            waitsFor(function () {
                return result.fetched;
            });
        }

        function rectangleElement(x, y) {
            return {type: 'rectangle', center: [x, y, 0], width: 4, height: 4};
        }

        describe('setup', function () {
            it('login', function () {
                huiTest.login();
            });

            it('open image', function () {
                huiTest.openImage('image');
            });

            it('access plugin namespaces', function () {
                girder = window.girder;
                largeImageAnnotation = girder.plugins.large_image_annotation;
                histomicsUI = girder.plugins.histomicsui;
            });
        });

        describe('#1/#2: no restriction (missing or empty allowed_groups)', function () {
            var result = {};
            var drawWidget;

            it('creates an annotation with no allowed_groups key', function () {
                createAnnotation('unrestricted annotation', {}, [rectangleElement(0, 0)], result);
            });

            it('offers every existing group in the Draw panel dropdown', function () {
                var bodyView = huiTest.app.bodyView;
                bodyView.annotations.add(result.annotation);
                bodyView._editAnnotation(result.annotation);
                drawWidget = bodyView.drawWidget;
                waitsFor(function () {
                    return !!drawWidget._groups.length;
                });
                runs(function () {
                    expect(drawWidget._getAllowedGroups()).toBe(null);
                    var expectedIds = drawWidget._groups.map(function (m) { return m.id; }).sort();
                    var values = drawWidget.$('.h-style-group option').map(function () {
                        return this.value;
                    }).get().sort();
                    expect(values).toEqual(expectedIds);
                });
            });

            it('offers every existing group in the context menu', function () {
                var bodyView = huiTest.app.bodyView;
                var element = result.annotation.elements().first();
                bodyView._resetSelection();
                bodyView._selectElement(element);
                var groups = bodyView.contextMenu._getAnnotationGroups();
                var expectedIds = bodyView.contextMenu.styles.map(function (m) { return m.id; });
                expect(groups.sort()).toEqual(expectedIds.sort());
            });

            it('treats an empty allowed_groups list the same as no restriction', function () {
                result.annotation.get('annotation').attributes = {allowed_groups: []};
                expect(drawWidget._getAllowedGroups()).toBe(null);
                result.annotation.get('annotation').attributes = {allowed_groups: 'not-an-array'};
                expect(drawWidget._getAllowedGroups()).toBe(null);
            });
        });

        describe('#3/#4: restricted annotation, including auto-created groups', function () {
            var result = {};
            var drawWidget;
            var defaultStyle;

            it('records the default group style for comparison', function () {
                // StyleModel has no url/urlRoot; styles are only persisted via
                // backbone.localStorage, which is patched onto the *collection*. So a
                // bare model must be fetched through a StyleCollection, not directly.
                var styles = new histomicsUI.collections.StyleCollection();
                var fetched = false;
                runs(function () {
                    styles.fetch().always(function () {
                        fetched = true;
                    });
                });
                waitsFor(function () {
                    return fetched;
                });
                runs(function () {
                    defaultStyle = styles.get('default');
                });
            });

            it('creates an annotation restricted to a mix of missing groups', function () {
                createAnnotation('restricted annotation', {
                    allowed_groups: ['groupA', 'groupB']
                }, [rectangleElement(10, 10)], result);
            });

            it('#4a/#4b: auto-creates every missing allowed group using the default style', function () {
                var bodyView = huiTest.app.bodyView;
                bodyView.annotations.add(result.annotation);
                bodyView._editAnnotation(result.annotation);
                drawWidget = bodyView.drawWidget;
                waitsFor(function () {
                    return drawWidget._groups.has('groupA') && drawWidget._groups.has('groupB');
                });
                runs(function () {
                    ['groupA', 'groupB'].forEach(function (groupId) {
                        var created = drawWidget._groups.get(groupId).toJSON();
                        expect(created.fillColor).toBe(defaultStyle.get('fillColor'));
                        expect(created.lineColor).toBe(defaultStyle.get('lineColor'));
                        expect(created.lineWidth).toBe(defaultStyle.get('lineWidth'));
                        expect(created.pattern).toBe(defaultStyle.get('pattern'));
                    });
                    // the active style switches to the first allowed group
                    expect(drawWidget._style.id).toBe('groupA');
                });
            });

            it('#3/#4c: restriction is immediately reflected in the Draw panel dropdown', function () {
                var values = drawWidget.$('.h-style-group option').map(function () {
                    return this.value;
                }).get();
                expect(values).toEqual(['groupA', 'groupB']);
            });

            it('#3/#4c: restriction is immediately reflected in the context menu', function () {
                var bodyView = huiTest.app.bodyView;
                // select an element of the restricted annotation so the context menu's group
                // list reflects it, rather than a stale selection left over from a previous
                // describe block
                var element = result.annotation.elements().first();
                bodyView._resetSelection();
                bodyView._selectElement(element);

                var groups = bodyView.contextMenu._getAnnotationGroups();
                expect(groups.sort()).toEqual(['groupA', 'groupB']);
            });
        });

        describe('#5: context menu ignores active selection, uses the clicked annotation', function () {
            var restricted = {};
            var unrestricted = {};

            it('creates a restricted and an unrestricted annotation', function () {
                createAnnotation('restricted annotation for #5', {
                    allowed_groups: ['groupE', 'groupF']
                }, [rectangleElement(30, 30)], restricted);
            });

            it('creates the unrestricted annotation', function () {
                createAnnotation('unrestricted annotation for #5', {}, [rectangleElement(40, 40)], unrestricted);
            });

            it('auto-creates the restricted annotation\'s allowed groups (groupE/groupF) as styles', function () {
                // briefly edit the restricted annotation in the Draw panel to create groupE and
                // groupF before switching the active annotation below.
                var bodyView = huiTest.app.bodyView;
                bodyView.annotations.add(restricted.annotation);
                bodyView._editAnnotation(restricted.annotation);
                waitsFor(function () {
                    return !!bodyView.drawWidget &&
                        bodyView.drawWidget._groups.has('groupE') &&
                        bodyView.drawWidget._groups.has('groupF');
                });
            });

            it('restricts the context menu to the clicked element\'s annotation regardless of the active annotation/group/shape', function () {
                var bodyView = huiTest.app.bodyView;

                runs(function () {
                    bodyView.annotations.add(unrestricted.annotation);
                    bodyView._editAnnotation(unrestricted.annotation);
                });
                waitsFor(function () {
                    return !!bodyView.drawWidget && !!bodyView.drawWidget._groups.length;
                });
                runs(function () {
                    // pick an arbitrary style group in the Draw panel to prove the context menu
                    // restriction is independent of it
                    bodyView.drawWidget.setStyleGroupById(bodyView.drawWidget._groups.first().id);

                    var element = restricted.annotation.elements().first();
                    bodyView._resetSelection();
                    bodyView._selectElement(element);

                    var groups = bodyView.contextMenu._getAnnotationGroups();
                    expect(groups.sort()).toEqual(['groupE', 'groupF']);
                });
            });

            it('renders the clicked annotation\'s restriction on selection, not the active annotation\'s (regression)', function () {
                var bodyView = huiTest.app.bodyView;

                runs(function () {
                    // keep the *unrestricted* annotation active in the panel
                    bodyView._editAnnotation(unrestricted.annotation);
                });
                waitsFor(function () {
                    return !!bodyView.drawWidget && !!bodyView.drawWidget._groups.length;
                });
                runs(function () {
                    // Selecting an element fires the context menu's render synchronously.
                    // This asserts on the DOM produced by that render, which is the path that
                    // regressed. Previously `originalAnnotation` was assigned only after `add`,
                    // so the render fell back to the active annotation and offered the wrong
                    // groups when the active annotation did not match the selected one.
                    var element = restricted.annotation.elements().first();
                    bodyView._resetSelection();
                    bodyView._selectElement(element);

                    var renderedGroups = bodyView.contextMenu.$('.h-set-group').map(function () {
                        return window.$(this).data('group');
                    }).get();
                    expect(renderedGroups.sort()).toEqual(['groupE', 'groupF']);
                });
            });
        });

        describe('#3/#5: live metadata updates without reselecting or reloading', function () {
            var result = {};
            var drawWidget;

            it('creates an annotation with no restriction', function () {
                createAnnotation('live-update annotation', {}, [rectangleElement(50, 50)], result);
            });

            it('opens the annotation while unrestricted', function () {
                var bodyView = huiTest.app.bodyView;
                bodyView.annotations.add(result.annotation);
                bodyView._editAnnotation(result.annotation);
                drawWidget = bodyView.drawWidget;
                waitsFor(function () {
                    return !!drawWidget._groups.length;
                });
                runs(function () {
                    expect(drawWidget._getAllowedGroups()).toBe(null);
                });
            });

            it('immediately restricts the Draw panel and context menu when allowed_groups is added, without reselecting', function () {
                var bodyView = huiTest.app.bodyView;

                var element = result.annotation.elements().first();
                bodyView._resetSelection();
                bodyView._selectElement(element);

                // simulate editing the annotation's metadata via the "Edit annotation" dialog,
                // which mutates attributes directly and triggers 'change:annotation' rather than
                // calling .set()
                result.annotation.get('annotation').attributes = {allowed_groups: ['groupG', 'groupH']};
                result.annotation.trigger('change:annotation', result.annotation, {});

                waitsFor(function () {
                    // the Draw panel's `_groups` collection updates synchronously, but its dropdown
                    // DOM is refreshed via a debounced render, so also wait for the DOM to catch up
                    // before asserting on it
                    return drawWidget._groups.has('groupG') && drawWidget._groups.has('groupH') &&
                        drawWidget.$('.h-style-group option').length === 2;
                });
                runs(function () {
                    expect(drawWidget._style.id).toBe('groupG');
                    var drawValues = drawWidget.$('.h-style-group option').map(function () {
                        return this.value;
                    }).get();
                    expect(drawValues).toEqual(['groupG', 'groupH']);
                });
                // the context menu keeps its own StyleCollection, refetched asynchronously via the
                // 'h:styleGroupsEdited' event once the Draw panel auto-creates the newly allowed
                // groups; wait for that refetch to complete before checking it
                waitsFor(function () {
                    return bodyView.contextMenu.styles.get('groupG') && bodyView.contextMenu.styles.get('groupH');
                });
                runs(function () {
                    var contextGroups = bodyView.contextMenu._getAnnotationGroups();
                    expect(contextGroups.sort()).toEqual(['groupG', 'groupH']);
                });
            });
        });

        describe('#3(consistency): the context menu auto-creates missing allowed groups', function () {
            var restricted = {};

            it('creates a restricted annotation that is never opened in the Draw panel', function () {
                createAnnotation('context-only restricted annotation', {
                    allowed_groups: ['groupK', 'groupL']
                }, [rectangleElement(70, 70)], restricted);
            });

            it('auto-creates the allowed groups the first time the context menu sees them', function () {
                var bodyView = huiTest.app.bodyView;
                // the groups must not already exist from an earlier spec
                expect(bodyView.contextMenu.styles.get('groupK')).toBe(undefined);
                expect(bodyView.contextMenu.styles.get('groupL')).toBe(undefined);

                // select an element of the restricted annotation without ever opening it in the
                // Draw panel, so the context menu is the only code path that can create its groups
                var element = restricted.annotation.elements().first();
                bodyView._resetSelection();
                bodyView._selectElement(element);

                var groups = bodyView.contextMenu._getAnnotationGroups();
                expect(groups.sort()).toEqual(['groupK', 'groupL']);
                expect(bodyView.contextMenu.styles.get('groupK')).toBeTruthy();
                expect(bodyView.contextMenu.styles.get('groupL')).toBeTruthy();
            });
        });
    });
});
