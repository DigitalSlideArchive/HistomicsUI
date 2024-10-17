import metadataPlotDialog from '../templates/dialogs/metadataPlot.pug';
import '../stylesheets/dialogs/metadataPlot.styl';

const View = girder.views.View;
const $ = girder.$;
const girderModal = girder.utilities.girderModal;

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
            folder: this.$('#h-plot-folder').is(':checked'),
            format: this.$('#h-plot-format').val()
        };
        ['x', 'y', 'r', 'c', 's'].forEach((series) => {
            const val = this.$('#h-plot-series-' + series).val();
            if (val !== '_none_' && val !== undefined) {
                configOptions[series] = val;
            }
        });
        ['u'].forEach((series) => {
            const opts = this.$('#h-plot-series-' + series + ' option');
            const val = opts.filter((idx, o) => o.selected).map((idx, o) => $(o).val()).get();
            configOptions[series] = val.length ? val : undefined;
        });
        this.result = configOptions;
        this.$el.modal('hide');
    }
});

export default MetadataPlotDialog;
