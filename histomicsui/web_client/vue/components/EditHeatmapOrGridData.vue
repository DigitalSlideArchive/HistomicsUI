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
        addColor(index) {
            const newEntry = {
                r: 0,
                g: 0,
                b: 0,
                a: 0,
                colorString: 'rgba(0, 0, 0, 0)',
                value: 0
            }
            this.colorRangeData.splice(index + 1, 0, newEntry);
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
                                    <th></th>
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
