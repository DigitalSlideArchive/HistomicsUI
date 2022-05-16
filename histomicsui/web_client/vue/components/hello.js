import tinycolor from 'tinycolor2';
export default {
    props: ['element'],
    data() {
        return {
            radius: null,
            normalizeRange: null,
            colorRange: null,
            colorObjects: null,
            rangeValues: null
        };
    },
    methods: {
        getColorString(colorObject) {
            return tinycolor(colorObject).toRgbString();
        },
        addColor(index) {
            const defaultColor = 'rgba(0, 0, 0, 0)';
            this.rangeValues.splice(index + 1, 0, 0);
            this.colorRange.splice(index + 1, 0, defaultColor);
            this.colorObjects.splice(index + 1, 0, tinycolor(defaultColor).toRgb());
        },
        removeColor(index) {
            console.log(index);
        }
    },
    watch: {
        radius(newRadius, oldRadius) {
        },
        colorObjects(newObjects, oldObjects) {
            console.log({ newObjects, oldObjects });
        }
    },
    mounted() {
        this.radius = this.element.get('radius');
        this.normalizeRange = this.element.get('normalizeRange');
        this.colorRange = this.element.get('colorRange');
        if (this.colorRange) {
            this.colorObjects = this.colorRange.map((color) => tinycolor(color).toRgb());
        }
        this.rangeValues = this.element.get('rangeValues');
        console.log(this.colorObjects);
    },
    template: `
        <div class="form-group" v-if="this.radius" ref="uniquekey">
            <label for="h-griddata-radius">Radius</label>
            <input id="h-griddata-radius" class="input-sm form-control" type="number" min="1" v-model="this.radius">
        </div>
        <div class="form-group" v-if="this.colorRange && this.rangeValues">
            <label for="h-griddata-range">Range Colors</label>
            <table id="h-griddata-range" class="table table-bordered">
                <thead>
                    <tr>
                        <th>Value</th>
                        <th>R</th>
                        <th>G</th>
                        <th>B</th>
                        <th>A</th>
                        <th>Color</th>
                    </tr>
                </thead>
                <tbody>
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
                        <button class="btn btn-default" @click.prevent="addColor(index)">
                            <span class="icon-plus"></span>
                        </button>
                        <button class="btn btn-default" @click.prevent="removeColor(index)">
                            <span class="icon-minus"></span>
                        </button>
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
