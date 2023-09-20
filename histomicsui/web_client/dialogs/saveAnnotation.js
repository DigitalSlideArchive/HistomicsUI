import _ from 'underscore';
import $ from 'jquery';
import tinycolor from 'tinycolor2';

import {AccessType} from '@girder/core/constants';
import {formatDate, DATE_SECOND} from '@girder/core/misc';
import AccessWidget from '@girder/core/views/widgets/AccessWidget';
// import MetadataWidget from '@girder/core/views/widgets/MetadataWidget';
import View from '@girder/core/views/View';

import MetadataWidget from '../panels/MetadataWidget';
import '../stylesheets/dialogs/saveAnnotation.styl';
import saveAnnotation from '../templates/dialogs/saveAnnotation.pug';
import {elementAreaAndEdgeLength} from '../views/utils';

/**
 * Collect styleable properties from user parameters in elements.
 *
 * @param {object} styleableFuncs An object with distinct keys for functions.
 *      Modified.
 * @param {array} elements A list of elements which might contain metadata
 *      properties in the user key.
 * @param {array} [root] A list of keys within objects in an element.
 */
function collectStyleableProps(styleableFuncs, elements, root) {
    const maxCategories = 20;

    const children = {};
    root = root || [];
    let key = 'user';
    for (let j = 0; j < root.length; j += 1) {
        key += '.' + root[j];
    }
    for (let i = 0; i < elements.length; i += 1) {
        let proplist = elements[i].user;
        for (let j = 0; j < root.length; j += 1) {
            if (proplist) {
                proplist = proplist[root[j]];
            }
        }
        if (proplist !== undefined && proplist !== null) {
            if (proplist.substring || (proplist.toFixed && _.isFinite(proplist))) {
                if (styleableFuncs[key] === undefined) {
                    styleableFuncs[key] = {
                        root,
                        key,
                        name: root.map((k) => k.replace('_', ' ')).join(' - '),
                        categoric: !proplist.toFixed
                    };
                    styleableFuncs[key].values = [proplist];
                    if (!styleableFuncs[key].categoric) {
                        styleableFuncs[key].min = styleableFuncs[key].max = +proplist;
                    }
                } else {
                    if (styleableFuncs[key].values.length <= maxCategories) {
                        if (styleableFuncs[key].values.indexOf(proplist) < 0) {
                            if (styleableFuncs[key].values.length >= maxCategories) {
                                styleableFuncs[key].manyValues = true;
                            } else {
                                styleableFuncs[key].values.push(proplist);
                            }
                        }
                    }
                    if (!styleableFuncs[key].categoric) {
                        const val = +proplist;
                        if (val < styleableFuncs[key].min) {
                            styleableFuncs[key].min = val;
                        }
                        if (val > styleableFuncs[key].max) {
                            styleableFuncs[key].max = val;
                        }
                    }
                }
            } else {
                Object.keys(proplist).forEach((subkey) => {
                    children[subkey] = true;
                });
            }
        }
    }
    Object.keys(children).forEach((subkey) => {
        const subroot = root.slice();
        subroot.push(subkey);
        collectStyleableProps(styleableFuncs, elements, subroot);
    });
}

/**
 * Calculate the min/max values for calculated properties.
 *
 * @param {object} styleableFuncs An object with distinct keys for functions.
 *      Modified.
 * @param {array} elements A list of elements which might contain metadata
 *      properties in the user key.
 */
