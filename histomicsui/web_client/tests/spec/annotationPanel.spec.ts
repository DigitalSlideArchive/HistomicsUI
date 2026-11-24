import {expect, type Page, test} from '@playwright/test';

import {setupServer} from '../server';
import {delay, waitForDialog, waitForIdlePage} from '../util';
import {
    evalApp, gotoHistomics, huiLogin, openImage, pageRest, rest, type Resources, setupResources, simulateMapEvent,
    waitForAppCondition
} from '../hui';

// The tests in this file build on one another, so run them in order and, if
// one fails, retry them as a group on a fresh server.
test.describe.configure({mode: 'serial'});

// Ported from tests/web_client_specs/annotationSpec.js, the 'Annotation panel'
// describe.  The Jasmine tests relied on annotations drawn by the earlier
// 'Draw panel' and 'Annotation styles' describes; here the equivalent
// annotations ('drawn 1' and 'drawn 2', each with a rectangle element) are
// created through the REST API before the image is opened.  Together with
// the public 'admin annotation' from setupResources, that gives the three
// annotations the old tests counted.

const USER_CONFIG = '.histomicsui_user_config.yaml';

/* The row in the annotation selector for the annotation with the given name. */
const annotationRow = (page: Page, name: string) =>
    page.locator('.h-annotation-selector .h-annotation', {hasText: new RegExp(`^\\s*${name}\\s*$`)});

/* Expand every collapsed annotation group in the selector. */
const expandGroups = async (page: Page) => {
    const collapsed = page.locator('.h-annotation-selector .h-group-collapsed .h-annotation-group-name');
    let count = await collapsed.count();
    while (count) {
        await collapsed.first().click();
        await expect(collapsed).toHaveCount(count - 1);
        count -= 1;
    }
    await expect(page.locator('.h-annotation-selector .h-group-collapsed')).toHaveCount(0);
};

/* Wait for the loading spinners in the annotation selector to disappear. */
const waitForAnnotationsLoaded = async (page: Page) => {
    await expect(page.locator('.h-annotation-selector .icon-spin3')).toHaveCount(0);
    await waitForIdlePage(page);
};

/* Click "show all annotations" and wait for the annotations to load. */
const showAllAnnotations = async (page: Page) => {
    await page.locator('.h-show-all-annotations').click();
    await waitForAnnotationsLoaded(page);
    await expect(page.locator('.h-annotation .icon-eye-off')).toHaveCount(0);
};

/* The annotation document (the `annotation` attribute) of a loaded annotation model. */
const annotationData = (page: Page, name: string) => evalApp(page, (app, name) => {
    const annotation = app.bodyView.annotations.filter(
        (annotation: any) => annotation.get('annotation').name === name)[0];
    return annotation ? JSON.parse(JSON.stringify(annotation.get('annotation'))) : null;
}, name);

/* Convert image coordinates to viewer display (pixel) coordinates. */
const toDisplay = (page: Page, x: number, y: number) => evalApp(page, (app, pt) => {
    const d = app.bodyView.viewer.gcsToDisplay({x: pt.x, y: pt.y});
    return {x: d.x, y: d.y};
}, {x, y});

/*
 * Set the value of an input through jQuery, as the old tests did.  This is
 * used for the color inputs, whose color pickers reformat typed values.
 */
const setVal = (page: Page, selector: string, value: string) => page.evaluate(([selector, value]) => {
    // @ts-ignore
    window.girder.$(selector).val(value);
}, [selector, value]);

/*
 * Set the value of a range input through jQuery and trigger the given events,
 * as the old tests did.
 */
const setRange = (page: Page, selector: string, value: number, events: string[]) => page.evaluate(({selector, value, events}) => {
    // @ts-ignore
    const $el = window.girder.$(selector);
    $el.val(value);
    events.forEach((event) => $el.trigger(event));
}, {selector, value, events});

/*
 * Spy on the viewer widget's setAnnotationOpacity, recording the arguments of
 * the latest call.  Returns a function that gets them.
 */
const spyAnnotationOpacity = async (page: Page) => {
    await evalApp(page, (app) => {
        const widget = app.bodyView.viewerWidget;
        const original = widget.setAnnotationOpacity;
        // @ts-ignore
        window._annotationOpacitySpy = {original, call: undefined};
        widget.setAnnotationOpacity = function (id: string, opacity: number | undefined) {
            // @ts-ignore
            window._annotationOpacitySpy.call = [id, opacity];
            return original.apply(this, arguments);
        };
    });
    // @ts-ignore
    return () => page.evaluate(() => window._annotationOpacitySpy.call);
};

/* Restore the viewer widget's setAnnotationOpacity after spyAnnotationOpacity. */
const unspyAnnotationOpacity = (page: Page) => evalApp(page, (app) => {
    // @ts-ignore
    app.bodyView.viewerWidget.setAnnotationOpacity = window._annotationOpacitySpy.original;
    // @ts-ignore
    delete window._annotationOpacitySpy;
});

/* Open the edit dialog of an annotation from the selector. */
const openEditDialog = async (page: Page, name: string) => {
    await annotationRow(page, name).locator('.h-edit-annotation-metadata').click();
    await waitForDialog(page);
    await expect(page.locator('#h-annotation-name')).toHaveValue(name);
};

/* Submit the edit dialog and wait for the annotation to be saved. */
const submitDialog = async (page: Page) => {
    await page.locator('#g-dialog-container .h-submit').click();
    await expect(page.locator('#g-dialog-container')).toBeHidden();
    await waitForIdlePage(page);
    await expect(page.locator('.h-annotation-selector')).not.toHaveClass(/saving/);
};

