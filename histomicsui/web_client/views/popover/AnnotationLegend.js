import View from '../View';

import annotationLegend from '../../templates/popover/annotationLegend.pug';
import '../../stylesheets/popover/annotationLegend.styl';

/**
 * The largest border width used for a legend swatch, so that wide lines do
 * not completely fill the sample.
 */
const MAX_SWATCH_BORDER = 6;

/**
 * Check if a legend entry is a continuous color range rather than a single
 * color sample.
 *
 * @param {object} entry A legend entry.
 * @returns {boolean} true if the entry's fillColor is a list of colors.
 */
function isRange(entry) {
    return Array.isArray(entry.fillColor);
}

/**
 * Compute the inline style used for a legend entry's color sample or color
 * range.
 *
 * @param {object} entry A legend entry with optional fillColor, lineColor,
 *      and lineWidth values.  If fillColor is a list, a gradient is used.
 * @returns {object} A dictionary of css properties.
 */
function swatchStyle(entry) {
    const style = {};
    if (isRange(entry)) {
        style.background = `linear-gradient(to right, ${entry.fillColor.join(', ')})`;
    } else if (entry.fillColor) {
        style.background = entry.fillColor;
    }
    if (entry.lineColor && entry.lineWidth !== 0) {
        style['border-color'] = entry.lineColor;
        style['border-width'] = Math.min(
            entry.lineWidth === undefined ? 2 : entry.lineWidth, MAX_SWATCH_BORDER) + 'px';
    }
    return style;
}

/**
 * Get the labels to show along a color range with their positions.
 *
 * @param {object} entry A legend entry whose fillColor is a list of colors.
 * @returns {object[]} A list of objects with `text` and `style` values for
 *      each non-empty label.
 */
function rangeLabels(entry) {
    const labels = [];
    const last = entry.fillColor.length - 1;
    (entry.labels || []).slice(0, last + 1).forEach((text, idx) => {
        if (!text) {
            return;
        }
        let style;
        if (idx === 0) {
            style = {left: 0};
        } else if (idx === last) {
            style = {right: 0};
        } else {
            style = {left: `${idx * 100 / last}%`, transform: 'translateX(-50%)'};
        }
        labels.push({text, style});
    });
    return labels;
}

/**
 * Show a floating legend over the image for every displayed annotation that
 * has a `legend` in its annotation document.
 *
 * @param {object} settings
 * @param {AnnotationCollection} settings.collection
 *     The collection representing the annotations attached to the current
 *     image.
 */
const AnnotationLegend = View.extend({
    events: {
        'click .h-annotation-legend-header': 'toggleCollapsed'
    },

    initialize(settings = {}) {
        this._collapsed = false;
        this.listenTo(
            this.collection,
            'change:displayed change:annotation remove reset sync',
            this.render);
    },

    /**
     * Get the displayed annotations that have a non-empty legend.
     *
     * @returns {AnnotationModel[]}
     */
    legendAnnotations() {
        return this.collection.filter((annotation) => {
            const legend = (annotation.get('annotation') || {}).legend;
            return annotation.get('displayed') && legend && legend.length;
        });
    },

    render() {
        const annotations = this.legendAnnotations();
        if (!annotations.length) {
            this.$el.addClass('hidden').empty();
            return this;
        }
        this.$el.removeClass('hidden').html(annotationLegend({
            annotations,
            collapsed: this._collapsed,
            isRange,
            rangeLabels,
            swatchStyle
        }));
        return this;
    },

    toggleCollapsed() {
        this._collapsed = !this._collapsed;
        this.render();
    }
});

export default AnnotationLegend;
