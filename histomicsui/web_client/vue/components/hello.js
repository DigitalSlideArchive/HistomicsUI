import tinycolor from 'tinycolor2';
export default {
    props: ['element'],
    data() {
        return {
            radius: null,
            normalizeRange: null,
            colorRange: null,
            colorObjects: null,
            rangeValues: null,
            minColor: null,
            maxColor: null
        };
    },
    methods: {
        getColorString(color) {
            return tinycolor(color).toRgbString();
        },
        addColor(index) {
            const defaultColor = 'rgba(0, 0, 0, 0)';
            this.rangeValues.splice(index + 1, 0, 0);
            this.colorRange.splice(index + 1, 0, defaultColor);
            this.colorObjects.splice(index + 1, 0, tinycolor(defaultColor).toRgb());
        },
        removeColor(index) {
            console.log(index);
            this.rangeValues.splice(index, 1);
            this.colorRange.splice(index, 1);
            this.colorObjects.splice(index, 1);
        }
    },
    watch: {
    },
    mounted() {
        this.radius = this.element.get('radius');
        this.normalizeRange = this.element.get('normalizeRange');
        this.colorRange = this.element.get('colorRange');
        if (this.colorRange) {
            this.colorObjects = this.colorRange.map((color) => tinycolor(color).toRgb());
        }
        this.minColor = tinycolor(this.element.get('minColor') || 'rgba(0, 0, 0, 0)').toRgb();
        this.maxColor = tinycolor(this.element.get('maxColor') || 'rgba(0, 0, 0, 0)').toRgb();
        this.rangeValues = this.element.get('rangeValues');
    },
    template: `
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
                <tr>
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
                <tr>
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
    `
};
