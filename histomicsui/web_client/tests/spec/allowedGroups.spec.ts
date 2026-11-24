import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {evalApp, evalAppAsync, gotoHistomics, huiLogin, openImage, pageRest, setupResources, waitForAppCondition} from '../hui';

// Tests of the `allowed_groups` annotation attribute, which restricts the
// style groups offered for an annotation's elements in the Draw panel and
// the annotation context menu.  The annotations are created through the REST
// API, fetched into AnnotationModel instances inside the page, and kept on
// `window.__huiTest` between `evalApp` calls.  Later steps depend on the
// style groups created by earlier ones (for instance, the final step asserts
// that groupK/groupL do not exist yet), so the order must be kept.

/**
 * POST a new annotation with the given name/attributes/elements and fetch it
 * back into a fresh AnnotationModel, stored as `window.__huiTest[key]`.
 */
const createAnnotation = async (page: Page, imageId: string, key: string, name: string, attributes: Record<string, unknown>, elements: unknown[]) => {
    const resp = await pageRest(page, {
        url: `annotation?itemId=${imageId}`,
        method: 'POST',
        contentType: 'application/json',
        data: {name, attributes, elements}
    }) as {_id: string};
    expect(resp._id).toBeTruthy();
    await evalAppAsync(page, async (app, arg) => {
        const girder = (window as any).girder;
        const scratch = (window as any).__huiTest;
        const annotation = new girder.plugins.large_image_annotation.models.AnnotationModel({_id: arg.id});
        await annotation.fetch();
        scratch[arg.key] = annotation;
    }, {id: resp._id, key});
};

const rectangleElement = (x: number, y: number) => ({type: 'rectangle', center: [x, y, 0], width: 4, height: 4});

/**
 * The values of the options of the Draw panel's style group dropdown.
 */
