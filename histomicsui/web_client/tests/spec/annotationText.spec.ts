import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog} from '../util';
import {evalApp, gotoHistomics, huiLogin, openImage, rest, setupResources, simulateMapEvent, type Resources} from '../hui';

// Ported from the 'Text elements' and 'Sort By' sections of the Jasmine
// annotationSpec.js.  The 'empty text is discarded' test from the former is
// in its own describe since it is expected to fail (see the comment there).

interface Element {
    id: string;
    type: string;
    text?: string;
    center?: number[];
    lineColor?: string;
    fillColor?: string;
    lineWidth?: number;
    fontSize?: number;
    pattern?: string;
}

const ANNOTATION_NAME = 'drawn 1';

/**
 * Wait for all REST requests from the page to finish.
 */
const waitForRest = async (page: Page) => {
    await page.waitForFunction(() => {
        // @ts-ignore
        return window.girder.rest.numberOutstandingRestRequests() === 0;
    });
};

/**
 * Create a new annotation through the annotation panel's "new annotation"
 * dialog and wait for the draw panel to show.
 */
const createAnnotation = async (page: Page, name: string) => {
    await page.locator('.h-create-annotation').click();
    await waitForDialog(page);
    await expect(page.locator('#h-annotation-name')).toHaveCount(1);
    await page.locator('#h-annotation-name').fill(name);
    await page.locator('#g-dialog-container .h-submit').click();
    await expect(page.locator('#g-dialog-container')).toBeHidden();
    await waitForRest(page);
    await expect(page.locator('.h-draw-widget')).not.toHaveClass(/hidden/);
    await expect(page.locator('.h-draw-widget .h-draw[data-type="text"]')).toBeVisible();
};

/**
 * Fetch the annotation with the given name that the user owns on the image
 * as the server has it (the old `checkAutoSave` helper).  Callers should use
 * this inside `expect.poll`, since the autosave may still be in progress.
 */
const savedAnnotation = async (page: Page, resources: Resources, name: string) => {
    const annotations = await rest(page, 'annotation', {
        token: resources.userToken,
        params: {itemId: resources.imageId, userId: resources.userId}
    });
    const found = annotations.filter((a: {annotation: {name: string}}) => a.annotation.name === name).pop();
    if (!found) {
        return null;
    }
    return rest(page, `annotation/${found._id}`, {token: resources.userToken});
};

/**
 * The text elements of the saved annotation.
 */
const savedTextElements = async (page: Page, resources: Resources): Promise<Element[]> => {
    const annotation = await savedAnnotation(page, resources, ANNOTATION_NAME);
    return annotation ? annotation.annotation.elements.filter((el: Element) => el.type === 'text') : [];
};

/**
 * The text elements of the draw widget's collection, as plain objects.
 */
const textElements = (page: Page): Promise<Element[]> => evalApp(page, (app) => {
    return app.bodyView.drawWidget.collection
        .filter((model: any) => model.get('type') === 'text')
        .map((model: any) => model.toJSON());
});

const editor = (page: Page) => page.locator('.h-image-view-body .g-li-annotation-text-edit');
const mover = (page: Page) => page.locator('.h-image-view-body .g-li-annotation-text-move');
const textButton = (page: Page) => page.locator('.h-draw[data-type="text"]');
const drawModeMap = (page: Page) => page.locator('.geojs-map.annotation-input');
const elementRows = (page: Page) => page.locator('.h-elements-container .h-element');

const clickMap = async (page: Page, x: number, y: number) => {
    await simulateMapEvent(page, 'mousedown', {map: {x, y}, button: 'left'});
    await simulateMapEvent(page, 'mouseup', {map: {x, y}, button: 'left'});
};

const hiddenElement = (page: Page) => evalApp(page, (app) => app.bodyView.viewerWidget._hideElement);

const gcsToDisplay = (page: Page, center: number[]) => evalApp(page, (app, c: number[]) => {
    const pt = app.bodyView.viewer.gcsToDisplay({x: c[0], y: c[1]});
    return {x: pt.x, y: pt.y};
}, center);

/**
 * Start the "Edit Shape" action on the text element.  This shows the text so
 * it can be moved; if edit is true, click on it to edit the text.
 */
