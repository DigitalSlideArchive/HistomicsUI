import $ from 'jquery';
import _ from 'underscore';

import { restRequest } from '@girder/core/rest';

import Panel from '@girder/slicer_cli_web/views/Panel';
// import events from '@girder/core/events';

import MetadataPlotDialog from '../dialogs/metadataPlot';
import metadataPlotTemplate from '../templates/panels/metadataPlot.pug';
import '../stylesheets/panels/metadataPlot.styl';

var MetadataPlot = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .g-widget-metadata-plot-settings': function (event) {
            const dlg = new MetadataPlotDialog({
                plotOptions: this.getPlotOptions(),
                plotConfig: this.plotConfig,
                plotPanel: this,
                el: $('#g-dialog-container'),
                parentView: this
            }).render();
            dlg.$el.on('hidden.bs.modal', () => {
                if (dlg.result !== undefined) {
                    this.plotConfig = dlg.result;
                    this.render();
                }
            });
        },
        'click .h-panel-maximize': function (event) {
            this.$el.html('');
            this.expand();
            this.$('.s-panel-content').addClass('in');
            let panelElem = this.$el.closest('.s-panel');
            let maximize = !panelElem.hasClass('h-panel-maximized');
            panelElem.toggleClass('h-panel-maximized', maximize);
            panelElem.toggleClass('s-no-panel-toggle', maximize);
            this.render();
        }
    }),

    /**
     * Creates a widget to display a plot of certain metadata, possibly
     * including data from items in the same parent folder.
     */
    initialize: function (settings) {
        this.settings = settings;
        this.plotConfig = {
            folder: true
        };
    },

    getSiblingItems(folderId) {
        var chunk = 100;
        if (folderId !== this.parentFolderId) {
            return null;
        }
        return restRequest({url: 'item', data: {folderId: folderId, offset: this.siblingItems.length, limit: chunk + 1}}).done((result) => {
            if (folderId !== this.parentFolderId) {
                return null;
            }
            this.siblingItems = this.siblingItems.concat(result.slice(0, chunk));
            if (result.length > chunk) {
                return this.getSiblingItems(folderId);
            }
            this.siblingItemsPromise.resolve(this.siblingItems);
            return null;
        });
    },

    setItem: function (item) {
        this.item = item;
        this.item.on('g:changed', function () {
            this.render();
        }, this);
        if (this.parentFolderId !== item.get('folderId')) {
            this.parentFolderId = null;
            if (this.siblingItemPromise) {
                this.siblingItemPromise.abort();
            }
            const plotOptions = this.getPlotOptions();
            this.siblingItems = [];
            this.collectedPlotData = null;
            if (plotOptions.filter((v) => v.type === 'number').length >= 2) {
                this.parentFolderId = item.get('folderId');
                this.siblingItemsPromise = $.Deferred();
                this.getSiblingItems(item.get('folderId'));
            }
        }
        this.render();
        return this;
    },

    /**
     * Check if there is metadata that can be used for a plot.  Metadata is
     * structured as a dictionary.  If a top-level key contains an array
     * whose first element is an object, then any key in that object is a
     * possible value to plot.  These keys are categorized based on if their
     * values are numbers or strings.
     *
     * @returns {object[]} An alphabetized list of available keys.  Each entry
     *   is an object with 'root', 'key' and 'type'.
     */
    getPlotOptions: function () {
        if (!this.item || !this.item.id || !this.item.get('meta')) {
            return [];
        }
        var meta = this.item.get('meta');
        var results = [{root: 'Item', key: 'name', type: 'string', sort: '_name'}];
        for (const [root, entry] of Object.entries(meta)) {
            if (_.isArray(entry) && entry.length >= 1 && _.isObject(entry[0])) {
                for (const [key, value] of Object.entries(entry[0])) {
                    let type;
                    if (_.isFinite(value)) {
                        type = 'number';
                    } else if (_.isString(value)) {
                        type = 'string';
                    }
                    if (type) {
                        results.push({root: root, key: key, type: type, sort: `${root}.${key}`.toLowerCase()});
                    }
                }
            }
        }
        return results.sort((a, b) => a.sort.localeCompare(b.sort));
    },

    /**
     * Collect all plot data into a single array with the current item first.
     * Create a summary of each data field.  For numeric values, this is the
     * minimum and maximum.  For all fields, this is the number of distinct
     * values.  This is done for the current item's data and for all items
     * combined.
     */
    getPlotData: function (plotConfig) {
        const plotOptions = this.getPlotOptions();
        const optDict = {};
        plotOptions.forEach((opt) => { optDict[opt.sort] = opt; });
        let plotData = {data: [], fieldToPlot: {}, plotToOpt: {}, ranges: {}};
        const usedFields = ['x', 'y', 'r', 'c', 's'].filter((series) => plotConfig[series] && optDict[plotConfig[series]]).map((series) => {
            if (!plotData.fieldToPlot[plotConfig[series]]) {
                plotData.fieldToPlot[plotConfig[series]] = [];
            }
            plotData.fieldToPlot[plotConfig[series]].push(series);
            plotData.plotToOpt[series] = optDict[plotConfig[series]];
            return plotConfig[series];
        });
        const usedOptions = plotOptions.filter((opt) => usedFields.includes(opt.sort));
        if (!usedOptions.length) {
            return plotData;
        }
        let items = [];
        if (plotConfig.folder) {
            items = this.siblingItems.filter((d) => d.largeImage && !d.largeImage.expected && d.meta && d._id !== this.item.id);
        }
        items.unshift(this.item.toJSON());
        items.forEach((item, itemIdx) => {
            let meta = item.meta;
            let end = false;
            for (let idx = 0; !end; idx += 1) {
                let entry = {};
                usedOptions.forEach((opt) => {
                    plotData.fieldToPlot[opt.sort].forEach((key) => {
                        let value;
                        if (opt.sort === '_name') {
                            value = item.name;
                        } else if (meta[opt.root] && meta[opt.root][idx]) {
                            value = meta[opt.root][idx][opt.key];
                        }
                        if (value === undefined || (opt.type === 'number' && !_.isFinite(value))) {
                            end = true;
                        }
                        if (opt.type === 'string') {
                            value = '' + value;
                        }
                        entry[key] = value;
                    });
                });
                if (!end) {
                    plotData.data.push(entry);
                }
            }
        });
        plotData.data.forEach((entry, idx) => {
            Object.entries(entry).forEach(([key, value]) => {
                if (!plotData.ranges[key]) {
                    if (_.isFinite(value)) {
                        plotData.ranges[key] = {min: value, max: value};
                    } else {
                        plotData.ranges[key] = {distinct: {}};
                    }
                }
                if (_.isFinite(value)) {
                    if (value < plotData.ranges[key].min) {
                        plotData.ranges[key].min = value;
                    }
                    if (value > plotData.ranges[key].max) {
                        plotData.ranges[key].max = value;
                    }
                } else {
                    plotData.ranges[key].distinct[value] = true;
                    plotData.ranges[key].list = Object.keys(plotData.ranges[key].distinct).sort();
                    plotData.ranges[key].count = plotData.ranges[key].list.length;
                }
            });
        });
        return plotData;
    },

    plotDataToPlotly: function (plotData) {
        let colorBrewerPaired12 = ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'];
        let viridis = ['#440154', '#482172', '#423d84', '#38578c', '#2d6f8e', '#24858d', '#1e9a89', '#2ab07e', '#51c468', '#86d449', '#c2df22', '#fde724'];
        let colorScale;
        if (plotData.ranges.c && !plotData.ranges.c.count) {
            colorScale = window.d3.scale.linear().domain(viridis.map((_, i) => i / (viridis.length - 1) * (plotData.ranges.c.max - plotData.ranges.c.min) + plotData.ranges.c.min)).range(viridis);
        }
        let plotlyData = {
            x: plotData.data.map((d) => d.x),
            y: plotData.data.map((d) => d.y),
            hovertext: plotData.data.map((d) => {
                let parts = [];
                ['x', 'y', 'r', 'c', 's'].forEach((series) => {
                    if (d[series] !== undefined) {
                        parts.push(`${plotData.plotToOpt[series].root} - ${plotData.plotToOpt[series].key}: ${d[series]}`);
                    }
                });
                return '<span style="font-size: 9px">' + parts.join('<br>') + '</span>';
            }),
            hoverinfo: 'text',
            marker: {
                symbol: plotData.ranges.s && plotData.ranges.s.count ? plotData.data.map((d) => plotData.ranges.s.list.indexOf(d.s)) : 0,
                size: plotData.ranges.r ? (
                    !plotData.ranges.r.count
                        ? plotData.data.map((d) => (d.r - plotData.ranges.r.min) / (plotData.ranges.r.max - plotData.ranges.r.min) * 10 + 5)
                        : plotData.data.map((d) => plotData.ranges.r.list.indexOf(d.r) / plotData.ranges.r.count * 10 + 5)
                ) : 10,
                color: plotData.ranges.c ? (
                    !plotData.ranges.c.count
                        ? plotData.data.map((d) => colorScale(d.c))
                        : plotData.data.map((d) => colorBrewerPaired12[plotData.ranges.c.list.indexOf(d.c)] || '#000000')
                ) : '#000000',
                opacity: 0.5
            },
            type: plotData.data.length > 100 ? 'scattergl' : 'scatter',
            mode: 'markers'
        };
        return [plotlyData];
    },

    render: function () {
        if (this.item && this.item.id) {
            const plotOptions = this.getPlotOptions();
            if (plotOptions.filter((v) => v.type === 'number').length < 2) {
                this.$el.html('');
                return;
            }
            $.when(
                this.siblingItemsPromise,
                $.ajax({ // like $.getScript, but allow caching
                    url: 'https://cdn.plot.ly/plotly-latest.min.js',
                    dataType: 'script',
                    cache: true
                })
            ).done(() => {
                let plotData = this.getPlotData(this.plotConfig);
                this.$el.html(metadataPlotTemplate({}));
                const elem = this.$el.find('.h-metadata-plot-area');
                if (!plotData.ranges.x || !plotData.ranges.y || plotData.data.length < 2) {
                    elem.html('');
                    return;
                }
                const maximized = this.$el.closest('.h-panel-maximized').length > 0;
                let plotOptions = {
                    margin: {t: 0, l: 40, r: 0, b: 20},
                    hovermode: 'closest'
                };
                if (maximized) {
                    plotOptions.margin.l += 20;
                    plotOptions.margin.b += 40;
                    plotOptions.xaxis = {title: {text: `${plotData.plotToOpt.x.root} - ${plotData.plotToOpt.x.key}`}};
                    plotOptions.yaxis = {title: {text: `${plotData.plotToOpt.y.root} - ${plotData.plotToOpt.y.key}`}};
                }
                window.Plotly.newPlot(elem[0], this.plotDataToPlotly(plotData), plotOptions);
            });
        }
        return this;
    }
});

export default MetadataPlot;
