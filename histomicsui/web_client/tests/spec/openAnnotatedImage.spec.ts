import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog} from '../util';
import {evalApp, gotoHistomics, huiLogin, openImage, pageRest, setupResources} from '../hui';

// Ported from the 'Open recently annotated image' section of the Jasmine
// annotationSpec.js.

const rectangle = (x: number, y: number) => ({
    type: 'rectangle',
    center: [x, y, 0],
    width: 50,
    height: 40,
    rotation: 0,
    lineColor: 'rgb(0,0,0)'
});

/**
 * Create an annotation on an item as the user logged in to the page.
 */
const createAnnotation = async (page: Page, itemId: string, name: string) => {
    return pageRest(page, {
        url: `annotation?itemId=${itemId}`,
        method: 'POST',
        contentType: 'application/json',
        data: {name, elements: [rectangle(100, 100), rectangle(300, 200)]}
    });
};

/**
 * Wait for the next response of the annotated image list endpoint and resolve
 * with the query parameters it was requested with.
 */
const nextImageListQuery = async (page: Page, trigger: () => Promise<unknown>) => {
    const [response] = await Promise.all([
        page.waitForResponse((resp) => resp.url().includes('/api/v1/annotation/images')),
        trigger()
    ]);
    expect(response.ok()).toBe(true);
    return new URL(response.url()).searchParams;
};

test.describe('Open recently annotated image', () => {
    setupServer();

    test('open the dialog, filter the image list, and open an image', async ({page}) => {
        const resources = await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');
        expect(imageId).toBe(resources.imageId);

        // The Jasmine tests had drawn annotations as the user on 'image' by
        // this point; create them directly so that the dialog lists both
        // images (the admin annotation on 'image' comes from setupResources).
        await createAnnotation(page, resources.imageId, 'drawn 2');
        await createAnnotation(page, resources.copyId, 'drawn on copy');

        const imageEntry = page.locator(`.h-annotated-image[data-id="${imageId}"]`);
        const creatorSelect = page.locator('#h-annotation-creator');
        const nameInput = page.locator('#h-image-name');

        await test.step('open the dialog', async () => {
            await page.locator('.h-open-annotated-image').click();
            await waitForDialog(page);
            await expect(imageEntry).toHaveCount(1);
            await expect(imageEntry.locator('.media-left img')).toHaveAttribute('src', /item\/[0-9a-f]*\/tiles\/thumbnail/);
            await expect(imageEntry.locator('.media-heading')).toHaveText('image');
            await expect(page.locator('.h-annotated-image')).toHaveCount(2);
        });

        await test.step('assert user list exists', async () => {
            await expect(creatorSelect.locator('option')).toHaveText(['Any user', 'admin', 'user']);
        });

        await test.step('filter by creator', async () => {
            const userId = resources.adminId;
            await expect(creatorSelect.locator('option').nth(1)).toHaveAttribute('value', userId);
            const query = await nextImageListQuery(page, () => creatorSelect.selectOption(userId));
            expect(query.get('creatorId')).toBe(userId);
            // Only 'image' has an annotation by the admin
            await expect(page.locator('.h-annotated-image')).toHaveCount(1);
            await expect(imageEntry).toHaveCount(1);
        });

        await test.step('filter by name', async () => {
            const query = await nextImageListQuery(page, async () => {
                await nameInput.fill('invalid name');
                await nameInput.dispatchEvent('keyup');
            });
            expect(query.get('imageName')).toBe('invalid name');
            await expect(page.locator('.h-annotated-image')).toHaveCount(0);
            await expect(page.locator('.h-annotated-images-list-container')).toContainText('no annotated images were found');
        });

        await test.step('reset filter', async () => {
            const query = await nextImageListQuery(page, async () => {
                await nameInput.fill('');
                await nameInput.dispatchEvent('keyup');
            });
            expect(query.get('imageName')).toBeNull();
            expect(query.get('creatorId')).toBe(resources.adminId);
            await expect(page.locator('.h-annotated-image')).toHaveCount(1);
        });

        await test.step('click on the image', async () => {
            await imageEntry.click();
            await expect(page.locator('#g-dialog-container')).toBeHidden();
            await expect.poll(() => evalApp(page, () => {
                // @ts-ignore
                return window.girder.plugins.histomicsui.router.getQuery('image');
            })).toBe(imageId);
            await expect(page.locator(`a.g-item-breadcrumb-link[data-id="${imageId}"]`)).toHaveCount(1);
        });
    });
});