const editShape = async (page: Page, textId: string, edit: boolean) => {
    await evalApp(page, (app, id: string) => {
        const element = app.bodyView.drawWidget.collection.get(id);
        app.bodyView._editElementShape(element, app.bodyView.activeAnnotation.id);
    }, textId);
    await expect(mover(page)).toHaveCount(1);
    await expect(editor(page)).toHaveCount(0);
    // the drawn text is hidden while it is edited
    expect(await hiddenElement(page)).toBe(textId);
    if (edit) {
        await mover(page).click();
        await expect(mover(page)).toHaveCount(0);
        await expect(editor(page)).toHaveCount(1);
    }
};

const finishEditor = async (page: Page, text: string) => {
    await editor(page).fill(text);
    await editor(page).press('Control+Enter');
};

/**
 * Drag the movable text by the given offset with the mouse.
 */
const dragMover = async (page: Page, dx: number, dy: number) => {
    const box = await mover(page).boundingBox();
    expect(box).toBeTruthy();
    const x = (box as {x: number}).x + (box as {width: number}).width / 2;
    const y = (box as {y: number}).y + (box as {height: number}).height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + dx, y + dy, {steps: 4});
    await page.mouse.up();
};

test.describe('Text elements', () => {
    setupServer();

    test('draw, edit, move, and delete text', async ({page}) => {
        // Several interactions with the server and the viewer are chained
        // here; give it more time than a typical test.
        test.slow();
        const resources = await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await createAnnotation(page, ANNOTATION_NAME);

        let baseCount = 0;
        let textId = '';

        await test.step('draw text', async () => {
            baseCount = await elementRows(page).count();
            await expect(textButton(page)).toHaveCount(1);
            await textButton(page).click();
            await expect(drawModeMap(page).first()).toBeAttached();
            await expect(textButton(page)).toHaveClass(/active/);
            await clickMap(page, 150, 150);
            await expect(editor(page)).toHaveCount(1);
            // re-rendering the draw panel, such as after another change is
            // saved, doesn't discard what is being typed
            await editor(page).fill('Still here');
            const rerendered = await evalApp(page, (app) => {
                const selector = '.h-image-view-body .g-li-annotation-text-edit';
                const input = document.querySelector(selector) as HTMLTextAreaElement;
                app.bodyView.drawWidget.render();
                const afterRender = {
                    count: document.querySelectorAll(selector).length,
                    same: document.querySelector(selector) === input,
                    value: input.value,
                    active: document.querySelector('.h-draw[data-type="text"]')?.classList.contains('active')
                };
                app.bodyView.drawWidget.drawElement(undefined, 'text');
                const afterDraw = {
                    same: document.querySelector(selector) === input,
                    value: input.value,
                    focused: document.activeElement === input
                };
                return {afterRender, afterDraw};
            });
            expect(rerendered).toEqual({
                afterRender: {count: 1, same: true, value: 'Still here', active: true},
                afterDraw: {same: true, value: 'Still here', focused: true}
            });
            // keys typed in the editor are not keyboard shortcuts
            await editor(page).press('r');
            await expect(page.locator('.h-draw.active')).toHaveAttribute('data-type', 'text');
            await finishEditor(page, '  A comment\twith a tab\nand a second line  ');
            await expect(elementRows(page)).toHaveCount(baseCount + 1);
            await expect(editor(page)).toHaveCount(0);
            const elements = await textElements(page);
            expect(elements).toHaveLength(1);
            textId = elements[0].id;
            expect(elements[0].text).toBe('A comment with a tab\nand a second line');
            expect(elements[0].lineColor).toBe('rgb(0,0,0)');
            expect(elements[0].fontSize).toBe(16);
            expect(elements[0].fillColor).toBeUndefined();
            expect(elements[0].lineWidth).toBeUndefined();
            expect(elements[0].pattern).toBeUndefined();
            await expect(page.locator(`.h-elements-container .h-element[data-id="${textId}"] .h-element-label`)).toHaveText(/^default text \d+$/);
            // text drawing stays on
            await expect(textButton(page)).toHaveClass(/active/);
            // the text was autosaved
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.map((el) => el.text)))
                .toEqual(['A comment with a tab\nand a second line']);
            const saved = await savedTextElements(page, resources);
            expect(saved[0].center?.length).toBe(3);
            // Turn text drawing off (the old test did this at the end of
            // 'empty text is discarded', which is in the 'Empty text' describe
            // below).
            await textButton(page).click();
            await expect(textButton(page)).not.toHaveClass(/active/);
            await expect(drawModeMap(page)).toHaveCount(0);
        });

        await test.step('toggle text mode with a keyboard shortcut', async () => {
            await page.locator('.h-image-body').focus();
            await page.keyboard.press('t');
            await expect(page.locator('.h-draw.active')).toHaveAttribute('data-type', 'text');
            await page.locator('.h-image-body').focus();
            await page.keyboard.press('t');
            await expect(page.locator('.h-draw.active')).toHaveCount(0);
        });

        await test.step('edit text in place', async () => {
            await editShape(page, textId, true);
            const center = (await textElements(page))[0].center;
            await expect(editor(page)).toHaveValue('A comment with a tab\nand a second line');
            await expect(editor(page)).toHaveAttribute('rows', '2');
            await finishEditor(page, 'Edited in place');
            await expect(editor(page)).toHaveCount(0);
            const element = (await textElements(page))[0];
            // the text wasn't moved
            expect(element.center).toEqual(center);
            expect(element.text).toBe('Edited in place');
            expect(await hiddenElement(page)).toBeUndefined();
            await expect(elementRows(page)).toHaveCount(baseCount + 1);
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.map((el) => el.text)))
                .toEqual(['Edited in place']);
        });

        await test.step('canceling an in place edit keeps the text', async () => {
            await editShape(page, textId, true);
            await editor(page).fill('Not kept');
            await editor(page).press('Escape');
            await expect(editor(page)).toHaveCount(0);
            expect((await textElements(page))[0].text).toBe('Edited in place');
            expect(await hiddenElement(page)).toBeUndefined();
        });

        await test.step('move text by dragging it', async () => {
            await editShape(page, textId, false);
            let center = (await textElements(page))[0].center as number[];
            const display = await gcsToDisplay(page, center);
            await expect(mover(page)).toHaveText('Edited in place');
            await dragMover(page, 40, -25);
            // dragging doesn't start editing or change the element yet
            await expect(mover(page)).toHaveCount(1);
            await expect(editor(page)).toHaveCount(0);
            expect((await textElements(page))[0].center).toEqual(center);
            // clicking elsewhere finishes
            await mover(page).blur();
            await expect(mover(page)).toHaveCount(0);
            const element = (await textElements(page))[0];
            const moved = await gcsToDisplay(page, element.center as number[]);
            expect(moved.x).toBeCloseTo(display.x + 40, 0);
            expect(moved.y).toBeCloseTo(display.y - 25, 0);
            expect((element.center as number[])[2]).toBe(center[2]);
            expect(element.text).toBe('Edited in place');
            expect(await hiddenElement(page)).toBeUndefined();
            center = element.center as number[];
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.map((el) => (el.center as number[]).slice(0, 2).map((v) => Math.round(v * 1000)))))
                .toEqual([center.slice(0, 2).map((v) => Math.round(v * 1000))]);
            const saved = await savedTextElements(page, resources);
            expect(saved[0].text).toBe('Edited in place');
            // escape cancels a move
            await editShape(page, textId, false);
            await dragMover(page, 60, 60);
            await mover(page).press('Escape');
            await expect(mover(page)).toHaveCount(0);
            expect((await textElements(page))[0].center).toEqual(center);
            expect(await hiddenElement(page)).toBeUndefined();
        });

        await test.step('keep text edits when the annotation list refreshes while editing', async () => {
            const refreshes = () => page.evaluate(() => (window as any).__refreshes as number);
            // a notification that asks to refresh the annotation list
            const requestRefresh = () => evalApp(page, (app) => {
                // @ts-ignore
                window.girder.utilities.eventStream.trigger('g:event.large_image_annotation.create', {
                    data: {itemId: app.bodyView.annotationSelector.parentItem.id}
                });
            });
            await editShape(page, textId, false);
            const annotationId: string = await evalApp(page, (app) => {
                (window as any).__refreshes = 0;
                (window as any).__countRefresh = () => {
                    (window as any).__refreshes += 1;
                };
                app.bodyView.annotations.on('g:changed', (window as any).__countRefresh);
                return app.bodyView.annotationSelector._activeAnnotation.id;
            });
            await requestRefresh();
            await waitForRest(page);
            // nothing was refreshed while the text could be moved
            expect(await refreshes()).toBe(0);
            await expect(mover(page)).toHaveCount(1);
            await mover(page).click();
            await expect(editor(page)).toHaveCount(1);
            await requestRefresh();
            await waitForRest(page);
            // or while it is being typed
            expect(await refreshes()).toBe(0);
            await expect(editor(page)).toHaveCount(1);
            await finishEditor(page, 'Edited during a refresh');
            // the refresh happens once the text is no longer being edited
            await expect.poll(refreshes).toBeGreaterThan(0);
            await waitForRest(page);
            await evalApp(page, (app) => {
                app.bodyView.annotations.off('g:changed', (window as any).__countRefresh);
            });
            const resp = await rest(page, `annotation/${annotationId}`, {token: resources.userToken});
            const saved = resp.annotation.elements.filter((el: Element) => el.type === 'text');
            expect(saved).toHaveLength(1);
            expect(saved[0].text).toBe('Edited during a refresh');
            const elements = await textElements(page);
            expect(elements).toHaveLength(1);
            expect(elements[0].text).toBe('Edited during a refresh');
            // put the text back for the following steps
            await evalApp(page, (app, id: string) => {
                app.bodyView.drawWidget.collection.get(id).set('text', 'Edited in place');
            }, textId);
            await waitForRest(page);
        });

        await test.step('the config file can make enter finish the text', async () => {
            // The folder config is what a .histomicsui_config.yaml provides;
            // the old test patched it on the view directly, as is done here.
            const setEnterKey = (finish: boolean) => evalApp(page, (app, finish: boolean) => {
                const win = window as any;
                if (win.__folderConfig === undefined) {
                    win.__folderConfig = {config: app.bodyView._folderConfig};
                }
                app.bodyView._folderConfig = finish
                    ? Object.assign({}, win.__folderConfig.config, {textAnnotations: {enterKey: 'finish'}})
                    : win.__folderConfig.config;
            }, finish);
            const textEditOptions = () => evalApp(page, (app) => app.bodyView._textEditOptions());
            const elementText = async () => (await textElements(page))[0].text;

            expect(await textEditOptions()).toEqual({enterKey: 'newline'});
            await editShape(page, textId, true);
            // by default, enter doesn't finish
            await editor(page).fill('Enter is a new line');
            await editor(page).press('Enter');
            await expect(editor(page)).toHaveCount(1);
            await editor(page).press('Escape');
            await expect(editor(page)).toHaveCount(0);
            expect(await elementText()).toBe('Edited in place');
            await setEnterKey(true);
            expect(await textEditOptions()).toEqual({enterKey: 'finish'});
            await editShape(page, textId, true);
            await editor(page).fill('Finished with enter');
            await editor(page).press('Shift+Enter');
            await expect(editor(page)).toHaveCount(1);
            await editor(page).press('Enter');
            await expect(editor(page)).toHaveCount(0);
            expect(await elementText()).toBe('Finished with enter');
            // put things back
            await evalApp(page, (app, id: string) => {
                app.bodyView.drawWidget.collection.get(id).set('text', 'Edited in place');
            }, textId);
            await setEnterKey(false);
            // new text uses the setting, too
            await setEnterKey(true);
            await textButton(page).click();
            await expect(drawModeMap(page).first()).toBeAttached();
            await clickMap(page, 300, 250);
            await expect(editor(page)).toHaveCount(1);
            await editor(page).fill('New with enter');
            await editor(page).press('Enter');
            await expect(editor(page)).toHaveCount(0);
            await expect.poll(() => textElements(page).then((elements) => elements.length)).toBe(2);
            const elements = await textElements(page);
            expect(elements[1].text).toBe('New with enter');
            await setEnterKey(false);
            await textButton(page).click();
            await evalApp(page, (app, id: string) => {
                app.bodyView.drawWidget.deleteElement(undefined, id);
            }, elements[1].id);
            expect((await textElements(page))).toHaveLength(1);
            await expect(textButton(page)).not.toHaveClass(/active/);
            await waitForRest(page);
        });

        await test.step('edit text properties', async () => {
            const dialog = page.locator('#g-dialog-container');
            await page.locator(`.h-elements-container .h-element[data-id="${textId}"] .h-edit-element`).click();
            await waitForDialog(page);
            await expect(dialog.locator('#h-element-text')).toHaveValue('Edited in place');
            await expect(dialog.locator('#h-element-font-size')).toHaveValue('16');
            await expect(dialog.locator('#h-element-line-color')).toHaveCount(1);
            // text doesn't have these properties
            await expect(dialog.locator('#h-element-line-width')).toHaveCount(0);
            await expect(dialog.locator('#h-element-fill-color')).toHaveCount(0);
            await expect(dialog.locator('#h-element-fill-pattern')).toHaveCount(0);
            // empty text and bad sizes are not allowed
            await dialog.locator('#h-element-text').fill('   ');
            await dialog.locator('#h-element-font-size').fill('-3');
            await dialog.locator('.h-submit').click();
            await expect(dialog.locator('.g-validation-failed-message')).not.toHaveClass(/hidden/);
            await expect(dialog.locator('.g-validation-failed-message')).toContainText('text cannot be empty');
            await expect(dialog.locator('.g-validation-failed-message')).toContainText('Invalid font size');
            expect((await textElements(page))[0].text).toBe('Edited in place');
            // The value is set directly, as the old test did, since the
            // control character can't be typed.
            await dialog.locator('#h-element-text').evaluate((el, value) => {
                (el as HTMLTextAreaElement).value = value;
            }, ' From the dialog\r\nline two\u0007 ');
            await dialog.locator('#h-element-font-size').fill('24');
            await dialog.locator('#h-element-line-color').evaluate((el, value) => {
                (el as HTMLInputElement).value = value;
            }, '#ff0000');
            await dialog.locator('.h-submit').click();
            await expect(dialog).toBeHidden();
            const element = (await textElements(page))[0];
            expect(element.text).toBe('From the dialog\nline two');
            expect(element.fontSize).toBe(24);
            expect(element.lineColor).toBe('rgb(255, 0, 0)');
            expect(element.fillColor).toBeUndefined();
            expect(element.lineWidth).toBeUndefined();
            expect(element.pattern).toBeUndefined();
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.map((el) => [el.text, el.fontSize])))
                .toEqual([['From the dialog\nline two', 24]]);
        });

        await test.step('a long comment can be edited', async () => {
            const lines: string[] = [];
            for (let i = 0; i < 200; i += 1) {
                const words: string[] = [];
                for (let j = 0; j < 15; j += 1) {
                    words.push('word' + (i * 15 + j));
                }
                lines.push(words.join(' '));
            }
            const longText = lines.join('\n');
            await editShape(page, textId, true);
            await finishEditor(page, longText);
            await expect(editor(page)).toHaveCount(0);
            expect((await textElements(page))[0].text).toBe(longText);
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.map((el) => el.text)))
                .toEqual([longText]);
            const saved = await savedTextElements(page, resources);
            expect((saved[0].text as string).split(/\s+/)).toHaveLength(3000);
        });

        await test.step('removing all of the text deletes the element', async () => {
            await editShape(page, textId, true);
            await finishEditor(page, ' \n ');
            await expect(editor(page)).toHaveCount(0);
            expect((await textElements(page))).toHaveLength(0);
            await expect(elementRows(page)).toHaveCount(baseCount);
            await expect.poll(() => savedTextElements(page, resources).then((saved) => saved.length)).toBe(0);
        });
    });
});

