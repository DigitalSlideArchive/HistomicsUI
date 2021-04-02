import View from '@girder/core/views/View';

import metadataPlotDialog from '../templates/dialogs/metadataPlot.pug';
import '@girder/core/utilities/jquery/girderModal';

const MetadataPlotDialog = View.extend({
    events: {
        'click .h-submit': '_submit'
    },

    initialize(settings) {
        this.plotConfig = settings.plotConfig;
        this.plotOptions = settings.plotOptions;
    },

    render() {
        this.$el.html(
            metadataPlotDialog({
                plotConfig: this.plotConfig,
                plotOptions: this.plotOptions
            })
        ).girderModal(this);
        return this;
    },

    _submit(evt) {
        evt.preventDefault();
        const configOptions = {
            folder: this.$('#h-plot-folder').is(':checked')
        };
        ['x', 'y', 'r', 'c', 's'].forEach((series) => {
            let val = this.$('#h-plot-series-' + series).val();
            if (val !== '_none_' && val !== undefined) {
                configOptions[series] = val;
            }
        });
        this.result = configOptions;
        this.$el.modal('hide');
    }
});

export default MetadataPlotDialog;
