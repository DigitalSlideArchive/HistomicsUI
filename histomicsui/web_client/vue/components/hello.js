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
  watch: {
    radius(newRadius, oldRadius) {
    }
  },
  mounted() {
    this.radius = this.element.get('radius');
    this.normalizeRange = this.element.get('normalizeRange');
    this.colorRange = this.element.get('colorRange');
    // if (this.colorRange) {
      // this.colorObjects = this.colorRange.map((color) => tinycolor(color).toRgb());
    // }
    this.rangeValues = this.element.get('rangeValues');
    // console.log(this.colorObjects);
  },
  // look into using pug for this
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
              <input class="input-sm form-control" type="number" min="0" max="255" step="1">
            </td>
            <td>
              <input class="input-sm form-control" type="number" min="0" max="255" step="1">
            </td>
            <td>
              <input class="input-sm form-control" type="number" min="0" max="255" step="1">
            </td>
            <td>
              <input class="input-sm form-control" type="number" min="0" max="255" step="1" value="this.colorRange[inxex]">
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="checkbox">
      <label><input type="checkbox" v-model="this.normalizeRange"> <b>Normalize Range</b></label>
    </div>
  `,

};
