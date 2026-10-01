import $ from 'jquery';
import jsyaml from 'js-yaml';

import View from '@girder/core/views/View';
import {restRequest} from '@girder/core/rest';
import {getCurrentUser} from '@girder/core/auth';

import StyleCollection from '../collections/StyleCollection';
import {
    USER_CONFIG_NAME, actionKey, displayKey, formatKey, bindingFromEvent,
    getHotkeyAction, hotkeyActions, occupiedKeys, overridesToEntries,
    resolveHotkeys
} from '../hotkeys';
import editHotkeysTemplate from '../templates/dialogs/editHotkeys.pug';
import '@girder/core/utilities/jquery/girderModal';
import '../stylesheets/dialogs/editHotkeys.styl';

/**
 * A modal dialog that lists every rebindable action and lets the current
 * user choose their own keys.  The choices are saved to a file in the user's
 * Private folder.
 */
const EditHotkeysDialog = View.extend({
    events: {
        'click .h-hotkey-change': '_startCapture',
        'click .h-hotkey-clear': '_clearAction',
        'click .h-hotkey-reset': '_resetAction',
        'click .h-hotkeys-reset-all': '_resetAll',
        'input .h-hotkeys-filter': '_filter',
        'click .h-submit': '_submit'
    },

    /**
     * @param {object} settings
     * @param {object} settings.userConfig The user's current config file.
     * @param {object[]} settings.configHotkeys Hotkey entries from the
     *      folder config.
     * @param {StyleCollection} settings.groups The user's style groups.
     * @param {function} [settings.onSave] Called with the new user config.
     */
    initialize(settings) {
        this.userConfig = settings.userConfig || {};
        this.configHotkeys = settings.configHotkeys || [];
        this.groups = settings.groups;
        this.onSave = settings.onSave;
        this.overrides = {};
        const initial = resolveHotkeys({user: this.userConfig.hotkeys || []});
        Object.keys(initial.source).forEach((ak) => {
            if (initial.source[ak] === 'user') {
                this.overrides[ak] = initial.bindings[ak];
            }
        });
        this._capturing = null;
        this._onCaptureKey = this._onCaptureKey.bind(this);
    },

    render() {
        this._resolve();
        const html = editHotkeysTemplate({
            categories: this._rows(),
            capturing: this._capturing,
            message: this._message,
            filter: this._filterText || ''
        });
        if (!this._rendered) {
            this.$el.html(html);
            this.$el.girderModal(this).on('hidden.bs.modal', () => this._stopCapture());
            this._rendered = true;
        } else {
            // Only replace the body; girderModal binds the close buttons
            // directly, so they must not be re-rendered.
            this.$('.modal-body').replaceWith($(html).find('.modal-body'));
        }
        this._filter();
        if (this._capturing) {
            this.$(`.h-hotkey-row[data-action="${this._capturing}"] .h-hotkey-change`).trigger('focus');
        }
        return this;
    },

    _resolve() {
        this.resolved = resolveHotkeys({
            config: this.configHotkeys,
            user: overridesToEntries(this.overrides, this._params())
        });
        return this.resolved;
    },

    _params() {
        const params = {};
        if (this.groups) {
            this.groups.each((group) => {
                params[actionKey('group', group.id)] = {action: 'group', param: group.id};
            });
        }
        return params;
    },

    _label(ak) {
        const action = getHotkeyAction(ak);
        if (action) {
            return action.label;
        }
        return `Use style group "${ak.substr(ak.indexOf(':') + 1)}"`;
    },

    _rows() {
        const categories = [];
        const byName = {};
        const addRow = (category, ak) => {
            if (!byName[category]) {
                byName[category] = {name: category, rows: []};
                categories.push(byName[category]);
            }
            const action = getHotkeyAction(ak);
            byName[category].rows.push({
                id: ak,
                label: this._label(ak),
                keys: (this.resolved.bindings[ak] || []).map(displayKey),
                source: this.resolved.source[ak] || 'default',
                sized: !!(action && action.sized)
            });
        };
        hotkeyActions.forEach((action) => addRow(action.category, action.id));
        const groupIds = new Set();
        if (this.groups) {
            this.groups.each((group) => groupIds.add(group.id));
        }
        Object.keys(this.resolved.bindings).forEach((ak) => {
            if (ak.startsWith('group:')) {
                groupIds.add(ak.substr(6));
            }
        });
        [...groupIds].sort().forEach((id) => addRow('Style groups', actionKey('group', id)));
        return categories;
    },

    _filter() {
        const text = (this.$('.h-hotkeys-filter').val() || '').trim().toLowerCase();
        this._filterText = text;
        this.$('.h-hotkey-row').each((idx, row) => {
            $(row).toggleClass('hidden', !!text && !$(row).text().toLowerCase().includes(text));
        });
    },

    _rowAction(evt) {
        return $(evt.currentTarget).closest('.h-hotkey-row').attr('data-action');
    },

    _startCapture(evt) {
        evt.preventDefault();
        this._capturing = this._rowAction(evt);
        this._message = null;
        document.addEventListener('keydown', this._onCaptureKey, true);
        this.render();
    },

    _stopCapture() {
        this._capturing = null;
        document.removeEventListener('keydown', this._onCaptureKey, true);
    },

    _onCaptureKey(evt) {
        const ak = this._capturing;
        if (!ak) {
            return;
        }
        const action = getHotkeyAction(ak);
        const binding = bindingFromEvent(evt, action && action.sized);
        if (!binding) {
            return;
        }
        evt.preventDefault();
        evt.stopPropagation();
        this._stopCapture();
        if (formatKey(binding) === 'esc') {
            this._message = null;
            this.render();
            return;
        }
        this._message = this._assign(ak, binding);
        this.render();
    },

    /**
     * Bind a key to an action, removing it from any other action.
     *
     * @returns {object|null} A message for the user.
     */
    _assign(ak, binding) {
        const wanted = occupiedKeys(ak, binding);
        const taken = [];
        for (const [other, list] of Object.entries(this.resolved.bindings)) {
            if (other === ak) {
                continue;
            }
            const clashes = (list || []).filter((b) => occupiedKeys(other, b).some((key) => wanted.includes(key)));
            if (!clashes.length) {
                continue;
            }
            taken.push([other, list.filter((b) => !clashes.includes(b))]);
        }
        taken.forEach(([other, remaining]) => { this.overrides[other] = remaining; });
        this.overrides[ak] = [binding];
        if (taken.length) {
            return {
                type: 'warning',
                text: `${displayKey(binding)} was removed from ${taken.map(([other]) => `"${this._label(other)}"`).join(', ')}.`
            };
        }
        return null;
    },

    _clearAction(evt) {
        evt.preventDefault();
        this.overrides[this._rowAction(evt)] = [];
        this._message = null;
        this.render();
    },

    _resetAction(evt) {
        evt.preventDefault();
        delete this.overrides[this._rowAction(evt)];
        this._message = null;
        this.render();
    },

    _resetAll(evt) {
        evt.preventDefault();
        this.overrides = {};
        this._message = null;
        this.render();
    },

    _submit(evt) {
        evt.preventDefault();
        this._stopCapture();
        // Only store overrides that differ from what the user would get
        // without them.
        const base = resolveHotkeys({config: this.configHotkeys});
        const same = (a, b) => (a || []).map(formatKey).sort().join(' ') === (b || []).map(formatKey).sort().join(' ');
        const overrides = {};
        Object.entries(this.overrides).forEach(([ak, list]) => {
            if (!same(list, base.bindings[ak])) {
                overrides[ak] = list;
            }
        });
        const userConfig = Object.assign({}, this.userConfig);
        const entries = overridesToEntries(overrides, this._params());
        if (entries.length) {
            userConfig.hotkeys = entries;
        } else {
            delete userConfig.hotkeys;
        }
        const user = getCurrentUser();
        this.$('.h-submit').prop('disabled', true);
        restRequest({
            url: `user/${user.id}/yaml_config/${USER_CONFIG_NAME}`,
            method: 'PUT',
            contentType: 'application/x-yaml',
            processData: false,
            data: jsyaml.dump(userConfig),
            error: null
        }).done(() => {
            if (this.onSave) {
                this.onSave(userConfig);
            }
            this.$el.modal('hide');
        }).fail((err) => {
            this.$('.h-submit').prop('disabled', false);
            this._message = {
                type: 'danger',
                text: `Failed to save: ${(err.responseJSON || {}).message || err.statusText || 'unknown error'}`
            };
            this.render();
        });
    }
});

/**
 * Show the keyboard shortcut dialog for the current user.
 *
 * @param {object} [options]
 * @param {object[]} [options.configHotkeys] Hotkey entries from the current
 *      folder config.
 * @param {function} [options.onSave] Called with the new user config.
 * @returns {Promise} Resolves with the dialog view.
 */
let pendingShow = null;

function show(options) {
    options = options || {};
    const user = getCurrentUser();
    if (!user) {
        return $.Deferred().reject().promise();
    }
    if (pendingShow) {
        // ignore repeated clicks while the dialog is loading
        return pendingShow;
    }
    const groups = new StyleCollection();
    pendingShow = $.when(
        restRequest({url: `user/${user.id}/yaml_config/${USER_CONFIG_NAME}`}),
        groups.fetch()
    ).then((userConfig) => {
        const dialog = new EditHotkeysDialog({
            parentView: null,
            el: $('#g-dialog-container'),
            userConfig: Array.isArray(userConfig) ? userConfig[0] : userConfig,
            configHotkeys: options.configHotkeys,
            groups,
            onSave: options.onSave
        });
        return dialog.render();
    }).always(() => {
        pendingShow = null;
    });
    return pendingShow;
}

export default show;
