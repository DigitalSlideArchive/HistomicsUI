/* global girderTest describe it expect girder $ */

girderTest.importPlugin('jobs', 'large_image', 'large_image_annotation', 'slicer_cli_web', 'histomicsui');

girderTest.promise.done(function () {
    var hotkeys = girder.plugins.histomicsui.hotkeys;

    // A keyboard event with only the properties the hotkeys module reads.
    function ev(key, mods) {
        return $.extend({key: key}, mods || {});
    }
    function fk(evt) {
        return hotkeys.formatKey(hotkeys.bindingFromEvent(evt));
    }

    describe('Hotkeys module', function () {
        describe('parsing and formatting', function () {
            it('parses key strings', function () {
                expect(hotkeys.formatKey(hotkeys.parseKey('S'))).toBe('shift+s');
                expect(hotkeys.formatKey(hotkeys.parseKey('ctrl-alt-x'))).toBe('ctrl+alt+x');
                expect(hotkeys.formatKey(hotkeys.parseKey('shift+-'))).toBe('-');
                expect(hotkeys.formatKey(hotkeys.parseKey('ctrl++'))).toBe('ctrl+plus');
                expect(hotkeys.formatKey(hotkeys.parseKey('ArrowLeft'))).toBe('left');
                expect(hotkeys.parseKey('')).toBe(null);
            });
            it('applies explicit modifiers from a config entry', function () {
                expect(hotkeys.formatKey(hotkeys.parseKey('r', {ctrl: true}))).toBe('ctrl+r');
            });
            it('formats keys for display', function () {
                expect(hotkeys.displayKey(hotkeys.parseKey('ctrl+shift+s'))).toBe('Ctrl+Shift+S');
            });
        });

        describe('keyboard events', function () {
            it('reads keys from events', function () {
                expect(fk(ev('S'))).toBe('shift+s');
                expect(fk(ev('<', {shiftKey: true}))).toBe('<');
                expect(fk(ev(' '))).toBe('space');
                expect(fk({originalEvent: {key: 'x', altKey: true}})).toBe('alt+x');
                expect(hotkeys.bindingFromEvent(ev('Shift', {shiftKey: true}))).toBe(null);
            });
            it('ignores shift and ctrl for sized navigation actions', function () {
                expect(hotkeys.formatKey(hotkeys.bindingFromEvent(ev('H', {shiftKey: true, ctrlKey: true}), true))).toBe('h');
            });
            it('uses the physical key when alt is held (macOS option)', function () {
                expect(fk(ev('œ', {altKey: true, code: 'KeyQ'}))).toBe('alt+q');
                expect(fk(ev('Dead', {altKey: true, code: 'KeyE'}))).toBe('alt+e');
                expect(fk(ev('¡', {altKey: true, code: 'Digit1'}))).toBe('alt+1');
                expect(fk(ev('Œ', {altKey: true, shiftKey: true, code: 'KeyQ'}))).toBe('alt+shift+q');
                expect(fk(ev('“', {altKey: true, code: 'BracketLeft'}))).toBe('alt+[');
                expect(fk(ev('¡', {ctrlKey: true, altKey: true, code: 'Digit1'}))).toBe('ctrl+alt+1');
                expect(fk(ev('q', {code: 'KeyA'}))).toBe('q');
                expect(fk(ev('œ', {altKey: true}))).toBe('alt+œ');
            });
        });

        describe('resolution', function () {
            it('dispatches the default keys', function () {
                var r = hotkeys.resolveHotkeys();
                expect(hotkeys.actionForEvent(r, ev('s'))).toEqual({action: 'select.rectangle'});
                expect(hotkeys.actionForEvent(r, ev('S'))).toEqual({action: 'select.polygon'});
                expect(hotkeys.actionForEvent(r, ev('Escape'))).toEqual({action: 'draw.cancel'});
                expect(hotkeys.actionForEvent(r, ev('s', {ctrlKey: true}))).toBe(null);
                expect(hotkeys.actionForEvent(r, ev('ArrowLeft'))).toBe(null);
                expect(hotkeys.findConflicts(r.bindings)).toEqual({});
                expect(hotkeys.geojsKeyboardActions(r)).toEqual({});
            });
            it('uses config group hotkeys and modifiers', function () {
                var r = hotkeys.resolveHotkeys({
                    config: [
                        {key: 't', action: 'group', param: 'tumor'},
                        {key: 'x', action: 'group', param: 'stroma', ctrl: true},
                        {key: 'z', action: 'unknown'}
                    ]
                });
                expect(hotkeys.actionForEvent(r, ev('t'))).toEqual({action: 'group', param: 'tumor'});
                expect(hotkeys.actionForEvent(r, ev('x'))).toBe(null);
                expect(hotkeys.actionForEvent(r, ev('x', {ctrlKey: true}))).toEqual({action: 'group', param: 'stroma'});
                expect(r.bindings.unknown).toBe(undefined);
            });
            it('lets config keys take keys from the defaults', function () {
                var r = hotkeys.resolveHotkeys({config: [{key: 'r', action: 'group', param: 'Red'}]});
                expect(hotkeys.actionForEvent(r, ev('r'))).toEqual({action: 'group', param: 'Red'});
                expect(r.bindings['draw.rectangle']).toEqual([]);
            });
            it('applies user overrides over config', function () {
                var r = hotkeys.resolveHotkeys({
                    config: [{key: 'r', action: 'draw.rectangle'}, {key: 't', action: 'group', param: 'A'}],
                    user: [
                        {key: 'x', action: 'draw.rectangle'},
                        {key: null, action: 'draw.point'},
                        {key: 't', action: 'draw.line'}
                    ]
                });
                expect(hotkeys.actionForEvent(r, ev('x'))).toEqual({action: 'draw.rectangle'});
                expect(hotkeys.actionForEvent(r, ev('r'))).toBe(null);
                expect(hotkeys.actionForEvent(r, ev('o'))).toBe(null);
                expect(hotkeys.actionForEvent(r, ev('t'))).toEqual({action: 'draw.line'});
                expect(r.bindings['group:A']).toEqual([]);
                expect(r.source['draw.rectangle']).toBe('user');
            });
            it('reports conflicts including sized navigation variants', function () {
                expect(hotkeys.findConflicts({
                    'pan.left': [hotkeys.parseKey('h')],
                    'draw.line': [hotkeys.parseKey('shift+h')]
                })).toEqual({'shift+h': ['pan.left', 'draw.line']});
            });
        });

        describe('geojs and frame selector keys', function () {
            it('expands rebound navigation keys for geojs', function () {
                var r = hotkeys.resolveHotkeys({
                    user: [
                        {key: 'h', action: 'pan.left'},
                        {key: '1', action: 'group', param: 'Tumor'}
                    ]
                });
                expect(hotkeys.geojsKeyboardActions(r)).toEqual({
                    'pan.left': ['h', 'shift+h', 'ctrl+shift+h'],
                    'zoom.0': []
                });
            });
            it('maps the default layer keys', function () {
                var lh = hotkeys.layerHotkeys(hotkeys.resolveHotkeys());
                expect(lh.layerForEvent(ev('1', {ctrlKey: true}))).toBe(0);
                expect(lh.layerForEvent(ev('0', {ctrlKey: true}))).toBe(9);
                expect(lh.layerForEvent(ev('1', {ctrlKey: true, altKey: true, code: 'Digit1'}))).toBe(10);
                expect(lh.layerForEvent(ev('1'))).toBe(undefined);
                expect(lh.labels[0]).toBe('Ctrl+1');
                expect(lh.labels[19]).toBe('Ctrl+Alt+0');
            });
            it('maps rebound layer keys', function () {
                var r = hotkeys.resolveHotkeys({
                    user: [
                        {action: 'layer.1', key: 'alt+q'},
                        {action: 'draw.point', key: 'ctrl+2'}
                    ]
                });
                var lh = hotkeys.layerHotkeys(r);
                expect(lh.layerForEvent(ev('œ', {altKey: true, code: 'KeyQ'}))).toBe(0);
                expect(lh.layerForEvent(ev('1', {ctrlKey: true}))).toBe(undefined);
                expect(lh.layerForEvent(ev('2', {ctrlKey: true}))).toBe(undefined);
                expect(hotkeys.actionForEvent(r, ev('2', {ctrlKey: true}))).toEqual({action: 'draw.point'});
            });
        });

        describe('user file entries and titles', function () {
            it('converts overrides to entries and back', function () {
                var entries = hotkeys.overridesToEntries(
                    {'draw.point': [], 'group:tumor': [hotkeys.parseKey('ctrl+t')]},
                    {'group:tumor': {action: 'group', param: 'tumor'}});
                expect(entries).toEqual([
                    {action: 'draw.point', key: null},
                    {action: 'group', param: 'tumor', key: 'ctrl+t'}
                ]);
                var r = hotkeys.resolveHotkeys({user: entries});
                expect(hotkeys.actionForEvent(r, ev('t', {ctrlKey: true}))).toEqual({action: 'group', param: 'tumor'});
                expect(r.bindings['draw.point']).toEqual([]);
            });
            it('fills keys into element titles', function () {
                var el = document.createElement('div');
                el.innerHTML = '<span data-hotkey-title="Select {select.rectangle}; {select.polygon}; {nope}"></span>';
                hotkeys.setCurrentHotkeys(hotkeys.resolveHotkeys({user: [{action: 'select.rectangle', key: 'k'}]}));
                hotkeys.applyHotkeyTitles(el);
                expect(el.firstChild.getAttribute('title')).toBe('Select K; Shift+S; none');
                hotkeys.setCurrentHotkeys(hotkeys.resolveHotkeys());
            });
        });
    });
});
