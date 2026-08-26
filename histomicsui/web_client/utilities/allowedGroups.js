import _ from 'underscore';

/**
 * Read and validate the `allowed_groups` metadata on an annotation.
 *
 * The value is expected to live at `annotation.get('annotation').attributes.allowed_groups`
 * and be an array of strings. As a convenience for the UI metadata editor, a JSON-stringified
 * array (e.g. `'["groupA", "groupB"]'`) is also accepted and parsed. Any other value (missing,
 * not an array or JSON array string, empty array, unparsable string, etc.) is treated as
 * "unrestricted" and returns `null`.
 *
 * @param {AnnotationModel} annotation The annotation to check.
 * @returns {string[]|null} The list of allowed group names, or null if there are no restrictions.
 */
function getAllowedGroups(annotation) {
    if (!annotation) return null;

    const attributes = (annotation.get('annotation') || {}).attributes || {};
    let allowedGroups = attributes.allowed_groups;

    if (_.isString(allowedGroups)) {
        try {
            allowedGroups = JSON.parse(allowedGroups);
        } catch (err) {
            return null;
        }
    }

    if (!_.isArray(allowedGroups)) return null;

    const filtered = _.uniq(allowedGroups.filter((group) => _.isString(group) && group.length));
    return filtered.length ? filtered : null;
}

/**
 * Ensure that every group in an `allowed_groups` restriction exists as a persisted style group.
 * Create any that are missing by copying the style of the default group.
 *
 * Newly created groups are added to the collection synchronously and each is persisted
 * asynchronously. The caller is responsible for reacting to the returned save promises.
 *
 * @param {StyleCollection} styles The style-group collection to populate.
 * @param {string[]|null} allowed The validated `allowed_groups` restriction, or `null` for
 *                                "unrestricted" (in which case nothing is created).
 * @param {string} defaultGroupId The id of the default style group to copy.
 * @returns {Array} The list of save promises for the newly created groups.
 */
function ensureAllowedGroupsExist(styles, allowed, defaultGroupId) {
    if (!allowed) {
        return [];
    }
    const missing = allowed.filter((groupId) => !styles.get(groupId));
    if (!missing.length) {
        return [];
    }
    // we assume the default group always exists; if it somehow does not, new groups are created
    // with no inherited style rather than failing
    const defaultGroup = styles.get(defaultGroupId);
    const baseAttributes = defaultGroup ? _.omit(defaultGroup.toJSON(), 'id', 'group') : {};
    return missing.map((groupId) => {
        styles.add(Object.assign({}, baseAttributes, {id: groupId}));
        return styles.get(groupId).save();
    });
}

export default getAllowedGroups;
export {ensureAllowedGroupsExist};
