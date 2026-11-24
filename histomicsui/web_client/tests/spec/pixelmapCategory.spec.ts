import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {evalApp, evalAppAsync, gotoHistomics, huiLogin, openImage, pageRest, setupResources, waitForAppCondition} from '../hui';

// These are mostly unit tests of the ImageView's pixelmap handling
// (_reconcilePixelmapCategories, mouseClickOverlay, mouseOverOverlay, ...)
// operating on an AnnotationModel that lives in the page.  The models are
// kept on `window.__huiTest` between `evalApp` calls.  Where the Jasmine
// version used sinon stubs, methods are replaced with call-recording wrappers
// inside the page.

interface MockEvent {
    index: number;
    mouse: Record<string, unknown>;
}

/**
 * Inside the page, call `method` of the body view with the pixelmap element,
 * a mock geojs pixelmap layer whose data starts as sixteen 1s, and the given
 * event.  Resolves with the resulting layer data and how many times the mock
 * layer's `draw` and the body view's `_debounceUpdatePixelmapValues` have been
 * called (the latter is cumulative over the test, as the sinon stub was).
 */
const callOverlayHandler = async (page: Page, method: 'mouseClickOverlay' | 'mouseOverOverlay', event: MockEvent) => {
    return evalApp(page, (app, arg) => {
        const scratch = (window as any).__huiTest;
        const bodyView = app.bodyView;
        scratch.pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
        let layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        const calls = {indexModified: 0, draw: 0};
        const mockLayer = {
            data(newData?: number[]) {
                if (newData) {
                    layerData = newData;
                }
                return layerData;
            },
            indexModified() {
                calls.indexModified += 1;
                return mockLayer;
            },
            draw() {
                calls.draw += 1;
                return null;
            }
        };
        bodyView[arg.method](scratch.pixelmapElement, mockLayer, arg.event);
        return {layerData, draw: calls.draw, debounce: scratch.debounceCalls as number};
    }, {method, event});
};

