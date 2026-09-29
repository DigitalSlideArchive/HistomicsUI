/**
 * Keyboard shortcut definitions and resolution.
 *
 * Bindings come from three layers, each replacing the previous layer's keys
 * for any action it mentions:
 *   1. the defaults listed in `hotkeyActions`,
 *   2. the folder's .histomicsui_config.yaml (`hotkeys` and group `hotkey`
 *      values),
 *   3. the user's own file in their Private folder (USER_CONFIG_NAME).
 *
 * Key strings use Mousetrap names (as geojs does), e.g. `shift+s`, `left`,
 * `space`, `esc`, `plus`.  This module has no imports so it can be used by
 * any view and tested outside of a browser.
 */

const USER_CONFIG_NAME = '.histomicsui_user_config.yaml';

const MODIFIERS = ['ctrl', 'alt', 'meta', 'shift'];

/* Map lower-cased KeyboardEvent.key values to Mousetrap names. */
const KEY_NAMES = {
    ' ': 'space',
    spacebar: 'space',
    arrowleft: 'left',
    arrowright: 'right',
    arrowup: 'up',
    arrowdown: 'down',
    '+': 'plus',
    escape: 'esc',
    delete: 'del',
    insert: 'ins',
    return: 'enter',
    control: 'ctrl',
    os: 'meta'
};

const DISPLAY_NAMES = {
    space: 'Space',
    left: '←',
    right: '→',
    up: '↑',
    down: '↓',
    plus: '+',
    esc: 'Esc',
    del: 'Delete',
    ins: 'Insert',
    enter: 'Enter',
    tab: 'Tab',
    backspace: 'Backspace',
    pageup: 'Page Up',
    pagedown: 'Page Down',
    home: 'Home',
    end: 'End'
};

/**
 * The built-in actions that can be rebound.  `geojs` actions are handled by
 * the geojs map interactor; `sized` geojs actions take shift or ctrl+shift for
 * larger steps, so only the base key is rebindable.  `layer` actions toggle
 * a channel or band in large_image's frame selector, which handles the keys
 * itself.  Style group actions are added dynamically with the id `group` and
 * a `param` of the group id.
 */
