import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {login, waitForIdlePage} from '../util';
import {rest, setupResources} from '../hui';

// girderUI.spec.ts checks that the item view has the Open HistomicsUI and
// Quarantine buttons with the default settings; this checks that the button
// reflects the configured brand name and webroot path.

test.describe('Girder item view with a brand name and webroot path', () => {
    setupServer();

    const brandName = 'TestBrandName';
    const webRootPath = 'TestRootPath';

    test('the Open HistomicsUI button uses the brand name and webroot path', async ({page}) => {
        const resources = await setupResources(page);
        await login(page, 'admin');

        await test.step('change the HistomicsUI settings', async () => {
            await page.locator('a.g-nav-link[g-target="admin"]').click();
            await page.locator('.g-plugins-config').click();
            const configLink = page.locator('.g-plugin-config-link[g-route="plugins/histomicsui/config"]');
            await expect(configLink).toBeVisible();
            await configLink.click();
            await expect(page.locator('#g-hui-form input').first()).toBeVisible();
            await waitForIdlePage(page);

            await page.locator('#g-hui-webroot-path').fill(webRootPath);
            await page.locator('#g-hui-brand-name').fill(brandName);
            await page.locator('.g-hui-buttons .btn-primary').click();
            await expect.poll(async () => {
                const settings = await rest(page, 'histomicsui/settings', {token: resources.adminToken});
                return [settings['histomicsui.brand_name'], settings['histomicsui.webroot_path']];
            }, {message: 'HistomicsUI settings to change'}).toEqual([brandName, webRootPath]);
            await waitForIdlePage(page);
        });

        await test.step('go to user item', async () => {
            await page.locator('a.g-nav-link[g-target="users"]').click();
            await page.locator('a.g-user-link').last().click();
            await page.locator('a.g-folder-list-link', {hasText: 'Public'}).click();
            await page.locator('a.g-item-list-link', {hasText: /^\s*image\s*$/}).click();
            await expect(page.locator('.g-item-actions-button')).toBeVisible();
            await waitForIdlePage(page);
            await page.locator('.g-item-actions-button').click();
            await expect(page.locator('.g-item-actions-menu')).toBeVisible();
        });

        await test.step('has a Open HistomicsUI button with TestBrandName', async () => {
            await expect(page.locator('.g-hui-open-item')).toHaveCount(1);
            await expect(page.locator('.g-hui-open-item')).toContainText(brandName);
        });

        await test.step('has a Open HistomicsUI button with link to webRootPath', async () => {
            await expect(page.locator('.g-hui-open-item')).toHaveAttribute(
                'href', new RegExp(`${webRootPath}#\\?image=${resources.imageId}`));
        });

        await test.step('has a Quarantine Item button', async () => {
            await expect(page.locator('.g-hui-quarantine-item')).toHaveCount(1);
        });
    });
});
