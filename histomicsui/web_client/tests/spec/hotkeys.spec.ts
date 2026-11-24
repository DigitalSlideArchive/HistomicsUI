import {expect, test, type Page} from '@playwright/test';

import {setupServer} from '../server';
import {gotoHistomics, setupResources} from '../hui';

// The tests in this file build on one another, so run them in order and, if
// one fails, retry them as a group on a fresh server.
test.describe.configure({mode: 'serial'});

// Unit tests of the hotkeys module (girder.plugins.histomicsui.hotkeys).  The
// checks run inside the HistomicsUI page; each mismatch is collected as a
// readable message and the test asserts that there are none.

type Check = (label: string, actual: unknown, expected: unknown) => void;
type MakeEvent = (key: string, mods?: Record<string, boolean>) => Record<string, unknown>;
type HotkeyChecks = (hotkeys: any, check: Check, ev: MakeEvent) => void;

/**
 * Run `fn` in the page with the hotkeys module, a `check(label, actual,
 * expected)` function that compares values by their JSON serialization, and
 * `ev(key, modifiers)`, which builds a keyboard event with only the properties
 * the hotkeys module reads.  The function is serialized, so it must be
 * self-contained.  Resolves with the list of failed checks.
 */
const runHotkeyChecks = async (page: Page, fn: HotkeyChecks): Promise<string[]> => {
    return page.evaluate((fnBody) => {
        const failures: string[] = [];
        const serialize = (value: unknown) => value === undefined ? 'undefined' : JSON.stringify(value);
        const check = (label: string, actual: unknown, expected: unknown) => {
            if (serialize(actual) !== serialize(expected)) {
                failures.push(`${label}: expected ${serialize(expected)}, got ${serialize(actual)}`);
            }
        };
        const ev = (key: string, mods?: Record<string, boolean>) => Object.assign({key}, mods || {});
        // @ts-ignore
        const hotkeys = window.girder.plugins.histomicsui.hotkeys;
        // eslint-disable-next-line no-new-func
        const checks = new Function('hotkeys', 'check', 'ev', `(${fnBody})(hotkeys, check, ev);`);
        checks(hotkeys, check, ev);
        return failures;
    }, fn.toString());
};

