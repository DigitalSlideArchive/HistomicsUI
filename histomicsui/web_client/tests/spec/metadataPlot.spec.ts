import {expect, test} from '@playwright/test';

import {setupServer} from '../server';
import {waitForDialog, waitForIdlePage} from '../util';
import {gotoHistomics, huiLogin, openImage, rest, setupResources} from '../hui';

const imageMetadata = {
    gloms: [{
        Label: 'Old',
        pas: 2680.166436339452,
        area: 783.110155889082,
        aspect: 2.9080459770114944,
        average: 164.37993900822062,
        std: 26.010079499756575
    }, {
        Label: 'Old',
        pas: 12980.996970666974,
        area: 1496.7676319940551,
        aspect: 1.9185185185185185,
        average: 155.27579392594646,
        std: 28.416844030625626
    }, {
        Label: 'Young',
        pas: 8402.006745559294,
        area: 1788.302533363278,
        aspect: 1.019704433497537,
        average: 159.67405227626796,
        std: 33.87920305083972
    }]
};

const copyMetadata = {
    gloms: [{
        Label: 'Young',
        pas: 11851.975039865125,
        area: 2360.3514018844844,
        aspect: 1.0686695278969958,
        average: 156.98394786336002,
        std: 31.21637278966411
    }, {
        Label: 'Old',
        pas: 14936.277054529173,
        area: 3136.911379889736,
        aspect: 1.0586080586080586,
        average: 156.36041872733267,
        std: 25.653667101657856
    }, {
        Label: 'Old',
        pas: 16794.292195370363,
        area: 3383.7387179248767,
        aspect: 1.08,
        average: 162.33947155279122,
        std: 29.727093069010945
    }]
};

test.describe('Metadata plot tests', () => {
    setupServer();

    test('plot item metadata', async ({page}) => {
        const resources = await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        const imageId = await openImage(page, 'image');
        expect(imageId).toBe(resources.imageId);

        const panel = page.locator('#h-metadataplot-panel');
        const points = page.locator('path[class=point]');

        await test.step('no plot panel without metadata', async () => {
            await expect(panel).toHaveCount(1);
            await expect(panel.locator('.s-panel-content')).toHaveCount(0);
        });

        await test.step('add metadata to this and a second image', async () => {
            await rest(page, `item/${imageId}/metadata`, {
                method: 'PUT', token: resources.userToken, json: imageMetadata
            });
            await rest(page, `item/${resources.copyId}/metadata`, {
                method: 'PUT', token: resources.userToken, json: copyMetadata
            });
            // Open 'copy' and then 'image' again so that the image is
            // refetched with its new metadata.
            expect(await openImage(page, 'copy')).toBe(resources.copyId);
            expect(await openImage(page, 'image')).toBe(imageId);
            await expect(panel.locator('.s-panel-content')).toHaveCount(1);
        });

        await test.step('Show a plot', async () => {
            await page.locator('.g-widget-metadata-plot-settings').click();
            await waitForDialog(page);
            await expect(page.locator('#h-plot-series-x')).toHaveCount(1);
            await page.locator('#h-plot-series-x').selectOption('data.gloms.0.pas');
            await page.locator('#h-plot-series-y').selectOption('data.gloms.0.area');
            await page.locator('#h-plot-series-r').selectOption('data.gloms.0.aspect');
            await page.locator('#h-plot-series-c').selectOption('data.gloms.0.label');
            await page.locator('#h-plot-series-s').selectOption('item.name');
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(page.locator('.plot-container.plotly')).toHaveCount(1);
            // Both items in the folder contribute three points each.
            await expect(points).toHaveCount(6);
        });

        await test.step('Exclude neighboring data', async () => {
            await page.locator('.g-widget-metadata-plot-settings').click();
            await waitForDialog(page);
            // switch some other options, too.
            await page.locator('#h-plot-series-r').selectOption('data.gloms.0.label');
            // a numeric color series uses a continuous color scale
            await page.locator('#h-plot-series-c').selectOption('data.gloms.0.average');
            await page.locator('#h-plot-folder').uncheck();
            await page.locator('#g-dialog-container .h-submit').click();
            await waitForIdlePage(page);
            await expect(page.locator('.plot-container.plotly')).toHaveCount(1);
            await expect(points).toHaveCount(3);
        });
    });
});