const hotkeyActions = [
    {id: 'pan.left', category: 'Navigation', label: 'Pan left', geojs: true, sized: true, keys: ['left']},
    {id: 'pan.right', category: 'Navigation', label: 'Pan right', geojs: true, sized: true, keys: ['right']},
    {id: 'pan.up', category: 'Navigation', label: 'Pan up', geojs: true, sized: true, keys: ['up']},
    {id: 'pan.down', category: 'Navigation', label: 'Pan down', geojs: true, sized: true, keys: ['down']},
    {id: 'zoom.in', category: 'Navigation', label: 'Zoom in', geojs: true, sized: true, keys: ['plus', '=']},
    {id: 'zoom.out', category: 'Navigation', label: 'Zoom out', geojs: true, sized: true, keys: ['-', '_']},
    {id: 'rotate.ccw', category: 'Navigation', label: 'Rotate counter-clockwise', geojs: true, sized: true, keys: ['<', '.']},
    {id: 'rotate.cw', category: 'Navigation', label: 'Rotate clockwise', geojs: true, sized: true, keys: ['>', ',']},
    {id: 'rotate.0', category: 'Navigation', label: 'Reset rotation', geojs: true, keys: ['0']},
    {id: 'zoom.0', category: 'Navigation', label: 'Zoom to level 0', geojs: true, keys: ['1']},
    {id: 'zoom.3', category: 'Navigation', label: 'Zoom to level 3', geojs: true, keys: ['2']},
    {id: 'zoom.6', category: 'Navigation', label: 'Zoom to level 6', geojs: true, keys: ['3']},
    {id: 'zoom.9', category: 'Navigation', label: 'Zoom to level 9', geojs: true, keys: ['4']},
    {id: 'zoom.12', category: 'Navigation', label: 'Zoom to level 12', geojs: true, keys: ['5']},
    {id: 'zoom.15', category: 'Navigation', label: 'Zoom to level 15', geojs: true, keys: ['6']},
    {id: 'zoom.18', category: 'Navigation', label: 'Zoom to level 18', geojs: true, keys: ['7']},

    {id: 'annotations.toggle', category: 'Annotations', label: 'Show or hide all annotations', keys: ['a']},
    {id: 'annotation.create', category: 'Annotations', label: 'Create a new annotation', keys: ['space']},
    {id: 'element.edit', category: 'Annotations', label: 'Edit the shape under the mouse', keys: ['e']},
    {id: 'element.menu', category: 'Annotations', label: 'Open the context menu for the selected or hovered element', keys: ['m']},
    {id: 'select.rectangle', category: 'Annotations', label: 'Select elements with a rectangle', keys: ['s']},
    {id: 'select.polygon', category: 'Annotations', label: 'Select elements with a polygon', keys: ['shift+s']},
    {id: 'select.clear', category: 'Annotations', label: 'Clear the selection', keys: ['shift+c']},

    {id: 'draw.point', category: 'Drawing', label: 'Draw a point', keys: ['o']},
    {id: 'draw.rectangle', category: 'Drawing', label: 'Draw a rectangle', keys: ['r']},
    {id: 'draw.ellipse', category: 'Drawing', label: 'Draw an ellipse', keys: ['i']},
    {id: 'draw.circle', category: 'Drawing', label: 'Draw a circle', keys: ['c']},
    {id: 'draw.polygon', category: 'Drawing', label: 'Draw a polygon', keys: ['p']},
    {id: 'draw.line', category: 'Drawing', label: 'Draw a line', keys: ['l']},
    {id: 'draw.brush', category: 'Drawing', label: 'Draw with a brush', keys: ['b']},
    {id: 'draw.finish', category: 'Drawing', label: 'Finish the current polygon or line', keys: ['enter']},
    {id: 'draw.cancel', category: 'Drawing', label: 'Stop drawing', keys: ['esc']},
    {id: 'brush.shape', category: 'Drawing', label: 'Next brush shape', keys: ['shift+b']},
    {id: 'brush.smaller', category: 'Drawing', label: 'Decrease brush size', keys: ['[']},
    {id: 'brush.larger', category: 'Drawing', label: 'Increase brush size', keys: [']']},
    {id: 'group.previous', category: 'Drawing', label: 'Previous style group', keys: ['q']},
    {id: 'group.next', category: 'Drawing', label: 'Next style group', keys: ['w']}
];
// ctrl+1 ... ctrl+0 toggle layers 1-10; ctrl+alt+1 ... ctrl+alt+0 layers 11-20
for (let idx = 0; idx < 20; idx += 1) {
    hotkeyActions.push({
        id: `layer.${idx + 1}`,
        category: 'Channels and bands',
        label: `Toggle layer ${idx + 1}`,
        layer: idx,
        keys: [`ctrl+${idx >= 10 ? 'alt+' : ''}${(idx + 1) % 10}`]
    });
}

const actionsById = {};
hotkeyActions.forEach((action) => { actionsById[action.id] = action; });

function getHotkeyAction(id) {
    return actionsById[id];
}

/**
 * Get the key used to store bindings for an action and optional parameter.
 */
function actionKey(action, param) {
    return param !== undefined && param !== null && param !== '' ? `${action}:${param}` : action;
}

function normalizeKeyName(key) {
    if (key === undefined || key === null) {
        return '';
    }
    key = String(key);
    const lower = key.toLowerCase();
    if (KEY_NAMES[key] !== undefined) {
        return KEY_NAMES[key];
    }
    return KEY_NAMES[lower] !== undefined ? KEY_NAMES[lower] : lower;
}

