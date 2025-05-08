import $ from 'jquery';
import 'select2';
import 'select2/dist/css/select2.css';

import View from '@girder/core/views/View';

import metadataPlotDialog from '../templates/dialogs/metadataPlot.pug';
import '@girder/core/utilities/jquery/girderModal';
import '../stylesheets/dialogs/metadataPlot.styl';

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
        // this adds search functionality to the select boxes, but not to the
        // multiple select, since the select2 tool breaks some traditional
        // aspects of multiple select
        this.$('.h-plot-select').not('[multiple]').select2({
            dropdownParent: $('.modal-body'),
            width: '100%'
        });

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