const drawPanelGroupOptions = (page: Page) => page.locator('.h-draw-widget .h-style-group option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));

/**
 * Add the annotation stored under `key` to the body view and open it in the
 * Draw panel, then wait for the Draw panel's style groups to load.
 */
const editAnnotation = async (page: Page, key: string) => {
    await evalApp(page, (app, key) => {
        const scratch = (window as any).__huiTest;
        app.bodyView.annotations.add(scratch[key]);
        app.bodyView._editAnnotation(scratch[key]);
    }, key);
    await waitForAppCondition(page, (app) => app.bodyView.drawWidget && app.bodyView.drawWidget._groups.length);
};

/**
 * Reset the selection, select the first element of the annotation stored
 * under `key`, and return the sorted groups offered by the context menu.
 */
const selectAndGetContextMenuGroups = async (page: Page, key: string): Promise<string[]> => {
    return evalApp(page, (app, key) => {
        const scratch = (window as any).__huiTest;
        const bodyView = app.bodyView;
        bodyView._resetSelection();
        bodyView._selectElement(scratch[key].elements().first());
        return bodyView.contextMenu._getAnnotationGroups().sort();
    }, key);
};

test.describe('allowed_groups annotation metadata tests', () => {
    setupServer();

    test('allowed_groups restricts the Draw panel and context menu', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');
        await page.evaluate(() => {
            (window as any).__huiTest = {};
        });

        await test.step('#1/#2: no restriction (missing or empty allowed_groups)', async () => {
            // creates an annotation with no allowed_groups key
            await createAnnotation(page, imageId, 'unrestricted', 'unrestricted annotation', {}, [rectangleElement(0, 0)]);

            // offers every existing group in the Draw panel dropdown
            await editAnnotation(page, 'unrestricted');
            const drawInfo = await evalApp(page, (app) => {
                const drawWidget = app.bodyView.drawWidget;
                return {
                    allowed: drawWidget._getAllowedGroups(),
                    expectedIds: drawWidget._groups.map((m: {id: string}) => m.id).sort()
                };
            });
            expect(drawInfo.allowed).toBe(null);
            // the dropdown is refreshed through a debounced render
            await expect.poll(async () => (await drawPanelGroupOptions(page)).sort()).toEqual(drawInfo.expectedIds);

            // offers every existing group in the context menu
            const contextInfo = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                bodyView._resetSelection();
                bodyView._selectElement(scratch.unrestricted.elements().first());
                return {
                    groups: bodyView.contextMenu._getAnnotationGroups().sort(),
                    expectedIds: bodyView.contextMenu.styles.map((m: {id: string}) => m.id).sort()
                };
            });
            expect(contextInfo.groups).toEqual(contextInfo.expectedIds);

            // treats an empty allowed_groups list the same as no restriction
            // and accepts a JSON-stringified array as allowed_groups
            const allowed = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const drawWidget = app.bodyView.drawWidget;
                const annotation = scratch.unrestricted.get('annotation');
                const results: unknown[] = [];
                annotation.attributes = {allowed_groups: []};
                results.push(drawWidget._getAllowedGroups());
                annotation.attributes = {allowed_groups: 'not-an-array'};
                results.push(drawWidget._getAllowedGroups());
                annotation.attributes = {allowed_groups: '["groupA", "groupB"]'};
                results.push(drawWidget._getAllowedGroups());
                annotation.attributes = {allowed_groups: '[]'};
                results.push(drawWidget._getAllowedGroups());
                return results;
            });
            expect(allowed).toEqual([null, null, ['groupA', 'groupB'], null]);
        });

        await test.step('#3/#4: restricted annotation, including auto-created groups', async () => {
            // records the default group style for comparison.  StyleModel has
            // no url/urlRoot; styles are only persisted via local storage,
            // which is patched onto the *collection*, so a bare model must be
            // fetched through a StyleCollection, not directly.  The app
            // bundle has its own copy of the StyleCollection class, whose
            // LocalStorage driver caches the saved record ids, so the class
            // the Draw panel uses must be fetched through (the copy under
            // `girder.plugins.histomicsui.collections` comes from the plugin
            // bundle and does not see the styles saved by the app).
            const defaultStyle = await evalAppAsync(page, async (app) => {
                const StyleCollection = app.bodyView.drawWidget._groups.constructor;
                const styles = new StyleCollection();
                await new Promise((resolve) => styles.fetch().always(resolve));
                return styles.get('default').toJSON();
            });
            expect(defaultStyle).toBeTruthy();

            // creates an annotation restricted to a mix of missing groups
            await createAnnotation(page, imageId, 'restricted', 'restricted annotation', {
                allowed_groups: ['groupA', 'groupB']
            }, [rectangleElement(10, 10)]);

            // #4a/#4b: auto-creates every missing allowed group using the default style
            await editAnnotation(page, 'restricted');
            await waitForAppCondition(page, (app) => {
                const drawWidget = app.bodyView.drawWidget;
                return drawWidget._groups.has('groupA') && drawWidget._groups.has('groupB');
            });
            const created = await evalApp(page, (app) => {
                const drawWidget = app.bodyView.drawWidget;
                return {
                    groupA: drawWidget._groups.get('groupA').toJSON(),
                    groupB: drawWidget._groups.get('groupB').toJSON(),
                    styleId: drawWidget._style.id
                };
            });
            for (const group of [created.groupA, created.groupB]) {
                expect(group.fillColor).toBe(defaultStyle.fillColor);
                expect(group.lineColor).toBe(defaultStyle.lineColor);
                expect(group.lineWidth).toBe(defaultStyle.lineWidth);
                expect(group.pattern).toBe(defaultStyle.pattern);
            }
            // the active style switches to the first allowed group
            expect(created.styleId).toBe('groupA');

            // #3/#4c: restriction is immediately reflected in the Draw panel dropdown
            await expect.poll(() => drawPanelGroupOptions(page)).toEqual(['groupA', 'groupB']);

            // #3/#4c: restriction is immediately reflected in the context
            // menu.  Select an element of the restricted annotation so the
            // context menu's group list reflects it, rather than a stale
            // selection left over from the previous step.
            expect(await selectAndGetContextMenuGroups(page, 'restricted')).toEqual(['groupA', 'groupB']);
        });

        await test.step('#5: context menu ignores active selection, uses the clicked annotation', async () => {
            // creates a restricted and an unrestricted annotation
            await createAnnotation(page, imageId, 'restricted5', 'restricted annotation for #5', {
                allowed_groups: ['groupF', 'groupG']
            }, [rectangleElement(30, 30)]);
            await createAnnotation(page, imageId, 'unrestricted5', 'unrestricted annotation for #5', {}, [rectangleElement(40, 40)]);

            // auto-creates the restricted annotation's allowed groups
            // (groupF/groupG) as styles: briefly edit the restricted
            // annotation in the Draw panel to create groupF and groupG before
            // switching the active annotation below.
            await editAnnotation(page, 'restricted5');
            await waitForAppCondition(page, (app) => {
                const drawWidget = app.bodyView.drawWidget;
                return drawWidget._groups.has('groupF') && drawWidget._groups.has('groupG');
            });

            // restricts the context menu to the clicked element's annotation
            // regardless of the active annotation/group/shape
            await editAnnotation(page, 'unrestricted5');
            const groups = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                // pick an arbitrary style group in the Draw panel to prove the
                // context menu restriction is independent of it
                bodyView.drawWidget.setStyleGroupById(bodyView.drawWidget._groups.first().id);
                bodyView._resetSelection();
                bodyView._selectElement(scratch.restricted5.elements().first());
                return bodyView.contextMenu._getAnnotationGroups().sort();
            });
            expect(groups).toEqual(['groupF', 'groupG']);

            // renders the clicked annotation's restriction on selection, not
            // the active annotation's (regression)
            const renderedGroups = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                // keep the *unrestricted* annotation active in the panel
                bodyView._editAnnotation(scratch.unrestricted5);
                // Selecting an element fires the context menu's render
                // synchronously.  This asserts on the DOM produced by that
                // render, which is the path that regressed.  Previously
                // `originalAnnotation` was assigned only after `add`, so the
                // render fell back to the active annotation and offered the
                // wrong groups when the active annotation did not match the
                // selected one.
                bodyView._resetSelection();
                bodyView._selectElement(scratch.restricted5.elements().first());
                return bodyView.contextMenu.$('.h-set-group').toArray()
                    .map((el: HTMLElement) => el.dataset.group).sort();
            });
            expect(renderedGroups).toEqual(['groupF', 'groupG']);
        });

        await test.step('context menu offers the intersection of restrictions across a multi-selection', async () => {
            // creates annotations with overlapping restrictions
            await createAnnotation(page, imageId, 'first', 'restricted annotation 1 for intersection', {
                allowed_groups: ['groupM', 'groupN']
            }, [rectangleElement(80, 80)]);
            await createAnnotation(page, imageId, 'second', 'restricted annotation 2 for intersection', {
                allowed_groups: ['groupN', 'groupO']
            }, [rectangleElement(90, 90)]);
            await createAnnotation(page, imageId, 'unrestrictedIntersection', 'unrestricted annotation for intersection', {}, [rectangleElement(100, 100)]);

            // offers only groups allowed by every selected element's annotation
            const groups = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                bodyView._resetSelection();
                bodyView._selectElement(scratch.first.elements().first());
                bodyView._selectElement(scratch.second.elements().first());
                const both = bodyView.contextMenu._getAnnotationGroups();
                bodyView._selectElement(scratch.unrestrictedIntersection.elements().first());
                const withUnrestricted = bodyView.contextMenu._getAnnotationGroups();
                return {both, withUnrestricted};
            });
            expect(groups.both).toEqual(['groupN']);
            expect(groups.withUnrestricted).toEqual(['groupN']);

            // offers no groups when the restrictions are disjoint
            const disjoint = await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                scratch.first.get('annotation').attributes = {allowed_groups: ['groupM']};
                bodyView._resetSelection();
                bodyView._selectElement(scratch.first.elements().first());
                bodyView._selectElement(scratch.second.elements().first());
                return bodyView.contextMenu._getAnnotationGroups();
            });
            expect(disjoint).toEqual([]);
        });

        await test.step('#3/#5: live metadata updates without reselecting or reloading', async () => {
            // creates an annotation with no restriction
            await createAnnotation(page, imageId, 'live', 'live-update annotation', {}, [rectangleElement(50, 50)]);

            // opens the annotation while unrestricted
            await editAnnotation(page, 'live');
            expect(await evalApp(page, (app) => app.bodyView.drawWidget._getAllowedGroups())).toBe(null);

            // immediately restricts the Draw panel and context menu when
            // allowed_groups is added, without reselecting
            await evalApp(page, (app) => {
                const scratch = (window as any).__huiTest;
                const bodyView = app.bodyView;
                bodyView._resetSelection();
                bodyView._selectElement(scratch.live.elements().first());
                // simulate editing the annotation's metadata via the "Edit
                // annotation" dialog, which mutates attributes directly and
                // triggers 'change:annotation' rather than calling .set()
                scratch.live.get('annotation').attributes = {allowed_groups: ['groupF', 'groupG']};
                scratch.live.trigger('change:annotation', scratch.live, {});
            });
            // the Draw panel's `_groups` collection updates synchronously, but
            // its dropdown DOM is refreshed via a debounced render, so also
            // wait for the DOM to catch up before asserting on it
            await waitForAppCondition(page, (app) => {
                const drawWidget = app.bodyView.drawWidget;
                return drawWidget._groups.has('groupF') && drawWidget._groups.has('groupG') &&
                    drawWidget.$('.h-style-group option').length === 2;
            });
            expect(await evalApp(page, (app) => app.bodyView.drawWidget._style.id)).toBe('groupF');
            expect(await drawPanelGroupOptions(page)).toEqual(['groupF', 'groupG']);
            // the context menu keeps its own StyleCollection, refetched
            // asynchronously via the 'h:styleGroupsEdited' event once the
            // Draw panel auto-creates the newly allowed groups; wait for that
            // refetch to complete before checking it
            await waitForAppCondition(page, (app) => {
                const styles = app.bodyView.contextMenu.styles;
                return styles.get('groupF') && styles.get('groupG');
            });
            const contextGroups = await evalApp(page, (app) => app.bodyView.contextMenu._getAnnotationGroups().sort());
            expect(contextGroups).toEqual(['groupF', 'groupG']);
        });

        await test.step('#3(consistency): the context menu auto-creates missing allowed groups', async () => {
            // creates a restricted annotation that is never opened in the Draw panel
            await createAnnotation(page, imageId, 'contextOnly', 'context-only restricted annotation', {
                allowed_groups: ['groupK', 'groupL']
            }, [rectangleElement(70, 70)]);

            // auto-creates the allowed groups the first time the context menu
            // sees them: the groups must not already exist from an earlier step
            const before = await evalApp(page, (app) => {
                const styles = app.bodyView.contextMenu.styles;
                return {groupK: styles.get('groupK') === undefined, groupL: styles.get('groupL') === undefined};
            });
            expect(before).toEqual({groupK: true, groupL: true});

            // select an element of the restricted annotation without ever
            // opening it in the Draw panel, so the context menu is the only
            // code path that can create its groups
            expect(await selectAndGetContextMenuGroups(page, 'contextOnly')).toEqual(['groupK', 'groupL']);
            const after = await evalApp(page, (app) => {
                const styles = app.bodyView.contextMenu.styles;
                return {groupK: !!styles.get('groupK'), groupL: !!styles.get('groupL')};
            });
            expect(after).toEqual({groupK: true, groupL: true});
        });
    });
});
