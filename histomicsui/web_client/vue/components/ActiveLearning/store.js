// If a store becomes desirable, start with these pieces of data:
// 1. selectedIndex: controls which card is highlighted in the film strip, and calculate map bounds on change
// 2. superpixelsToTrain: sorted list of superpixels

import Vue from 'vue';

export default Vue.observable({
    selectedIndex: 0,
    apiRoot: ''
});