function isLetter(key) {
    return key.length === 1 && key.toLowerCase() !== key.toUpperCase();
}

/* Named keys (enter, left, ...) and letters honor shift.  For other
 * characters, shift is part of how the character is typed, so it is ignored. */
function usesShift(key) {
    return key.length > 1 || isLetter(key);
}

/**
 * Parse a key string such as "shift+s", "ctrl-alt-x", or "S".
 *
 * @param {string} str The key string.
 * @param {object} [entry] Optional config entry with explicit ctrl, alt,
 *      meta, or shift booleans that override the string.
 * @returns {object|null} A binding {key, ctrl, alt, meta, shift} where each
 *      modifier is a boolean, or null if there is no key.
 */
function parseKey(str, entry) {
    if (str === undefined || str === null || str === '') {
        return null;
    }
    str = String(str);
    const parts = str.replace(/([+-])(?!$)/g, '\n').split('\n');
    const binding = {key: normalizeKeyName(parts[parts.length - 1])};
    if (!binding.key) {
        return null;
    }
    MODIFIERS.forEach((mod) => { binding[mod] = false; });
    parts.slice(0, -1).forEach((part) => {
        const mod = normalizeKeyName(part.trim());
        if (MODIFIERS.includes(mod)) {
            binding[mod] = true;
        } else if (mod === 'option') {
            binding.alt = true;
        } else if (mod === 'command' || mod === 'cmd') {
            binding.meta = true;
        }
    });
    const last = parts[parts.length - 1];
    if (isLetter(last) && last !== last.toLowerCase()) {
        binding.shift = true;
    }
    if (entry) {
        MODIFIERS.forEach((mod) => {
            if (typeof entry[mod] === 'boolean') {
                binding[mod] = entry[mod];
            }
        });
    }
    if (!usesShift(binding.key)) {
        binding.shift = false;
    }
    return binding;
}

/**
 * Convert a binding to its canonical Mousetrap string, e.g. "ctrl+shift+s".
 */
function formatKey(binding) {
    if (!binding) {
        return '';
    }
    return MODIFIERS.filter((mod) => binding[mod]).concat([binding.key]).join('+');
}

/**
 * Convert a binding to a string for display, e.g. "Ctrl+Shift+S".
 */
function displayKey(binding) {
    if (!binding) {
        return '';
    }
    const names = {ctrl: 'Ctrl', alt: 'Alt', meta: 'Meta', shift: 'Shift'};
    const key = DISPLAY_NAMES[binding.key] || (binding.key.length === 1 ? binding.key.toUpperCase() : binding.key);
    return MODIFIERS.filter((mod) => binding[mod]).map((mod) => names[mod]).concat([key]).join('+');
}

/**
 * Get the binding for a keyboard event.
 *
 * @param {object} evt A DOM or jQuery keyboard event.
 * @param {boolean} [sized] If true, shift and ctrl are ignored because they
 *      select the step size of a geojs action.
 * @returns {object|null} The binding, or null for a bare modifier key.
 */
function bindingFromEvent(evt, sized) {
    const oe = evt.originalEvent || evt;
    const raw = oe.key !== undefined ? oe.key : evt.key;
    const key = normalizeKeyName(raw);
    if (!key || MODIFIERS.includes(key) || key === 'dead' || key === 'unidentified') {
        return null;
    }
    const binding = {
        key,
        ctrl: !!oe.ctrlKey,
        alt: !!oe.altKey,
        meta: !!oe.metaKey,
        shift: !!oe.shiftKey || (isLetter(raw) && raw !== raw.toLowerCase())
    };
    if (!usesShift(key)) {
        binding.shift = false;
    }
    if (sized) {
        binding.shift = binding.ctrl = false;
    }
    return binding;
}

