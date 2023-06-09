import _ from 'underscore';

import Panel from '@girder/slicer_cli_web/views/Panel';
import FrameSelector from '@girder/large_image/vue/components/FrameSelector.vue';

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
        const vm = new FrameSelector({
            el,
            propsData: {
                itemId: this._itemId,
                imageMetadata: this._tiles,
                frameUpdate: (frame, style) => {
                    this.viewer.frameUpdate(frame, style);
                }
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
