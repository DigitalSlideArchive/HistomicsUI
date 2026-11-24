import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog} from '../util';
import {evalApp, gotoHistomics, huiLogin, openImage, setupResources, simulateMapEvent} from '../hui';

// Ported from the 'Annotation styles' section of the Jasmine
// annotationSpec.js.

/**
 * Wait for all REST requests from the page to finish.
 */
const waitForRest = async (page: Page) => {
    await page.waitForFunction(() => {
        // @ts-ignore
        return window.girder.rest.numberOutstandingRestRequests() === 0;
    });
};

/**
 * Open the style group dialog from the draw panel.
 */
const openStyleGroupDialog = async (page: Page) => {
    await page.locator('.h-configure-style-group').click();
    await waitForDialog(page);
    await expect(page.locator('body')).toHaveClass(/modal-open/);
    await expect(page.locator('#g-dialog-container .h-group-name')).toBeVisible();
};

test.describe('Annotation styles', () => {
    setupServer();

    test('style groups', async ({page}) => {
        const dialog = page.locator('#g-dialog-container');
        const groupName = dialog.locator('.h-group-name');
        const styleGroup = page.locator('.h-draw-widget .h-style-group');

        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');

        await test.step('create a new annotation', async () => {
            await page.locator('.h-create-annotation').click();
            await waitForDialog(page);
            await expect(page.locator('#h-annotation-name')).toHaveCount(1);
            await page.locator('#h-annotation-name').fill('drawn 2');
            await dialog.locator('.h-submit').click();
            await expect(dialog).toBeHidden();
            await waitForRest(page);
            await expect(page.locator('.h-draw-widget')).not.toHaveClass(/hidden/);
            await expect(page.locator('.h-draw-widget .h-draw[data-type="point"]')).toBeVisible();
        });

        await test.step('open the style group dialog', async () => {
            await openStyleGroupDialog(page);
            // ensure the default style is created on load
            await expect(groupName).toHaveValue('default');
        });

        await test.step('test reset to defaults as a regular user', async () => {
            await dialog.locator('#h-element-line-width').fill('10');
            await dialog.locator('#h-reset-defaults').click();
            await expect(dialog.locator('#h-element-line-width')).toHaveValue('2');
            await expect(groupName).toHaveValue('default');
        });

        await test.step('create a new style group', async () => {
            await dialog.locator('.h-create-new-style').click();
            await dialog.locator('.h-new-group-name').fill('new');
            await dialog.locator('.h-save-new-style').click();
            await expect(groupName).toHaveValue('new');

            await dialog.locator('#h-element-line-width').fill('1');
            await dialog.locator('#h-element-line-color').fill('rgb(255,0,0)');
            // The color picker keeps the current alpha (0 for the default
            // fill) when a color is typed without one, so give it explicitly.
            await dialog.locator('#h-element-fill-color').fill('rgba(0,0,255,1)');
            await dialog.locator('.h-submit').click();
            await expect(dialog).toBeHidden();
            await expect(styleGroup).toHaveValue('new');
        });

        await test.step('draw a point', async () => {
            await page.locator('.h-draw[data-type="point"]').click();
            await expect(page.locator('.geojs-map.annotation-input').first()).toBeAttached();
            await simulateMapEvent(page, 'mousedown', {map: {x: 200, y: 200}, button: 'left'});
            await simulateMapEvent(page, 'mouseup', {map: {x: 200, y: 200}, button: 'left'});
            await expect.poll(() => evalApp(page, (app) => app.bodyView.drawWidget.collection.length)).toBe(1);
            const point = await evalApp(page, (app) => app.bodyView.drawWidget.collection.at(0).toJSON());
            expect(point.lineWidth).toBe(1);
            expect(point.lineColor).toBe('rgb(255, 0, 0)');
            expect(point.fillColor).toBe('rgb(0, 0, 255)');
            await waitForRest(page);
        });

        await test.step('change style group using keyboard shortcuts', async () => {
            // The shortcuts are handled by the image view for keys pressed
            // anywhere in it, including the draw panel.
            const pressInDrawWidget = async (key: string) => {
                await page.locator('.h-draw-widget .h-draw[data-type="point"]').focus();
                await page.keyboard.press(key);
            };
            // Pressing q should select the previous annotation group in the
            // list
            await pressInDrawWidget('q');
            await expect(styleGroup).toHaveValue('default');

            // Since the currently selected style group is the first one in
            // the list, pressing q should cause it to wrap around and select
            // the last style group in the list
            await pressInDrawWidget('q');
            await expect(styleGroup).toHaveValue('new');

            // Pressing w should select the next annotation group in the list
            await pressInDrawWidget('w');
            await expect(styleGroup).toHaveValue('default');

            // Since the currently selected style group is the last one in
            // the list, pressing w should cause it to wrap around and select
            // the first style group in the list
            await pressInDrawWidget('w');
            await expect(styleGroup).toHaveValue('new');
        });

        await test.step('open the style group dialog again', async () => {
            await openStyleGroupDialog(page);
            await expect(groupName).toHaveValue('new');
        });

        await test.step('delete a style group', async () => {
            await dialog.locator('.h-delete-style').click();
            await expect(groupName).toHaveValue('default');
            await dialog.locator('.h-submit').click();
            await expect(dialog).toBeHidden();
            await expect(styleGroup).toHaveValue('default');
        });
    });
});