function groupEntries(entries) {
    const result = {};
    (entries || []).forEach((entry) => {
        if (!entry || typeof entry !== 'object' || !entry.action) {
            return;
        }
        if (entry.action !== 'group' && !actionsById[entry.action]) {
            return;
        }
        const ak = actionKey(entry.action, entry.param);
        if (!result[ak]) {
            result[ak] = {action: entry.action, param: entry.param, bindings: [], hasKey: false};
        }
        if ('key' in entry) {
            result[ak].hasKey = true;
            const binding = parseKey(entry.key, entry);
            if (binding) {
                result[ak].bindings.push(binding);
            }
        }
    });
    return result;
}

function sizedBinding(action, binding) {
    if (action && action.sized) {
        return Object.assign({}, binding, {shift: false, ctrl: false});
    }
    return binding;
}

/**
 * Get the key strings a binding occupies, including the shift and ctrl+shift
 * variants of sized geojs actions.
 */
function occupiedKeys(ak, binding) {
    const action = actionsById[ak];
    const base = formatKey(binding);
    if (!action || !action.sized) {
        return [base];
    }
    return [base, formatKey(Object.assign({}, binding, {shift: true})),
        formatKey(Object.assign({}, binding, {shift: true, ctrl: true}))];
}

/**
 * Combine default, config, and user hotkeys.
 *
 * @param {object} options
 * @param {object[]} [options.config] `hotkeys` entries from the folder config,
 *      plus entries generated from annotation group `hotkey` values.
 * @param {object[]} [options.user] `hotkeys` entries from the user's file.
 * @returns {object} `bindings`: action key to a list of bindings; `source`:
 *      action key to 'default', 'config', or 'user'; `params`: action key to
 *      {action, param}; `stripped`: action key to true if some of its keys
 *      were taken by a later layer.
 */
function resolveHotkeys({config, user} = {}) {
    const result = {bindings: {}, source: {}, params: {}, stripped: {}};
    const rank = {default: 0, config: 1, user: 2};
    hotkeyActions.forEach((action) => {
        result.bindings[action.id] = action.keys.map((key) => parseKey(key));
        result.source[action.id] = 'default';
        result.params[action.id] = {action: action.id};
    });
    const apply = (grouped, source) => {
        const taken = {};
        Object.entries(grouped).forEach(([ak, info]) => {
            result.params[ak] = info.param !== undefined ? {action: info.action, param: info.param} : {action: info.action};
            if (info.hasKey || !result.bindings[ak]) {
                result.bindings[ak] = info.bindings.map((binding) => sizedBinding(actionsById[ak], binding));
                result.source[ak] = source;
                result.bindings[ak].forEach((binding) => {
                    occupiedKeys(ak, binding).forEach((key) => { taken[key] = true; });
                });
            }
        });
        // A key bound by this layer is removed from actions that got it from
        // an earlier layer.
        Object.entries(result.bindings).forEach(([ak, list]) => {
            if (rank[result.source[ak]] >= rank[source]) {
                return;
            }
            const remaining = list.filter((binding) => !occupiedKeys(ak, binding).some((key) => taken[key]));
            if (remaining.length !== list.length) {
                result.bindings[ak] = remaining;
                result.stripped[ak] = true;
            }
        });
    };
    apply(groupEntries(config), 'config');
    apply(groupEntries(user), 'user');
    return result;
}

/**
 * Find key strings that are bound to more than one action.
 *
 * @param {object} bindings Action key to a list of bindings.
 * @returns {object} Key string to a list of action keys, only for conflicts.
 */
function findConflicts(bindings) {
    const used = {};
    Object.entries(bindings).forEach(([ak, list]) => {
        (list || []).forEach((binding) => {
            occupiedKeys(ak, binding).forEach((key) => {
                used[key] = used[key] || [];
                if (!used[key].includes(ak)) {
                    used[key].push(ak);
                }
            });
        });
    });
    Object.keys(used).forEach((key) => {
        if (used[key].length < 2) {
            delete used[key];
        }
    });
    return used;
}