test.describe('Empty text', () => {
    setupServer();

    // The old 'empty text is discarded' test.  It has its own server because
    // it leaves text mode on.
    test('empty text is discarded', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await createAnnotation(page, 'drawn text');
        const baseCount = await elementRows(page).count();
        // draw a first text, leaving text mode on
        await textButton(page).click();
        await expect(drawModeMap(page).first()).toBeAttached();
        await clickMap(page, 150, 150);
        await expect(editor(page)).toHaveCount(1);
        await finishEditor(page, 'A comment');
        await expect(elementRows(page)).toHaveCount(baseCount + 1);
        await expect(textButton(page)).toHaveClass(/active/);

        await expect(drawModeMap(page).first()).toBeAttached();
        await clickMap(page, 250, 150);
        await expect(editor(page)).toHaveCount(1);
        await finishEditor(page, '  \n ');
        await expect(editor(page)).toHaveCount(0);
        expect((await textElements(page))).toHaveLength(1);
        await expect(elementRows(page)).toHaveCount(baseCount + 1);
        // still in text mode
        await expect(textButton(page)).toHaveClass(/active/);
        await expect(drawModeMap(page).first()).toBeAttached();
        // escape while typing cancels the text
        await clickMap(page, 250, 150);
        await expect(editor(page)).toHaveCount(1);
        await editor(page).fill('Canceled');
        await editor(page).press('Escape');
        await expect(editor(page)).toHaveCount(0);
        expect((await textElements(page))).toHaveLength(1);
        await expect(drawModeMap(page).first()).toBeAttached();
        await clickMap(page, 250, 150);
        await expect(editor(page)).toHaveCount(1);
        // clicking the button while typing keeps the text and turns off
        // text mode
        await editor(page).fill('Kept when the tool is turned off');
        await editor(page).blur();
        await textButton(page).click();
        await expect.poll(() => textElements(page).then((elements) => elements.length)).toBe(2);
        const elements = await textElements(page);
        expect(elements[1].text).toBe('Kept when the tool is turned off');
        await expect(textButton(page)).not.toHaveClass(/active/);
        expect(await evalApp(page, (app) => app.bodyView.drawWidget.drawingType())).toBeNull();
        await expect(drawModeMap(page)).toHaveCount(0);
        await evalApp(page, (app, id: string) => {
            app.bodyView.drawWidget.deleteElement(undefined, id);
        }, elements[1].id);
        expect((await textElements(page))).toHaveLength(1);
        await expect(elementRows(page)).toHaveCount(baseCount + 1);
    });
});

