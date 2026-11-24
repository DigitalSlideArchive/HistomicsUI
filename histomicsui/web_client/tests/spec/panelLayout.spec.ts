import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {gotoHistomics, huiLogin, openImage, rest, setupResources} from '../hui';

test.describe('Panel layout', () => {
    setupServer();

    test('panels are placed according to the panel_layout setting', async ({page}) => {
        const resources = await setupResources(page);
        await rest(page, 'system/setting', {
            method: 'PUT',
            token: resources.adminToken,
            form: {
                key: 'histomicsui.panel_layout',
                value: JSON.stringify([
                    {name: 'annotation', state: 'closed'},
                    {name: 'metadata'},
                    {name: 'zoom', position: 'left'}
                ])
            }
        });

        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'image');

        const panelIds = (group: string) => page.locator(`.h-panel-group-${group} [id^=h-][id$=-panel]`)
            .evaluateAll((panels) => panels.map((panel) => panel.id));
        expect(await panelIds('left')).toEqual(['h-zoom-panel', 'h-analysis-panel']);
        expect(await panelIds('right')).toEqual([
            'h-annotation-panel', 'h-metadata-panel', 'h-overview-panel',
            'h-frame-selector-panel', 'h-metadataplot-panel', 'h-draw-panel']);

        await expect(page.locator('#h-annotation-panel .s-panel-content')).not.toHaveClass(/\bin\b/);
        await expect(page.locator('#h-zoom-panel .s-panel-content')).toHaveClass(/\bin\b/);
    });
});
