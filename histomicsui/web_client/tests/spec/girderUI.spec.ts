import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {login} from '../util';
import {setupResources} from '../hui';

test.describe('Girder item view integration', () => {
    setupServer();

    test('the item view has Open HistomicsUI and Quarantine buttons', async ({page}) => {
        await setupResources(page);
        await login(page, 'admin');

        await page.locator('a.g-nav-link[g-target="users"]').click();
        await page.locator('a.g-user-link').last().click();
        await page.locator('a.g-folder-list-link', {hasText: 'Public'}).click();
        await page.locator('a.g-item-list-link', {hasText: /^\s*image\s*$/}).click();
        await expect(page.locator('.g-item-actions-button')).toBeVisible();

        await expect(page.locator('.g-hui-open-item')).toHaveCount(1);
        await expect(page.locator('.g-hui-quarantine-item')).toHaveCount(1);
    });
});