function rangeStyleableProps(styleableFuncs, elements) {
    let needsArea = true;
    Object.entries(styleableFuncs).forEach(([key, func]) => {
        if (['perimeter', 'area', 'length'].indexOf(key) >= 0) {
            needsArea = true;
            return;
        }
        if (!func.calc) {
            return;
        }
        for (let i = 0; i < elements.length; i += 1) {
            const d = elements[i];
            if (d[key] !== undefined) {
                if (func.min === undefined) {
                    func.min = func.max = d[key];
                }
                if (d[key] < func.min) {
                    func.min = d[key];
                }
                if (d[key] > func.max) {
                    func.max = d[key];
                }
            }
        }
    });
    if (needsArea) {
        for (let i = 0; i < elements.length; i += 1) {
            const element = elements[i];
            const {area, edge} = elementAreaAndEdgeLength({el: element});
            if (styleableFuncs.area && area) {
                if (styleableFuncs.area.min === undefined) {
                    styleableFuncs.area.min = styleableFuncs.area.max = area;
                    styleableFuncs.area.values = new Array(elements.length);
                }
                styleableFuncs.area.values[i] = area;
                if (area < styleableFuncs.area.min) {
                    styleableFuncs.area.min = area;
                }
                if (area > styleableFuncs.area.max) {
                    styleableFuncs.area.max = area;
                }
            }
            if (styleableFuncs.length && edge) {
                if (styleableFuncs.length.min === undefined) {
                    styleableFuncs.length.min = styleableFuncs.length.max = edge;
                    styleableFuncs.length.values = new Array(elements.length);
                }
                styleableFuncs.length.values[i] = edge;
                if (edge < styleableFuncs.length.min) {
                    styleableFuncs.length.min = edge;
                }
                if (edge > styleableFuncs.length.max) {
                    styleableFuncs.length.max = edge;
                }
            }
            if (styleableFuncs.perimeter && edge) {
                if (styleableFuncs.perimeter.min === undefined) {
                    styleableFuncs.perimeter.min = styleableFuncs.perimeter.max = edge;
                    styleableFuncs.perimeter.values = new Array(elements.perimeter);
                }
                styleableFuncs.perimeter.values[i] = edge;
                if (edge < styleableFuncs.perimeter.min) {
                    styleableFuncs.perimeter.min = edge;
                }
                if (edge > styleableFuncs.perimeter.max) {
                    styleableFuncs.perimeter.max = edge;
                }
            }
        }
    }
}

/**
 * Given an element and a color function, compute the color needed.
 *
 * @param {elementModel} element The element for which to compute a color
 * @param {number} idx The index in the element collection
 * @param {object} colorParam A functioon record with prepared min, max,
 *      range, minColor, and maxColor values.
 * @param {object} funcInfo Information about the function.  If calc is true,
 *      values is an array of precomputed values.  Otherwise, root is an
 *      attribute path in the element user object.
 * @returns {string} A color string.
 */
function colorFromFunc(element, idx, colorParam, funcInfo) {
    const geo = window.geo;
    let val;
    if (funcInfo.calc) {
        val = funcInfo.values[idx];
    } else {
        val = element.get('user');
        for (let i = 0; i < funcInfo.root.length; i += 1) {
            val = (val || {})[funcInfo.root[i]];
        }
    }
    if (!_.isFinite(val)) {
        return 'rgba(0,0,0,0)';
    }
    val = Math.max(Math.min((val - colorParam.min) / colorParam.range, 1), 0);
    if (colorParam.minColor.a === undefined) {
        colorParam.minColor.a = 1;
    }
    if (colorParam.maxColor.a === undefined) {
        colorParam.maxColor.a = 1;
    }
    const clr = {
        r: val * (colorParam.maxColor.r - colorParam.minColor.r) + colorParam.minColor.r,
        g: val * (colorParam.maxColor.g - colorParam.minColor.g) + colorParam.minColor.g,
        b: val * (colorParam.maxColor.b - colorParam.minColor.b) + colorParam.minColor.b,
        a: val * (colorParam.maxColor.a - colorParam.minColor.a) + colorParam.minColor.a
    };
    return geo.util.convertColorToRGBA(clr);
}

/**
 * Create a modal dialog with fields to edit the properties of
 * an annotation before POSTing it to the server.
 */
