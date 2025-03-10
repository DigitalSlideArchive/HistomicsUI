import _ from 'underscore';
import Backbone from 'backbone';

const AllowedKeys = ['fillColor', 'lineColor', 'lineWidth', 'label', 'group', 'id'];

const StyleModel = Backbone.Model.extend({
    defaults: {
        lineWidth: 2,
        lineColor: 'rgb(0,0,0)',
        fillColor: 'rgba(0,0,0,0)'
    },
    initialize: function (attributes, options) {
        if (attributes) {
            attributes = Object.assign({}, attributes);
            Object.keys(attributes).forEach((k) => {
                if (!AllowedKeys.includes(k)) {
                    delete attributes[k];
                }
            });
        }
        Backbone.Model.prototype.initialize.call(this, attributes, options);
    },
    set: function (key, value, options) {
        if (_.isObject(key) && !_.isFunction(key)) {
            key = Object.assign({}, key);
            Object.keys(key).forEach((k) => {
                if (!AllowedKeys.includes(k)) {
                    delete key[k];
                }
            });
            Backbone.Model.prototype.set.call(this, key, value, options);
        } else if (AllowedKeys.includes(key)) {
            Backbone.Model.prototype.set.call(this, key, value, options);
        }
    }
});

export default StyleModel;
