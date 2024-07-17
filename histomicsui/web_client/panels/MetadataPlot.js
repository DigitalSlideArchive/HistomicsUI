/* global BUILD_TIMESTAMP */

import $ from 'jquery';
import _ from 'underscore';

import {restRequest} from '@girder/core/rest';

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
                    if (!_.isEqual(this.plotConfig, dlg.result)) {
                        this.plottableData = null;
                    }
                    this.plotConfig = dlg.result;
                    this.render();
                }
            });
        },
        'click .h-panel-maximize': function (event) {
            this.$el.html('');
            this.expand(event);
            this.$('.s-panel-content').addClass('in');
            const panelElem = this.$el.closest('.s-panel');
            const maximize = !panelElem.hasClass('h-panel-maximized');
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

    _refetchPlottable: function () {
        const annotations = [];
        if (this.parentView.annotationSelector && this.parentView.annotationSelector.collection) {
            this.parentView.annotationSelector.collection.each((model) => {
                if (model.get('displayed')) {
                    annotations.push(model.id);
                }
            });
            if (!this._listeningForAnnotations) {
                this.listenTo(this.parentView.annotationSelector.collection, 'sync remove update reset change:displayed h:refreshed', this._refetchPlottable);
                this._listeningForAnnotations = true;
            }
        }
        const lastUsed = this.item.id + ',' + annotations.join(',');
        if (lastUsed === this.plottableListUsed && this.plottableListPromise) {
            return;
        }
        this._currentAnnotations = annotations;
        this.plottableListUsed = lastUsed;

        this.plottableList = null;
        if (this.plottableListPromise) {
            this.plottableListPromise.abort();
        }
        this.plottableData = null;
        if (this.plottableDataPromise) {
            this.plottableDataPromise.abort();
        }
        const hasPlot = (this.getPlotOptions().filter((v) => v.type === 'number' && v.count).length >= 2);

        // redo this when annotations are turned on or off
        this.plottableListPromise = restRequest({
            url: `annotation/item/${this.item.id}/plot/list`,
            method: 'POST',
            error: null,
            data: {
                annotations: JSON.stringify(this._currentAnnotations)
            }
        }).done((result) => {
            this.plottableList = result;
            const plotOptions = this.getPlotOptions();
            if (plotOptions.filter((v) => v.type === 'number' && v.count).length >= 2) {
                if (!hasPlot) {
                    this.render();
                }
            }
        });
    },

    setItem: function (item) {
        const update = (this.item !== undefined && item !== undefined && this.item.id !== item.id) || !(this.item === undefined && item === undefined);
        this.item = item;
        this.item.on('g:changed', function () {
            this.render();
        }, this);
        if (update) {
            this.parentFolderId = item.get('folderId');
            this._refetchPlottable();
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
        if (!this.item || !this.item.id || !this.item.get('meta') || !this.plottableList) {
            return [];
        }
        return this.plottableList;
    },

    fetchPlottableData: function () {
        if (!this.item) {
            return;
        }
        let keys = [];
        ['x', 'y', 'r', 'c', 's'].forEach((k) => {
            if (this.plotConfig[k] !== undefined) {
                keys.push(this.plotConfig[k]);
            }
        });
        if (!keys.length) {
            return;
        }
        const requiredKeys = [];
        ['x', 'y'].forEach((k) => {
            if (this.plotConfig[k] !== undefined) {
                requiredKeys.push(this.plotConfig[k]);
            }
        });
        keys = keys.concat(['_0_item.name', '_2_item.id', '_bbox.x0', '_bbox.y0', '_bbox.x1', '_bbox.y1']);
        this.plottableDataPromise = restRequest({
            url: `annotation/item/${this.item.id}/plot/data`,
            method: 'POST',
            error: null,
            data: {
                adjacentItems: !!this.plotConfig.folder,
                keys: keys.join(','),
                requiredKeys: requiredKeys.join(','),
                annotations: JSON.stringify(this._currentAnnotations)
            }
        }).done((result) => {
            this.plottableData = result;
        });
    },

    /**
     * Collect all plot data into a single array with the current item first.
     * Create a summary of each data field.  For numeric values, this is the
     * minimum and maximum.  For all fields, this is the number of distinct
     * values.  This is done for the current item's data and for all items
     * combined.
     */
    getPlotData: function (plotConfig) {
        if (!this.plottableData || !this.plottableData.columns || !this.plottableData.data) {
            return null;
        }
        const plotData = {
            columns: this.plottableData.columns,
            data: this.plottableData.data,
            colDict: {},
            series: {},
            format: plotConfig.format || 'scatter'
        };
        plotData.columns.forEach((col) => {
            plotData.colDict[col.key] = col;
        });
        ['x', 'y', 'r', 'c', 's'].filter((series) => plotConfig[series] && plotData.colDict[plotConfig[series]]).forEach((series) => {
            plotData.series[series] = plotData.colDict[plotConfig[series]];
        });
        return plotData;
    },

    onHover: function (evt) {
        // this is a stub for wrapping.
    },

    adjustHoverText: function (d, parts, plotData) {
    },

    plotDataToPlotly: function (plotData) {
        const colorBrewerPaired12 = ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'];
        const viridis = ['#440154', '#482172', '#423d84', '#38578c', '#2d6f8e', '#24858d', '#1e9a89', '#2ab07e', '#51c468', '#86d449', '#c2df22', '#fde724'];
        let colorScale;
        if (plotData.series.c && (plotData.series.c.type === 'number' || !plotData.series.c.distinctcount)) {
            colorScale = window.d3.scale.linear().domain(viridis.map((_, i) => i / (viridis.length - 1) * ((plotData.series.c.max - plotData.series.c.min) || 0) + plotData.series.c.min)).range(viridis);
        }
        const plotlyData = {
            x: plotData.data.map((d) => d[plotData.series.x.index]),
            y: plotData.data.map((d) => d[plotData.series.y.index]),
            hovertext: plotData.data.map((d) => {
                const parts = [];
                ['x', 'y', 'r', 'c', 's'].forEach((series) => {
                    if (plotData.series[series] && d[plotData.series[series].index] !== undefined) {
                        parts.push(`${plotData.series[series].title}: ${d[plotData.series[series].index]}`);
                    }
                });
                this.adjustHoverText(d, parts, plotData);
                return '<span class="hui-plotly-hover" style="font-size: 9px">' + parts.join('<br>') + '</span>';
            }),
            hoverinfo: 'text',
            marker: {
                symbol: plotData.series.s && plotData.series.s.distinct ? plotData.data.map((d) => plotData.series.s.distinct.indexOf(d[plotData.series.s.index])) : 0,
                size: plotData.series.r && (plotData.series.r.type === 'number' || plotData.series.r.distinctcount)
                    ? (
                        plotData.series.r.type === 'number'
                            ? plotData.data.map((d) => (d[plotData.series.r.index] - plotData.series.r.min) / (plotData.series.r.max - plotData.series.r.min) * 10 + 5)
                            : plotData.data.map((d) => plotData.series.r.distinct.indexOf(d[plotData.series.r.index]) / plotData.series.r.distinctcount * 10 + 5)
                    )
                    : 10,
                color: plotData.series.c
                    ? (
                        !plotData.series.c.distinctcount
                            ? plotData.data.map((d) => colorScale(d[plotData.series.c.index]))
                            : plotData.data.map((d) => colorBrewerPaired12[plotData.series.c.distinct.indexOf(d[plotData.series.c.index])] || '#000000')
                    )
                    : '#000000',
                opacity: 0.5
            },
            type: plotData.data.length > 100 ? 'scattergl' : 'scatter',
            mode: 'markers'
        };
        if (plotData.format === 'violin') {
            plotlyData.type = 'violin';
            plotlyData.x = plotlyData.marker.symbol;
            plotlyData.box = {visible: true};
            plotlyData.meanline = {visible: true};
            plotlyData.yaxis = {zeroline: false};
            plotlyData.scalemode = 'width';
            plotlyData.width = 0.9;
            // plotlyData.points = 'outliers';
            plotlyData.points = 'all';
            plotlyData.pointpos = 0;
            plotlyData.jitter = 0;
            // plotlyData.side = 'positive';
            if (plotData.series.c && plotData.series.c.distinct) {
                plotlyData.transforms = [{
                    type: 'groupby',
                    groups: plotlyData.x,
                    styles: Object.keys(plotData.series.c.distinct).map((k, kidx) => ({target: kidx, value: {line: {color: colorBrewerPaired12[kidx]}}}))
                }];
            }
        }
        return [plotlyData];
    },

    render: function () {
        if (this.item && this.item.id) {
            const plotOptions = this.getPlotOptions();
            if (plotOptions.filter((v) => v.type === 'number' && v.count).length < 2) {
                this.$el.html('');
                return;
            }
            let root = '/static/built';
            try {
                root = __webpack_public_path__ || root; // eslint-disable-line
            } catch (err) { }
            root = root.replace(/\/$/, '');
            this.fetchPlottableData();
            $.when(
                this.plottableDataPromise,
                !window.Plotly
                    ? $.ajax({ // like $.getScript, but allow caching
                        url: root + '/plugins/histomicsui/extra/plotly.js' + (BUILD_TIMESTAMP ? '?_=' + BUILD_TIMESTAMP : ''),
                        dataType: 'script',
                        cache: true
                    })
                    : null
            ).done(() => {
                const plotData = this.getPlotData(this.plotConfig);
                this.lastPlotData = plotData;
                this.$el.html(metadataPlotTemplate({}));
                const elem = this.$el.find('.h-metadata-plot-area');
                if (!plotData || !plotData.series.x || !plotData.series.y || plotData.data.length < 2) {
                    elem.html('');
                    return;
                }
                const maximized = this.$el.closest('.h-panel-maximized').length > 0;
                const plotOptions = {
                    margin: {t: 0, l: 40, r: 0, b: 20},
                    hovermode: 'closest'
                };
                if (maximized) {
                    plotOptions.margin.l += 20;
                    plotOptions.margin.b += 40;
                    plotOptions.xaxis = {title: {text: plotData.format !== 'violin' ? `${plotData.series.x.title}` : `${plotData.series.s.title}`}};
                    plotOptions.yaxis = {title: {text: `${plotData.series.y.title}`}};
                }
                window.Plotly.newPlot(elem[0], this.plotDataToPlotly(plotData), plotOptions);
                elem[0].on('plotly_hover', (evt) => this.onHover(evt));
            });
        }
        return this;
    }
});

export default MetadataPlot;
