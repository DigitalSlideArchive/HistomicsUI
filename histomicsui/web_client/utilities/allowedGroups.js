import _ from 'underscore';

/**
 * Read and validate the `allowed_groups` metadata on an annotation.
 *
 * The value is expected to live at `annotation.get('annotation').attributes.allowed_groups`
 * and be an array of strings. Any other value (missing, not an array, empty array, etc.) is
 * treated as "unrestricted" and returns `null`.
 *
 * @param {AnnotationModel} annotation The annotation to check.
 * @returns {string[]|null} The list of allowed group names, or null if there are no restrictions.
 */
function getAllowedGroups(annotation) {
    if (!annotation) return null;

    const attributes = (annotation.get('annotation') || {}).attributes || {};
    const allowedGroups = attributes.allowed_groups;

    if (!_.isArray(allowedGroups)) return null;

    const filtered = _.uniq(allowedGroups.filter((group) => _.isString(group) && group.length));
    return filtered.length ? filtered : null;
}

export default getAllowedGroups;
