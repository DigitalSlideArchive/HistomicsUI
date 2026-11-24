import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {gotoHistomics, huiLogin, openImage, setupResources} from '../hui';

interface Point {
    x: number;
    y: number;
}

interface MapState {
    center: Point;
    zoom: number;
}

interface SimulatedEvent {
    event: string;
    options: Record<string, unknown>;
}

/**
 * Simulate a sequence of mouse events on the overview map's interactor,
 * waiting three animation frames after each one (as the Jasmine test did),
 * and resolve with the main viewer's center and zoom before and after.
 */
const simulateOnOverview = async (page: Page, events: SimulatedEvent[]) => {
    return page.evaluate(async (events) => {
        // @ts-ignore
        const $ = window.geo.jQuery;
        const main = $('.geojs-map').data('data-geojs-map');
        const overview = $('.geojs-map').eq(1).data('data-geojs-map');
        const state = (): MapState => ({center: {x: main.center().x, y: main.center().y}, zoom: main.zoom()});
        const waitFrames = (count: number) => new Promise<void>((resolve) => {
            const step = () => {
                count -= 1;
                if (count <= 0) {
                    resolve();
                } else {
                    window.requestAnimationFrame(step);
                }
            };
            window.requestAnimationFrame(step);
        });
        const before = state();
        for (const {event, options} of events) {
            overview.interactor().simulateEvent(event, options);
            await waitFrames(3);
        }
        return {before, after: state()};
    }, events);
};

test.describe('Overview panel', () => {
    setupServer();

    test('overview actions', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        await huiLogin(page);
        await openImage(page, 'copy');
        await openImage(page, 'image');

        // overview updates on main image change
        const result = await page.evaluate(() => {
            // @ts-ignore
            const $ = window.geo.jQuery;
            const main = $('.geojs-map').data('data-geojs-map');
            const overview = $('.geojs-map').eq(1).data('data-geojs-map');
            const frameFeature = overview.layers()[1].features()[0];
            const initialFrame = JSON.stringify(frameFeature.data());
            main.zoom(main.zoom() + 2);
            const zoomedFrame = JSON.stringify(frameFeature.data());
            main.rotation(1);
            const rotatedFrame = JSON.stringify(frameFeature.data());
            main.rotation(0);
            return {mapCount: $('.geojs-map').length, initialFrame, zoomedFrame, rotatedFrame};
        });
        expect(result.mapCount).toBeGreaterThanOrEqual(2);
        expect(result.zoomedFrame).not.toEqual(result.initialFrame);
        expect(result.rotatedFrame).not.toEqual(result.zoomedFrame);

        await test.step('click pan', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 100, y: 100}, button: 'left'}},
                {event: 'mouseup', options: {map: {x: 100, y: 100}, button: 'left'}}
            ]);
            expect(after.center).not.toEqual(before.center);
        });

        await test.step('click drag back to start', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 140, y: 120}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 140, y: 140}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 140, y: 120}, button: 'left'}},
                {event: 'mouseup', options: {map: {x: 140, y: 120}, button: 'left'}}
            ]);
            expect(after.center.x).toBeCloseTo(before.center.x);
            expect(after.center.y).toBeCloseTo(before.center.y);
        });

        await test.step('click drag', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 140, y: 120}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 140, y: 140}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 140, y: 150}, button: 'left'}},
                {event: 'mouseup', options: {map: {x: 140, y: 150}, button: 'left'}}
            ]);
            expect(after.center.x).toBeCloseTo(before.center.x);
            expect(after.center.y).not.toBeCloseTo(before.center.y);
        });

        await test.step('click drag outside of zone', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 40, y: 20}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 40, y: 40}, button: 'left'}},
                {event: 'mousemove', options: {map: {x: 40, y: 50}, button: 'left'}},
                {event: 'mouseup', options: {map: {x: 40, y: 50}, button: 'left'}}
            ]);
            expect(after.center.x).toBeCloseTo(before.center.x);
            expect(after.center.y).toBeCloseTo(before.center.y);
        });

        await test.step('left-click drag zero area', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'}},
                {event: 'mousemove', options: {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'}},
                {event: 'mousemove', options: {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'}},
                {event: 'mouseup', options: {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'}}
            ]);
            expect(after.center).toEqual(before.center);
            expect(after.zoom).toEqual(before.zoom);
        });

        await test.step('left-click drag', async () => {
            const {before, after} = await simulateOnOverview(page, [
                {event: 'mousedown', options: {map: {x: 40, y: 20}, button: 'left', modifiers: 'shift'}},
                {event: 'mousemove', options: {map: {x: 40, y: 40}, button: 'left', modifiers: 'shift'}},
                {event: 'mousemove', options: {map: {x: 60, y: 40}, button: 'left', modifiers: 'shift'}},
                {event: 'mouseup', options: {map: {x: 60, y: 40}, button: 'left', modifiers: 'shift'}}
            ]);
            expect(after.center).not.toEqual(before.center);
            expect(after.zoom).not.toEqual(before.zoom);
        });
    });
});
