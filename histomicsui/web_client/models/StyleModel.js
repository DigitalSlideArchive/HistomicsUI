const StyleModel = girder.Backbone.Model.extend({
    defaults: {
        lineWidth: 2,
        lineColor: 'rgb(0,0,0)',
        fillColor: 'rgba(0,0,0,0)'
    }
});

export default StyleModel;
