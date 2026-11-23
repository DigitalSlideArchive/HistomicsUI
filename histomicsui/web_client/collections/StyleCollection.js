import StyleModel from '../models/StyleModel';
import {LocalStorage} from '../vendor/localStorage/driver';

const Backbone = girder.Backbone;

const StyleCollection = Backbone.Collection.extend({
    model: StyleModel,
    localStorage: new LocalStorage('histomicsui.draw.style')
});

export default StyleCollection;