test.describe('Hotkeys module', () => {
    setupServer();

    test('parsing and formatting', async ({page}) => {
        await setupResources(page);
        await gotoHistomics(page);
        const failures = await runHotkeyChecks(page, (hotkeys, check) => {
            // parses key strings
            check('parseKey S', hotkeys.formatKey(hotkeys.parseKey('S')), 'shift+s');
            check('parseKey ctrl-alt-x', hotkeys.formatKey(hotkeys.parseKey('ctrl-alt-x')), 'ctrl+alt+x');
            check('parseKey shift+-', hotkeys.formatKey(hotkeys.parseKey('shift+-')), '-');
            check('parseKey ctrl++', hotkeys.formatKey(hotkeys.parseKey('ctrl++')), 'ctrl+plus');
            check('parseKey ArrowLeft', hotkeys.formatKey(hotkeys.parseKey('ArrowLeft')), 'left');
            check('parseKey empty', hotkeys.parseKey(''), null);
            // applies explicit modifiers from a config entry
            check('parseKey r with ctrl', hotkeys.formatKey(hotkeys.parseKey('r', {ctrl: true})), 'ctrl+r');
            // formats keys for display
            check('displayKey ctrl+shift+s', hotkeys.displayKey(hotkeys.parseKey('ctrl+shift+s')), 'Ctrl+Shift+S');
        });
        expect(failures).toEqual([]);
    });

    test('keyboard events', async ({page}) => {
        await gotoHistomics(page);
        const failures = await runHotkeyChecks(page, (hotkeys, check, ev) => {
            const fk = (evt: unknown) => hotkeys.formatKey(hotkeys.bindingFromEvent(evt));
            // reads keys from events
            check('event S', fk(ev('S')), 'shift+s');
            check('event shift+<', fk(ev('<', {shiftKey: true})), '<');
            check('event space', fk(ev(' ')), 'space');
            check('event originalEvent alt+x', fk({originalEvent: {key: 'x', altKey: true}}), 'alt+x');
            check('event Shift alone', hotkeys.bindingFromEvent(ev('Shift', {shiftKey: true})), null);
            check('event CapsLock', hotkeys.bindingFromEvent(ev('CapsLock')), null);
            check('event NumLock', hotkeys.bindingFromEvent(ev('NumLock')), null);
            // ignores shift and ctrl for sized navigation actions
            check('sized navigation H', hotkeys.formatKey(hotkeys.bindingFromEvent(ev('H', {shiftKey: true, ctrlKey: true}), true)), 'h');
        });
        expect(failures).toEqual([]);
    });

    test('resolution', async ({page}) => {
        await gotoHistomics(page);
        const failures = await runHotkeyChecks(page, (hotkeys, check, ev) => {
            // dispatches the default keys
            let r = hotkeys.resolveHotkeys();
            check('default s', hotkeys.actionForEvent(r, ev('s')), {action: 'select.rectangle'});
            check('default S', hotkeys.actionForEvent(r, ev('S')), {action: 'select.polygon'});
            check('default Escape', hotkeys.actionForEvent(r, ev('Escape')), {action: 'draw.cancel'});
            check('default ctrl+s', hotkeys.actionForEvent(r, ev('s', {ctrlKey: true})), null);
            check('default ArrowLeft', hotkeys.actionForEvent(r, ev('ArrowLeft')), null);
            check('default geojs actions', hotkeys.geojsKeyboardActions(r), {});

            // uses config group hotkeys and modifiers
            r = hotkeys.resolveHotkeys({
                config: [
                    {key: 't', action: 'group', param: 'tumor'},
                    {key: 'x', action: 'group', param: 'stroma', ctrl: true},
                    {key: 'z', action: 'unknown'}
                ]
            });
            check('config t', hotkeys.actionForEvent(r, ev('t')), {action: 'group', param: 'tumor'});
            check('config x', hotkeys.actionForEvent(r, ev('x')), null);
            check('config ctrl+x', hotkeys.actionForEvent(r, ev('x', {ctrlKey: true})), {action: 'group', param: 'stroma'});
            check('config unknown binding', r.bindings.unknown, undefined);

            // lets config keys take keys from the defaults
            r = hotkeys.resolveHotkeys({config: [{key: 'r', action: 'group', param: 'Red'}]});
            check('config takes r', hotkeys.actionForEvent(r, ev('r')), {action: 'group', param: 'Red'});
            check('config draw.rectangle unbound', r.bindings['draw.rectangle'], []);

            // applies user overrides over config
            r = hotkeys.resolveHotkeys({
                config: [{key: 'r', action: 'draw.rectangle'}, {key: 't', action: 'group', param: 'A'}],
                user: [
                    {key: 'x', action: 'draw.rectangle'},
                    {key: null, action: 'draw.point'},
                    {key: 't', action: 'draw.line'}
                ]
            });
            check('user x', hotkeys.actionForEvent(r, ev('x')), {action: 'draw.rectangle'});
            check('user r', hotkeys.actionForEvent(r, ev('r')), null);
            check('user o', hotkeys.actionForEvent(r, ev('o')), null);
            check('user t', hotkeys.actionForEvent(r, ev('t')), {action: 'draw.line'});
            check('user group:A unbound', r.bindings['group:A'], []);
            check('user source draw.rectangle', r.source['draw.rectangle'], 'user');
        });
        expect(failures).toEqual([]);
    });

    test('geojs and frame selector keys', async ({page}) => {
        await gotoHistomics(page);
        const failures = await runHotkeyChecks(page, (hotkeys, check, ev) => {
            // expands rebound navigation keys for geojs
            let r = hotkeys.resolveHotkeys({
                user: [
                    {key: 'h', action: 'pan.left'},
                    {key: '1', action: 'group', param: 'Tumor'}
                ]
            });
            check('geojs actions', hotkeys.geojsKeyboardActions(r), {
                'pan.left': ['h', 'shift+h', 'ctrl+shift+h'],
                'zoom.0': []
            });

            // maps the default layer keys
            let lh = hotkeys.layerHotkeys(hotkeys.resolveHotkeys());
            check('layer ctrl+1', lh.layerForEvent(ev('1', {ctrlKey: true})), 0);
            check('layer ctrl+0', lh.layerForEvent(ev('0', {ctrlKey: true})), 9);
            check('layer ctrl+alt+1', lh.layerForEvent(ev('1', {ctrlKey: true, altKey: true})), 10);
            check('layer 1', lh.layerForEvent(ev('1')), undefined);
            check('layer label 0', lh.labels[0], 'Ctrl+1');
            check('layer label 19', lh.labels[19], 'Ctrl+Alt+0');

            // maps rebound layer keys
            r = hotkeys.resolveHotkeys({
                user: [
                    {action: 'layer.1', key: 'alt+q'},
                    {action: 'draw.point', key: 'ctrl+2'}
                ]
            });
            lh = hotkeys.layerHotkeys(r);
            check('rebound layer alt+q', lh.layerForEvent(ev('q', {altKey: true})), 0);
            check('rebound layer ctrl+1', lh.layerForEvent(ev('1', {ctrlKey: true})), undefined);
            check('rebound layer ctrl+2', lh.layerForEvent(ev('2', {ctrlKey: true})), undefined);
            check('rebound ctrl+2 action', hotkeys.actionForEvent(r, ev('2', {ctrlKey: true})), {action: 'draw.point'});
        });
        expect(failures).toEqual([]);
    });

    test('user file entries and titles', async ({page}) => {
        await gotoHistomics(page);
        const failures = await runHotkeyChecks(page, (hotkeys, check, ev) => {
            // converts overrides to entries and back
            const entries = hotkeys.overridesToEntries(
                {'draw.point': [], 'group:tumor': [hotkeys.parseKey('ctrl+t')]},
                {'group:tumor': {action: 'group', param: 'tumor'}});
            check('entries', entries, [
                {action: 'draw.point', key: null},
                {action: 'group', param: 'tumor', key: 'ctrl+t'}
            ]);
            const r = hotkeys.resolveHotkeys({user: entries});
            check('entries ctrl+t', hotkeys.actionForEvent(r, ev('t', {ctrlKey: true})), {action: 'group', param: 'tumor'});
            check('entries draw.point unbound', r.bindings['draw.point'], []);

            // fills keys into element titles
            const el = document.createElement('div');
            el.innerHTML = '<span data-hotkey-title="Select {select.rectangle}; {select.polygon}; {nope}"></span>';
            hotkeys.setCurrentHotkeys(hotkeys.resolveHotkeys({user: [{action: 'select.rectangle', key: 'k'}]}));
            hotkeys.applyHotkeyTitles(el);
            check('title', (el.firstChild as Element).getAttribute('title'), 'Select K; Shift+S; none');
            hotkeys.setCurrentHotkeys(hotkeys.resolveHotkeys());
        });
        expect(failures).toEqual([]);
    });
});
