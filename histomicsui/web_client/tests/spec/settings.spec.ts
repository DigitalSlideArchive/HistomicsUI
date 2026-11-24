import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {login, waitForDialog, waitForIdlePage} from '../util';
import {rest, setupResources} from '../hui';

/**
 * Navigate from the Girder web client to the HistomicsUI plugin settings
 * page through the admin console, as an admin user.
 */
const gotoPluginSettings = async (page: Page) => {
    await page.locator('a.g-nav-link[g-target="admin"]').click();
    await page.locator('.g-plugins-config').click();
    const configLink = page.locator('.g-plugin-config-link[g-route="plugins/histomicsui/config"]');
    await expect(configLink).toBeVisible();
    await configLink.click();
    await expect(page.locator('#g-hui-form input').first()).toBeVisible();
    await waitForIdlePage(page);
};

test.describe('HistomicsUI plugin settings', () => {
    setupServer();

    test('change the HistomicsUI settings', async ({page}) => {
        const resources = await setupResources(page);
        const styles = [{lineWidth: 8, id: 'Sample Group'}];

        await login(page, 'admin');
        await gotoPluginSettings(page);

        await test.step('save a default draw style', async () => {
            await page.locator('#g-hui-default-draw-styles').fill(JSON.stringify(styles));
            await page.locator('.g-hui-buttons .btn-primary').click();
            await expect.poll(async () => {
                const settings = await rest(page, 'system/setting', {
                    token: resources.adminToken,
                    params: {list: JSON.stringify(['histomicsui.default_draw_styles'])}
                });
                return settings && settings['histomicsui.default_draw_styles'] && JSON.parse(settings['histomicsui.default_draw_styles']);
            }, {message: 'HistomicsUI settings to change'}).toEqual(styles);
            await waitForIdlePage(page);
        });

        await test.step('an invalid draw style is rejected', async () => {
            await page.locator('#g-hui-default-draw-styles').fill('not a json list');
            await page.locator('.g-hui-buttons .btn-primary').click();
            await expect(page.locator('#g-hui-error-message')).toContainText('must be a JSON list');
        });

        await test.step('the default color buttons restore the defaults', async () => {
            await page.locator('#g-hui-brand-color').fill('#ffffff');
            await expect(page.locator('#g-hui-brand-color')).toHaveValue('#ffffff');
            await page.locator('#g-hui-brand-default-color').click();
            await expect(page.locator('#g-hui-brand-color')).toHaveValue('#777777');
            await page.locator('#g-hui-banner-color').fill('#ffffff');
            await expect(page.locator('#g-hui-banner-color')).toHaveValue('#ffffff');
            await page.locator('#g-hui-banner-default-color').click();
            await expect(page.locator('#g-hui-banner-color')).toHaveValue('#f8f8f8');
        });

        await test.step('select a quarantine folder with the browser', async () => {
            await page.locator('.g-open-browser').click();
            await waitForDialog(page);
            // The second option of the root selector is the admin's home.
            await page.locator('#g-root-selector').selectOption({index: 1});
            const folders = page.locator('#g-dialog-container .g-folder-list-link');
            await expect(folders).toHaveCount(2);
            const folderName = (await folders.first().innerText()).trim();
            await folders.first().click();
            await expect(page.locator('#g-selected-model')).not.toHaveValue('');
            await page.locator('#g-dialog-container .g-submit-button').click();
            await expect(page.locator('#g-dialog-container')).toBeHidden();
            await waitForIdlePage(page);
            // The input gets the folder id, then the resource path is added.
            await expect(page.locator('#g-hui-quarantine-folder')).toHaveValue(
                new RegExp(`^[a-f0-9]{24} \\(/user/admin/${folderName}\\)$`));
        });

        await test.step('cancel returns to the plugins page', async () => {
            await page.locator('.g-hui-buttons #g-hui-cancel').click();
            await expect(page.locator('.g-plugin-config-link').first()).toBeVisible();
            await waitForIdlePage(page);
            // Cancelling does not save the quarantine folder.
            const settings = await rest(page, 'system/setting', {
                token: resources.adminToken,
                params: {list: JSON.stringify(['histomicsui.quarantine_folder'])}
            });
            expect(settings['histomicsui.quarantine_folder']).toBeFalsy();
        });
    });
});
