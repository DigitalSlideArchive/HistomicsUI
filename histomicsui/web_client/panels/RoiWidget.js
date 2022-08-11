import _ from 'underscore';
import Panel from '@girder/slicer_cli_web/views/Panel';
import roiWidget from '../templates/panels/roiWidget.pug';
import '../stylesheets/panels/roiWidget.styl';

function generateTestDataForExpandedView(numPatches) {
    const xStart = 10000;
    const yStart = 10000;
    const radius = 64;
    const patches = [];
    for(let i = 0; i < numPatches; i++) {
        const patch = {
            x: xStart + (100 * i),
            y: yStart + (100 * i),
            radius: radius,
            machineLabel: Math.floor(Math.random() * 2) + 1,
            confidence: Math.random().toFixed(2),
            humanLabel: null,
            id: i
        }
        patches.push(patch);
    }
    return patches.sort((a, b) => a.confidence - b.confidence);
}

const categories = [{
        id: 1,
        label: 'positive'
    }, {
        id: 2,
        label: 'negative'
}];

var RoiWidget = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .h-roi-img-container': 'centerOnRoi',
        'click .h-roi-buttons button': '_updateActiveRois',
        'click .h-panel-maximize': function (event) {
            this.expand();
            this.$('.s-panel-content').addClass('in');
            let panelElem = !panelElem.hasClass('h-panel-maximized');
            let maximize = !panelElem.hasClass('h-panel-maximized');
            panelElem.toggleClass('h-panel-maximized', maximize);
            panelElem.toggleClass('s-no-panel-toggle', maximize);
            this.expanded = !this.expanded;
        },
        'click .h-roi-next': 'nextPage',
        'click .h-roi-previous': 'previousPage',
        'click button.h-roi-reset-button': 'resetAgreeSelection',
        'change .h-roi-agree-disagree': 'handleAgreeChange'
    }),

    initialize(settings = {}) {
        this._rois = generateTestDataForExpandedView(50);
        this._epoch = settings.trainingEpoch;
        this._categories = categories;
        this._page = 0;
        this._patchesPerPage = 18;
        this._firstRoi = 0;
        this.expanded = false;
    },

    render() {
        this._updateExpandedFlag();
        this.$el.html(roiWidget({
            id: 'roi-panel-container',
            expanded: this.expanded,
            rois: this._rois,
            categories: this._categories,
            epoch: this._epoch,
            page: this._page,
            patchesPerPage: this._patchesPerPage,
            indices: this.getCurrentIndices(),
        }));
        this._enableNextPrevButtons();
        this._updateMessage();
        return this;
    },

    setViewer(viewer) {
        this.parentViewer = viewer;
        return this;
    },

    getCurrentIndices() {
        const lower = this._page * this._patchesPerPage;
        const upper = Math.min(this._rois.length, lower + this._patchesPerPage);
        return Array(upper - lower).fill().map((_, index) => index + lower);
    },

    centerOnRoi(event) {
        const val = this.$(event.currentTarget).data('value');
        const roi = this._rois[this._firstRoi + val];
        if (!roi || !roi.radius || !roi.x || !roi.y) {
            return;
        }
        const map = this.parentViewer.viewer;
        const mapSize = map.size();
        const scaleX = Math.abs((2 * roi.radius) / mapSize.width);
        const scaleY = Math.abs((2 * roi.radius) / mapSize.height);
        const zoom = map.zoom() - Math.log2(Math.max(scaleX, scaleY));
        map.zoom(zoom);
        map.center({ x: roi.x, y: roi.y });
    },

    _updateActiveRois(event) {
        const val = this.$(event.currentTarget).data('value');
        if (val === 'prev') {
            this._firstRoi = Math.max(0, this._firstRoi - 3);
        } else if (val === 'next') {
            this._firstRoi = Math.min(this._rois.length - 3, this._firstRoi + 3);
        }
        this._enableNextPrevButtons();
        this._updateMessage();
    },

    _enableNextPrevButtons() {
        const nextButton = this.$('.h-next-rois').first();
        const prevButton = this.$('.h-prev-rois').first();
        prevButton.removeClass('disabled');
        nextButton.removeClass('disabled');
        if (this._rois.length < 4) {
            nextButton.addClass('disabled');
            prevButton.addClass('disabled');
        } else if (this._firstRoi === 0) {
            prevButton.addClass('disabled');
        } else if (this._firstRoi === this._rois.length - 3 || this._rois.length < 4) {
            nextButton.addClass('disabled');
        }
    },

    _updateMessage() {
        let message = '';
        if (this._rois.length > 3) {
            message = `Showing ${this._firstRoi + 1}-${this._firstRoi + 3} of ${this._rois.length}`;
        }
        this.$('.roi-count').first().text(message);
    },

    _updateExpandedFlag() {
        const container = $('#h-roi-panel').first();
        const classes = container.attr('class').split(/\s+/);
        this.expanded = classes.includes('h-panel-maximized');
    },

    nextPage() {
        let maxPages = this._rois.length / this._patchesPerPage;
        if (this._page < maxPages) {
            this._page++;
            this.render();
        }
    },

    previousPage() {
        if (this._page > 0) {
            this._page--;
            this.render();
        }
    },

    _updateRoi(roi, agree) {
        roi['agree'] = agree;
        if (agree === true) {
            roi.humanLabel = roi.machineLabel;
        } else if (agree === false) {
            if (this._categories.length === 2) {
                roi.humanLabel = this._categories.filter(
                    (category) => category.id !== roi.machineLabel
                )[0].id;
            }
        }
    },

    _resetRoi(roi) {
        delete roi.agree;
        roi.humanLabel = null;
    },

    handleAgreeChange(event) {
        const target = $(event.target)
        const data = target.data();
        const updatedRoi = this._rois[data.id];
        this._updateRoi(updatedRoi, data.agree === 'agree');
        const container = target.closest('.roi-image-control-options').first();
        const labelDropdown = container.children('.roi-new-category').first();
        if (data.agree !== 'agree') {
            labelDropdown.removeClass('no-disp');
        } else {
            labelDropdown.addClass('no-disp');
        }
        if (this._categories.length < 3) {
            const dropdownControl = labelDropdown.children('.roi-class').first();
            dropdownControl.prop('disabled', true);
        }
        const resetButton = container.parent().find('.h-roi-reset-button').first();
        resetButton.removeClass('no-disp');
    },

    resetAgreeSelection(event) {
        const target = $(event.currentTarget);
        const data = target.data();
        this._resetRoi(this._rois[data.id]);
        const container = target.closest('.roi-image-control-options').first();
        const radioButtons = container.find('.h-roi-agree-radio');
        _.forEach(radioButtons, (radioButton) => {
            radioButton.checked = false;
        });
        target.addClass('no-disp');
        const labelDropdown = container.children('.roi-new-category').first();
        labelDropdown.addClass('no-disp');
    },
});

export default RoiWidget;
