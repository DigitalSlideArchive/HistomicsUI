<script>
import tinycolor from 'tinycolor2';
import _ from 'underscore';
export default {
    props: ['elementData'],
    emits: ['submit', 'cancel'],
    data() {
        return {
            type: this.elementData.type,
            interpretation: this.elementData.interpretation,
            radius: this.elementData.radius,
            normalizeRange: this.elementData.normalizeRange,
            colorRange: _.clone(this.elementData.colorRange),
            colorObjects: null,
            colorRangeData: [],
            rangeValues: _.clone(this.elementData.rangeValues),
            minColor: tinycolor(this.elementData.minColor || 'transparent').toRgb(),
            maxColor: tinycolor(this.elementData.maxColor || 'transparent').toRgb(),
            stepped: this.elementData.stepped,
            scaleWithZoom: this.elementData.scaleWithZoom,
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
        updateColorString(index) {
            console.log(this.colorRangeData[index]);
            const entry = this.colorRangeData[index];
            entry.colorString = tinycolor({
                r: entry.r,
                b: entry.b,
                g: entry.g,
                a: entry.a
            }).toRgbString();
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
        submitClicked() {
            this.validationErrors = [];
            this.tryValidateForm();
            if (this.validationErrors.length === 0) {
                this.notifySubmit();
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
            _.each(this.colorObjects, (colorObj, index) => {
                const isValidColor = tinycolor(colorObj).isValid();
                if (!isValidColor) {
                    this.validationErrors.push(
                        `Invaid color for value ${this.rangeValues[index]}`
                    );
                }
            });
        },
        notifySubmit() {
            const propsToSave = {
                rangeValues: this.colorRangeData.map((entry) => entry.value),
                colorRange: this.colorRangeData.map((entry) => tinycolor({
                    r: entry.r,
                    b: entry.b,
                    g: entry.g,
                    a: entry.a
                }).toRgbString()),
                normalizeRange: this.normalizeRange
            };
            if (this.type === 'heatmap') {
                console.log(this.radius);
                propsToSave['radius'] = parseInt(this.radius);
                propsToSave['scaleWithZoom'] = this.scaleWithZoom;
            } else {
                // griddata
                propsToSave['minColor'] = tinycolor(this.minColor).toRgbString();
                propsToSave['maxColor'] = tinycolor(this.maxColor).toRgbString();
                if (this.interpretation === 'contour' || this.interpretation === 'chloropleth') {
                    propsToSave['stepped'] = this.stepped;
                }
            }
            this.$emit('submit', propsToSave);
        },
        cancelDialog() {
            this.$emit('cancel');
        },
        radiusChanged() {
            console.log(this.radius);
        }
    },
    watch: {
    },
    mounted() {
        if (this.colorRange) {
            _.forEach(this.colorRange, (color, index) => {
                const entry = tinycolor(color).toRgb();
                entry['colorString'] = this.getColorString(tinycolor(color).toRgb());
                entry['value'] = this.rangeValues[index];
                this.colorRangeData.push(entry);
            });
            this.colorObjects = this.colorRange.map((color) => tinycolor(color).toRgb());
        }
    }
}
</script>

<template>
    <div class="modal-dialog" v-if="this.colorRangeData">
        <div class="modal-content">
            <form class="modal-form">
                <div class="modal-header">
                    <button type="button" class="close"  @click="cancelDialog()" ref="close">
                        <span>&times;</span>
                    </button>
                    <h4>{{ headerMessage }}</h4>
                </div>
                <div class="modal-body">
                    <div class="errors" v-if="validationErrors.length > 0">
                        <p>Errors</p>
                        <ul>
                            <li v-for="error in this.validationErrors" :key="error">{{ error }}</li>
                        </ul>
                    </div>
                    <div class="form-group" v-if="this.radius" ref="uniquekey">
                        <label for="h-griddata-radius">Radius</label>
                        <input id="h-griddata-radius" class="input-sm form-control" type="number" min="1" v-model="radius" @change.prevent="radiusChanged()">
                    </div>
                    <div class="form-group" v-if="this.colorRangeData.length > 0">
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
                            <tr v-for="(entry, index) in colorRangeData" :key="entry.value">
                                <td>
                                    <input class="input-sm form-control" type="number" step="0.1" v-model="entry.value">
                                </td>
                                <td>
                                    <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="entry.r" @change="updateColorString(index)">
                                </td>
                                <td>
                                    <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="entry.g" @change="updateColorString(index)">
                                </td>
                                <td>
                                    <input class="input-sm form-control" type="number" min="0" max="255" step="1" v-model="entry.b" @change="updateColorString(index)">
                                </td>
                                <td>
                                    <input class="input-sm form-control" type="number" min="0" max="1" step=".01" v-model="entry.a" @change="updateColorString(index)">
                                </td>
                                <td>
                                    <span>
                                        <i :style="{ 'background-color': entry.colorString, height: '25px', width: '25px', display: 'block' }">
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
                        <label><input type="checkbox" v-model="normalizeRange"> <b>Normalize Range</b></label>
                    </div>
                    <div v-if="this.type === 'heatmap'" class="checkbox">
                        <label><input type="checkbox" v-model="scaleWithZoom"> <b>Scale With Zoom</b></label>
                    </div>
                    <div v-if="this.interpretation === 'contour' || this.interpretation === 'chloropleth'" class="checkbox">
                        <label><input type="checkbox" v-model="stepped"> <b>Stepped</b></label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-default" @click.prevent="cancelDialog()" id="close">
                        Cancel
                    </button>
                    <button type="button" class="btn btn-primary" @click.prevent="submitClicked()">
                        Submit
                    </button>
                </div>
            </form>
        </div>
    </div>
</template>
