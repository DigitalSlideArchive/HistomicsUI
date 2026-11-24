import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog, waitForIdlePage} from '../util';
import {
    evalApp, gotoHistomics, huiLogin, openImage, pageRest, setupResources,
    simulateMapEvent, waitForAppCondition
} from '../hui';

// The tests in this file build on one another, so run them in order and, if
// one fails, retry them as a group on a fresh server.
test.describe.configure({mode: 'serial'});

/**
 * Ported from tests/web_client_specs/annotationSpec.js, the 'Draw panel'
 * describe.
 */

/**
 * Make assertions about the last autosaved annotation.  The autosaved
 * annotation is assumed to be the last annotation with the given name
 * returned by the `annotation` endpoint for the current user and image.
 *
 * The old test waited 100 ms before fetching so the save could land; here the
 * fetch is polled instead.
 */
const checkAutoSave = async (page: Page, imageId: string, annotationName: string, numberOfElements: number) => {
    await waitForIdlePage(page);
    const userId = await page.evaluate(() => {
        // @ts-ignore
        return window.girder.auth.getCurrentUser().id;
    });
    await expect.poll(async () => {
        const annotations = await pageRest(page, {url: 'annotation', data: {itemId: imageId, userId}}) as any[];
        const found = annotations.filter((a) => a.annotation.name === annotationName);
        if (!found.length) {
            return null;
        }
        const annotation = await pageRest(page, {url: `annotation/${found[found.length - 1]._id}`}) as any;
        return annotation.annotation.elements.length;
    }, {message: `autosaved annotation "${annotationName}" to have ${numberOfElements} elements`}).toBe(numberOfElements);
};

const clickMap = async (page: Page, x: number, y: number, modifiers?: string) => {
    const options: Record<string, unknown> = {map: {x, y}, button: 'left'};
    if (modifiers) {
        options.modifiers = modifiers;
    }
    await simulateMapEvent(page, 'mousedown', options);
    await simulateMapEvent(page, 'mouseup', options);
};

/* Send a keyboard shortcut to the image body, as the old tests did with a
 * jQuery keydown event. */
const pressOnImage = async (page: Page, key: string) => {
    await page.locator('.h-image-body').press(key);
};

const activeDrawButton = (page: Page) => page.locator('.h-draw.active');

const elements = (page: Page) => page.locator('.h-elements-container .h-element');

/* Elements are sorted lexically by label, so target elements by their label
 * rather than by position. */
const elementByLabel = (page: Page, label: string) => elements(page).filter({
    has: page.locator('.h-element-label', {hasText: new RegExp(`^${label}$`)})
});

const createAnnotation = async (page: Page, name: string) => {
    await page.locator('.h-create-annotation').click();
    await waitForDialog(page);
    await expect(page.locator('#h-annotation-name')).toHaveCount(1);
    await page.locator('#h-annotation-name').fill(name);
    await page.locator('#g-dialog-container .h-submit').click();
    await waitForIdlePage(page);
    await expect(page.locator('.h-draw-widget')).not.toHaveClass(/\bhidden\b/);
};

/* Expand all collapsed annotation groups in the annotation selector. */
const expandAnnotationGroups = async (page: Page) => {
    await expect.poll(() => evalApp(page, (app) => {
        const collapsed = app.bodyView.$('.h-annotation-selector .h-group-collapsed .h-annotation-group-name');
        if (collapsed.length) {
            collapsed.first().click();
            return false;
        }
        return true;
    })).toBe(true);
};

const annotationInList = (page: Page, name: string) => page.locator('.h-annotation-selector .h-annotation').filter({
    has: page.locator('.h-annotation-name', {hasText: new RegExp(`^${name}$`)})
});

/* Count refreshes of the annotation list (g:changed on the annotation
 * collection) in the page. */
const startCountingRefreshes = async (page: Page) => {
    await evalApp(page, (app) => {
        // @ts-ignore
        window.__refreshes = 0;
        // @ts-ignore
        window.__countRefresh = () => { window.__refreshes += 1; };
        // @ts-ignore
        app.bodyView.annotations.on('g:changed', window.__countRefresh);
    });
};

const stopCountingRefreshes = async (page: Page) => {
    await evalApp(page, (app) => {
        // @ts-ignore
        app.bodyView.annotations.off('g:changed', window.__countRefresh);
    });
};