test.describe('Sort By', () => {
    setupServer();

    test('sorts the element list', async ({page}) => {
        const testLabels = ['Alpha', 'Bravo', 'Charlie', 'Delta'];
        const testIds = ['sort-test-alpha', 'sort-test-bravo', 'sort-test-charlie', 'sort-test-delta'];
        const testElementLabels = async () => {
            const labels = await page.locator('.h-elements-container .h-element-label').allTextContents();
            return labels.filter((text) => testLabels.includes(text));
        };
        const sortMode = page.locator('.h-sort-mode');
        const sortOrder = page.locator('.h-sort-order');

        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');
        await createAnnotation(page, 'sorted');

        await test.step('add elements with distinct labels, groups, and shapes', async () => {
            await evalApp(page, (app) => {
                app.bodyView.drawWidget.collection.add([
                    // give each element valid geometry; the viewer may redraw
                    // the annotation and fails on shapes without coordinates
                    {id: 'sort-test-charlie', type: 'point', center: [100, 100, 0], label: {value: 'Charlie'}, group: 'rareGroup'},
                    {id: 'sort-test-alpha', type: 'point', center: [120, 100, 0], label: {value: 'Alpha'}, group: 'commonGroup'},
                    {id: 'sort-test-bravo', type: 'rectangle', center: [140, 100, 0], width: 10, height: 10, rotation: 0, label: {value: 'Bravo'}, group: 'commonGroup'},
                    {id: 'sort-test-delta', type: 'polyline', points: [[160, 100, 0], [170, 110, 0]], closed: false, label: {value: 'Delta'}, group: 'commonGroup'}
                ]);
            });
            await expect.poll(() => testElementLabels().then((labels) => labels.length)).toBe(testLabels.length);
        });

        await test.step('defaults to sorting by label, ascending', async () => {
            await expect(sortMode).toHaveValue('label');
            await expect(sortOrder.locator('i')).toHaveClass(/icon-sort-alt-up/);
            expect(await testElementLabels()).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        });

        await test.step('toggles to descending order', async () => {
            await sortOrder.click();
            await expect(sortOrder.locator('i')).toHaveClass(/icon-sort-alt-down/);
            await expect(sortOrder).toHaveAttribute('title', /^Sort descending/);
            await expect.poll(testElementLabels).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha']);
        });

        await test.step('toggles back to ascending order', async () => {
            await sortOrder.click();
            await expect(sortOrder.locator('i')).toHaveClass(/icon-sort-alt-up/);
            await expect(sortOrder).toHaveAttribute('title', /^Sort ascending/);
            await expect.poll(testElementLabels).toEqual(['Alpha', 'Bravo', 'Charlie', 'Delta']);
        });

        await test.step('sorts by group', async () => {
            await sortMode.selectOption('group');
            // "commonGroup" sorts before "rareGroup" lexically.
            await expect.poll(() => testElementLabels().then((order) => order.indexOf('Charlie') === order.length - 1)).toBe(true);
        });

        await test.step('sorts by shape', async () => {
            await sortMode.selectOption('shape');
            await expect.poll(() => testElementLabels().then((order) => order.indexOf('Delta') < order.indexOf('Bravo'))).toBe(true);
        });

        await test.step('sorts by count, rare groups first', async () => {
            await sortMode.selectOption('count');
            await expect.poll(() => testElementLabels().then((order) => order[0])).toBe('Charlie');
        });

        await test.step('removes the test elements and restores label sort', async () => {
            await evalApp(page, (app, ids: string[]) => {
                app.bodyView.drawWidget.collection.remove(ids);
            }, testIds);
            await sortMode.selectOption('label');
            await expect.poll(() => testElementLabels().then((labels) => labels.length)).toBe(0);
            await waitForRest(page);
        });
    });
});
