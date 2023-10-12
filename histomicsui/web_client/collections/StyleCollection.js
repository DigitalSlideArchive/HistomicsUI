import Backbone from 'backbone';
import {LocalStorage} from 'backbone.localstorage';

import StyleModel from '../models/StyleModel';

let localStorage;
try {
    localStorage = new LocalStorage('histomicsui.draw.style');
} catch (e) {
}

const StyleCollection = Backbone.Collection.extend({
    model: StyleModel,
    localStorage: localStorage
});

export default StyleCollection;
