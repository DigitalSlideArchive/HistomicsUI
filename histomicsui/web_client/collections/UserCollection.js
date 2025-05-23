const $ = girder.$;
const UserCollection = girder.collections.UserCollection;
const {getCurrentUser} = girder.auth;

const origCollFetch = UserCollection.prototype.fetch;
UserCollection.prototype.fetch = function fetch(params, reset) {
    if (!getCurrentUser()) {
        return $.Deferred().resolve([]).then([]);
    }
    return origCollFetch.call(this, params, reset);
};

export default UserCollection;
