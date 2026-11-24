import {expect, type Page, test} from '@playwright/test';

import {setupServer} from '../server';
import {waitForIdlePage} from '../util';
import {
    createTestAnalyses, evalApp, gotoHistomics, huiLogin, openImage, rest, type Resources, setupResources,
    simulateMapEvent
} from '../hui';

const IMAGE_NAME = 'huirchive/histomicstk';
const IMAGE_TAG = 'latest';

/**
 * Register the test CLIs and check that the slicer_cli_web docker_image
 * endpoint lists them as the huirchive/histomicstk:latest image.
 */
const registerTestAnalyses = async (page: Page, resources: Resources) => {
    await createTestAnalyses(page, resources, IMAGE_NAME, IMAGE_TAG);

    const analyses = await rest(page, 'slicer_cli_web/docker_image', {token: resources.userToken});
    expect(Object.keys(analyses)).toEqual([IMAGE_NAME]);
    expect(Object.keys(analyses[IMAGE_NAME])).toEqual([IMAGE_TAG]);
    expect(Object.keys(analyses[IMAGE_NAME][IMAGE_TAG]).sort()).toEqual(['ComputeNucleiFeatures', 'NucleiDetection']);
    for (const cli of Object.values(analyses[IMAGE_NAME][IMAGE_TAG]) as {run: string}[]) {
        expect(cli.run).toMatch(/^\/slicer_cli_web\/cli\/[a-f0-9]{24}\/run$/);
    }
};

