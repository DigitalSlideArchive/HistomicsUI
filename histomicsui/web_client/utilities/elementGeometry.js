/* globals geo */
import convertRectangle from '@girder/large_image_annotation/annotations/geometry/rectangle';

/**
 * Check if a point is inside an ellipse or circle element.
 *
 * @param {object} element An ellipse or circle element.
 * @param {object} pt A point with `x` and `y`.
 * @returns {boolean}
 */
function insideEllipse(element, pt) {
    const dx = pt.x - element.center[0];
    const dy = pt.y - element.center[1];
    if (element.type === 'circle') {
        return dx * dx + dy * dy <= element.radius * element.radius;
    }
    const cos = Math.cos(element.rotation || 0);
    const sin = Math.sin(element.rotation || 0);
    const u = (dx * cos + dy * sin) / (element.width / 2);
    const v = (dy * cos - dx * sin) / (element.height / 2);
    return u * u + v * v <= 1;
}

/**
 * Check if an element's area contains a polygon.
 *
 * @param {object} element An annotation element.
 * @param {object} poly A polygon with `outer` and `inner` lists of `{x, y}`.
 * @returns {boolean}
 */
export function elementContainsPolygon(element, poly) {
    let rings;
    switch (element.type) {
        case 'circle':
        case 'ellipse':
            // these are convex, so they contain the polygon if they contain
            // its vertices
            return poly.outer.every((pt) => insideEllipse(element, pt));
        case 'rectangle':
            rings = convertRectangle(element).coordinates;
            break;
        case 'polyline':
            if (!element.closed) {
                return false;
            }
            rings = [element.points].concat(element.holes || []);
            break;
        default:
            return false;
    }
    rings = rings.map((ring) => ring.map((pt) => [pt[0], pt[1]]));
    const outside = geo.util.polyops.difference(
        poly, {outer: rings[0], inner: rings.slice(1)}, {style: 'flat-listlist'});
    return !outside.some((p) => p.length);
}

/**
 * Get the area of an element, ignoring holes.
 *
 * @param {object} element A circle, ellipse, rectangle, or closed polyline
 *      element.
 * @returns {number}
 */
export function elementArea(element) {
    switch (element.type) {
        case 'circle':
            return Math.PI * element.radius * element.radius;
        case 'ellipse':
            return Math.PI * element.width * element.height / 4;
        case 'rectangle':
            return element.width * element.height;
    }
    const pts = element.points;
    let sum = 0;
    pts.forEach((pt, idx) => {
        const next = pts[(idx + 1) % pts.length];
        sum += pt[0] * next[1] - next[0] * pt[1];
    });
    return Math.abs(sum) / 2;
}
