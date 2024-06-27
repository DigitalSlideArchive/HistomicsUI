import StyleModel from '../models/StyleModel';

const Backbone = girder.Backbone;

const StyleCollection = Backbone.Collection.extend({
    model: StyleModel,
    // TODO use an alternate method to persist this and read it from localStorage
    // localStorage: localStorage
});

export default StyleCollection;
