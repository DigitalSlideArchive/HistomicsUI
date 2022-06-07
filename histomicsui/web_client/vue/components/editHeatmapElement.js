import tinycolor from 'tinycolor2';
import _ from 'underscore';
export default {
    props: ['element'],
    data() {
        return {
            type: null,
            interpretation: null,
            radius: null,
            normalizeRange: null,
            colorRange: null,
            colorObjects: null,
            rangeValues: null,
            minColor: null,
            maxColor: null,
            stepped: null,
            scaleWithZoom: null,
            validationErrors: []
        };
    },
    computed: {
        headerMessage() {
            if (this.type === 'heatmap') {
                return 'Edit Heatmap Element';
            }
            return 'Edit Grid Data Element';
        }
    },
    methods: {
        getColorString(color) {
            return tinycolor(color).toRgbString();
        },
        addColor(index) {
            const defaultColor = 'rgba(0, 0, 0, 0)';
            this.colorObjects.splice(index + 1, 0, tinycolor(defaultColor).toRgb());
            this.rangeValues.splice(index + 1, 0, 0);
            this.colorRange.splice(index + 1, 0, defaultColor);
        },
        removeColor(index) {
            this.rangeValues.splice(index, 1);
            this.colorRange.splice(index, 1);
            this.colorObjects.splice(index, 1);
        },
        cancelClicked() {
            this.$root.$el.parentNode.removeChild(this.$el);
        },
        submitClicked() {
            this.validationErrors = [];
            this.tryValidateForm();
            if (this.validationErrors.length === 0) {
                this.saveElement();
                this.$refs.close.click();
            }
        },
        tryValidateForm() {
            if (this.normalizeRange) {
                // check values
                const invalidRangeValues = this.rangeValues.filter(
                    (value) => value < 0 || value > 1).map(
                    (value, index) => index + 1
                );
                if (invalidRangeValues.length) {
                    this.validationErrors.push(
                        'Invalid value(s) in row(s) ' + invalidRangeValues.join(', ') + '. When "Normalize Range" is checked, values must be between 0 and 1'
                    );
                }
            }
            const invalidColorRows = this.colorObjects.filter(
                (color) => !tinycolor(color).isValid()).map(
                (color, index) => index
            );
            if (invalidColorRows.length) {
                this.validationErrors.push(
                    'Invalid color(s) in row(s) ' + invalidColorRows.join(', ')
                );
            }
        },
        saveElement() {
            const propsToSave = {
                rangeValues: this.rangeValues,
                colorRange: this.colorObjects.map((colorObj) => tinycolor(colorObj).toRgbString()),
                normalizeRange: this.normalizeRange
            };
            if (this.type === 'heatmap') {
                propsToSave['radius'] = this.radius;
                propsToSave['scaleWithZoom'] = this.scaleWithZoom;
            } else {
                // griddata
                propsToSave['minColor'] = tinycolor(this.minColor).toRgbString();
                propsToSave['maxColor'] = tinycolor(this.maxColor).toRgbString();
                if (this.interpretation === 'contour' || this.interpretation === 'chloropleth') {
                    propsToSave['stepped'] = this.stepped;
                }
            }
            this.element.set(propsToSave);
        }
    },
    watch: {
    },
    mounted() {
        this.type = this.element.get('type');
        this.interpretation = this.element.get('interpretation') || null;
        this.radius = this.element.get('radius');
        this.normalizeRange = this.element.get('normalizeRange');
        this.colorRange = _.clone(this.element.get('colorRange'));
        if (this.colorRange) {
            this.colorObjects = this.colorRange.map((color) => tinycolor(color).toRgb());
        }
        this.minColor = tinycolor(this.element.get('minColor') || 'rgba(0, 0, 0, 0)').toRgb();
        this.maxColor = tinycolor(this.element.get('maxColor') || 'rgba(0, 0, 0, 0)').toRgb();
        this.rangeValues = _.clone(this.element.get('rangeValues'));
        this.scaleWithZoom = this.element.get('scaleWithZoom') || false;
        this.stepped = this.element.get('stepped') || false;
    },
    template: `
        <div class="modal-dialog">
            <div class="modal-content">
                <form class="modal-form">
                    <div class="modal-header">
                        <button type="button" class="close" data-dismiss="modal" aria-label="Close" ref="close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                        <h4>{{ headerMessage }}</h4>
                    </div>
                    <div class="modal-body">
                        <div class="errors" v-if="validationErrors.length > 0">
                            <p>Errors</p>
                            <ul>
                                <li v-for="error in this.validationErrors">{{ error }}</li>
                            </ul>
                        </div>
                        <div class="form-group" v-if="this.radius" ref="uniquekey">
                            <label for="h-griddata-radius">Radius</label>
                            <input id="h-griddata-radius" class="input-sm form-control" type="number" min="1" v-model="this.radius">
                        </div>
                        <div class="form-group" v-if="this.colorRange && this.rangeValues">
                            <label for="h-griddata-range">Range Colors</label>
                            <table id="h-griddata-range" class="table table-bordered table-condensed">
                                <thead>
                                    <tr>
                                        <th>Value</th>
                                        <th>R</th>
                                        <th>G</th>
                                        <th>B</th>
                                        <th>A</th>
                                        <th>Color</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                <tr v-if="this.type === 'griddata'">
                                    <td>
                                        Min. color
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="minColor.r">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="minColor.g">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="minColor.b">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="1" step=".01" v-model="minColor.a">
                                    </td>
                                    <td>
                                        <span>
                                            <i :style="{ 'background-color': getColorString(this.minColor), height: '25px', width: '25px', display: 'block' }">
                                            </i>
                                        </span>
                                    </td>
                                </tr>
                                <tr v-for="(value, index) in rangeValues">
                                    <td>
                                        <input class="input-sm form-control" type="number" step="0.1" v-model="this.rangeValues[index]">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="this.colorObjects[index].r">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="this.colorObjects[index].g">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="this.colorObjects[index].b">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="1" step=".01" v-model="this.colorObjects[index].a">
                                    </td>
                                    <td>
                                        <span>
                                            <i :style="{ 'background-color': getColorString(this.colorObjects[index]), height: '25px', width: '25px', display: 'block' }">
                                            </i>
                                        </span>
                                    </td>
                                    <td>
                                        <a @click.prevent="addColor(index)">
                                            <span class="icon-plus" title="Add row below"></span>
                                        </a>
                                        <a @click.prevent="removeColor(index)">
                                            <span class="icon-minus" title="Remove this row"></span>
                                        </a>
                                    </td>
                                </tr>
                                <tr v-if="this.type === 'griddata'">
                                    <td>
                                        Max. color
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="maxColor.r">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="maxColor.g">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="maxColor.b">
                                    </td>
                                    <td>
                                        <input class="input-sm form-control" type="number" min="0" max="1" step=".01" v-model="maxColor.a">
                                    </td>
                                    <td>
                                        <span>
                                            <i :style="{ 'background-color': getColorString(this.maxColor), height: '25px', width: '25px', display: 'block' }">
                                            </i>
                                        </span>
                                    </td>
                                </tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="checkbox">
                            <label><input type="checkbox" v-model="this.normalizeRange"> <b>Normalize Range</b></label>
                        </div>
                        <div v-if="this.type === 'heatmap'" class="checkbox">
                            <label><input type="checkbox" v-model="this.scaleWithZoom"> <b>Scale With Zoom</b></label>
                        </div>
                        <div v-if="this.interpretation === 'contour' || this.interpretation === 'chloropleth'" class="checkbox">
                            <label><input type="checkbox" v-model="this.stepped"> <b>Stepped</b></label>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-default" data-dismiss="modal" ref="close" id="close">
                            Cancel
                        </button>
                        <button type="button" class="btn btn-primary" @click.prevent="submitClicked()">
                            Submit
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `
};
