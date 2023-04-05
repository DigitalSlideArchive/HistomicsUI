import $ from 'jquery';

import {restRequest} from '@girder/core/rest';
import convert from '@girder/large_image_annotation/annotations/convert';

/* Utility items for HistomicUI views
  In the future more utility classes/functions can be added for export
*/
class HuiSettings {
    constructor() {
        HuiSettings._hui_settings = null;
    }

    static getSettings() {
        if (HuiSettings._hui_settings) {
            if (HuiSettings._hui_settings_result) {
                return HuiSettings._hui_settings_result;
            }
            return HuiSettings._hui_settings;
        } else {
            HuiSettings._hui_settings = restRequest({
                type: 'GET',
                url: 'histomicsui/settings'
            }).then((resp) => {
                HuiSettings._hui_settings = $.Deferred().resolve(resp);
                return resp;
            });
        }
        return HuiSettings._hui_settings;
    }

    static clearSettingsCache() {
        delete HuiSettings._hui_settings;
    }
}

/**
 * Get the area and edge length of an element.
 *
 * @param {object} element An element to analyze
 * @returns {object} An area and edge length; may be undefined.
 */
function elementAreaAndEdgeLength(element) {
    const geojson = convert(element, {}).features[0];
    const geogeom = geojson.geometry;
    let area, edge;
    if (geogeom.type === 'Polygon') {
        area = edge = 0;
        const lens = [];
        for (let j = 0; j < geogeom.coordinates.length; j += 1) {
            for (let i = 0; i < geogeom.coordinates[j].length - 1; i += 1) {
                const v0 = geogeom.coordinates[j][i];
                const v1 = geogeom.coordinates[j][i + 1];
                area += (v1[1] - v0[1]) * (v0[0] + v1[0]) / 2 * (!j ? 1 : -1);
                const len = ((v1[0] - v0[0]) ** 2 + (v1[1] - v0[1]) ** 2) ** 0.5;
                edge += len;
                lens.push(len);
            }
        }
        area = Math.abs(area);
        if ((geojson.properties.annotationType === 'ellipse' || geojson.properties.annotationType === 'circle') && edge) {
            area *= Math.PI / 4;
            const a = lens[0] / 2;
            const b = lens[1] / 2;
            const h = (a - b) ** 2 / (a + b) ** 2;
            // Ramanujan's approximation -- we actually need a series to
            // compute this properly.
            edge = Math.PI * (a + b) * (1 + 3 * h / (10 + (4 - 3 * h) ** 0.5));
        }
    }
    if (geogeom.type === 'LineString') {
        edge = 0;
        for (let i = 0; i < geogeom.coordinates.length - 1; i += 1) {
            const v0 = geogeom.coordinates[i];
            const v1 = geogeom.coordinates[i + 1];
            edge += ((v1[0] - v0[0]) ** 2 + (v1[1] - v0[1]) ** 2) ** 0.5;
        }
    }
    return {area, edge};
}

export {HuiSettings, elementAreaAndEdgeLength};
