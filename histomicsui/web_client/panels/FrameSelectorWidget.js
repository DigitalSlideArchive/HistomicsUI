import _ from 'underscore';
import Vue from 'vue';

import {restRequest} from '@girder/core/rest';
import Panel from '@girder/slicer_cli_web/views/Panel';
import FrameSelector from '@girder/large_image/widgets/FrameSelector.vue';
import DualInput from '@girder/large_image/widgets/DualInput.vue';
import CompositeLayers from '@girder/large_image/widgets/CompositeLayers.vue';
import HistogramEditor from '@girder/large_image/widgets/HistogramEditor.vue';
import PresetsMenu from '@girder/large_image/vue/components/PresetsMenu.vue';
import colors from '@girder/large_image/widgets/colors.json';

import frameSelectorWidget from '../templates/panels/frameSelectorWidget.pug';
import '../stylesheets/panels/frameSelectorWidget.styl';

var FrameSelectorWidget = Panel.extend({
    render() {
        let hideControls = !this._tiles || !this.viewer;
        // if not a multi frame image, uint8, and an "ordinary" number of
        // bands, don't show. This might hide the controls from images with
        // more than 1 band that aren't LA, RGB, or RGBA.  We probably should
        // also check if there is band interpretation.
        if (!hideControls) {
            const multiFrame = this._tiles.frames && this._tiles.frames.length > 1;
            const highBand = this._tiles.bandCount && this._tiles.bandCount > 4;
            const not8bit = this._tiles.dtype !== 'uint8';
            hideControls = !multiFrame && !highBand && !not8bit;
        }
        if (hideControls) {
            this.$el.html('');
            return this;
        }
        this.$el.html(frameSelectorWidget({
            id: 'frame-selector-panel-container',
            title: 'Frame Selector',
            collapsed: this.$('.s-panel-content.collapse').length && !this.$('.s-panel-content').hasClass('in')
        }));
        const el = this.$('#vue-container').get(0);
        const getFrameHistogram = (params) => {
            params = Object.assign({}, params);
            restRequest({
                type: 'GET',
                url: 'item/' + this._itemId + '/tiles/histogram',
                data: params
            }).then((response) => {
                const frameHistograms = this.vueApp._props.frameHistograms || {};
                frameHistograms[params.frame] = response;
                this.vueApp._props.frameHistograms = Object.assign({}, frameHistograms);
                return undefined;
            });
        };
        CompositeLayers.components = {HistogramEditor};
        FrameSelector.components = {DualInput, CompositeLayers, HistogramEditor, PresetsMenu};
        const Component = Vue.extend(FrameSelector);
        const vm = new Component({
            el,
            propsData: {
                currentFrame: 0,
                itemId: this._itemId,
                imageMetadata: this._tiles,
                frameUpdate: (frame, style) => {
                    this.viewer.frameUpdate(frame, style);
                },
                liConfig: this._liConfig,
                frameHistograms: undefined,
                getFrameHistogram,
                colors
            }
        });
        this.vueApp = vm;
        return this;
    },

    setImage(itemId, tiles) {
        if (!_.isEqual(tiles, this._tiles) || this._itemId !== itemId) {
            this._itemId = itemId;
            this._tiles = tiles;
            this.render();
        }
        return this;
    },

    /**
     * Set the viewer instance.
     */
    setViewer(viewer) {
        this.viewer = viewer;
        return this;
    }
});

export default FrameSelectorWidget;