test.describe('Analysis tests', () => {
    setupServer();

    test('open, submit, and close analyses', async ({page}) => {
        const resources = await setupResources(page);
        await registerTestAnalyses(page, resources);

        // Don't run real jobs: the Jasmine test used a mock resource for the
        // analysis endpoints.
        await page.route('**/slicer_cli_web/cli/*/run', (route) => route.fulfill({json: {_id: 'jobid'}}));

        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        const analysisItems = page.locator('.h-analysis-item');
        await expect(analysisItems.first()).toBeAttached();

        const dropdownLink = page.locator('.h-analyses-dropdown-link');
        const dropdown = page.locator('.h-analyses-dropdown');
        const imageLink = dropdown.locator('.h-analyses-image a', {hasText: IMAGE_NAME});
        const activeGroup = dropdown.locator('.h-analyses-task-group.h-active');
        const firstPanel = page.locator('.h-control-panel-container .s-panel').first();
        const roi = page.locator('#analysis_roi');
        let regionValue = '';

        const openDropdown = async () => {
            await dropdownLink.click();
            await expect(dropdown).toBeVisible();
            await expect(dropdown.locator('.h-analyses-filter')).toBeFocused();
        };

        await test.step('get dropdown values', async () => {
            await openDropdown();
            await expect(imageLink).toHaveCount(1);
            await expect(dropdown.locator('.h-analyses-recent')).toHaveCount(0);
            await imageLink.click();

            await expect(activeGroup).toHaveCount(1);
            await expect(activeGroup.locator('.h-analyses-version-name', {hasText: IMAGE_TAG})).toHaveCount(1);
            const link = activeGroup.locator('a', {hasText: 'NucleiDetection'});
            await expect(link).toHaveCount(1);
            await link.click();
            await waitForIdlePage(page);
            await expect(firstPanel).toBeAttached();
            await expect(firstPanel.locator('.s-panel-title-container')).toHaveText('Detects Nuclei');
        });

        await test.step('check autofilled forms', async () => {
            await expect(page.locator('#inputImageFile')).toHaveValue('image');
            await expect(page.locator('#outputNucleiAnnotationFile')).toHaveValue(
                'Detects Nuclei-outputNucleiAnnotationFile.anot');
        });

        await test.step('draw a region of interest', async () => {
            const regionButton = page.locator('.s-select-region-button').first();
            await expect(regionButton).toHaveCount(1);
            await regionButton.click();

            await simulateMapEvent(page, 'mousedown', {map: {x: 100, y: 100}, button: 'left'});
            await simulateMapEvent(page, 'mousemove', {map: {x: 200, y: 200}, button: 'left'});
            await simulateMapEvent(page, 'mouseup', {map: {x: 200, y: 200}, button: 'left'});

            await expect(roi).not.toHaveValue('-1,-1,-1,-1');
            regionValue = await roi.inputValue();
            expect(regionValue).toMatch(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/);
        });

        await test.step('submit the job', async () => {
            await page.evaluate(() => {
                // @ts-ignore
                window.__alertOptions = undefined;
                // @ts-ignore
                window.girder.events.once('g:alert', (options) => { window.__alertOptions = options; });
            });
            const submit = page.locator('.s-info-panel-submit');
            await expect(submit).toHaveCount(1);
            await submit.click();

            await expect.poll(() => page.evaluate(() => {
                // @ts-ignore
                return window.__alertOptions;
            })).toMatchObject({text: 'Analysis job submitted.'});
            await expect(page.locator('.s-jobs-panel .s-panel-controls .icon-up-open')).toHaveCount(1);
        });

        await test.step('open a new analysis', async () => {
            await openDropdown();
            await expect(imageLink).toHaveCount(1);
            await imageLink.click();

            await expect(activeGroup.locator('.h-analyses-version-name', {hasText: IMAGE_TAG})).toHaveCount(1);
            const link = activeGroup.locator('a', {hasText: 'ComputeNucleiFeatures'});
            await expect(link).toHaveCount(1);
            await link.click();
            await waitForIdlePage(page);
            await expect(firstPanel.locator('.s-panel-title-container')).toHaveText('Computes Nuclei Features');
        });

        await test.step('assert roi is preserved', async () => {
            await expect(roi).toHaveValue(regionValue);
        });

        await test.step('assert roi resets on analysis change', async () => {
            await evalApp(page, (app) => {
                // @ts-ignore
                window.__resetCalled = false;
                app.bodyView.viewerWidget.on('g:mouseResetAnnotation', (annotation: {id: string}) => {
                    if (annotation.id === 'region-selection') {
                        // @ts-ignore
                        window.__resetCalled = true;
                    }
                });
                app.bodyView.controlPanel.reset();
                // @ts-ignore
                window.girder.plugins.histomicsui.events.trigger('h:analysis', null);
            });
            await expect.poll(() => page.evaluate(() => {
                // @ts-ignore
                return window.__resetCalled;
            })).toBe(true);
        });

        await test.step('recently used', async () => {
            await openDropdown();
            const recent = dropdown.locator('.h-analyses-recent');
            await expect(recent).toHaveCount(1);
            await recent.locator('a').click();
            const links = activeGroup.locator('.h-analysis-item');
            await expect(links).toHaveCount(2);
            await expect(links.nth(0)).toHaveAttribute('data-cli', 'ComputeNucleiFeatures');
            await expect(links.nth(0).locator('.h-analyses-item-source')).toHaveText(`${IMAGE_NAME}:${IMAGE_TAG}`);
            await expect(links.nth(1)).toHaveAttribute('data-cli', 'NucleiDetection');
        });

        await test.step('filter', async () => {
            const filter = dropdown.locator('.h-analyses-filter');
            const visibleLinks = dropdown.locator('li:not(.hidden) > .h-analysis-item');
            const visibleImages = dropdown.locator('.h-analyses-image:not(.hidden)');
            const empty = dropdown.locator('.h-analyses-empty');

            await filter.fill('histomicstk detect');
            // one in the recently used list and one in the image
            await expect(visibleLinks).toHaveCount(2);
            await expect(visibleLinks.and(page.locator('[data-cli="NucleiDetection"]'))).toHaveCount(2);
            await expect(empty).toHaveClass(/\bhidden\b/);

            await filter.fill('nosuchanalysis');
            await expect(visibleLinks).toHaveCount(0);
            await expect(visibleImages).toHaveCount(0);
            await expect(empty).not.toHaveClass(/\bhidden\b/);

            await filter.fill('');
            await expect(visibleLinks).toHaveCount(4);
            await expect(visibleImages).toHaveCount(2);
            await expect(activeGroup).toHaveCount(1);
        });

        await test.step('keyboard', async () => {
            await dropdown.locator('.h-analyses-recent a').click();
            await expect(activeGroup).toHaveAttribute('data-key', ':recent');
            // moving focus to an image shows its tasks
            await imageLink.focus();
            await expect(activeGroup).toHaveAttribute('data-key', IMAGE_NAME);
            await expect(activeGroup.locator('.h-analysis-item')).toHaveCount(2);
        });

        await test.step('close analysis', async () => {
            // open analysis
            const group = dropdown.locator(`.h-analyses-task-group[data-key="${IMAGE_NAME}"]`);
            await imageLink.click();
            await expect(group).toHaveClass(/\bh-active\b/);
            await group.locator('a', {hasText: 'NucleiDetection'}).click();
            await waitForIdlePage(page);
            await expect(firstPanel).toBeAttached();
            await expect(firstPanel.locator('.s-panel-title-container')).toHaveText('Detects Nuclei');

            // click close
            const close = page.locator('.s-close-panel-group:visible');
            await expect(close).toHaveCount(1);
            await close.click();
            await expect(page.locator('.s-close-panel-group:visible')).toHaveCount(0);
        });
    });
});