const getRefreshes = (page: Page) => page.evaluate(() => {
    // @ts-ignore
    return window.__refreshes as number;
});

/* Send a notification that asks to refresh the annotation list. */
const triggerAnnotationRefresh = async (page: Page) => {
    await evalApp(page, (app) => {
        // @ts-ignore
        window.girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
            data: {itemId: app.bodyView.annotationSelector.parentItem.id}
        });
    });
};

const waitForDrawMode = async (page: Page) => {
    await expect(page.locator('.geojs-map.annotation-input')).toBeAttached();
};

const annotationLayerMode = (page: Page) => evalApp(page, (app) => app.bodyView.viewerWidget.annotationLayer.mode());

const openHotkeysDialog = async (page: Page) => {
    await page.locator('.h-user-dropdown-link').click();
    await page.locator('a.h-edit-hotkeys').click();
    await waitForDialog(page);
    await expect(page.locator('.h-hotkey-row[data-action="draw.rectangle"]')).toBeAttached();
};

const hotkeyRow = (page: Page, action: string) => page.locator(`.h-hotkey-row[data-action="${action}"]`);

test.describe('Draw panel', () => {
    setupServer();

    test('draw, edit, and delete point elements', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');

        await test.step('create a new annotation', async () => {
            await createAnnotation(page, 'drawn 1');
        });

        await test.step('draw a point', async () => {
            await page.locator('.h-draw[data-type="point"]').click();
            await waitForDrawMode(page);
            await clickMap(page, 100, 100);
            await expect(elements(page)).toHaveCount(1);
            await expect(elements(page).locator('.h-element-label')).toHaveText('default point 1');
            await expect(page.locator('.h-draw[data-type="point"]')).toHaveClass(/\bactive\b/);
            // turn off point drawing.
            await page.locator('.h-draw[data-type="point"]').click();
            await expect(page.locator('.h-draw[data-type="point"]')).not.toHaveClass(/\bactive\b/);
            await checkAutoSave(page, imageId, 'drawn 1', 1);
        });

        await test.step('edit a point element', async () => {
            await elements(page).locator('.h-edit-element').click();
            await waitForDialog(page);
            await expect(page.locator('#g-dialog-container .modal-title')).toHaveText('Edit annotation');
            await page.locator('#g-dialog-container #h-element-label').fill('test');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(elements(page).locator('.h-element-label')).toHaveText('test');
        });

        await test.step('keep element edits when the annotation list refreshes while editing', async () => {
            const annotationId = await evalApp(page, (app) => app.bodyView.annotationSelector._activeAnnotation.id);
            await startCountingRefreshes(page);
            await elements(page).locator('.h-edit-element').click();
            await waitForDialog(page);
            await triggerAnnotationRefresh(page);
            await page.waitForFunction(() => {
                // @ts-ignore
                return window.girder.rest.numberOutstandingRestRequests() === 0;
            });
            expect(await getRefreshes(page)).toBe(0);
            await page.locator('#g-dialog-container #h-element-label').fill('edited during a refresh');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            // the refresh happens once the dialog is closed
            await expect.poll(() => getRefreshes(page), {message: 'annotation list to refresh'}).toBeGreaterThan(0);
            await waitForIdlePage(page);
            await stopCountingRefreshes(page);
            const resp = await pageRest(page, {url: `annotation/${annotationId}`}) as any;
            const labels = resp.annotation.elements.map((element: any) => (element.label || {}).value);
            await expect(elements(page).locator('.h-element-label')).toHaveText('edited during a refresh');
            expect(labels).toEqual(['edited during a refresh']);
            // restore the label for the following tests
            await elements(page).locator('.h-edit-element').click();
            await waitForDialog(page);
            await page.locator('#g-dialog-container #h-element-label').fill('test');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(elements(page).locator('.h-element-label')).toHaveText('test');
        });

        await test.step('keep shape edits when the annotation list refreshes while editing', async () => {
            await startCountingRefreshes(page);
            const {annotationId, original} = await evalApp(page, (app) => {
                const bodyView = app.bodyView;
                const annotationId = bodyView.annotationSelector._activeAnnotation.id;
                const element = bodyView.annotations.get(annotationId).elements().at(0);
                const original = element.get('center').slice();
                bodyView._editElementShape(element, annotationId);
                return {annotationId, original};
            });
            expect(await annotationLayerMode(page)).toBe('edit');
            await triggerAnnotationRefresh(page);
            await page.waitForFunction(() => {
                // @ts-ignore
                return window.girder.rest.numberOutstandingRestRequests() === 0;
            });
            expect(await getRefreshes(page)).toBe(0);
            expect(await annotationLayerMode(page)).toBe('edit');
            // move the point and finish editing
            const moved = [original[0] + 50, original[1] + 25, original[2]];
            await evalApp(page, (app, moved) => {
                const map = app.bodyView.viewer;
                const layer = app.bodyView.viewerWidget.annotationLayer;
                // @ts-ignore
                const geo = window.geo;
                layer.annotations()[0].options('position', geo.transform.transformCoordinates(
                    map.ingcs(), map.gcs(), {x: moved[0], y: moved[1]}));
                layer.annotations()[0].state(geo.annotation.state.done);
            }, moved);
            // the refresh happens once the shape is no longer being edited
            await expect.poll(() => getRefreshes(page), {message: 'annotation list to refresh'}).toBeGreaterThan(0);
            await waitForIdlePage(page);
            await stopCountingRefreshes(page);
            const resp = await pageRest(page, {url: `annotation/${annotationId}`}) as any;
            const centers = resp.annotation.elements.map((element: any) => element.center);
            expect(centers).toHaveLength(1);
            expect(centers[0][0]).toBeCloseTo(moved[0], 3);
            expect(centers[0][1]).toBeCloseTo(moved[1], 3);
            const currentCenter = await evalApp(page, (app, annotationId) =>
                app.bodyView.annotations.get(annotationId).elements().at(0).get('center'), annotationId);
            expect(currentCenter[0]).toBeCloseTo(moved[0], 3);
            // a later refresh is not deferred
            await startCountingRefreshes(page);
            await triggerAnnotationRefresh(page);
            await expect.poll(() => getRefreshes(page), {message: 'annotation list to refresh again'}).toBeGreaterThan(0);
            await waitForIdlePage(page);
            await stopCountingRefreshes(page);
            // restore the location for the following tests
            await evalApp(page, (app, arg) => {
                app.bodyView.annotations.get(arg.annotationId).elements().at(0).set('center', arg.original);
            }, {annotationId, original});
            await waitForIdlePage(page);
        });

        await test.step('draw another point', async () => {
            await page.locator('.h-draw[data-type="point"]').click();
            await waitForDrawMode(page);
            await clickMap(page, 200, 200);
            await expect(elements(page)).toHaveCount(2);
            await expect(elementByLabel(page, 'default point 2')).toHaveCount(1);
            await checkAutoSave(page, imageId, 'drawn 1', 2);
        });

        await test.step('delete the second point', async () => {
            await elementByLabel(page, 'default point 2').locator('.h-delete-element').click();
            await expect(elements(page)).toHaveCount(1);
            await checkAutoSave(page, imageId, 'drawn 1', 1);
        });

        await test.step('draw another point after switching from line mode', async () => {
            await page.locator('.h-draw[data-type="line"]').click();
            await page.locator('.h-draw[data-type="point"]').click();
            await waitForDrawMode(page);
            await clickMap(page, 100, 100);
            await expect(elements(page)).toHaveCount(2);
            await expect(elementByLabel(page, 'default point 2')).toHaveCount(1);
            await checkAutoSave(page, imageId, 'drawn 1', 2);
        });

        await test.step('modify the location of the last point', async () => {
            await simulateMapEvent(page, 'mousemove', {map: {x: 100, y: 100}});
            await pressOnImage(page, 'e');
            await expect.poll(() => annotationLayerMode(page), {message: 'annotation to be in edit mode'}).toBe('edit');
            await clickMap(page, 150, 100);
            await expect.poll(() => annotationLayerMode(page), {message: 'annotation to not be in edit mode'}).not.toBe('edit');
        });

        await test.step('delete the last point', async () => {
            await elementByLabel(page, 'default point 2').locator('.h-delete-element').click();
            await expect(elements(page)).toHaveCount(1);
            // reset the draw state
            await page.locator('.h-draw[data-type="line"]').click();
            await page.locator('.h-draw[data-type="point"]').click();
            await expect(page.locator('.h-draw[data-type="point"]')).toHaveClass(/\bactive\b/);
        });

        await test.step('check that the drawing type persists when switching annotations', async () => {
            await expandAnnotationGroups(page);
            await expect(page.locator('button.h-draw[data-type="point"]')).toHaveClass(/\bactive\b/);
            await createAnnotation(page, 'drawn b');
            // expect that the drawing type is the same as before
            await expect(page.locator('button.h-draw[data-type="point"]')).toHaveClass(/\bactive\b/);
            await expandAnnotationGroups(page);
            await expect(annotationInList(page, 'drawn b')).toHaveCount(1);

            // delete the annotation we just created.
            await annotationInList(page, 'drawn b').locator('.h-delete-annotation').click();
            await waitForDialog(page);
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(annotationInList(page, 'drawn b')).toHaveCount(0);
            // select the original annotation
            await expect(annotationInList(page, 'drawn 1').locator('.h-annotation-name')).toHaveCount(1);
            await annotationInList(page, 'drawn 1').locator('.h-annotation-name').click();
            await expect(page.locator('.h-draw-widget')).not.toHaveClass(/\bhidden\b/);
            await waitForIdlePage(page);
            // expect that the drawing type is the same as before
            await expect(page.locator('button.h-draw[data-type="point"]')).toHaveClass(/\bactive\b/);
        });
    });

    test('boolean polygon and brush operations', async ({page}) => {
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await createAnnotation(page, 'drawn 2');

        await test.step('test a boolean polygon operation', async () => {
            const annotCount = await elements(page).count();
            await page.locator('.h-draw[data-type="rectangle"]').click();
            await waitForDrawMode(page);
            await clickMap(page, 100, 100);
            await clickMap(page, 200, 200);
            await expect(elements(page)).toHaveCount(annotCount + 1);
            await waitForIdlePage(page);
            await waitForDrawMode(page);
            await clickMap(page, 210, 100);
            await clickMap(page, 300, 200);
            await expect(elements(page)).toHaveCount(annotCount + 2);
            await waitForIdlePage(page);
            await waitForDrawMode(page);
            // move the mouse with shift held until the union mode is shown
            let toggle = 0;
            await expect.poll(async () => {
                toggle = toggle ? 0 : 1;
                await simulateMapEvent(page, 'mousemove', {map: {x: 140 + toggle, y: 110}, button: 'left', modifiers: 'shift'});
                return page.locator('.geojs-map.annotation-union').count();
            }, {message: 'boolean mode to be active'}).toBeGreaterThan(0);
            await clickMap(page, 150, 110, 'shift');
            await clickMap(page, 250, 210);
            // two annotations merge into one
            await expect(elements(page)).toHaveCount(annotCount + 1);
        });

        await test.step('test a brush operation', async () => {
            const annotCount = await elements(page).count();
            await page.locator('.h-draw[data-type="brush"]').click();
            const brushReady = (app: any) => app.bodyView.viewerWidget.annotationLayer.annotations().length === 1;
            await waitForAppCondition(page, brushReady, undefined, 'brush mode to activate');
            await simulateMapEvent(page, 'mousemove', {map: {x: 90, y: 100}});
            await simulateMapEvent(page, 'mousemove', {map: {x: 95, y: 100}});
            await clickMap(page, 100, 100);
            await expect(elements(page)).toHaveCount(annotCount + 1);
            await waitForIdlePage(page);
            await waitForAppCondition(page, brushReady, undefined, 'brush mode to activate again');
            await simulateMapEvent(page, 'mousemove', {map: {x: 200, y: 100}});
            await clickMap(page, 210, 100);
            await simulateMapEvent(page, 'mousedown', {map: {x: 140, y: 110}, button: 'left'});
            await simulateMapEvent(page, 'mousemove', {map: {x: 180, y: 110}, button: 'left'});
            await simulateMapEvent(page, 'mouseup', {map: {x: 200, y: 110}, button: 'left'});
            await waitForIdlePage(page);
            await waitForAppCondition(page, brushReady, undefined, 'brush mode to be active after the stroke');
            // the strokes merge into one element
            await expect(elements(page)).toHaveCount(annotCount + 1);
        });
    });

    test('keyboard shortcuts', async ({page}) => {
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await createAnnotation(page, 'drawn 3');

        await test.step('check that keyboard shortcuts behave correctly', async () => {
            // expect that hitting keyboard shortcut for each shape will
            // switch the annotation mode to it, and hitting it again will
            // turn off drawing mode.
            for (const [key, type] of [
                ['r', 'rectangle'], ['o', 'point'], ['c', 'circle'], ['i', 'ellipse'], ['p', 'polygon'], ['l', 'line']
            ]) {
                await pressOnImage(page, key);
                await expect(activeDrawButton(page)).toHaveAttribute('data-type', type);
                await pressOnImage(page, key);
                await expect(activeDrawButton(page)).toHaveCount(0);
            }
        });

        await test.step('rebind draw rectangle to x', async () => {
            await openHotkeysDialog(page);
            await expect(hotkeyRow(page, 'draw.rectangle').locator('kbd')).toHaveText('R');
            // Enter in the filter must not submit the form
            const enterPrevented = await page.evaluate(() => {
                // @ts-ignore
                const $ = window.girder.$;
                const enter = $.Event('keydown', {key: 'Enter'});
                $('.h-hotkeys-filter').trigger(enter);
                return enter.isDefaultPrevented();
            });
            expect(enterPrevented).toBe(true);
            await hotkeyRow(page, 'draw.rectangle').locator('.h-hotkey-change').click();
            await expect(page.locator('.h-hotkey-capturing')).toHaveCount(1);
            // the dialog listens with a native capture listener
            await page.keyboard.press('x');
            await expect(hotkeyRow(page, 'draw.rectangle').locator('kbd')).toHaveText('X');
            await expect(hotkeyRow(page, 'draw.rectangle').locator('.h-hotkey-source')).toHaveText('custom');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);

            await expect(page.locator('button.h-draw[data-type="rectangle"]')).toHaveAttribute('title', 'Draw a new rectangle (keyboard shortcut: X)');
            await pressOnImage(page, 'x');
            await expect(activeDrawButton(page)).toHaveAttribute('data-type', 'rectangle');
            await pressOnImage(page, 'x');
            await expect(activeDrawButton(page)).toHaveCount(0);
            await pressOnImage(page, 'r');
            await expect(activeDrawButton(page)).toHaveCount(0);

            const userId = await page.evaluate(() => {
                // @ts-ignore
                return window.girder.auth.getCurrentUser().id;
            });
            const userConfig = await pageRest(page, {url: `user/${userId}/yaml_config/.histomicsui_user_config.yaml`}) as any;
            expect(userConfig.hotkeys).toEqual([{action: 'draw.rectangle', key: 'x'}]);
        });

        await test.step('reset all keyboard shortcuts', async () => {
            await openHotkeysDialog(page);
            const list = page.locator('.h-hotkeys-list');
            expect(await list.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
            await list.evaluate((node) => { node.scrollTop = 200; });
            await expect.poll(() => list.evaluate((node) => node.scrollTop)).toBe(200);
            // click through the app's jQuery so that the row is not scrolled
            // into view first; the scroll position must survive the re-render
            await evalApp(page, (app) => {
                app.$('.h-hotkey-row[data-action="layer.20"] .h-hotkey-clear').click();
            });
            await expect(hotkeyRow(page, 'layer.20').locator('kbd')).toHaveCount(0);
            expect(await list.evaluate((node) => node.scrollTop)).toBe(200);
            await evalApp(page, (app) => {
                app.$('.h-hotkey-row[data-action="layer.20"] .h-hotkey-change').click();
            });
            await expect(page.locator('.h-hotkey-capturing')).toHaveCount(1);
            await page.keyboard.press('x');
            await expect(page.locator('.h-hotkeys-message')).toHaveText('X was removed from "Draw a rectangle".');
            const footerBottom = await page.locator('.modal-footer').evaluate((node) => node.getBoundingClientRect().bottom);
            const innerHeight = await page.evaluate(() => window.innerHeight);
            expect(footerBottom).not.toBeGreaterThan(innerHeight);
            await page.locator('.h-hotkeys-reset-all').click();
            await expect(hotkeyRow(page, 'draw.rectangle').locator('kbd')).toHaveText('R');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);

            await expect(page.locator('button.h-draw[data-type="rectangle"]')).toHaveAttribute('title', 'Draw a new rectangle (keyboard shortcut: R)');
            await pressOnImage(page, 'r');
            await expect(activeDrawButton(page)).toHaveAttribute('data-type', 'rectangle');
            await pressOnImage(page, 'r');
            await expect(activeDrawButton(page)).toHaveCount(0);
        });
    });
});
