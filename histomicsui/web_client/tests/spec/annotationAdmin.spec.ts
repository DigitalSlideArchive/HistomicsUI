import fs from 'fs';

import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog, waitForIdlePage} from '../util';
import {evalApp, gotoHistomics, huiLogin, huiLogout, openImage, pageRest, rest, setupResources, waitForImage} from '../hui';

// Ported from the 'Annotation tests as admin' (including the 'style group
// tests') and 'Effect of config file' sections of the Jasmine
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
 * The values of the style group options of the draw widget.
 */
const styleGroupOptions = (page: Page) => page.locator('.h-style-group option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

/**
 * Build a file for the style group import input from a JSON-serializable
 * value.
 */
const jsonFile = (contents: unknown) => ({
    name: 'test1.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(contents))
});

/**
 * Open the style group dialog from the draw widget.
 */
const openStyleGroupDialog = async (page: Page) => {
    await page.locator('.h-configure-style-group').click();
    await waitForDialog(page);
    await expect(page.locator('.h-style-editor .h-group-name')).toBeVisible();
};

/**
 * Wait for a style group import to finish: the inputs are re-enabled and
 * the dialog shows the given style names.
 */
const waitForImport = async (page: Page, groupNames: string[]) => {
    await expect(page.locator('.h-style-editor input.disabled')).toHaveCount(0);
    await expect(page.locator('.h-style-editor .h-group-name option')).toHaveText(groupNames);
};

/**
 * Expand every collapsed annotation group in the annotation selector so that
 * the annotation rows are rendered.
 */
const expandAnnotationGroups = async (page: Page) => {
    const collapsed = page.locator('.h-annotation-selector .h-group-collapsed .h-annotation-group-name');
    let count = await collapsed.count();
    while (count) {
        await collapsed.first().click();
        await expect(collapsed).toHaveCount(count - 1);
        count -= 1;
    }
    await expect(page.locator('.h-annotation-selector .h-group-collapsed')).toHaveCount(0);
};

const closeDialog = async (page: Page, button: string) => {
    await page.locator(`#g-dialog-container ${button}`).click();
    await waitForIdlePage(page);
};

test.describe('Annotation tests as admin', () => {
    setupServer();

    test('open an annotated image and edit the style groups as admin', async ({page}) => {
        const resources = await setupResources(page);
        const imageId = resources.imageId;
        await gotoHistomics(page);
        await huiLogin(page);
        // The Jasmine tests had drawn the 'drawn 2' annotation as the user by
        // this point; create it directly.
        await createAnnotation(page, imageId, 'drawn 2');

        await test.step('logout regular user and login as admin', async () => {
            await huiLogout(page);
            await huiLogin(page, 'admin');
        });

        await test.step('open the dialog', async () => {
            await page.locator('.h-open-annotated-image').click();
            await waitForDialog(page);
            const imageEntry = page.locator(`.h-annotated-image[data-id="${imageId}"]`);
            await expect(imageEntry).toHaveCount(1);
            await imageEntry.click();
            await expect(page.locator('#g-dialog-container')).toBeHidden();
            await waitForImage(page, imageId);
            expect(await evalApp(page, () => {
                // @ts-ignore
                return window.girder.plugins.histomicsui.router.getQuery('image');
            })).toBe(imageId);
        });

        const annotationRow = (name: string) => page.locator('.h-annotation-selector .h-annotation', {hasText: name});

        await test.step('open an annotation in the draw panel', async () => {
            await expect(page.locator('.h-annotation-selector .h-annotation-group')).not.toHaveCount(0);
            await expandAnnotationGroups(page);
            await expect(annotationRow('drawn 2').locator('.h-toggle-annotation')).toHaveCount(1);
            await annotationRow('admin annotation').locator('.h-annotation-name').click();
            await waitForIdlePage(page);
            await expect(page.locator('.h-draw-widget .h-panel-name')).toHaveText('admin annotation');
            await annotationRow('drawn 2').locator('.h-annotation-name').click();
            await waitForIdlePage(page);
            await expect(page.locator('.icon-spin3')).toHaveCount(0);
            await expect(page.locator('.h-elements-container')).toHaveCount(1);
            await expect(annotationRow('drawn 2').locator('.icon-eye')).toHaveCount(1);
            await expect(page.locator('.h-draw-widget .h-panel-name')).toHaveText('drawn 2');
        });

        await test.step('open the style group dialog', async () => {
            await openStyleGroupDialog(page);
            // Earlier Jasmine tests had created a 'new' style group that the
            // default/reset checks below rely on; create it here.
            await page.locator('.h-create-new-style').click();
            await page.locator('.h-new-group-name').fill('new');
            await page.locator('.h-save-new-style').click();
            await expect(page.locator('.h-group-name')).toHaveValue('new');
            await expect(page.locator('.h-group-name option')).toHaveText(['default', 'new']);
        });

        await test.step('set the default style groups', async () => {
            await page.locator('#h-set-defaults').click();
            await expect.poll(async () => {
                const settings = await rest(page, 'system/setting', {
                    token: resources.adminToken,
                    params: {list: JSON.stringify(['histomicsui.default_draw_styles'])}
                });
                const styles = settings && settings['histomicsui.default_draw_styles'];
                return styles ? JSON.parse(styles) : null;
            }).toEqual(expect.arrayContaining([
                expect.objectContaining({id: 'default'}),
                expect.objectContaining({id: 'new', group: 'new', lineWidth: 2})
            ]));
        });

        await test.step('reset the style groups', async () => {
            await page.locator('.h-group-name').selectOption('new');
            await expect(page.locator('.h-group-name')).toHaveValue('new');
            await page.locator('#h-element-line-width').fill('10');
            await page.locator('#h-element-label').fill('newlabel');
            await page.locator('#h-reset-defaults').click();
            await expect(page.locator('#h-element-label')).toHaveValue('');
            await waitForDialog(page);
            await expect(page.locator('.h-group-name')).toHaveValue('new');
            await expect(page.locator('#h-element-line-width')).toHaveValue('2');
        });

        await test.step('cancel changes', async () => {
            await closeDialog(page, '.h-cancel');
            // cancelling restores the groups from before the dialog opened
            await expect.poll(() => styleGroupOptions(page)).toEqual(['default']);
        });

        await test.step('export style groups', async () => {
            await openStyleGroupDialog(page);
            const [download] = await Promise.all([
                page.waitForEvent('download'),
                page.locator('#h-export').click()
            ]);
            expect((await page.locator('#h-export-link').getAttribute('href') || '').substr(0, 5)).toBe('blob:');
            expect(download.suggestedFilename()).toBe('hui_groups.json');
            const exported = JSON.parse(fs.readFileSync(await download.path() as string).toString());
            expect(exported.map((style: {id: string}) => style.id)).toEqual(['default']);
            await closeDialog(page, '.h-cancel');
        });

        await test.step('import style groups', async () => {
            expect(await styleGroupOptions(page)).toEqual(['default']);
            await openStyleGroupDialog(page);
            const contents = [{
                lineWidth: 2,
                lineColor: 'rgb(0,0,0)',
                fillColor: 'rgba(0,0,0,0)',
                id: 'Black 2'
            }, {
                lineWidth: 4,
                lineColor: 'rgb(0, 0, 255)',
                fillColor: 'rgba(0, 0, 255, 0)',
                id: 'Blue 4'
            }];
            // The import button opens the file chooser of the hidden file
            // input.
            const [chooser] = await Promise.all([
                page.waitForEvent('filechooser'),
                page.locator('#h-import').click()
            ]);
            await chooser.setFiles(jsonFile(contents));
            await waitForImport(page, ['Black 2', 'Blue 4', 'default']);
            await closeDialog(page, '.h-submit');
            await expect.poll(() => styleGroupOptions(page)).toEqual(['Black 2', 'Blue 4', 'default']);
        });

        await test.step('import style groups, merging with existing', async () => {
            await openStyleGroupDialog(page);
            const contents = [{
                lineWidth: 4,
                lineColor: 'rgb(128, 128, 255)',
                fillColor: 'rgba(0, 0, 255, 0)',
                id: 'Blue 4'
            }, {
                lineWidth: 8,
                lineColor: 'rgb(255,0,0)',
                fillColor: 'rgba(255,0,0,0.25)',
                id: 'Red 8'
            }];
            await page.locator('#h-import-groups').setInputFiles(jsonFile(contents));
            await waitForImport(page, ['Black 2', 'Blue 4', 'Red 8', 'default']);
            await closeDialog(page, '.h-submit');
            await expect.poll(() => styleGroupOptions(page)).toEqual(['Black 2', 'Blue 4', 'Red 8', 'default']);
            expect(await evalApp(page, (app) => app.bodyView.drawWidget._groups.get('Blue 4').get('lineColor'))).toBe('rgb(128, 128, 255)');
        });

        await test.step('import style groups, replacing existing', async () => {
            await openStyleGroupDialog(page);
            const contents = [{
                lineWidth: 4,
                lineColor: 'rgb(128, 128, 255)',
                fillColor: 'rgba(0, 0, 255, 0)',
                id: 'Blue 4'
            }, {
                lineWidth: 8,
                lineColor: 'rgb(255,0,0)',
                fillColor: 'rgba(255,0,0,0.25)',
                id: 'Red 8'
            }];
            await page.locator('#h-import-replace').check();
            await page.locator('#h-import-groups').setInputFiles(jsonFile(contents));
            await waitForImport(page, ['Blue 4', 'Red 8', 'default']);
            await closeDialog(page, '.h-submit');
            await expect.poll(() => styleGroupOptions(page)).toEqual(['Blue 4', 'Red 8', 'default']);
        });

        await test.step('import style groups, cancel', async () => {
            await openStyleGroupDialog(page);
            const contents = [{
                lineWidth: 6,
                lineColor: 'rgb(0, 255, 0)',
                fillColor: 'rgba(0, 255, 0, 0)',
                id: 'Green 6'
            }];
            await page.locator('#h-import-groups').setInputFiles(jsonFile(contents));
            await waitForImport(page, ['Blue 4', 'Green 6', 'Red 8', 'default']);
            await closeDialog(page, '.h-cancel');
            await expect.poll(() => styleGroupOptions(page)).toEqual(['Blue 4', 'Red 8', 'default']);
        });

        await test.step('import style groups, error', async () => {
            await openStyleGroupDialog(page);
            await page.locator('#h-import-groups').setInputFiles(jsonFile('this is not json'));
            await expect(page.locator('.h-style-editor input.disabled')).toHaveCount(0);
            await expect(page.locator('#g-dialog-container .g-validation-failed-message')).toBeVisible();
            await expect(page.locator('#g-dialog-container .g-validation-failed-message')).toContainText('parse');
            await expect(page.locator('.h-style-editor .h-group-name option')).toHaveText(['Blue 4', 'Red 8', 'default']);
            await closeDialog(page, '.h-cancel');
            await expect.poll(() => styleGroupOptions(page)).toEqual(['Blue 4', 'Red 8', 'default']);
        });
    });
});

test.describe('Effect of config file', () => {
    setupServer();

    test('the folder config sets the opacity, style groups, and hotkeys', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image.svs', ['subfolder']);

        await test.step('respects unselected opacity config', async () => {
            await expect.poll(() => evalApp(page, (app) => [
                app.bodyView._unselectedOpacityMultiplier,
                app.bodyView.viewerWidget._unselectedOpacityMultiplier
            ])).toEqual([0.5, 0.5]);
        });

        await test.step('create a new annotation', async () => {
            await page.locator('.h-create-annotation').click();
            await waitForDialog(page);
            await expect(page.locator('#h-annotation-name')).toHaveCount(1);
            await page.locator('#h-annotation-name').fill('drawn c1');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(page.locator('.h-draw-widget .h-panel-name')).toHaveText('drawn c1');
            await expect(page.locator('.h-style-group option[value="Red"]')).toHaveCount(1);
        });

        await test.step('delete the annotation we just created', async () => {
            const row = page.locator('.h-annotation-selector .h-annotation', {hasText: 'drawn c1'});
            await expandAnnotationGroups(page);
            await expect(row).toHaveCount(1);
            await row.locator('.h-delete-annotation').click();
            await waitForDialog(page);
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(row).toHaveCount(0);
        });

        await test.step('uses group hotkeys from the config', async () => {
            await expect.poll(() => evalApp(page, (app) => {
                const bindings = app.bodyView.hotkeys.bindings['group:Red'];
                return bindings && bindings.length;
            })).toBe(1);
            expect(await evalApp(page, (app) => {
                // @ts-ignore
                return window.girder.plugins.histomicsui.hotkeys.hotkeyText('group:Red', app.bodyView.hotkeys);
            })).toBe('Shift+R');
        });

        await test.step('open original image', async () => {
            await openImage(page, 'image');
        });

        await test.step('drops config hotkeys in a folder without a config', async () => {
            await expect.poll(() => evalApp(page, (app) => {
                return app.bodyView.hotkeys.bindings['group:Red'] === undefined;
            })).toBe(true);
        });
    });
});
