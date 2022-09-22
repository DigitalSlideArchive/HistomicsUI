export function getOverlayRelativeScale(overlay) {
    const transformInfo = overlay.transform || {};
    const matrix = transformInfo.matrix || [[1, 0], [0, 1]];
    const s11 = matrix[0][0];
    const s12 = matrix[0][1];
    const s21 = matrix[1][0];
    const s22 = matrix[1][1];

    let scale = Math.sqrt(Math.abs(s11 * s22 - s12 * s21)) || 1;
    return Math.floor(Math.log2(scale));
}

export function getOverlayTransformProjString(overlay) {
    console.log(overlay);
    const transformInfo = overlay.transform || {};
    let xOffset = transformInfo.xoffset || 0;
    let yOffset = transformInfo.yoffset || 0;
    const matrix = transformInfo.matrix || [[1, 0], [0, 1]];
    let s11 = matrix[0][0];
    let s12 = matrix[0][1];
    let s21 = matrix[1][0];
    let s22 = matrix[1][1];
    console.log({ s11, s12, s21, s22 });

    // const scale = 2 ** getOverlayRelativeScale(overlay);
    // if (scale && scale !== 1) {
        // s11 /= scale;
        // s12 /= scale;
        // s21 /= scale;
        // s22 /= scale;
        // xOffset *= scale;
        // yOffset *= scale;
    // }

    let projString = '+proj=longlat +axis=enu';
    if (xOffset !== 0) {
        // negate x offset so positive values specified in the annotation
        // move overlays to the right
        xOffset = -1 * xOffset;
        projString = projString + ` +xoff=${xOffset}`;
    }
    if (yOffset !== 0) {
        projString = projString + ` +yoff=${yOffset}`;
    }
    if (s11 !== 1 || s12 !== 0 || s21 !== 0 || s22 !== 1) {
        // add affine matrix vals to projection string if not identity matrix
        console.log('adding affine stuff');
        projString = projString + ` +s11=${1 / s11} +s12=${s12} +s21=${s21} +s22=${1 / s22}`;
    }
    return projString;
}