test.describe('pixelmap category tests', () => {
    setupServer();

    test('pixelmap behavior', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');

        await test.step('creates a pixelmap annotation', async () => {
            const resp = await pageRest(page, {
                url: `annotation?itemId=${imageId}`,
                method: 'POST',
                contentType: 'application/json',
                data: {
                    name: 'test pixelmap annotation',
                    elements: [{
                        type: 'pixelmap',
                        girderId: imageId,
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
                }
            }) as {_id: string};
            expect(resp._id).toBeTruthy();
            await evalAppAsync(page, async (app, arg) => {
                const girder = (window as any).girder;
                const scratch = (window as any).__huiTest = {};
                scratch.pixelmapAnnotation = new girder.plugins.large_image_annotation.models.AnnotationModel({_id: arg.id});
                await scratch.pixelmapAnnotation.fetch();
                return scratch.pixelmapAnnotation.id;
            }, {id: resp._id});
        });

        await test.step('initializes the draw widget', async () => {
            await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                app.bodyView.annotations.add(scratch.pixelmapAnnotation);
                app.bodyView._editAnnotation(scratch.pixelmapAnnotation);
            });
            await expect(page.locator('.h-draw-widget')).not.toHaveClass(/\bhidden\b/);
            // the draw widget's style groups are fetched from local storage
            await waitForAppCondition(page, (app) => app.bodyView.drawWidget && app.bodyView.drawWidget._groups.length);
        });

        await test.step('creates a new style group for categories', async () => {
            const result = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                scratch.pixelmapElement = scratch.pixelmapAnnotation.elements().first();
                const groups = app.bodyView.drawWidget._groups;
                // The app reconciles the categories of a pixelmap with the
                // style groups itself when the annotation is drawn, which may
                // already have happened; make sure the group is missing so
                // that this checks that reconciling creates it.
                groups.remove('category1');
                const before = groups.get('category1');
                app.bodyView._reconcilePixelmapCategories(scratch.pixelmapElement, groups, scratch.pixelmapAnnotation);
                scratch.newCategory = groups.get('category1');
                return {before: before === undefined, after: scratch.newCategory !== undefined};
            });
            expect(result.before).toBe(true);
            expect(result.after).toBe(true);
        });

        await test.step('creates a new category for style groups', async () => {
            const categoryCount = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const histomicsUI = (window as any).girder.plugins.histomicsui;
                scratch.pixelmapElement = scratch.pixelmapAnnotation.elements().first();
                const groups = app.bodyView.drawWidget._groups;
                scratch.newGroup = new histomicsUI.models.StyleModel({
                    id: 'category2',
                    fillColor: 'rgb(255, 0, 0)',
                    lineColor: 'rgb(255, 0, 0)'
                });
                groups.push(scratch.newGroup);
                app.bodyView._reconcilePixelmapCategories(scratch.pixelmapElement, groups, scratch.pixelmapAnnotation);
                return scratch.pixelmapElement.get('categories').length;
            });
            expect(categoryCount).toBe(3);
        });

        await test.step('updates category to match existing style group', async () => {
            const fillColor = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                scratch.newGroup.set('fillColor', 'rgb(0, 255, 0)');
                const groups = app.bodyView.drawWidget._groups;
                app.bodyView._reconcilePixelmapCategories(scratch.pixelmapElement, groups, scratch.pixelmapAnnotation);
                const category2 = scratch.pixelmapElement.get('categories').find(
                    (category: {label: string}) => category.label === scratch.newGroup.id);
                return category2.fillColor;
            });
            expect(fillColor).toBe('rgb(0, 255, 0)');
        });

        await test.step('moves the default category to index 0', async () => {
            const result = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                scratch.pixelmapElement.set('categories', [
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
                scratch.pixelmapElement.set('values', [0, 1, 0, 1, 0, 1, 0, 2]);
                const groups = app.bodyView.drawWidget._groups;
                app.bodyView._reconcilePixelmapCategories(scratch.pixelmapElement, groups, scratch.pixelmapAnnotation);
                return {
                    categories: scratch.pixelmapElement.get('categories'),
                    values: scratch.pixelmapElement.get('values')
                };
            });
            expect(result.categories[0].label).toBe('default');
            expect(result.values[0]).toBe(1);
            expect(result.values[1]).toBe(0);
            expect(result.values[result.values.length - 1]).toBe(2);
        });

        await test.step('updates layer data on left click', async () => {
            // stub _debounceUpdatePixelmapValues with a call counter for the
            // rest of the test (it is restored at the end)
            await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                scratch.debounceCalls = 0;
                scratch.originalDebounce = app.bodyView._debounceUpdatePixelmapValues;
                app.bodyView._debounceUpdatePixelmapValues = () => {
                    scratch.debounceCalls += 1;
                };
            });
            const result = await callOverlayHandler(page, 'mouseClickOverlay', {
                index: 0,
                mouse: {
                    buttonsDown: {
                        left: true
                    },
                    modifiers: {}
                }
            });
            expect(result.layerData[0]).toBe(0);
            expect(result.layerData[1]).toBe(0);
            expect(result.draw).toBeGreaterThan(0);
            expect(result.debounce).toBeGreaterThan(0);
        });

        await test.step('allows click shift and drag', async () => {
            const result = await callOverlayHandler(page, 'mouseOverOverlay', {
                index: 1,
                mouse: {
                    buttons: {
                        left: true
                    },
                    modifiers: {
                        shift: true
                    }
                }
            });
            expect(result.layerData[0]).toBe(0);
            expect(result.layerData[1]).toBe(0);
            expect(result.draw).toBeGreaterThan(0);
            expect(result.debounce).toBe(2);
        });

        await test.step('does nothing on left click if no draw widget', async () => {
            await evalApp(page, (app) => app.bodyView._removeDrawWidget());
            const result = await callOverlayHandler(page, 'mouseClickOverlay', {
                index: 0,
                mouse: {
                    buttonsDown: {
                        left: true
                    },
                    modifiers: {}
                }
            });
            expect(result.layerData[0]).toBe(1);
            expect(result.layerData[1]).toBe(1);
            expect(result.draw).toBe(0);
            expect(result.debounce).toBe(2);
        });

        await test.step('does nothing on click and drag if no draw widget', async () => {
            const result = await callOverlayHandler(page, 'mouseOverOverlay', {
                index: 1,
                mouse: {
                    buttons: {
                        left: true
                    },
                    modifiers: {
                        shift: true
                    }
                }
            });
            expect(result.layerData[0]).toBe(1);
            expect(result.layerData[1]).toBe(1);
            expect(result.draw).toBe(0);
            expect(result.debounce).toBe(2);
        });

        await test.step('opens context menu for right click', async () => {
            const queueCalls = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                scratch.pixelmapElement.set('values', [1, 1, 1, 1, 1, 1, 1, 1]);
                let layerData = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
                const clickEvent = {
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
                const mockLayer = {
                    data(newData?: number[]) {
                        if (newData) {
                            layerData = newData;
                        }
                        return layerData;
                    },
                    indexModified() {
                        return mockLayer;
                    },
                    draw() {
                        return null;
                    }
                };
                // spy on _queueMouseClickAction
                const original = bodyView._queueMouseClickAction;
                let calls = 0;
                bodyView._queueMouseClickAction = function (...args: unknown[]) {
                    calls += 1;
                    return original.apply(this, args);
                };
                try {
                    bodyView.mouseClickOverlay(scratch.pixelmapElement, mockLayer, clickEvent);
                } finally {
                    bodyView._queueMouseClickAction = original;
                }
                return calls;
            });
            expect(queueCalls).toBeGreaterThan(0);
            await waitForAppCondition(page, (app) => app.bodyView._pixelmapContextMenuActive === true);
            await expect(page.locator('#h-pixelmap-context-menu')).not.toHaveClass(/\bhidden\b/);
        });

        // restore the stubbed method
        await evalApp(page, (app) => {
            const scratch = (window as any).__huiTest;
            app.bodyView._debounceUpdatePixelmapValues = scratch.originalDebounce;
        });
    });
});
