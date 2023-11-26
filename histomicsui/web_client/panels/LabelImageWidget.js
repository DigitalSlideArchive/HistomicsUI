import _ from 'underscore';

import Panel from '@girder/slicer_cli_web/views/Panel';

import labelImageWidget from '../templates/panels/labelImageWidget.pug';
import '../stylesheets/panels/labelImageWidget.styl';

var LabelImageWidget = Panel.extend({
    render() {
        this.$el.html(labelImageWidget({
            id: 'label-panel-container',
            collapsed: this.$('.s-panel-content.collapse').length && !this.$('.s-panel-content').hasClass('in')
        }));
        window.setTimeout(() => {
            this._createOverview();
        }, 1);
        return this;
    },

    /**
     * Set the viewer instance and set several internal variables used
     * to convert between magnification and zoom level.
     */
    setViewer(viewer) {
        return this;
    },

    setImage(imageId) {
        // show label and/or macro images

        return this;
    },

});

export default LabelImageWidget;