/**
 * Get geojs keyboard actions for navigation actions that differ from the
 * defaults.
 *
 * @param {object} resolved The result of resolveHotkeys.
 * @returns {object} geojs action name to a list of Mousetrap key strings.
 */
function geojsKeyboardActions(resolved) {
    const actions = {};
    hotkeyActions.forEach((action) => {
        if (!action.geojs || (resolved.source[action.id] === 'default' && !resolved.stripped[action.id])) {
            return;
        }
        actions[action.id] = [];
        (resolved.bindings[action.id] || []).forEach((binding) => {
            occupiedKeys(action.id, binding).forEach((key) => actions[action.id].push(key));
        });
    });
    return actions;
}

/**
 * Get the action key for a keyboard event, ignoring geojs actions.
 *
 * @param {object} resolved The result of resolveHotkeys.
 * @param {object} evt A keyboard event.
 * @returns {object|null} {action, param} or null.
 */
function actionForEvent(resolved, evt) {
    const pressed = bindingFromEvent(evt);
    if (!pressed) {
        return null;
    }
    const key = formatKey(pressed);
    for (const [ak, list] of Object.entries(resolved.bindings)) {
        const action = actionsById[ak];
        if (action && (action.geojs || action.layer !== undefined)) {
            continue;
        }
        if ((list || []).some((binding) => formatKey(binding) === key)) {
            return resolved.params[ak] || {action: ak};
        }
    }
    return null;
}

/**
 * Convert a map of user overrides to `hotkeys` entries for the user's file.
 *
 * @param {object} overrides Action key to a list of bindings.  An empty list
 *      unbinds the action.
 * @param {object} params Action key to {action, param}.
 * @returns {object[]} Entries for the `hotkeys` list.
 */
function overridesToEntries(overrides, params) {
    const entries = [];
    Object.entries(overrides).forEach(([ak, list]) => {
        const base = Object.assign({}, (params && params[ak]) || {action: ak});
        if (base.param === undefined) {
            delete base.param;
        }
        if (!list.length) {
            entries.push(Object.assign({}, base, {key: null}));
        }
        list.forEach((binding) => entries.push(Object.assign({}, base, {key: formatKey(binding)})));
    });
    return entries;
}

let currentHotkeys = resolveHotkeys();

/**
 * Set the hotkeys used for tooltips.
 */
function setCurrentHotkeys(resolved) {
    currentHotkeys = resolved;
}

/**
 * Get the display text for an action's keys, e.g. "Shift+S".
 */
function hotkeyText(ak, resolved) {
    const list = ((resolved || currentHotkeys).bindings[ak] || []).map(displayKey);
    return list.length ? list.join(' or ') : 'none';
}

/**
 * Set the title of every element with a `data-hotkey-title` attribute under
 * a root element.  In the attribute, `{action.id}` is replaced with the keys
 * for that action.
 *
 * @param {Element} root A DOM element.
 */
function applyHotkeyTitles(root) {
    if (!root || !root.querySelectorAll) {
        return;
    }
    const nodes = Array.from(root.querySelectorAll('[data-hotkey-title]'));
    if (root.matches && root.matches('[data-hotkey-title]')) {
        nodes.push(root);
    }
    nodes.forEach((node) => {
        node.setAttribute('title', node.getAttribute('data-hotkey-title').replace(
            /\{([\w.:-]+)\}/g, (match, ak) => hotkeyText(ak)));
    });
}

export {
    setCurrentHotkeys,
    hotkeyText,
    applyHotkeyTitles,
    USER_CONFIG_NAME,
    hotkeyActions,
    getHotkeyAction,
    actionKey,
    normalizeKeyName,
    parseKey,
    formatKey,
    displayKey,
    bindingFromEvent,
    occupiedKeys,
    resolveHotkeys,
    findConflicts,
    geojsKeyboardActions,
    actionForEvent,
    overridesToEntries
};
