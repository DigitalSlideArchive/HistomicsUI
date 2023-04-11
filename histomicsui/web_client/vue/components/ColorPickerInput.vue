<script>
import {Chrome} from 'vue-color';
import tinycolor from 'tinycolor2';

export default {
    components: {
        'chrome-picker': Chrome
    },
    props: ['color'],
    data() {
        return {
            pickerColor: this.color,
            colorValue: this.color,
            displayPicker: false
        };
    },
    watch: {
        colorValue(val) {
            if (val) {
                this.updatePickerColor(val);
                this.$emit('input', val);
            }
        }
    },
    mounted() {
        this.setColor(this.color || '#000000');
    },
    methods: {
        setColor(color) {
            this.updatePickerColor(color);
            this.colorValue = color;
        },
        updatePickerColor(color) {
            this.pickerColor = color;
        },
        showPicker() {
            document.addEventListener('click', this.documentClick);
            this.displayPicker = true;
        },
        hidePicker() {
            document.removeEventListener('click', this.documentClick);
            this.displayPicker = false;
        },
        togglePicker() {
            this.displayPicker ? this.hidePicker() : this.showPicker();
        },
        updateFromInput() {
            this.updatePickerColor(this.colorValue);
        },
        updateFromPicker(color) {
            this.colorValue = tinycolor(color.rgba).toString();
        },
        documentClick(e) {
            const picker = this.$refs.colorpicker;
            if (picker && picker !== e.target && !picker.contains(e.target)) {
                this.hidePicker();
            }
        }
    }
};
</script>

<template>
  <div
    ref="colorpicker"
    class="input-group color-picker"
  >
    <input
      v-model="colorValue"
      type="text"
      class="form-control"
      @focus="showPicker"
      @input="updateFromInput"
    >
    <span
      v-if="colorValue"
      class="input-group-addon color-picker-container"
    >
      <span
        class="current-color"
        :style="{ 'background-color': colorValue }"
        @click="togglePicker"
      >
        <i :style="{ 'background-color': colorValue }" />
      </span>
      <chrome-picker
        v-if="displayPicker"
        ref="colorPicker"
        class="picker-offset"
        :value="pickerColor"
        @input="updateFromPicker"
      />
    </span>
  </div>
</template>

<style scoped>
.current-color {
    display: inline-block;
    width: 16px;
    height: 16px;
    background-color: #000;
    cursor: pointer;
}

.vc-chrome {
    position: absolute;
    right: 0;
    z-index: 100;
}

.picker-offset {
    right: 45px;
    bottom: -100px;
}

</style>
