import _ from 'underscore';
import $ from 'jquery';
import {getCurrentUser} from '@girder/core/auth';
import {restRequest} from '@girder/core/rest';

import events from '../../events';
import router from '../../router';
import View from '../View';
import headerAnalysesTemplate from '../../templates/layout/headerAnalyses.pug';
import '../../stylesheets/layout/headerAnalyses.styl';

const RECENT_KEY = ':recent';
const RECENT_STORAGE = 'histomicsui.analyses.recent';
const RECENT_MAX = 10;

var HeaderUserView = View.extend({
    events: {
        'click .h-analysis-item': '_setAnalysis',
        'click .h-analyses-image > a': '_clickImage',
        'focusin .h-analyses-image > a': '_focusImage',
        'click .h-analyses-dropdown': '_clickMenu',
        'keydown .h-analyses-dropdown': '_keydown',
        'input .h-analyses-filter': '_applyFilter',
        'shown.bs.dropdown': '_shown'
    },
    initialize() {
        this.image = null;
        this.listenTo(events, 'h:imageOpened', function (image) {
            this.image = image;
            this.render();
        });
    },
    render() {
        if (this.image) {
            restRequest({
                url: 'slicer_cli_web/docker_image'
            }).then((analyses) => {
                this._analyses = analyses || {};
                if (_.keys(this._analyses).length > 0) {
                    this.$el.removeClass('hidden');
                    this._renderMenu();
                } else {
                    this.$el.addClass('hidden');
                }
                return null;
            });
        } else {
            this.$el.addClass('hidden');
        }
        return this;
    },
    /**
     * Convert the docker image response to a sorted list of images, each with
     * a list of versions, each with a list of tasks.
     *
     * @param {object} analyses The response from the docker_image endpoint.
     * @returns {object[]} The list of images.
     */
    _imageList(analyses) {
        const keyCount = {};
        for (const key of Object.keys(analyses)) {
            const key2 = key.split('/').slice(-2).join('/');
            keyCount[key2] = (keyCount[key2] || 0) + 1;
        }
        const keyMap = {};
        for (const key of Object.keys(analyses)) {
            const key2 = key.split('/').slice(-2).join('/');
            keyMap[keyCount[key2] === 1 ? key2 : key] = key;
        }
        return Object.keys(keyMap).sort().map((label) => {
            const name = keyMap[label];
            const versions = Object.keys(analyses[name]).map((versionName) => {
                const tasks = Object.keys(analyses[name][versionName]).map((cliName) => {
                    return this._task(analyses, name, versionName, cliName, label);
                });
                return {name: versionName, tasks: tasks, key: versionName.toLowerCase()};
            });
            // uncased lexical order
            versions.sort((a, b) => (a.key < b.key ? -1 : (a.key > b.key ? 1 : (a.name < b.name ? -1 : 1))));
            return {name: name, label: label, versions: versions};
        });
    },

    _task(analyses, imageName, versionName, cliName, label) {
        return {
            image: imageName,
            version: versionName,
            cli: cliName,
            label: label,
            api: analyses[imageName][versionName][cliName].run.replace(/\/run$/, ''),
            search: [imageName, versionName, cliName].join(' ').toLowerCase()
        };
    },

    /**
     * Get the recently used analyses that still exist.
     *
     * @param {object[]} images The list from _imageList.
     * @returns {object[]} A list of tasks, most recently used first.
     */
    _recentList(images) {
        const labels = {};
        images.forEach((image) => { labels[image.name] = image.label; });
        return this._getRecent().filter((entry) => {
            return ((this._analyses[entry.image] || {})[entry.version] || {})[entry.cli];
        }).map((entry) => {
            return this._task(this._analyses, entry.image, entry.version, entry.cli, labels[entry.image]);
        });
    },

    _recentStorageKey() {
        const user = getCurrentUser();
        return RECENT_STORAGE + '.' + (user ? user.id : '');
    },

    _getRecent() {
        let recent = [];
        try {
            recent = JSON.parse(window.localStorage.getItem(this._recentStorageKey()) || '[]');
        } catch (err) { }
        return _.isArray(recent) ? recent.filter((entry) => _.isObject(entry)) : [];
    },

    _addRecent(image, version, cli) {
        const recent = this._getRecent().filter((entry) => {
            return entry.image !== image || entry.version !== version || entry.cli !== cli;
        });
        recent.unshift({image: image, version: version, cli: cli});
        try {
            window.localStorage.setItem(
                this._recentStorageKey(), JSON.stringify(recent.slice(0, RECENT_MAX)));
        } catch (err) {
            console.warn('Failed to write localStorage');
        }
    },

    _renderMenu() {
        const images = this._imageList(this._analyses);
        const recent = this._recentList(images);
        this.$el.html(headerAnalysesTemplate({
            images: images,
            recent: recent,
            recentKey: RECENT_KEY
        }));
        let selected = this._selected;
        if (!this._groups().filter((idx, el) => $(el).attr('data-key') === selected).length) {
            selected = this._groups().first().attr('data-key');
        }
        this._select(selected);
    },

    _groups() {
        return this.$('.h-analyses-task-group');
    },

    /**
     * Show the tasks for one image (or for the recently used list).
     *
     * @param {string} key The image name or the recent key.
     */
    _select(key) {
        this._selected = key;
        this.$('.h-analyses-image, .h-analyses-task-group').each((idx, el) => {
            $(el).toggleClass('h-active', $(el).attr('data-key') === key);
        });
        this._align();
    },

    /**
     * Where there is room, center the tasks vertically on the selected image.
     */
    _align() {
        const $column = this.$('.h-analyses-tasks');
        const $group = this.$('.h-analyses-task-group.h-active');
        const $image = this.$('.h-analyses-image.h-active:not(.hidden)');
        this._groups().css('margin-top', '');
        $column.scrollTop(0);
        if (!$group.length || !$image.length || !$column.is(':visible')) {
            return;
        }
        const imageRect = $image[0].getBoundingClientRect();
        const offset = imageRect.top + imageRect.height / 2 - $group.outerHeight() / 2 -
            this.$('.h-analyses-images')[0].getBoundingClientRect().top - parseFloat($column.css('padding-top'));
        const room = $column.height() - $group.outerHeight();
        $group.css('margin-top', Math.max(0, Math.min(offset, room)));
    },

    /**
     * Show only the tasks where every word in the filter is in the image
     * name, version, or task name.
     */
    _applyFilter() {
        const tokens = (this.$('.h-analyses-filter').val() || '').toLowerCase().split(/\s+/).filter(Boolean);
        this.$('.h-analysis-item').each((idx, el) => {
            const text = $(el).attr('data-search');
            $(el).parent().toggleClass('hidden', !tokens.every((token) => text.includes(token)));
        });
        this.$('.h-analyses-version').each((idx, el) => {
            $(el).toggleClass('hidden', !$(el).find('li:not(.hidden)').length);
        });
        const $images = this.$('.h-analyses-image');
        this._groups().each((idx, el) => {
            $images.eq(idx).toggleClass('hidden', !$(el).find('li:not(.hidden)').length);
        });
        const $visible = $images.filter(':not(.hidden)');
        this.$('.h-analyses-empty').toggleClass('hidden', $visible.length > 0);
        this._select(($visible.filter('.h-active').length ? $visible.filter('.h-active') : $visible.first()).attr('data-key'));
    },

    _shown() {
        const $filter = this.$('.h-analyses-filter');
        const $menu = this.$('.h-analyses-dropdown');
        const $images = this.$('.h-analyses-images');
        $filter.val('');
        this._applyFilter();
        // Size the menu to show the longest names, then keep that size so it
        // doesn't shift when the selection or filter changes.
        $menu.css('width', '');
        $images.css('width', '');
        $images.css('width', Math.ceil($images[0].getBoundingClientRect().width));
        $menu.css('width', Math.ceil($menu[0].getBoundingClientRect().width));
        this._align();
        $filter.focus();
    },

    _focusImage(evt) {
        const key = $(evt.currentTarget).parent().attr('data-key');
        if (key !== this._selected) {
            this._select(key);
        }
    },

    _clickImage(evt) {
        evt.preventDefault();
        this._select($(evt.currentTarget).parent().attr('data-key'));
    },

    /**
     * Keep the menu open on clicks that don't pick an analysis.
     */
    _clickMenu(evt) {
        if (!$(evt.target).closest('.h-analysis-item').length) {
            evt.stopPropagation();
        }
    },

    _keydown(evt) {
        // Bootstrap's dropdown key handling doesn't know about the columns
        evt.stopPropagation();
        const key = evt.which;
        const $target = $(evt.target);
        const $filter = this.$('.h-analyses-filter');
        const $images = this.$('.h-analyses-image:not(.hidden) > a');
        const $tasks = this.$('.h-analyses-task-group.h-active li:not(.hidden) > a');
        const $activeImage = this.$('.h-analyses-image.h-active:not(.hidden) > a');
        if (key === 27) { // escape
            this.$el.removeClass('open');
            this.$('.h-analyses-dropdown-link').attr('aria-expanded', 'false').focus();
        } else if ($target.is($filter)) {
            if (key === 40) { // down
                ($activeImage.length ? $activeImage : $images.first()).focus();
            } else if (key === 13 && $filter.val().trim()) { // enter
                $tasks.first().click();
            } else {
                return;
            }
        } else if ($target.closest('.h-analyses-images').length) {
            const idx = $images.index($target);
            if (key === 38) { // up
                (idx > 0 ? $images.eq(idx - 1) : $filter).focus();
            } else if (key === 40) { // down
                $images.eq(Math.min(idx + 1, $images.length - 1)).focus();
            } else if (key === 37 || key === 13) { // left, enter
                $tasks.first().focus();
            } else {
                return;
            }
        } else if ($target.closest('.h-analyses-tasks').length) {
            const idx = $tasks.index($target);
            if (key === 38) { // up
                (idx > 0 ? $tasks.eq(idx - 1) : $filter).focus();
            } else if (key === 40) { // down
                $tasks.eq(Math.min(idx + 1, $tasks.length - 1)).focus();
            } else if (key === 39) { // right
                $activeImage.focus();
            } else {
                return;
            }
        } else {
            return;
        }
        evt.preventDefault();
    },

    _setAnalysis(evt) {
        evt.preventDefault();
        var $target = $(evt.currentTarget);
        var target = $target.data();

        // use attr rather than data so versions like "1.9" stay strings
        this._addRecent($target.attr('data-image'), $target.attr('data-version'), $target.attr('data-cli'));
        this._renderMenu();
        router.setQuery('analysis', target.api, {trigger: true});
    }
});

export default HeaderUserView;
