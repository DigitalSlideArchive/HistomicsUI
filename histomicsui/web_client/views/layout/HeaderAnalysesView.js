// Importing the bootstrap-submenu jQuery plugin immediately
// runs an IIFE, which modifies the global jQuery (i.e. require('jquery')).
// We'd prefer to only use girder.$ as the jquery instance in this view, but
// in order to use the jquery plugin, we have to bring in an additional instance.
// Ideally, this is a temporary measure. This is documented in Github.
// See: https://github.com/DigitalSlideArchive/HistomicsUI/issues/454
import $ from 'jquery';

import events from '../../events';
import router from '../../router';
import View from '../View';
import headerAnalysesTemplate from '../../templates/layout/headerAnalyses.pug';
import '../../stylesheets/layout/headerAnalyses.styl';

import 'bootstrap-submenu/dist/js/bootstrap-submenu'; // eslint-disable-line
import 'bootstrap-submenu/dist/css/bootstrap-submenu.css'; // eslint-disable-line

const _ = girder._;
const _$ = girder.$;
const {restRequest} = girder.rest;

var HeaderUserView = View.extend({
    events: {
        'click .h-analysis-item': '_setAnalysis'
    },
    initialize() {
        this.image = null;
        this.listenTo(events, 'h:imageOpened', function (image) {
            this.image = image;
            this.render();
        });
    },
    render() {
        if (this.image) {
            restRequest({
                url: 'slicer_cli_web/docker_image'
            }).then((analyses) => {
                const maxRows = Math.max(5, Math.floor(((_$('.h-image-view-body').height() || 0) - 8) / 26));
                if (_.keys(analyses || {}).length > 0) {
                    this.$el.removeClass('hidden');
                    this.$el.html(headerAnalysesTemplate({
                        analyses: analyses || {},
                        maxRows: maxRows
                    }));
                    $('.h-analyses-dropdown-link').submenupicker();
                    // Restore the "fully collapse" functionality
                    $('.h-analyses-dropdown-link').on('click', function () {
                        $('.dropdown-submenu').each(function () {
                            $(this).removeClass('open');
                        });
                    });
                } else {
                    this.$el.addClass('hidden');
                }
                return null;
            });
        } else {
            this.$el.addClass('hidden');
        }
        return this;
    },
    _setAnalysis(evt) {
        evt.preventDefault();
        var target = $(evt.currentTarget).data();
        $('.dropdown-submenu').each(function () {
            $(this).removeClass('open');
        });

        router.setQuery('analysis', target.api, {trigger: true});
    }
});

export default HeaderUserView;
