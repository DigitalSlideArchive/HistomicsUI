import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog, waitForIdlePage} from '../util';
import {gotoHistomics, huiLogin, openImage, setupResources} from '../hui';

test.describe('Metadata panel tests', () => {
    setupServer();

    test('add and edit metadata', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');

        const panel = page.locator('#h-metadata-panel');
        const keyValue = page.locator('.g-widget-metadata-header-key-value');
        const keyInput = page.locator('.g-widget-metadata-key-input');
        const valueInput = page.locator('.g-widget-metadata-value-input');
        const toggleButton = page.locator('.g-widget-metadata-toggle-button');
        const jsonEditor = page.locator('.g-json-editor');

        await test.step('No metadata to start', async () => {
            await expect(panel).toBeVisible();
            await expect(keyValue).toHaveCount(0);
        });

        await test.step('Expand the panel and add some simple metadata', async () => {
            await panel.locator('.s-panel-title-container .icon-down-open').click();
            await expect(panel.locator('.s-panel-content')).toHaveClass(/\bin\b/);
            await expect(panel.locator('.s-panel-controls .icon-up-open')).toHaveCount(1);

            const addSimple = page.locator('.g-add-simple-metadata');
            await expect(addSimple).toBeHidden();
            await page.locator('.g-widget-metadata-add-button').click();
            await expect(addSimple).toBeVisible();
            await addSimple.click();
            await expect(keyInput).toHaveCount(1);
            await expect(keyInput).toBeVisible();
            await keyInput.fill('Key');
            await valueInput.fill('Value');
            await page.locator('.g-widget-metadata-save-button').click();

            await expect(keyValue).toHaveCount(1);
            await expect(page.locator('.g-widget-metadata-row .g-widget-metadata-key')).toHaveText('Key');
            await expect(page.locator('.g-widget-metadata-row .g-widget-metadata-value')).toHaveText('Value');
        });

        await test.step('edit metadata', async () => {
            await page.locator('.g-widget-metadata-edit-button').click();
            await expect(toggleButton).toHaveCount(1);
            // 'Value' is not valid JSON, so the editor can't be converted
            await toggleButton.click();
            await expect(jsonEditor).toHaveCount(0);
            await valueInput.fill('["Value"]');
            await toggleButton.click();
            await expect(jsonEditor).toHaveCount(1);
            await toggleButton.click();
            await expect(jsonEditor).toHaveCount(0);
            await page.locator('.g-widget-metadata-save-button').click();
            await expect(jsonEditor).toHaveCount(0);
            await expect(page.locator('.g-widget-metadata-save-button')).toHaveCount(0);
            await waitForIdlePage(page);
            await expect(page.locator('.g-widget-metadata-row .g-widget-metadata-key')).toHaveText('Key');
        });

        await test.step('cancel edit', async () => {
            await page.locator('.g-widget-metadata-edit-button').click();
            await expect(toggleButton).toHaveCount(1);
            await page.locator('.g-widget-metadata-cancel-button').click();
            await expect(jsonEditor).toHaveCount(0);
            await expect(toggleButton).toHaveCount(0);
        });

        await test.step('delete', async () => {
            await page.locator('.g-widget-metadata-edit-button').click();
            await expect(toggleButton).toHaveCount(1);
            await page.locator('.g-widget-metadata-delete-button').click();
            await waitForDialog(page);
            await page.locator('#g-confirm-button').click();
            await waitForIdlePage(page);
            await expect(jsonEditor).toHaveCount(0);
            await expect(keyValue).toHaveCount(0);
            await expect(page.locator('.g-widget-metadata-row')).toHaveCount(0);
        });
    });
});
