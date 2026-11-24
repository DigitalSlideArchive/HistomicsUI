import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog} from '../util';
import {evalApp, gotoHistomics, huiLogin, openImage, rest, setupResources, simulateMapEvent} from '../hui';

/**
 * Ported from tests/web_client_specs/annotationSpec.js, the 'Download view
 * and region of interest' describe.
 */
test.describe('Download view and region of interest', () => {
    setupServer();

    test('download the view and a region of interest', async ({page}) => {
        const resources = await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');

        await test.step('check href attribute of \'Download View\' link', async () => {
            // keep the browser from following the download link
            await page.evaluate(() => {
                document.getElementById('download-view-link')?.addEventListener('click', (event) => event.preventDefault());
            });
            await page.locator('.h-download-button-view').click();
            await expect(page.locator('#download-view-link')).toHaveAttribute(
                'href',
                /\/item\/[0-9a-f]{24}\/tiles\/region\?width=[0-9-]+&height=[0-9-]+&left=[0-9-]+&top=[0-9-]+&right=[0-9-]+&bottom=[0-9-]+&contentDisposition=attachment/);
        });

        await test.step('open the download dialog', async () => {
            await page.locator('.h-download-button-area').click();
            await simulateMapEvent(page, 'mousedown', {map: {x: 100, y: 100}, button: 'left'});
            await simulateMapEvent(page, 'mousemove', {map: {x: 200, y: 200}, button: 'left'});
            await simulateMapEvent(page, 'mouseup', {map: {x: 200, y: 200}, button: 'left'});
            await waitForDialog(page);
            await expect(page.locator('.modal-title')).toHaveText('Edit Area');
        });

        await test.step('test modifying form elements', async () => {
            const fields = ['#h-element-width', '#h-element-height', '#h-nb-pixel', '#h-size-file'];
            const oldSettings: string[] = [];
            for (const field of fields) {
                oldSettings.push(await page.locator(field).inputValue());
            }
            await page.locator('#h-element-mag').fill('10');
            await page.locator('#h-element-mag').dispatchEvent('change');
            // Check all the setting labels change
            for (let i = 0; i < fields.length; i += 1) {
                await expect(page.locator(fields[i])).not.toHaveValue(oldSettings[i]);
            }
            const sizeBefore = await page.locator('#h-size-file').inputValue();
            await page.locator('#h-download-image-format').selectOption('TIFF');
            // Check the size label change
            await expect(page.locator('#h-size-file')).not.toHaveValue(sizeBefore);
        });

        await test.step('ensure the download link is correct', async () => {
            await expect(page.locator('#h-download-area-link')).toHaveAttribute(
                'href',
                /\/item\/[0-9a-f]{24}\/tiles\/region\?regionWidth=[0-9-]+&regionHeight=[0-9-]+&left=[0-9-]+&top=[0-9-]+&right=[0-9-]+&bottom=[0-9-]+&encoding=[EFGIJNPT]{3,4}&contentDisposition=attachment&magnification=[0-9-]+/);
        });

        await test.step('close the dialog', async () => {
            await page.evaluate(() => {
                // @ts-ignore
                window.girder.$('#g-dialog-container').girderModal('close');
            });
            await expect(page.locator('body.modal-open')).toHaveCount(0);
            await expect(page.locator('#g-dialog-container')).toBeHidden();
        });

        await test.step('respects the showDownload setting', async () => {
            // The old test stubbed app.showDownload; here the core setting
            // that feeds it is changed and the app reloaded.
            await expect(page.locator('.h-download-button-container')).toHaveCount(1);
            expect(await evalApp(page, (app) => app.showDownload())).toBe(true);

            await rest(page, 'system/setting', {
                method: 'PUT',
                token: resources.adminToken,
                form: {key: 'core.show_download', value: 'none'}
            });
            await gotoHistomics(page, {image: imageId});
            await expect(page.locator('.h-zoom-slider')).toBeVisible();
            await expect(page.locator('.h-zoom-buttons')).toBeVisible();
            expect(await evalApp(page, (app) => app.showDownload())).toBe(false);
            await expect(page.locator('.h-download-button-container')).toHaveCount(0);

            await rest(page, 'system/setting', {
                method: 'PUT',
                token: resources.adminToken,
                form: {key: 'core.show_download', value: 'all'}
            });
            await gotoHistomics(page, {image: imageId});
            await expect(page.locator('.h-zoom-slider')).toBeVisible();
            await expect(page.locator('.h-download-button-container')).toHaveCount(1);
        });
    });
});
