import _ from 'underscore';
import Panel from '@girder/slicer_cli_web/views/Panel';
import roiWidget from '../templates/panels/roiWidget.pug';
import '../stylesheets/panels/roiWidget.styl';

var RoiWidget = Panel.extend({
    events: _.extend(Panel.prototype.events, {
        'click .h-roi-img-container': 'centerOnRoi',
        'click .h-roi-buttons button': '_updateActiveRois',
    }),

    initialize(settings = {}) {
        this._rois = settings.rois || [];
        this._firstRoi = 0;
    },

    render() {
        this.$el.html(roiWidget({
            id: 'roi-panel-container'
        }));
        this._enableNextPrevButtons();
        this._updateMessage();
        return this;
    },

    setViewer(viewer) {
        this.parentViewer = viewer;
        return this;
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
    }

});

export default RoiWidget;