var SaveAnnotation = View.extend({
    events: {
        'click .h-access': 'access',
        'click .h-cancel': 'cancel',

        'input #h-annotation-fill-color': 'checkFixedIfPresent',
        'changeColor #h-annotation-colorpicker-fill-color': 'checkFixedIfPresent',
        'change #h-annotation-fill-color-func-list': 'changeFillColorFunc',
        'input #h-annotation-fill-color-min-val': () => $('.h-functional-value #h-annotation-fill-color-min-setval').prop('checked', true),
        'input #h-annotation-fill-color-max-val': () => $('.h-functional-value #h-annotation-fill-color-max-setval').prop('checked', true),

        'input #h-annotation-line-color': 'checkFixedIfPresent',
        'changeColor #h-annotation-colorpicker-line-color': 'checkFixedIfPresent',
        'change #h-annotation-line-color-func-list': 'changeLineColorFunc',
        'input #h-annotation-line-color-min-val': () => $('.h-functional-value #h-annotation-line-color-min-setval').prop('checked', true),
        'input #h-annotation-line-color-max-val': () => $('.h-functional-value #h-annotation-line-color-max-setval').prop('checked', true),

        'submit form': 'save'
    },

    render() {
        // clean up old colorpickers when rerendering
        this.$('.h-colorpicker').colorpicker('destroy');

        let elementTypes = [];
        if (this.annotation.get('annotation').elements) {
            elementTypes = this.annotation.get('annotation').elements
                .map((element) => element.type === 'polyline' ? (element.closed ? 'polygon' : 'line') : element.type)
                .filter((type, index, types) => types.indexOf(type) === index);
        }
        // should be updated when additional shape elements are supported
        const elementTypeProps = {
            point: [],
            polygon: ['perimeter', 'area'],
            line: ['length'],
            rectangle: ['perimeter', 'area', 'width', 'height', 'rotation'],
            arrow: ['length'],
            circle: ['perimeter', 'area', 'radius'],
            ellipse: ['perimeter', 'area', 'width', 'height', 'rotation']
        };
        const annotationHasEditableElements = _.filter(elementTypes, (type) => elementTypeProps[type] !== undefined).length > 0;
        const showStyleEditor = this.annotation.get('annotation').elements && !this.annotation._pageElements && annotationHasEditableElements;

        const defaultStyles = {};

        const styleableFuncs = {};
        if (showStyleEditor) {
            let scale;
            if (this.options.viewer && this.options.viewer._scale) {
                scale = this.options.viewer._scale.scale;
            }
            elementTypes.forEach((type) => {
                (elementTypeProps[type] || []).forEach((key) => {
                    styleableFuncs[key] = {calc: true, key, scale, name: key};
                });
            });
            const elements = this.annotation.get('annotation').elements;
            rangeStyleableProps(styleableFuncs, elements);
            collectStyleableProps(styleableFuncs, elements.filter((d) => d.user));
            const firstElement = elements[0];
            if (elements.every((d) => d.lineWidth === firstElement.lineWidth)) {
                defaultStyles.lineWidth = firstElement.lineWidth;
            }
            if (elements.every((d) => d.lineColor === firstElement.lineColor)) {
                defaultStyles.lineColor = firstElement.lineColor;
            }
            if (elements.every((d) => d.fillColor === firstElement.fillColor)) {
                defaultStyles.fillColor = firstElement.fillColor;
            }
        }
        this._showStyleEditor = showStyleEditor;
        this._styleableFuncs = styleableFuncs;

        let _styleFuncs;
        if (this.annotation.attributes.annotation.attributes) {
            _styleFuncs = this.annotation.attributes.annotation.attributes._styleFuncs;
        }
        if (!_styleFuncs || !_styleFuncs.lineColor || !_styleFuncs.fillColor || !_styleFuncs.lineWidth) {
            _styleFuncs = {lineColor: {}, lineWidth: {}, fillColor: {}};
        }
        this.annotation._styleFuncs = _styleFuncs;

        this.$el.html(
            saveAnnotation({
                title: this.options.title,
                hasAdmin: this.annotation.get('_accessLevel') >= AccessType.ADMIN,
                annotation: this.annotation.toJSON().annotation,
                model: this.annotation,
                formatDate,
                DATE_SECOND,
                showStyleEditor,
                styleableFuncs,
                styleFuncs: this.annotation._styleFuncs,
                defaultStyles
            })
        ).girderModal(this);
        this.$('.h-colorpicker').colorpicker();

        if (this.annotation.id) {
            if (!this.annotation.meta) {
                this.annotation._meta = Object.assign({}, (this.annotation.get('annotation') || {}).attributes || {});
                delete this.annotation._meta._styleFuncs;
            }
            // copy the metadata to a place that is expected for the widget
            if (!this.metadataWidget) {
                this.metadataWidget = new MetadataWidget({
                    item: this.annotation,
                    parentView: this,
                    fieldName: '_meta',
                    accessLevel: this.annotation.get('_accessLevel'),
                    panel: false,
                    noSave: true
                });
            }
            this.metadataWidget.setItem(this.annotation);
            this.metadataWidget.accessLevel = this.annotation.get('_accessLevel');
            this.metadataWidget.setElement(this.$('.hui-annotation-metadata')).render();
        }

        this.$el.find('.modal-dialog').addClass('hui-save-annotation-dialog');
        this._updateFuncValues();
        return this;
    },

    access(evt) {
        evt.preventDefault();
        this.annotation.off('g:accessListSaved');
        new AccessWidget({
            el: $('#g-dialog-container'),
            type: 'annotation',
            hideRecurseOption: true,
            parentView: this,
            model: this.annotation,
            noAccessFlag: true
        }).on('g:accessListSaved', () => {
            this.annotation.fetch();
        });
    },

    cancel(evt) {
        if (this.annotation) {
            delete this.annotation._meta;
            delete this.annotation._styleFuncs;
        }
        evt.preventDefault();
        this.$el.modal('hide');
    },

    changeFillColorFunc() {
        $('.h-functional-value #h-annotation-fill-color-func').prop('checked', true);
        this._updateFuncValues();
    },

    changeLineColorFunc() {
        $('.h-functional-value #h-annotation-line-color-func').prop('checked', true);
        this._updateFuncValues();
    },

    checkFixedIfPresent(evt) {
        const val = $(evt.target).closest('.row').find('input[type="text"]').val();
        if ((val || '').trim().length) {
            $(evt.target).closest('.row').find('input[type="radio"]').prop('checked', true);
        }
    },

    _updateFuncValues() {
        var names = ['fill-color', 'line-color'];
        names.forEach((name) => {
            const curfunc = this.$el.find('#h-annotation-' + name + '-func-list').val();
            let mintext = '';
            let maxtext = '';
            if (this._styleableFuncs[curfunc]) {
                if (!this._styleableFuncs[curfunc].categoric) {
                    mintext = 'Minimum value: ' + this._styleableFuncs[curfunc].min;
                    maxtext = 'Maximum value: ' + this._styleableFuncs[curfunc].max;
                }
            }
            this.$el.find('#h-annotation-' + name + '-min-auto').parent().attr('title', mintext);
            this.$el.find('#h-annotation-' + name + '-min-setval').parent().attr('title', mintext);
            this.$el.find('#h-annotation-' + name + '-max-auto').parent().attr('title', maxtext);
            this.$el.find('#h-annotation-' + name + '-max-setval').parent().attr('title', maxtext);
        });
    },

    _getFunctionalProps(name, key, valueParam, setValue, color) {
        var geo = window.geo;

        const valueFunc = this.annotation._styleFuncs[key];
        valueFunc.useFunc = this.$('#h-annotation-' + name + '-func').prop('checked');
        valueFunc.key = this.$('#h-annotation-' + name + '-func-list').val();
        valueFunc.minColor = tinycolor(this.$('#h-annotation-' + name + '-min').val()).toRgbString();
        valueFunc.minSet = this.$('#h-annotation-' + name + '-min-setval').prop('checked');
        valueFunc.minValue = parseFloat(this.$('#h-annotation-' + name + '-min-val').val());
        valueFunc.minValue = _.isFinite(valueFunc.minValue) ? valueFunc.minValue : undefined;
        valueFunc.maxColor = tinycolor(this.$('#h-annotation-' + name + '-max').val()).toRgbString();
        valueFunc.maxSet = this.$('#h-annotation-' + name + '-max-setval').prop('checked');
        valueFunc.maxValue = parseFloat(this.$('#h-annotation-' + name + '-max-val').val());
        valueFunc.maxValue = _.isFinite(valueFunc.maxValue) ? valueFunc.maxValue : undefined;
        if (valueFunc.useFunc) {
            setValue = 'func';
        }
        valueParam.key = valueFunc.key;
        if (this._styleableFuncs[valueFunc.key]) {
            valueParam.min = valueFunc.minSet && _.isFinite(valueFunc.minValue) ? valueFunc.minValue : this._styleableFuncs[valueFunc.key].min;
            valueParam.max = valueFunc.maxSet && _.isFinite(valueFunc.maxValue) ? valueFunc.maxValue : this._styleableFuncs[valueFunc.key].max;
            valueParam.range = (valueParam.max - valueParam.min) || 1;
            valueParam.minColor = geo.util.convertColor(valueFunc.minColor);
            valueParam.maxColor = geo.util.convertColor(valueFunc.maxColor);
        } else if (setValue === 'func') {
            setValue = false;
        }
        return setValue;
    },

    /**
     * Respond to form submission.  Triggers a `g:save` event on the
     * AnnotationModel.
     */
    save(evt) {
        evt.preventDefault();

        let validation = '';

        if (!this.$('#h-annotation-name').val()) {
            this.$('#h-annotation-name').parent().addClass('has-error');
            validation += 'Please enter a name. ';
        }

        let setFillColor = !!this.$('#h-annotation-fill-color').val();
        let fillColor = tinycolor(this.$('#h-annotation-fill-color').val()).toRgbString();
        let setLineColor = !!this.$('#h-annotation-line-color').val();
        let lineColor = tinycolor(this.$('#h-annotation-line-color').val()).toRgbString();
        const setLineWidth = !!this.$('#h-annotation-line-width').val();
        const lineWidth = parseFloat(this.$('#h-annotation-line-width').val());

        if (setLineWidth && (lineWidth < 0 || !isFinite(lineWidth))) {
            validation += 'Invalid line width. ';
            this.$('#h-annotation-line-width').parent().addClass('has-error');
        }

        const fillColorParam = {};
        const lineColorParam = {};
        if (this._showStyleEditor && Object.keys(this._styleableFuncs || {}).length) {
            // get functional values
            setFillColor = this._getFunctionalProps('fill-color', 'fillColor', fillColorParam, setFillColor, true);
            setLineColor = this._getFunctionalProps('line-color', 'lineColor', lineColorParam, setLineColor, true);
        }

        if (validation) {
            this.$('.g-validation-failed-message').text(validation.trim())
                .removeClass('hidden');
            return;
        }

        // all valid
        if (setFillColor || setLineColor || setLineWidth) {
            this.annotation.elements().each((element, idx) => { /* eslint-disable backbone/no-silent */
                if (setFillColor) {
                    if (setFillColor === 'func') {
                        fillColor = colorFromFunc(element, idx, fillColorParam, this._styleableFuncs[fillColorParam.key]);
                    }
                    element.set('fillColor', fillColor, {silent: true});
                }
                if (setLineColor) {
                    if (setLineColor === 'func') {
                        lineColor = colorFromFunc(element, idx, lineColorParam, this._styleableFuncs[lineColorParam.key]);
                    }
                    element.set('lineColor', lineColor, {silent: true});
                }
                if (setLineWidth) {
                    element.set('lineWidth', lineWidth, {silent: true});
                }
            });
            const annotationData = _.extend({}, this.annotation.get('annotation'));
            annotationData.elements = this.annotation.elements().toJSON();
            this.annotation.set('annotation', annotationData, {silent: true});
        }

        const visible = this.$('#h-annotation-visible').prop('checked');
        const display = this.annotation.get('annotation').display || {};
        if (visible) {
            display.visible = true;
        } else if (display.visible === true) {
            display.visible = false;
        }
        _.extend(this.annotation.get('annotation'), {
            name: this.$('#h-annotation-name').val(),
            description: this.$('#h-annotation-description').val()
        });
        if (display !== {}) {
            this.annotation.get('annotation').display = display;
        }
        this.annotation.attributes.annotation.attributes = Object.assign({}, this.annotation._meta);
        this.annotation.attributes.annotation.attributes._styleFuncs = this.annotation._styleFuncs;
        delete this.annotation._meta;
        delete this.annotation._styleFuncs;
        this.annotation.trigger('change:annotation', this.annotation, {});
        this.trigger('g:submit');
        this.$el.modal('hide');
    },

    destroy() {
        this.$('.h-colorpicker').colorpicker('destroy');
        SaveAnnotation.prototype.destroy.call(this);
    }
});

/**
 * Create a singleton instance of this widget that will be rendered
 * when `show` is called.
 */
var dialog = new SaveAnnotation({
    parentView: null
});

/**
 * Show the save dialog box.  Watch for the `g:submit` event on the
 * view to respond to user submission of the form.
 *
 * @param {AnnotationModel} annotationElement The element to edit
 * @returns {SaveAnnotation} The dialog's view
 */
function show(annotation, options) {
    _.defaults(options, {title: 'Create annotation'});
    delete annotation._meta;
    dialog.annotation = annotation;
    dialog.options = options;
    dialog.setElement('#g-dialog-container').render();
    return dialog;
}

export default show;
