import $ from 'jquery';

import UserCollection from '@girder/core/collections/UserCollection';
import {getCurrentUser} from '@girder/core/auth';

const origCollFetch = UserCollection.prototype.fetch;
UserCollection.prototype.fetch = function fetch(params, reset) {
    if (!getCurrentUser()) {
        return $.Deferred().resolve([]).then([]);
    }
    return origCollFetch.call(this, params, reset);
};
