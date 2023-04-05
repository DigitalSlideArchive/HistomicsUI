import $ from 'jquery';
import 'url-search-params-polyfill';

import View from '@girder/core/views/View';
import {formatSize} from '@girder/core/misc';

import editRegionOfInterest from '../templates/dialogs/editRegionOfInterest.pug';
import '../stylesheets/panels/zoomWidget.styl';

var EditRegionOfInterest = View.extend({
    events: {
        'change .update-form': 'updateform'
    },

    initialize() {
        this._sizeCte = 1000; // Constante to find
        this._format = 'JPEG'; // JPEG is the default format
        this._compressionRatio = 0.35; // JPEG ratio
        this._magnification = 0;
    },

    render() {
        if (this._magnification <= 1) {
            this._magnification = 1;
        } else if (this._magnification >= this.areaElement.maxMag) {
            this._magnification = this.areaElement.maxMag;
        }
        var bounds = this.scaleBounds();
        this.$el.html(
            editRegionOfInterest({
                magnification: this._magnification,
                scaleWidth: bounds.width,
                scaleHeight: bounds.height,
                maxMag: this.areaElement.maxMag,
                numberOfPixel: this.getNumberPixels(),
                fileSize: this.getConvertFileSize()
            })
        ).girderModal(this);
        this.updateform();
        return this;
    },

    /**
     * Convert from zoom level to magnification.
     */
    zoomToMagnification(zoom) {
        return Math.round(parseFloat(this.areaElement.maxMag) *
            Math.pow(2, zoom - parseFloat(this.areaElement.maxZoom)) * 10) / 10;
    },

    /**
     * Convert from magnification to zoom level.
     */
    magnificationToZoom(magnification) {
        return parseFloat(this.areaElement.maxZoom) -
            Math.log2(this.areaElement.maxMag / magnification);
    },

    /**
     * Convert from magnification to zoom level.
     */
    scaleBounds() {
        var zoom = this.magnificationToZoom(this._magnification);
        var factor = Math.pow(2, zoom - this.areaElement.maxZoom);
        var scaleWidth = Math.round(factor * this.areaElement.width);
        var scaleHeight = Math.round(factor * this.areaElement.height);
        return {width: scaleWidth, height: scaleHeight};
    },

    /**
     * Get the number of pixel in the region of interest
     */
    getNumberPixels() {
        var bounds = this.scaleBounds();
        var pixelNumber = bounds.width * bounds.height;
        return pixelNumber;
    },

    /**
     * Get the size of the file before download it for an image in 24b/px (result in Bytes)
     */
    getFileSize() {
        var fileSize = (this.getNumberPixels() * 3 + this._sizeCte) * this._compressionRatio;
        return fileSize;
    },

    /**
     * Get the size of the file in the appropriate unity (Bytes, MB, GB...)
     */
    getConvertFileSize() {
        var bytesNumber = this.getFileSize();
        var convertedSize = formatSize(bytesNumber);
        this.downloadDisable(bytesNumber >= Math.pow(2, 30));
        return convertedSize;
    },

    /**
     * Disable the Download button if SizeFile > 1GB
     */
    downloadDisable(bool) {
        this.$('#h-download-area-link').unbind('click');
        if (bool) {
            this.$('#h-download-area-link').attr('disabled', 'disabled');
            this.$('#h-msgDisable').removeClass('hidden');
            this.$('#h-download-area-link').bind('click', (ev) => ev.preventDefault());
        } else {
            this.$('#h-download-area-link').removeAttr('disabled');
            this.$('#h-msgDisable').addClass('hidden');
            this.$('#h-download-area-link').bind('click', () => { this.$el.girderModal('close'); });
        }
    },

    /**
     * Set the size of the file, bounds, format...
     * And download the image
     */
    updateform(evt) {
        const selectedOption = $('#h-download-image-format option:selected').text();
        switch (selectedOption) {
            case 'PNG':
                this._format = 'PNG';
                this._compressionRatio = 0.7;
                break;
            case 'TIFF':
                this._format = 'TIFF';
                this._compressionRatio = 0.8;
                break;
            case 'JPEG':
            default:
                // JPEG is the default format
                this._format = 'JPEG';
                this._compressionRatio = 0.35;
                break;
        }
        this._magnification = parseFloat($('#h-element-mag').val());
        const bounds = this.scaleBounds();
        this.$('#h-element-width').val(bounds.width);
        this.$('#h-element-height').val(bounds.height);
        this.$('#h-nb-pixel').val(this.getNumberPixels());
        this.$('#h-size-file').val(this.getConvertFileSize());
        this.$('#h-download-area-link').attr('href', this.getUrl());
    },

    /**
     * Get all data from the form and set the attributes of the
     * Region of Interest (triggering a change event)
     * Return the url to download the image
     */
    getUrl() {
        const left = this.areaElement.left;
        const top = this.areaElement.top;
        const right = left + this.areaElement.width;
        const bottom = top + this.areaElement.height;
        const magnification = parseFloat($('#h-element-mag').val());
        const params = {
            regionWidth: this.areaElement.width,
            regionHeight: this.areaElement.height,
            left,
            top,
            right,
            bottom,
            encoding: this._format,
            contentDisposition: 'attachment',
            magnification
        };
        let urlView = this.areaElement.frameAndUrl.url.replace('/zxy/{z}/{x}/{y}', '/region');
        for (const [key, value] of new URLSearchParams(urlView.replace(/[^?]*(\?|$)/, ''))) {
            if (params[key] === undefined) {
                params[key] = value;
            }
        }
        urlView = urlView.replace(/\?.*$/, '') + '?' + $.param(params);
        return urlView;
    }
});

/**
 * Create a singleton instance of this widget that will be rendered
 * when `show` is called.
 */
var dialog = new EditRegionOfInterest({
    parentView: null
});

/**
 * Show the edit dialog box.  Watch for change events on the passed
 * `ElementModel` to respond to user submission of the form.
 *
 * @param {ElementModel} areaElement The element to edit
 * @returns {EditRegionOfInterest} The dialog's view
 */
function show(areaElement) {
    dialog.areaElement = areaElement;
    dialog._magnification = parseFloat(areaElement.magnification);
    dialog.setElement('#g-dialog-container').render();
    return dialog;
}

export default show;
