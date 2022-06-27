<script>
import tinycolor from 'tinycolor2';
import _ from 'underscore';
import ColorPickerInput from './ColorPickerInput.vue';
export default {
    props: ['elementData'],
    emits: ['submit', 'cancel'],
    components: {
        ColorPickerInput
    },
    data() {
        return {
            type: this.elementData.type,
            interpretation: this.elementData.interpretation,
            radius: this.elementData.radius,
            normalizeRange: this.elementData.normalizeRange,
            colorRange: _.clone(this.elementData.colorRange),
            colorRangeData: [],
            rangeValues: _.clone(this.elementData.rangeValues),
            minColor: this.elementData.minColor,
            maxColor: this.elementData.maxColor,
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
            return tinycolor(color).toString();
        },
        addNewFirstColor() {
            let newFirstColor;
            if (this.colorRangeData.length > 0) {
                newFirstColor = tinycolor(this.colorRangeData[0].colorString).toRgb();
            } else {
                newFirstColor = tinycolor('rgba(0, 0, 0, 0').toRgb();
            }
            newFirstColor.a = 0;
            const newColorEntry = {
                colorString: tinycolor(newFirstColor).toString(),
                value: 0
            };
            this.colorRangeData.splice(0, 0, newColorEntry);
        },
        addColor(index) {
            const lowerRecord = this.colorRangeData[index];
            const higherRecord = this.colorRangeData[index + 1] || this.colorRangeData[index];
            const lowerColorRgb = tinycolor(lowerRecord.colorString).toRgb();
            const higherColorRgb = tinycolor(higherRecord.colorString).toRgb();
            if (index < this.colorRangeData.length - 1) {
                const newColorString = tinycolor({
                    r: (lowerColorRgb.r + higherColorRgb.r) / 2,
                    g: (lowerColorRgb.g + higherColorRgb.g) / 2,
                    b: (lowerColorRgb.b + higherColorRgb.b) / 2,
                    a: (lowerColorRgb.a + higherColorRgb.a) / 2
                }).toString();
                const newEntry = {
                    colorString: newColorString,
                    value: (lowerRecord.value + higherRecord.value) / 2
                }
                this.colorRangeData.splice(index + 1, 0, newEntry);
            } else {
                const newColor = _.clone(lowerColorRgb);
                newColor.a = 1.0;
                const newEntry = {
                    value: lowerRecord.value < 1 ? 1 : lowerRecord.value,
                    colorString: tinycolor(newColor).toString()
                }
                this.colorRangeData.push(newEntry);
            }
            this.updateRangeDataKeys();
        },
        removeColor(index) {
            this.colorRangeData.splice(index, 1);
            this.updateRangeDataKeys();
        },
        updateRangeDataKeys() {
            _.forEach(this.colorRangeData, (entry, index) => {
                entry.key = `${index}-${entry.colorString}`;
            });
        },
        submitClicked() {
            this.validationErrors = [];
            this.tryValidateForm();
            if (this.validationErrors.length === 0) {
                this.notifySubmit();
            }
        },
        tryValidateForm() {
            const indicesByValue = {};
            _.forEach(this.colorRangeData, (entry, index) => {
                if (!indicesByValue[entry.value]) {
                    indicesByValue[entry.value] = [index];
                } else {
                    indicesByValue[entry.value].push(index);
                }
            });
            _.forEach(Object.keys(indicesByValue), (value) => {
                if (indicesByValue[value].length > 1) {
                    this.validationErrors.push(
                        'Duplicate value in row(s) ' + indicesByValue[value].map((index) => index + 1).join(', ')
                    );
                }
            });
            if (this.type === 'heatmap') {
                const radiusAsFloat = parseFloat(this.radius);
                if (isNaN(radiusAsFloat) || radiusAsFloat <= 0) {
                    this.validationErrors.push('Radius must be a positive number');
                }
            }
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
            _.each(this.colorRangeData, (entry) => {
                const isValidColor = tinycolor(entry.colorString).isValid();
                if (!isValidColor) {
                    this.validationErrors.push(
                        `Invaid color for value ${entry.value}`
                    );
                }
            });
        },
        notifySubmit() {
            this.colorRangeData.sort((entry1, entry2) => entry1.value - entry2.value);
            const propsToSave = {
                rangeValues: this.colorRangeData.map((entry) => parseFloat(entry.value)),
                colorRange: this.colorRangeData.map((entry) => entry.colorString),
                normalizeRange: this.normalizeRange
            };
            if (this.type === 'heatmap') {
                propsToSave['radius'] = parseFloat(this.radius);
                propsToSave['scaleWithZoom'] = this.scaleWithZoom;
            } else {
                // griddata
                propsToSave['minColor'] = tinycolor(this.minColor).toString();
                propsToSave['maxColor'] = tinycolor(this.maxColor).toString();
                if (this.interpretation === 'contour' || this.interpretation === 'chloropleth') {
                    propsToSave['stepped'] = this.stepped;
                }
            }
            this.$emit('submit', propsToSave);
        },
        cancelDialog() {
            this.$emit('cancel');
        }
    },
    mounted() {
        if (this.colorRange) {
            _.forEach(this.colorRange, (color, index) => {
                this.colorRangeData.push({
                    colorString: color,
                    value: this.rangeValues[index]
                });
            });
        }
        if (this.type === 'griddata' && !this.minColor && !this.maxColor) {
            if (this.colorRange.length > 0) {
                this.minColor = this.colorRange[0];
                this.maxColor = this.colorRange[this.colorRange.length - 1];
            } else {
                this.minColor = 'rgba(0, 0, 0, 0)';
                this.maxColor = 'rgba(255, 0, 0, 1)';
            }
        }
        this.updateRangeDataKeys();
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
                    <div class="form-group" v-if="this.type === 'heatmap'">
                        <label for="h-griddata-radius">Radius</label>
                        <input id="h-griddata-radius" class="input-sm form-control" type="number" min="1" v-model="radius">
                    </div>
                    <div class="form-group" v-if="this.colorRangeData.length > 0">
                        <label for="h-griddata-range">Range Colors</label>
                        <table id="h-griddata-range" class="table table-bordered table-condensed">
                            <thead>
                                <tr>
                                    <th>Value</th>
                                    <th>Color</th>
                                    <th>
                                        <a @click.prevent="addNewFirstColor">
                                            <span class="icon-plus" title="Add new first color"></span>
                                        </a>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                            <tr v-if="this.type === 'griddata'">
                                <td title="The color of values below the lowest range value">
                                    Minimum color
                                </td>
                                <td>
                                    <color-picker-input :color="minColor" v-model="minColor"></color-picker-input>
                                </td>
                            </tr>
                            <tr v-for="(entry, index) in colorRangeData" :key="entry.key">
                                <td>
                                    <input class="input-sm form-control" type="number" step="0.1" v-model="entry.value">
                                </td>
                                <td>
                                    <color-picker-input :color="entry.colorString" v-model="entry.colorString"></color-picker-input>
                                </td>
                                <td>
                                    <a @click.prevent="addColor(index)">
                                        <span class="icon-plus" title="Add row below"></span>
                                    </a>
                                    <a v-if="colorRangeData.length > 1" @click.prevent="removeColor(index)">
                                        <span class="icon-minus" title="Remove this row"></span>
                                    </a>
                                </td>
                            </tr>
                            <tr v-if="this.type === 'griddata'">
                                <td title="The color of values above the highest range value">
                                    Maximum color
                                </td>
                                <td>
                                    <color-picker-input :color="maxColor" v-model="maxColor"></color-picker-input>
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
