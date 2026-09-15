import { test, expect } from '@playwright/test';

import { createUser, login, uploadSampleFile } from '../util';
import { setupServer } from '../server';

test.describe('Test zoom widget', () => {
  setupServer();

  test('Zoom widget shows a download button when viewing an image', async ({ page }) => {
    await createUser(page);
    await page.locator('#g-app-header-container').getByText('firstlast').click();
    await page.locator('a.g-my-folders').click();
    await page.getByRole('link', { name: ' Private ' }).click();
    await uploadSampleFile(page, 'sample_svs_image.TCGA-DU-6399-01A-01-TS1.e8eb65de-d63e-42db-af6f-14fefbbdf7bd.svs');

    const thumbnail = page.locator('.large_image_thumbnail>img.loaded');
    await thumbnail.waitFor({ state: 'visible' });

    await page.locator('a.g-item-list-link[title="Name"]').click();
    await expect(page).toHaveURL(/#item\//);
    const itemId = page.url().split('#item/')[1];

    await page.goto(`${new URL(page.url()).origin}/histomics#?image=${itemId}`);

    await expect(page.locator('.h-download-button-view')).toBeVisible();
  });

  test('Zoom widget hides the download buttons but still renders when show_download is "none"', async ({ page }) => {
    await login(page, 'firstlast');
    await page.locator('#g-app-header-container').getByText('firstlast').click();
    await page.locator('a.g-my-folders').click();

    await page.getByRole('link', { name: ' Public ' }).click();
    await uploadSampleFile(page, 'sample_svs_image.TCGA-DU-6399-01A-01-TS1.e8eb65de-d63e-42db-af6f-14fefbbdf7bd.svs');

    const thumbnail = page.locator('.large_image_thumbnail>img.loaded');
    await thumbnail.waitFor({ state: 'visible' });

    await page.locator('a.g-item-list-link[title="Name"]').click();
    await expect(page).toHaveURL(/#item\//);
    const itemId = page.url().split('#item/')[1];

    const origin = new URL(page.url()).origin;
    // Girder's REST auth relies on a Girder-Token header rather than just the
    // session cookie, so use the page's own authenticated rest client instead
    // of a bare page.request call.
    await page.evaluate(() => (window as any).girder.rest.restRequest({
      url: 'system/setting',
      method: 'PUT',
      data: { key: 'core.show_download', value: 'none' },
    }));

    await page.goto(`${origin}/histomics#?image=${itemId}`);

    await expect(page.locator('.h-zoom-slider')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.h-download-button-view')).not.toBeVisible();
    await expect(page.locator('.h-download-button-area')).not.toBeVisible();
  });
});
