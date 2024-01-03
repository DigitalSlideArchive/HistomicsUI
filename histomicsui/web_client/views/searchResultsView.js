import $ from 'jquery';

import {wrap} from '@girder/core/utilities/PluginUtils';
import {restRequest} from '@girder/core/rest';
import SearchResultsView from '@girder/core/views/body/SearchResultsView';

import '../stylesheets/views/searchResultsView.styl';

function addResourcePaths(v) {
    if (!v._results || !v._results.length) {
        return;
    }
    const payload = {};
    payload[v._type] = v._results.map((r) => r._id);
    const resources = JSON.stringify(payload);
    restRequest({
        type: 'POST',
        contentType: 'application/json',
        processData: false,
        url: 'resource/paths',
        error: null,
        data: resources
    }).done((resp) => {
        const payload = {};
        payload[v._type] = v._results.map((r) => r._id);
        if (resources !== JSON.stringify(payload)) {
            return;
        }
        v._results.forEach((doc, idx) => {
            $(v.$el.find('.g-search-result')[idx]).append($('<span class="g-hui-search-result-resource-path">').text(resp[v._type][doc._id]));
        });
    });
}

wrap(SearchResultsView, 'render', function (render) {
    render.call(this);
    this._request.done(() => {
        Object.values(this._subviews).forEach((v) => {
            v._origrender = v.render;
            v.render = function () {
                v._origrender();
                addResourcePaths(v);
                return v;
            };
            addResourcePaths(v);
        });
    });
});
