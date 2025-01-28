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
        // if not a multi frame image, don't show (this means we can't do
        // band-only work on hyperspectral data, so we may want to change this
        // to also expose it if there are listed bands and there are more
        // than 3 of them).  Maybe instead we should just keep the frame
        // selector collapsed.
        if (!this._tiles || !this._tiles.frames || this._tiles.frames.length <= 1 || !this.viewer) {
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
