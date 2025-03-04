import events from '../../events';
import router from '../../router';
import View from '../View';
import headerAnalysesTemplate from '../../templates/layout/headerAnalyses.pug';
import '../../stylesheets/layout/headerAnalyses.styl';

// Importing the bootstrap-submenu jQuery plugin immediately
// runs an IIFE, which modifies the global jQuery (i.e. window.jQuery).
// We can temporarily point window.jQuery to girder.$, so we add the
// plugin to the instance of jQuery stored on the girder global.
const windowJQuery = window.jQuery;
window.jQuery = girder.$;

import 'bootstrap-submenu/dist/js/bootstrap-submenu'; // eslint-disable-line
import 'bootstrap-submenu/dist/css/bootstrap-submenu.css'; // eslint-disable-line

if (typeof girder.$.fn.submenupicker === 'function') {
    window.jQuery = windowJQuery;
}

const $ = girder.$;
const _ = girder._;
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
                const maxRows = Math.max(5, Math.floor((($('.h-image-view-body').height() || 0) - 8) / 26));
                if (_.keys(analyses || {}).length > 0) {
                    this.$el.removeClass('hidden');
                    this.$el.html(headerAnalysesTemplate({
                        analyses: analyses || {},
                        maxRows: maxRows
                    }));
                    $('.h-analyses-dropdown-link').submenupicker();
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

        router.setQuery('analysis', target.api, {trigger: true});
    }
});

export default HeaderUserView;
