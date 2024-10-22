/* global BUILD_TIMESTAMP */

import $ from 'jquery';
import _ from 'underscore';
import {v4 as uuidv4} from 'uuid';

import {restRequest} from '@girder/core/rest';

import Panel from '@girder/slicer_cli_web/views/Panel';
// import events from '@girder/core/events';

import MetadataPlotDialog from '../dialogs/metadataPlot';
import metadataPlotTemplate from '../templates/panels/metadataPlot.pug';
import '../stylesheets/panels/metadataPlot.styl';

const sessionId = uuidv4();

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
                this.listenTo(this.parentView, 'h:selectedElementsByRegion', this.onElementSelect);
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
            this.plottableListLoading = false;
        }
        this.plottableData = null;
        if (this.plottableDataPromise) {
            this.plottableDataPromise.abort();
            this.plottableDataPromise = null;
            this.plottableDataLoading = false;
        }
        const hasPlot = (this.getPlotOptions().filter((v) => v.type === 'number' && v.count).length >= 2);

        // redo this when annotations are turned on or off
        this.$el.addClass('loading');
        this.plottableListLoading = true;
        this.plottableListPromise = restRequest({
            url: `annotation/item/${this.item.id}/plot/list`,
            method: 'POST',
            error: null,
            data: {
                annotations: JSON.stringify(this._currentAnnotations),
                uuid: sessionId
            }
        }).done((result) => {
            this.plottableList = result;
            this.plottableListLoading = false;
            this.$el.toggleClass('loading', !!(this.plottableListLoading || this.plottableDataLoading));
            const plotOptions = this.getPlotOptions();
            if (plotOptions.filter((v) => v.type === 'number' && v.count).length >= 2) {
                if (!hasPlot) {
                    this.render();
                }
            }
        }).fail((result) => {
            this.plottableListLoading = false;
            this.$el.toggleClass('loading', !!(this.plottableListLoading || this.plottableDataLoading));
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
        let requiredKeys = [];
        ['x', 'y'].forEach((k) => {
            if (this.plotConfig[k] !== undefined) {
                requiredKeys.push(this.plotConfig[k]);
            }
        });
        keys = keys.concat(['item.name', 'item.id', 'bbox.x0', 'bbox.y0', 'bbox.x1', 'bbox.y1']);
        if (this._currentAnnotations && this._currentAnnotations.length > 1) {
            keys = keys.concat(['annotation.name']);
        }
        if (this._currentAnnotations && this._currentAnnotations.length >= 1) {
            keys = keys.concat(['annotation.id', 'annotationelement.id']);
        }
        let anyCompute = false;
        if (this.plotConfig.u) {
            ['x', 'y', 'r', 'c', 's'].forEach((k) => {
                anyCompute = anyCompute || !!(this.plotConfig[k] !== undefined && this.plotConfig[k].startsWith('compute.'));
                if (this.plotConfig[k] !== undefined && this.plotConfig[k].startsWith('compute.') && !keys.includes(this.plotConfig[k])) {
                    keys.push(this.plotConfig[k]);
                }
                if (this.plotConfig[k] !== undefined && this.plotConfig[k].startsWith('compute.') && !requiredKeys.includes(this.plotConfig[k])) {
                    requiredKeys.push(this.plotConfig[k]);
                }
            });
            if (anyCompute) {
                keys = keys.concat(this.plotConfig.u);
                requiredKeys = requiredKeys.concat(this.plotConfig.u);
            }
        }
        const params = {
            adjacentItems: !!this.plotConfig.folder,
            keys: keys.join(','),
            requiredKeys: requiredKeys.join(','),
            annotations: JSON.stringify(this._currentAnnotations),
            uuid: sessionId
        };
        if (this.plotConfig.u && this.plotConfig.u.length >= 3 && anyCompute) {
            params.compute = JSON.stringify({columns: this.plotConfig.u});
        }
        if (!_.isEqual(this._lastPlottableDataParams, params) || !this.plottableDataPromise) {
            this.$el.addClass('loading');
            this.plottableDataLoading = true;
            this.plottableDataPromise = restRequest({
                url: `annotation/item/${this.item.id}/plot/data`,
                method: 'POST',
                error: null,
                data: params
            });
            this._lastPlottableDataParams = params;
        }
        this.plottableDataPromise.done((result) => {
            this.plottableData = result;
            this.plottableDataLoading = false;
            this.$el.toggleClass('loading', !!(this.plottableListLoading || this.plottableDataLoading));
        }).fail(() => {
            this.plottableDataLoading = false;
            this.$el.toggleClass('loading', !!(this.plottableListLoading || this.plottableDataLoading));
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
            format: plotConfig.format || 'scatter',
            adjacentItems: !!plotConfig.folder
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
        if (!evt || !evt.points || evt.points.length < 1 || evt.points[0].pointIndex === undefined || !$('svg g.hoverlayer').length) {
            return;
        }
        const idx = evt.points[0].pointIndex;
        const image = this.lastPlotData.data[idx].image;
        if (!image) {
            return;
        }
        const maxw = 100, maxh = 100;
        const imgw = Math.min(Math.ceil(image.right - image.left) * 2, maxw);
        const imgh = Math.min(Math.ceil(image.bottom - image.top) * 2, maxh);
        if (!imgw || !imgh) {
            return;
        }
        const regionUrl = `api/v1/item/${image.id}/tiles/region?width=${imgw}&height=${imgh}&left=${image.left}&top=${image.top}&right=${image.right}&bottom=${image.bottom}`;
        let x = parseFloat($('svg g.hoverlayer g.hovertext text[x]').attr('x'));
        let y = parseFloat($('svg g.hoverlayer g.hovertext text[y]').attr('y'));
        x = x === 0 ? -maxw / 2 + (maxw - imgw) / 2 : x < 0 ? x - maxw + (maxw - imgw) : x;
        const d = $('svg g.hoverlayer g.hovertext path[d]').attr('d');
        if (d && (d.split('L6,').length >= 2 || d.split('L-6,').length >= 2)) {
            const y2 = parseFloat(d.split('v')[2]);
            y += Math.abs(y2) - maxh - 13 + (maxh - imgh) / 2;
        } else if (d && d.split('v').length === 2) {
            const y2 = parseFloat(d.split('v')[1]);
            y += Math.abs(y2) - maxh - 13 + (maxh - imgh) / 2;
        } else {
            y = -3;
        }
        $('svg g.hoverlayer g.hovertext image.hoverthumbnail').remove();
        $('svg g.hoverlayer g.hovertext').html($('svg g.hoverlayer g.hovertext').html() + `<image class="hoverthumbnail" href="${regionUrl}" x="${x}px" y="${y}px" width="${imgw}px" height="${imgh}px"/>`);
    },

    adjustHoverText: function (d, parts, plotData) {
    },

    onSelect: function (evt, plotData) {
        if (this._elementSelect) {
            this._elementSelect -= 1;
            if (this._afterSelect && !this._elementSelect) {
                this._afterSelect();
                this._afterSelect = null;
            }
            return;
        }
        if (plotData.colDict['annotation.id'] === undefined || plotData.colDict['annotationelement.id'] === undefined) {
            return;
        }
        // evt is undefined when the selection is cleared
        if (evt === undefined) {
            this.parentView._resetSelection();
            return;
        }
        // evt.points is an array with data, fullData, pointNumber, and pointIndex
        const annots = {};
        const elements = [];
        evt.points.forEach((pt) => {
            const row = plotData.data[pt.pointIndex];
            const annotid = row[plotData.colDict['annotation.id'].index];
            const elid = row[plotData.colDict['annotationelement.id'].index];
            if (annotid === undefined || elid === undefined) {
                return;
            }
            if (annots[annotid] === undefined) {
                annots[annotid] = this.parentView.annotationSelector.collection.get(annotid) || null;
            }
            if (annots[annotid] === null || !annots[annotid]._elements || !annots[annotid]._elements._byId || !annots[annotid]._elements._byId[elid]) {
                return;
            }
            elements.push(annots[annotid]._elements._byId[elid]);
        });
        if (!elements.length) {
            return;
        }
        this.parentView._resetSelection();
        elements.forEach((element, idx) => {
            this.parentView._selectElement(element, {silent: idx !== elements.length - 1});
        });
    },

    onElementSelect: function (elements) {
        if (!this.lastPlotData || !this.lastPlotData.colDict['annotationelement.id'] || !elements.models) {
            return;
        }
        const ids = {};
        elements.models.forEach((el) => {
            ids[el.id] = true;
        });
        const colidx = this.lastPlotData.colDict['annotationelement.id'].index;
        const points = this.lastPlotData.data.map((row, idx) => ids[row[colidx]] ? idx : null).filter((idx) => idx !== null);
        if (!points.length) {
            return;
        }
        /* Deselect any selection on plotly.  There is no exposed function to
         * do this, so we synthesize several actions: (a) switch to box select
         * mode, (b) double click on the plot, (c) ignore the first selection
         * event (first click), (d) on the second selection event, the plot no
         * longer has a selection, so we can specify the selected points (in
         * the _afterSelect callback), (e) switch back to whatever tool the
         * user had selected on the plot. */
        this._elementSelect = 2;
        const curactive = this._plotlyNode.find('.modebar-btn.active');
        this._afterSelect = () => {
            window.Plotly.restyle(this._plotlyNode[0], {selectedpoints: [points]});
            if (curactive.length) {
                curactive[0].dispatchEvent(new MouseEvent('click'));
            }
        };
        const plot = this._plotlyNode.find('.drag').first()[0];
        for (let i = 0; i <= 2; i += 1) {
            this._plotlyNode.find('.modebar-btn[data-val="select"]')[0].dispatchEvent(new MouseEvent('click'));
            plot.dispatchEvent(new MouseEvent('mousedown', {bubbles: true, cancelable: true, view: window, clientX: 10, clientY: 10}));
            plot.dispatchEvent(new MouseEvent('mouseup', {bubbles: true, cancelable: true, view: window, clientX: 10, clientY: 10}));
        }
    },

    _formatNumber: function (val, significant) {
        if (isNaN(parseFloat(val))) {
            return val;
        }
        if (!significant || significant < 1) {
            significant = 3;
        }
        let digits = Math.min(significant, Math.max(0, significant - Math.floor(Math.log10(Math.abs(val)))));
        if (parseFloat(val) === parseInt(val, 10)) {
            digits = 0;
        }
        return val.toFixed(digits);
    },

    _hoverText: function (d, plotData) {
        const used = {};
        let parts = [];
        let key = 'item.name';
        if (plotData.adjacentItems && plotData.colDict[key] && d[plotData.colDict[key].index] !== undefined && plotData.colDict[key].distinctcount !== 1) {
            used[key] = true;
            parts.push(plotData.colDict[key]);
        }
        key = 'annotation.name';
        if (plotData.colDict[key] && d[plotData.colDict[key].index] !== undefined) {
            used[key] = true;
            parts.push(plotData.colDict[key]);
        }
        ['x', 'y', 'r', 'c', 's'].forEach((series) => {
            if (plotData.series[series] && d[plotData.series[series].index] !== undefined && used[plotData.series[series].key] === undefined) {
                used[plotData.series[series].key] = true;
                parts.push(plotData.series[series]);
            }
        });
        const maximized = this.$el.closest('.h-panel-maximized').length > 0;
        const maxtotallen = 50;
        const maxlen = 32;
        parts = parts.map((col) => {
            let title = '' + col.title;
            let val = d[col.index];
            if (val === undefined || val === null) {
                val = '';
            } else if (col.type === 'number') {
                val = this._formatNumber(val);
            } else {
                val = '' + val;
            }
            const result = title + ': ' + val;
            if (maximized || result.length <= maxtotallen) {
                return result;
            }
            if (val.length > maxlen + 3) {
                val = val.substring(0, maxlen).replace(/\.+$/, '') + '...';
            }
            if (title.length + val.length + 2 > maxtotallen + 3) {
                title = title.substring(0, maxtotallen - val.length - 2).replace(/\.+$/, '') + '...';
            }
            return title + ': ' + val;
        });

        const imageDict = {
            id: 'item.id',
            left: 'bbox.x0',
            top: 'bbox.y0',
            right: 'bbox.x1',
            bottom: 'bbox.y1'
        };
        if (Object.values(imageDict).every((v) => plotData.colDict[v] && d[plotData.colDict[v].index] !== undefined)) {
            d.image = {};
            Object.entries(imageDict).forEach(([k, v]) => {
                d.image[k] = d[plotData.colDict[v].index];
            });
            /* Plotly adds hovertext rows in its own way, so add several rows
             * that are blank and of some width that we can dynamically
             * replace. */
            for (let i = 0; i < 8; i += 1) {
                parts.push('<span class="hui-plotly-hover-thumbnail">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
            }
        }
        this.adjustHoverText(d, parts, plotData);
        return '<span class="hui-plotly-hover">' + parts.join('<br>') + '</span>';
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
            hovertext: plotData.data.map((d) => this._hoverText(d, plotData)),
            hoverinfo: 'text',
            hoverlabel: {
                font: {size: 10}
            },
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
            plotlyData.spanmode = 'hard';
            plotlyData.showlegend = false;
            plotlyData.width = 0.9;
            // plotlyData.points = 'outliers';
            plotlyData.points = 'all';
            plotlyData.pointpos = 0;
            plotlyData.jitter = 0;
            // plotlyData.side = 'positive';
            if (plotData.series.c && plotData.series.c.distinct && plotData.series.s && plotData.series.s.distinct) {
                plotlyData.transforms = [{
                    type: 'groupby',
                    groups: plotlyData.x,
                    styles: Object.keys(plotData.series.s.distinct).map((k, kidx) => {
                        k = plotData.series.s.distinct[kidx];
                        for (let didx = 0; didx < plotData.data.length; didx += 1) {
                            if (plotData.data[didx][plotData.series.s.index] === k) {
                                const cval = plotData.data[didx][plotData.series.c.index];
                                const cidx = plotData.series.c.distinct.indexOf(cval);
                                return {target: kidx, value: {line: {color: colorBrewerPaired12[cidx]}}};
                            }
                        }
                        return {target: kidx, value: {line: {color: '#000000'}}};
                    })
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
                this._plotlyNode = elem;
                window.Plotly.newPlot(elem[0], this.plotDataToPlotly(plotData), plotOptions);
                elem[0].on('plotly_hover', (evt) => this.onHover(evt));
                elem[0].on('plotly_selected', (evt) => this.onSelect(evt, plotData));
            });
        }
        return this;
    }
});

export default MetadataPlot;