/* The annotations on the open image created by the current user. */
const listUserAnnotations = async (page: Page, imageId: string) => {
    const userId = await page.evaluate(() => {
        // @ts-ignore
        return window.girder.auth.getCurrentUser().id;
    });
    return await pageRest(page, {url: 'annotation', data: {itemId: imageId, userId}}) as any[];
};

/* Write the user's hotkey configuration file. */
const setUserConfig = async (page: Page, resources: Resources, yaml: string) => {
    await rest(page, `user/${resources.userId}/yaml_config/${USER_CONFIG}`, {
        method: 'PUT', token: resources.userToken, body: yaml, headers: {'Content-Type': 'application/x-yaml'}, raw: true
    });
};

/* Right click on the viewer at display coordinates. */
const rightClick = async (page: Page, x: number, y: number) => {
    await simulateMapEvent(page, 'mousedown', {map: {x, y}, button: 'right'});
    await simulateMapEvent(page, 'mouseup', {map: {x, y}, button: 'right'});
};

const rectangle = (x: number, y: number, size: number) => ({
    type: 'rectangle', center: [x, y, 0], width: size, height: size, rotation: 0
});

test.describe('Annotation panel', () => {
    setupServer();

    let resources: Resources;
    let imageId: string;

    test('render the panel, toggle annotations, and select by region', async ({page}) => {
        resources = await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        // The old tests had drawn these annotations in earlier describes.
        for (const [name, element] of [['drawn 1', rectangle(200, 200, 100)], ['drawn 2', rectangle(400, 400, 100)]] as const) {
            await pageRest(page, {
                url: `annotation?itemId=${resources.imageId}`,
                method: 'POST',
                contentType: 'application/json',
                data: {name, elements: [element]}
            });
        }
        imageId = await openImage(page, 'image');
        expect(imageId).toBe(resources.imageId);

        await test.step('panel is rendered', async () => {
            await expect(page.locator('.h-annotation-selector .s-panel-title')).toContainText('Annotations');
            // make sure all groups are expanded
            await expandGroups(page);
        });

        await test.step('collapse an annotation group', async () => {
            const group = page.locator('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
            await expect(group).toHaveClass(/h-group-expanded/);
            await group.locator('.h-annotation-group-name').click();
            await expect(group).toHaveClass(/h-group-collapsed/);
            await expect(group).not.toHaveClass(/h-group-expanded/);
            await expect(group.locator('.h-annotation')).toHaveCount(0);
        });

        await test.step('expand an annotation group', async () => {
            const group = page.locator('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
            await expect(group).toHaveClass(/h-group-collapsed/);
            await group.locator('.h-annotation-group-name').click();
            await expect(group).toHaveClass(/h-group-expanded/);
            await expect(group).not.toHaveClass(/h-group-collapsed/);
            await expect(group.locator('.h-annotation')).toHaveCount(3);
        });

        await test.step('ensure user cannot remove the admin annotation', async () => {
            const adminAnnotation = annotationRow(page, 'admin annotation');
            await expect(adminAnnotation).toHaveCount(1);
            await expect(adminAnnotation.locator('.h-delete-annotation')).toHaveCount(0);
        });

        await test.step('hide all annotations', async () => {
            await page.locator('.h-hide-all-annotations').click();
            await waitForIdlePage(page);
            await expect(page.locator('.h-annotation .icon-eye-off')).toHaveCount(3);
            await expect(page.locator('.h-annotation .icon-eye')).toHaveCount(0);
        });

        await test.step('show all annotations', async () => {
            await showAllAnnotations(page);
            await expect(page.locator('.h-annotation .icon-eye')).toHaveCount(3);
        });

        await test.step('set the global annotation opacity', async () => {
            // Record the value passed to the viewer widget while the slider
            // changes (the old test spied on the method the same way).
            const opacity = await evalApp(page, (app) => {
                const widget = app.bodyView.viewerWidget;
                const original = widget.setGlobalAnnotationOpacity;
                let value;
                widget.setGlobalAnnotationOpacity = function (opacity: unknown) {
                    value = opacity;
                    return original.apply(this, arguments);
                };
                // @ts-ignore
                window.girder.$('#h-annotation-opacity').val(0.5).trigger('input');
                widget.setGlobalAnnotationOpacity = original;
                return value;
            });
            expect(opacity).toBe(0.5);
        });

        await test.step('set the global annotation fill opacity', async () => {
            const opacity = await evalApp(page, (app) => {
                const widget = app.bodyView.viewerWidget;
                const original = widget.setGlobalAnnotationFillOpacity;
                let value;
                widget.setGlobalAnnotationFillOpacity = function (opacity: unknown) {
                    value = opacity;
                    return original.apply(this, arguments);
                };
                // @ts-ignore
                window.girder.$('#h-annotation-fill-opacity').val(0.5).trigger('input');
                widget.setGlobalAnnotationFillOpacity = original;
                return value;
            });
            expect(opacity).toBe('0.5');
        });

        await test.step('annotation opacities are locked by default', async () => {
            const id = await annotationRow(page, 'drawn 1').getAttribute('data-id');
            const row = page.locator(`.h-annotation[data-id="${id}"]`);
            await expect(row.locator('.h-toggle-layer-opacity')).toHaveCount(0);
            await expect(page.locator('.h-layer-opacity-slider')).toHaveCount(0);

            await page.locator('.h-annotation-opacity-lock.icon-lock').click();
            await expect(page.locator('.h-annotation-opacity-lock.icon-lock-open')).toHaveCount(1);
            await expect(row.locator('.h-toggle-layer-opacity.icon-ajust')).toHaveCount(1);
            await expect(page.locator('.h-layer-opacity-slider')).toHaveCount(0);
        });

        await test.step('set an annotation opacity', async () => {
            const lastCall = await spyAnnotationOpacity(page);
            const id = await annotationRow(page, 'drawn 1').getAttribute('data-id');
            const rowSel = `.h-annotation[data-id="${id}"] `;
            const toggle = page.locator(rowSel + '.h-toggle-layer-opacity');
            const slider = page.locator(rowSel + '.h-layer-opacity-slider');
            const reset = page.locator(rowSel + '.h-reset-layer-opacity');
            // an annotation that matches the global opacity opens on click
            await toggle.click();
            await expect(slider).toHaveCount(1);
            await expect(slider).toHaveValue('0.5');
            await expect(reset).toHaveCount(0);
            await setRange(page, rowSel + '.h-layer-opacity-slider', 0.75, ['input', 'change']);
            expect(await lastCall()).toEqual([id, 0.75]);
            await expect(reset).toHaveCount(1);

            // an annotation that differs from the global opacity can be closed
            await toggle.click();
            await expect(slider).toHaveCount(0);
            await expect(toggle).toHaveClass(/h-layer-opacity-changed/);
            await toggle.click();
            await expect(slider).toHaveCount(1);

            // the global opacity moves annotation opacities by the same amount
            await setRange(page, '#h-annotation-opacity', 0.6, ['input']);
            expect(await lastCall()).toEqual([id, 0.85]);
            await expect(slider).toHaveValue('0.85');
            await setRange(page, '#h-annotation-opacity', 1, ['input']);
            expect(await lastCall()).toEqual([id, 1]);
            await setRange(page, '#h-annotation-opacity', 0.5, ['input']);
            expect(await lastCall()).toEqual([id, 0.5]);

            await unspyAnnotationOpacity(page);
        });

        await test.step('lock annotation opacities', async () => {
            const lastCall = await spyAnnotationOpacity(page);
            const id = await annotationRow(page, 'drawn 1').getAttribute('data-id');
            const rowSel = `.h-annotation[data-id="${id}"] `;
            const toggle = page.locator(rowSel + '.h-toggle-layer-opacity');
            const slider = page.locator(rowSel + '.h-layer-opacity-slider');
            // the slider was left open by the previous step
            await expect(slider).toHaveCount(1);
            await setRange(page, rowSel + '.h-layer-opacity-slider', 0.25, ['input', 'change']);
            await page.locator('.h-annotation-opacity-lock.icon-lock-open').click();
            expect(await lastCall()).toEqual([id, undefined]);
            await expect(page.locator('.h-layer-opacity-slider')).toHaveCount(0);
            await expect(page.locator('.h-toggle-layer-opacity')).toHaveCount(0);

            // locked annotation opacities don't move with the global opacity
            await setRange(page, '#h-annotation-opacity', 0.7, ['input']);
            await page.locator('.h-annotation-opacity-lock.icon-lock').click();
            expect(await lastCall()).toEqual([id, 0.25]);
            // an annotation that differs from the global opacity shows its slider
            await expect(slider).toHaveCount(1);
            await expect(slider).toHaveValue('0.25');

            // a closed slider opens again the next time opacities are unlocked
            await toggle.click();
            await expect(slider).toHaveCount(0);
            await page.locator('.h-annotation-opacity-lock.icon-lock-open').click();
            await page.locator('.h-annotation-opacity-lock.icon-lock').click();
            await expect(slider).toHaveCount(1);

            await unspyAnnotationOpacity(page);
        });

        await test.step('highlight annotations with a different opacity', async () => {
            const id = await annotationRow(page, 'drawn 1').getAttribute('data-id');
            const rowSel = `.h-annotation[data-id="${id}"] `;
            const toggle = page.locator(rowSel + '.h-toggle-layer-opacity');
            const slider = page.locator(rowSel + '.h-layer-opacity-slider');
            await expect(toggle).toHaveClass(/h-layer-opacity-changed/);
            await setRange(page, rowSel + '.h-layer-opacity-slider', 0.7, ['input']);
            await expect(toggle).not.toHaveClass(/h-layer-opacity-changed/);
            // an annotation that matches the global opacity closes when it isn't open
            await setRange(page, rowSel + '.h-layer-opacity-slider', 0.7, ['change']);
            await expect(slider).toHaveCount(0);

            await toggle.click();
            await setRange(page, rowSel + '.h-layer-opacity-slider', 0.25, ['input', 'change']);
            await expect(toggle).toHaveClass(/h-layer-opacity-changed/);
        });

        await test.step('reset an annotation opacity', async () => {
            const lastCall = await spyAnnotationOpacity(page);
            const id = await annotationRow(page, 'drawn 1').getAttribute('data-id');
            const rowSel = `.h-annotation[data-id="${id}"] `;
            const toggle = page.locator(rowSel + '.h-toggle-layer-opacity');
            const slider = page.locator(rowSel + '.h-layer-opacity-slider');
            // relock so the slider is open because it differs, not because it was clicked
            await page.locator('.h-annotation-opacity-lock.icon-lock-open').click();
            await page.locator('.h-annotation-opacity-lock.icon-lock').click();
            await expect(slider).toHaveCount(1);
            await page.locator(rowSel + '.h-reset-layer-opacity').click();
            expect(await lastCall()).toEqual([id, undefined]);
            await expect(slider).toHaveCount(0);
            await expect(toggle).not.toHaveClass(/h-layer-opacity-changed/);

            await page.locator('.h-annotation-opacity-lock.icon-lock-open').click();
            await expect(page.locator('.h-toggle-layer-opacity')).toHaveCount(0);

            await unspyAnnotationOpacity(page);
        });

        await test.step('toggle visibility of an annotation', async () => {
            const row = annotationRow(page, 'drawn 1');
            await row.locator('.h-toggle-annotation').click();
            await expect(row.locator('.icon-eye-off.h-toggle-annotation')).toHaveCount(1);
            await row.locator('.h-toggle-annotation').click();
            await expect(row.locator('.icon-eye.h-toggle-annotation')).toHaveCount(1);
        });

        await test.step('toggle visibility of all annotations in a group', async () => {
            const group = page.locator('.h-annotation-selector .h-annotation-group[data-group-name="Other"]');
            await expect(group).toHaveClass(/h-group-expanded/);
            await expect(group.locator('.icon-eye.h-toggle-group-annotations')).toHaveCount(1);
            await group.locator('.h-toggle-group-annotations').click();
            await expect(group.locator('.icon-eye-off.h-toggle-group-annotations')).toHaveCount(1);
            await expect(group.locator('.icon-eye.h-toggle-annotation')).toHaveCount(0);
            // clicking the group toggle must not collapse/expand the group
            await expect(group).toHaveClass(/h-group-expanded/);
            await group.locator('.h-toggle-group-annotations').click();
            await expect(group.locator('.icon-eye.h-toggle-group-annotations')).toHaveCount(1);
            await expect(group.locator('.icon-eye-off.h-toggle-annotation')).toHaveCount(0);
            await waitForAnnotationsLoaded(page);
        });

        await test.step('select annotations by rect - no hits', async () => {
            const button = page.locator('.h-annotation-select-by-region');
            await expect(button).toHaveCount(1);
            await button.click();
            await expect(button).toHaveClass(/active/);
            // drag out a region of the image that contains no elements
            const start = await toDisplay(page, 1000, 1000);
            const end = await toDisplay(page, 1200, 1200);
            await simulateMapEvent(page, 'mousedown', {map: start, button: 'left'});
            await simulateMapEvent(page, 'mousemove', {map: end, button: 'left'});
            await simulateMapEvent(page, 'mouseup', {map: end, button: 'left'});
            await expect(button).not.toHaveClass(/active/);
            await expect(page.locator('#h-annotation-context-menu')).toBeHidden();
            expect(await evalApp(page, (app) => app.bodyView.selectedElements.length)).toBe(0);
        });

        await test.step('getElementsInBox', async () => {
            await showAllAnnotations(page);
            const [found, existing] = await evalApp(page, (app) => {
                const viewer = app.bodyView.viewerWidget;
                const boundingBox = {left: 0, top: 0, width: viewer.$el.width(), height: viewer.$el.height()};
                const elements = app.bodyView.getElementsInBox(boundingBox);
                const count = app.bodyView.annotations.reduce(
                    (acc: number, annotation: any) => acc + annotation.elements().length, 0);
                return [elements.length, count];
            });
            expect(existing).toBe(2);
            expect(found).toBe(existing);
        });
    });

    /* Log in, open the image, and show all of its annotations. */
    const openImageWithAnnotations = async (page: Page) => {
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await expandGroups(page);
        await showAllAnnotations(page);
    };

    test('edit annotation metadata and style', async ({page}) => {
        await openImageWithAnnotations(page);

        await test.step('edit annotation metadata', async () => {
            await openEditDialog(page, 'drawn 1');
            await page.locator('#h-annotation-name').fill('');
            await page.locator('#h-annotation-description').fill('description');
            await page.locator('#g-dialog-container .h-submit').click();

            const validation = page.locator('.g-validation-failed-message');
            await expect(validation).toHaveCount(1);
            await expect(validation).not.toHaveClass(/hidden/);
            await expect(validation).toHaveText('Please enter a name.');

            await page.locator('#h-annotation-name').fill('edited 1');
            await submitDialog(page);
            await expect(annotationRow(page, 'edited 1')).toHaveCount(1);
            await expect(annotationRow(page, 'drawn 1')).toHaveCount(0);
        });

        await test.step('edit annotation style', async () => {
            await openEditDialog(page, 'drawn 2');
            await expect(page.locator('#h-annotation-line-width')).toHaveCount(1);
            await expect(page.locator('#h-annotation-line-color')).toHaveCount(1);
            await expect(page.locator('#h-annotation-fill-color')).toHaveCount(1);
            await page.locator('#h-annotation-line-width').fill('2');
            await setVal(page, '#h-annotation-line-color', 'black');
            await setVal(page, '#h-annotation-fill-color', 'white');
            await submitDialog(page);

            const annotation = await annotationData(page, 'drawn 2');
            expect(annotation.elements[0].lineWidth).toBe(2);
            expect(annotation.elements[0].lineColor).toBe('rgb(0, 0, 0)');
            expect(annotation.elements[0].fillColor).toBe('rgb(255, 255, 255)');
        });
    });

    test('edit annotation legends', async ({page}) => {
        await openImageWithAnnotations(page);

        await test.step('edit annotation legend', async () => {
            const legend = page.locator('.h-annotation-legend-container');
            await expect(legend).toHaveClass(/hidden/);
            await openEditDialog(page, 'drawn 2');
            const entries = page.locator('.h-legend-entry');
            await expect(entries).toHaveCount(0);
            await page.locator('.h-add-legend-entry').click();
            await page.locator('.h-add-legend-entry').click();
            await expect(entries).toHaveCount(2);
            await entries.first().locator('.h-legend-label').fill('High');
            await setVal(page, '.h-legend-entry:first .h-legend-fill-color', 'red');
            await entries.last().locator('.h-legend-label').fill('Low');
            await setVal(page, '.h-legend-entry:last .h-legend-fill-color', 'blue');
            await setVal(page, '.h-legend-entry:last .h-legend-line-color', 'black');
            await entries.last().locator('.h-legend-line-width').fill('2');
            // reorder the entries
            await entries.last().locator('.h-legend-move-up').click();
            await expect(entries.first().locator('.h-legend-label')).toHaveValue('Low');
            await entries.first().locator('.h-legend-move-up').click();
            await expect(entries.first().locator('.h-legend-label')).toHaveValue('Low');
            await entries.first().locator('.h-legend-move-down').click();
            await expect(entries.first().locator('.h-legend-label')).toHaveValue('High');
            await entries.last().locator('.h-legend-move-up').click();
            await expect(entries.first().locator('.h-legend-label')).toHaveValue('Low');
            // entries without a label or with invalid colors are rejected
            await page.locator('.h-add-legend-entry').click();
            await setVal(page, '.h-legend-entry:last .h-legend-fill-color', 'not a color');
            await page.locator('#g-dialog-container .h-submit').click();

            const validation = page.locator('.g-validation-failed-message');
            await expect(validation).not.toHaveClass(/hidden/);
            await expect(validation).toHaveText('Legend entries must have a label. Invalid legend color.');
            await expect(entries.last().locator('.has-error')).toHaveCount(2);
            await expect(entries.first().locator('.has-error')).toHaveCount(0);
            // entries without any color are rejected
            await entries.last().locator('.h-legend-label').fill('No color');
            await setVal(page, '.h-legend-entry:last .h-legend-fill-color', '');
            await page.locator('#g-dialog-container .h-submit').click();
            await expect(validation).toHaveText('Legend entries must have a fill or line color.');
            await expect(entries.last().locator('.has-error')).toHaveCount(2);

            await entries.last().locator('.h-legend-remove').click();
            await expect(entries).toHaveCount(2);
            await submitDialog(page);

            expect((await annotationData(page, 'drawn 2')).legend).toEqual([
                {label: 'Low', fillColor: 'rgb(0, 0, 255)', lineColor: 'rgb(0, 0, 0)', lineWidth: 2},
                {label: 'High', fillColor: 'rgb(255, 0, 0)'}
            ]);
            await expect(legend).not.toHaveClass(/hidden/);
            await expect(legend.locator('.h-annotation-legend-entry')).toHaveCount(2);
            await expect(legend.locator('.h-annotation-legend-name')).toHaveText('drawn 2');
            await expect(legend.locator('.h-annotation-legend-label').first()).toHaveText('Low');
            await expect(legend.locator('.h-annotation-legend-label').last()).toHaveText('High');
            const swatch = legend.locator('.h-annotation-legend-swatch').first();
            await expect(swatch).toHaveCSS('background-color', 'rgb(0, 0, 255)');
            await expect(swatch).toHaveCSS('border-top-color', 'rgb(0, 0, 0)');
            await expect(swatch).toHaveCSS('border-top-width', '2px');
            // collapse and expand the legend
            await legend.locator('.h-annotation-legend-header').click();
            await expect(legend.locator('.h-annotation-legend-entry')).toHaveCount(0);
            await expect(legend.locator('.icon-up-open')).toHaveCount(1);
            await legend.locator('.h-annotation-legend-header').click();
            await expect(legend.locator('.h-annotation-legend-entry')).toHaveCount(2);
            // hiding the annotation hides the legend
            await annotationRow(page, 'drawn 2').locator('.h-toggle-annotation').click();
            await expect(legend).toHaveClass(/hidden/);
            await annotationRow(page, 'drawn 2').locator('.h-toggle-annotation').click();
            await expect(legend).not.toHaveClass(/hidden/);
            await expect(legend.locator('.h-annotation-legend-entry')).toHaveCount(2);
            // Showing the annotation refetches it.  Edits made while it is
            // loading are not saved, so wait for the fetch to finish.
            await waitForAnnotationsLoaded(page);
            await waitForAppCondition(page, (app) => {
                const annotation = app.bodyView.annotations.filter(
                    (annotation: any) => annotation.get('annotation').name === 'drawn 2')[0];
                return annotation && !annotation.get('loading');
            }, undefined, 'annotation to finish loading');
            // remove the legend
            await openEditDialog(page, 'drawn 2');
            await expect(entries).toHaveCount(2);
            await expect(entries.first().locator('.h-legend-label')).toHaveValue('Low');
            await expect(entries.first().locator('.h-legend-fill-color')).toHaveValue(/^rgb\(0, ?0, ?255\)$/);
            await entries.last().locator('.h-legend-remove').click();
            await expect(entries).toHaveCount(1);
            await entries.last().locator('.h-legend-remove').click();
            await expect(entries).toHaveCount(0);
            await submitDialog(page);
            expect((await annotationData(page, 'drawn 2')).legend).toEqual([]);
            await expect(legend).toHaveClass(/hidden/);
        });

        await test.step('edit annotation legend color range', async () => {
            const legend = page.locator('.h-annotation-legend-container');
            await openEditDialog(page, 'drawn 2');
            const entries = page.locator('.h-legend-entry');
            const stops = page.locator('.h-legend-stop');
            await expect(entries).toHaveCount(0);
            await page.locator('.h-add-legend-range').click();
            await expect(page.locator('.h-legend-entry.h-legend-range-entry')).toHaveCount(1);
            await expect(stops).toHaveCount(2);
            await page.locator('.h-legend-range-entry .h-legend-label').fill('Patch IoU');
            await setVal(page, '.h-legend-stop:first .h-legend-stop-color', 'blue');
            // every color must be filled in
            await page.locator('#g-dialog-container .h-submit').click();
            const validation = page.locator('.g-validation-failed-message');
            await expect(validation).not.toHaveClass(/hidden/);
            await expect(validation).toHaveText('Invalid legend color.');
            await expect(stops.last().locator('.has-error')).toHaveCount(1);
            // a range needs at least two colors
            await stops.last().locator('.h-legend-remove-stop').click();
            await expect(stops).toHaveCount(1);
            await page.locator('#g-dialog-container .h-submit').click();
            await expect(validation).toHaveText('Color ranges need at least two colors.');
            await expect(page.locator('.h-legend-add-stop')).toHaveClass(/has-error/);
            await page.locator('.h-legend-add-stop').click();
            await page.locator('.h-legend-add-stop').click();
            await expect(stops).toHaveCount(3);
            await setVal(page, '.h-legend-stop:eq(1) .h-legend-stop-color', 'white');
            await setVal(page, '.h-legend-stop:last .h-legend-stop-color', 'rgb(255, 0, 0)');
            await stops.first().locator('.h-legend-stop-label').fill('Low');
            await stops.last().locator('.h-legend-stop-label').fill('High');
            await setVal(page, '.h-legend-range-entry .h-legend-line-color', 'black');
            await submitDialog(page);

            expect((await annotationData(page, 'drawn 2')).legend).toEqual([{
                label: 'Patch IoU',
                fillColor: ['rgb(0, 0, 255)', 'rgb(255, 255, 255)', 'rgb(255, 0, 0)'],
                labels: ['Low', '', 'High'],
                lineColor: 'rgb(0, 0, 0)'
            }]);
            await expect(legend).not.toHaveClass(/hidden/);
            const range = legend.locator('.h-annotation-legend-range');
            await expect(range).toHaveCount(1);
            await expect(range.locator('.h-annotation-legend-label')).toHaveText('Patch IoU');
            await expect(range.locator('.h-annotation-legend-bar')).toHaveAttribute(
                'style', /linear-gradient\(to right, rgb\(0, 0, 255\), rgb\(255, 255, 255\), rgb\(255, 0, 0\)\)/);
            await expect(range.locator('.h-annotation-legend-bar')).toHaveCSS('border-top-color', 'rgb(0, 0, 0)');
            const labels = range.locator('.h-annotation-legend-range-label');
            await expect(labels).toHaveCount(2);
            await expect(labels.first()).toHaveText('Low');
            await expect(labels.last()).toHaveText('High');
            // remove the legend
            await openEditDialog(page, 'drawn 2');
            await expect(page.locator('.h-legend-range-entry')).toHaveCount(1);
            await expect(stops).toHaveCount(3);
            await expect(stops.first().locator('.h-legend-stop-color')).toHaveValue(/^rgb\(0, ?0, ?255\)$/);
            await expect(stops.first().locator('.h-legend-stop-label')).toHaveValue('Low');
            await expect(stops.nth(1).locator('.h-legend-stop-label')).toHaveValue('');
            await entries.locator('.h-legend-remove').click();
            await expect(entries).toHaveCount(0);
            await submitDialog(page);
            expect((await annotationData(page, 'drawn 2')).legend).toEqual([]);
            await expect(legend).toHaveClass(/hidden/);
        });
    });

    test('refresh while editing, change permissions, and delete an annotation', async ({page}) => {
        await openImageWithAnnotations(page);

        await test.step('keep annotation edits when the list refreshes while editing', async () => {
            await evalApp(page, (app) => {
                app.__refreshes = 0;
                app.__countRefresh = () => { app.__refreshes += 1; };
                app.bodyView.annotations.on('g:changed', app.__countRefresh);
            });
            await openEditDialog(page, 'drawn 2');
            // a notification that asks to refresh the annotation list
            await evalApp(page, (app) => {
                // @ts-ignore
                window.girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                    data: {itemId: app.bodyView.annotationSelector.parentItem.id}
                });
            });
            await waitForDialog(page);
            expect(await evalApp(page, (app) => app.__refreshes)).toBe(0);
            await page.locator('#h-annotation-description').fill('edited during a refresh');
            await submitDialog(page);
            // the refresh happens once the dialog is closed
            await waitForAppCondition(page, (app) => app.__refreshes > 0, undefined, 'annotation list to refresh');
            await waitForIdlePage(page);
            await evalApp(page, (app) => {
                app.bodyView.annotations.off('g:changed', app.__countRefresh);
                delete app.__refreshes;
                delete app.__countRefresh;
            });
            expect((await annotationData(page, 'drawn 2')).description).toBe('edited during a refresh');
        });

        await test.step('set annotation permissions to WRITE', async () => {
            // The old test changed the permissions of 'edited 1' and then
            // deleted it; the selector only offers deletion to owners, so the
            // permissions are changed on 'drawn 2' instead.
            await openEditDialog(page, 'drawn 2');
            await expect(page.locator('#g-dialog-container .h-access')).toHaveCount(1);
            await page.locator('#g-dialog-container .h-access').click();
            await expect(page.locator('#g-access-public')).toHaveCount(1);
            await waitForDialog(page);
            const dialog = page.locator('#g-dialog-container');
            await expect(dialog.locator('.modal-title')).toHaveText('Access control');

            // set edit-only access
            await expect(dialog.locator('.g-user-access-entry')).toHaveCount(1);
            await dialog.locator('.g-user-access-entry .g-access-col-right select').selectOption('1');
            await dialog.locator('.g-save-access-list').click();
            await expect(dialog).toBeHidden();
            await waitForIdlePage(page);
            const id = await annotationRow(page, 'drawn 2').getAttribute('data-id');
            const access = await rest(page, `annotation/${id}/access`, {token: resources.adminToken});
            expect(access.users.map((user: any) => [user.login, user.level])).toEqual([['user', 1]]);

            // The dialog refetches the annotation after saving the access list.
            await waitForAppCondition(page, (app, id) => app.bodyView.annotations.get(id).get('_accessLevel') === 1, id,
                'annotation access level to update');

            // the user should still have the edit button
            await expect(annotationRow(page, 'drawn 2').locator('.h-edit-annotation-metadata')).toHaveCount(1);
            await openEditDialog(page, 'drawn 2');
            // admin access should be removed
            await expect(page.locator('#g-dialog-container .h-access')).toHaveCount(0);
            await page.locator('#g-dialog-container .h-cancel').click();
            await expect(page.locator('#g-dialog-container')).toBeHidden();
        });

        await test.step('delete an annotation', async () => {
            await annotationRow(page, 'edited 1').locator('.h-delete-annotation').click();
            await waitForDialog(page);
            await page.locator('#g-dialog-container .h-submit').click();
            await expect(page.locator('#g-dialog-container')).toBeHidden();
            await waitForIdlePage(page);
            await expect(annotationRow(page, 'edited 1')).toHaveCount(0);
            const annotations = await listUserAnnotations(page, imageId);
            expect(annotations).toHaveLength(1);
        });
    });

    test('draw panel, mouse events, job events, context menu, and hotkeys', async ({page}) => {
        await openImageWithAnnotations(page);

        await test.step('cannot edit an annotation as a non-admin', async () => {
            // Record alerts by wrapping the event trigger (the old test used
            // _.wrap for the same purpose).
            await evalApp(page, (app) => {
                // @ts-ignore
                const events = window.girder.events;
                app.__trigger = events.trigger;
                app.__alerts = [];
                events.trigger = function (event: string, options: unknown) {
                    if (event === 'g:alert') {
                        app.__alerts.push(options);
                    }
                    return app.__trigger.apply(this, arguments);
                };
            });
            await annotationRow(page, 'drawn 2').locator('.h-toggle-annotation').click();
            await expect(annotationRow(page, 'drawn 2').locator('.icon-eye-off')).toHaveCount(1);
            await annotationRow(page, 'admin annotation').locator('.h-annotation-name').click();
            await waitForIdlePage(page);
            const alerts = await evalApp(page, (app) => {
                // @ts-ignore
                window.girder.events.trigger = app.__trigger;
                const alerts = app.__alerts;
                delete app.__trigger;
                delete app.__alerts;
                return alerts;
            });
            expect(alerts.length).toBeGreaterThan(0);
            expect(alerts[0].text).toBe('You do not have write access to this annotation.');
            await expect(page.locator('.h-elements-container')).toHaveCount(0);
        });

        await test.step('close the open draw panel', async () => {
            await annotationRow(page, 'drawn 2').locator('.h-annotation-name').click();
            await expect(page.locator('.h-elements-container')).toHaveCount(1);
            await waitForIdlePage(page);
            await annotationRow(page, 'drawn 2').locator('.h-annotation-name').click();
            await expect(page.locator('.h-elements-container')).toHaveCount(0);
            await waitForIdlePage(page);
        });

        await test.step('open the draw panel for an editable annotation', async () => {
            await annotationRow(page, 'drawn 2').locator('.h-annotation-name').click();
            await expect(page.locator('.h-elements-container')).toHaveCount(1);
            await waitForIdlePage(page);
            await expect(annotationRow(page, 'drawn 2').locator('.icon-eye')).toHaveCount(1);
            await expect(page.locator('.h-draw-widget .h-panel-name')).toHaveText('drawn 2');
            await expect(page.locator('.h-draw-widget .h-element')).toHaveCount(1);
        });

        const drawn2 = annotationRow(page, 'drawn 2');
        const element = page.locator('.h-draw-widget .h-element');
        const triggerMouseEvent = (event: string) => evalApp(page, (app, event) => {
            // @ts-ignore
            const $ = window.girder.$;
            const annotationId = $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id');
            const element = app.bodyView.annotations.get(annotationId).elements().get($('.h-draw-widget .h-element').data('id'));
            app.bodyView.viewerWidget.trigger(event, element, annotationId);
        }, event);

        await test.step('trigger a mouseon event on an element with interactivity off', async () => {
            await expect(page.locator('#h-toggle-interactive')).not.toBeChecked();
            await triggerMouseEvent('g:mouseOnAnnotation');
            await expect(drawn2).not.toHaveClass(/h-highlight-annotation/);
            await expect(element).not.toHaveClass(/h-highlight-element/);
        });

        await test.step('trigger a mouseon event and then turn interactivity off', async () => {
            await page.locator('#h-toggle-interactive').click(); // interactive on
            await expect(page.locator('#h-toggle-interactive')).toBeChecked();
            await triggerMouseEvent('g:mouseOnAnnotation');
            await expect(drawn2).toHaveClass(/h-highlight-annotation/);
            await expect(element).toHaveClass(/h-highlight-element/);

            await page.locator('#h-toggle-interactive').click(); // interactive off
            await expect(page.locator('#h-toggle-interactive')).not.toBeChecked();
            await expect(drawn2).not.toHaveClass(/h-highlight-annotation/);
            await expect(element).not.toHaveClass(/h-highlight-element/);
        });

        await test.step('turn on interactivity and trigger a mouseon event', async () => {
            await page.locator('#h-toggle-interactive').click(); // interactive on
            await expect(page.locator('#h-toggle-interactive')).toBeChecked();
            await triggerMouseEvent('g:mouseOnAnnotation');
            await expect(drawn2).toHaveClass(/h-highlight-annotation/);
            await expect(element).toHaveClass(/h-highlight-element/);
        });

        await test.step('trigger a mouseoff event', async () => {
            await triggerMouseEvent('g:mouseOffAnnotation');
            await expect(drawn2).not.toHaveClass(/h-highlight-annotation/);
            await expect(element).not.toHaveClass(/h-highlight-element/);
        });

        // Replace viewerWidget.highlightAnnotation with a recorder while a
        // jQuery mouse event is triggered on an element, and resolve with the
        // recorded calls along with the ids the calls are compared against.
        const recordHighlight = (selector: string, event: string) => evalApp(page, (app, arg) => {
            // @ts-ignore
            const $ = window.girder.$;
            const widget = app.bodyView.viewerWidget;
            const original = widget.highlightAnnotation;
            const calls: unknown[][] = [];
            widget.highlightAnnotation = function (annotation: unknown, element: unknown) {
                calls.push([annotation, element]);
            };
            try {
                $(arg.selector).trigger(arg.event);
            } finally {
                widget.highlightAnnotation = original;
            }
            return {
                calls,
                annotationId: $('.h-annotation-selector .h-annotation:contains("drawn 2")').data('id'),
                elementId: $('.h-element').data('id')
            };
        }, {selector, event});

        await test.step('mouseover an annotation in the AnnotationSelector', async () => {
            const result = await recordHighlight('.h-annotation-selector .h-annotation:contains("drawn 2")', 'mouseenter');
            expect(result.calls).toHaveLength(1);
            expect(result.calls[0][0]).toBe(result.annotationId);
            expect(result.calls[0][1]).toBeUndefined();
        });

        await test.step('mouseover an annotation in the Draw widget', async () => {
            const result = await recordHighlight('.h-element', 'mouseenter');
            expect(result.calls).toHaveLength(1);
            expect(result.calls[0][0]).toBe(result.annotationId);
            expect(result.calls[0][1]).toBe(result.elementId);
        });

        await test.step('mouseout to reset the highlight state', async () => {
            const result = await recordHighlight('.h-element', 'mouseout');
            expect(result.calls).toHaveLength(1);
            expect(result.calls[0][0]).toBeUndefined();
            expect(result.calls[0][1]).toBeUndefined();
        });

        await test.step('mouseover a hidden annotation should be a no-op', async () => {
            await annotationRow(page, 'admin annotation').locator('.icon-eye').click();
            await expect(annotationRow(page, 'admin annotation').locator('.icon-eye-off')).toHaveCount(1);
            await waitForIdlePage(page);
            const result = await recordHighlight('.h-annotation-selector .h-annotation:contains("admin annotation")', 'mouseenter');
            expect(result.calls).toHaveLength(0);
        });

        await test.step('show new annotations during job events', async () => {
            await pageRest(page, {
                url: `annotation?itemId=${imageId}`,
                method: 'POST',
                contentType: 'application/json',
                data: {
                    name: 'rectangle',
                    description: 'the description',
                    elements: [{center: [2000, 2000, 0], height: 4000, rotation: 0, type: 'rectangle', width: 4000}]
                }
            });
            // A job finishing is reported through the event stream; the
            // annotation selector refreshes its list when one does.
            await page.evaluate(() => {
                // @ts-ignore
                window.girder.utilities.eventStream.trigger('g:event.job_status', {data: {status: 3}});
            });
            const row = annotationRow(page, 'rectangle');
            await expect(row).toHaveCount(1);
            await waitForAnnotationsLoaded(page);
            await expect(row.locator('.icon-eye.h-toggle-annotation')).toHaveCount(1);
        });

        // A point on the image inside the 'rectangle' annotation and away
        // from the other annotations' elements.
        const hover = await toDisplay(page, 1000, 1000);
        const popover = page.locator('#h-annotation-popover-container');

        await test.step('hover over annotation with labels off', async () => {
            await expect(page.locator('#h-toggle-labels')).not.toBeChecked();
            await simulateMapEvent(page, 'mousemove', {map: hover});
            await expect(popover).toHaveClass(/hidden/);
        });

        await test.step('hover over annotation with labels on', async () => {
            await page.locator('#h-toggle-labels').click();
            await expect(page.locator('#h-toggle-labels')).toBeChecked();
            // The old test waited a tick before moving the mouse because the
            // hover event occasionally failed to fire; retry the move instead.
            await expect(async () => {
                await simulateMapEvent(page, 'mousemove', {map: {x: hover.x - 5, y: hover.y - 5}});
                await simulateMapEvent(page, 'mousemove', {map: hover});
                await expect(popover.locator('.h-annotation-name')).toHaveText('rectangle', {timeout: 1000});
            }).toPass();
            await expect(popover).not.toHaveClass(/hidden/);
            await expect(popover.locator('.h-annotation-description')).toContainText('the description');
        });

        const contextMenu = page.locator('#h-annotation-context-menu');

        await test.step('open and close the context menu', async () => {
            await rightClick(page, hover.x, hover.y);
            await expect(contextMenu).not.toHaveClass(/hidden/);
            await page.evaluate(() => {
                // @ts-ignore
                const $ = window.girder.$;
                $(document).trigger('mousedown');
                $(document).trigger('mouseup');
            });
            await expect(contextMenu).toHaveClass(/hidden/);
        });

        await test.step('delete an element from the context menu', async () => {
            await rightClick(page, hover.x, hover.y);
            await expect(contextMenu).not.toHaveClass(/hidden/);
            // wait for the next animation frame so that the highlighting is finished
            await delay(30);
            await contextMenu.locator('.h-remove-elements').click();
            await expect(contextMenu).toHaveClass(/hidden/);
            await waitForIdlePage(page);
            await expect.poll(async () => (await annotationData(page, 'rectangle')).elements.length).toBe(0);
        });

        await test.step('edit the user hotkey file directly', async () => {
            await setUserConfig(page, resources, 'hotkeys:\n  - action: draw.rectangle\n    key: y\n');
        });

        await test.step('open a different image', async () => {
            await openImage(page, 'copy');
            await expect(page.locator('.h-annotation-selector .h-annotation')).toHaveCount(0);
        });

        await test.step('loads the user hotkey file with the image', async () => {
            await waitForAppCondition(page, (app) => {
                // @ts-ignore
                return window.girder.plugins.histomicsui.hotkeys.hotkeyText('draw.rectangle', app.bodyView.hotkeys) === 'Y';
            }, undefined, 'user hotkeys to load');
            await setUserConfig(page, resources, '{}\n');
        });

        await test.step('open the original image', async () => {
            await openImage(page, 'image');
            await expandGroups(page);
            await expect(page.locator('.h-annotation-selector .h-annotation')).toHaveCount(3);
        });
    });
});
