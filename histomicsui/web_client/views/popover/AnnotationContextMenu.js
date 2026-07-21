import $ from 'jquery';

import StyleCollection from '../../collections/StyleCollection';
import getAllowedGroups from '../../utilities/allowedGroups';
import View from '../View';

import template from '../../templates/popover/annotationContextMenu.pug';
import '../../stylesheets/popover/annotationContextMenu.styl';

const AnnotationContextMenu = View.extend({
    events: {
        'click .h-remove-elements': '_removeElements',
        'click .h-edit-elements': '_editElements',
        'click .h-edit-shape': '_editElements',
        'click .h-set-group': '_setGroup',
        'click .h-remove-group': '_removeGroup'
    },
    initialize(settings) {
        this._cachedGroupCount = {};
        this.styles = new StyleCollection();
        this.styles.fetch().done(() => this.render());
        this.listenTo(this.collection, 'add remove reset', this.render);
        // react immediately if any annotation's metadata is edited
        this.listenTo(this.parentView.annotations, 'change:annotation', this.render);
    },
    render() {
        this.$el.html(template({
            groups: this._getAnnotationGroups(),
            numberSelected: this.collection.length
        }));
        return this;
    },
    refetchStyles() {
        // Prevent race conditions when multiple fetches happen in quick succession.
        const requestId = (this._styleFetchRequestId = (this._styleFetchRequestId || 0) + 1);
        this.styles.fetch({
            success: (collection, resp, options) => {
                if (requestId === this._styleFetchRequestId) {
                    collection.set(resp, options);
                    this.render();
                }
            }
        });
    },
    setGroupCount(groupCount) {
        this._cachedGroupCount = groupCount;
    },
    _removeElements(evt) {
        evt.preventDefault();
        evt.stopPropagation();
        this.collection.each((element) => {
            if (this.parentView.drawWidget && this.parentView.activeAnnotation.id === element.originalAnnotation.id) {
                if (['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(element.attributes.type)) {
                    this.parentView.drawWidget.updateCount(element.attributes.group || this.parentView._defaultGroup, -1);
                } else if (element.attributes.type === 'pixelmap') {
                    this.parentView.drawWidget.countPixelmap(element, -1);
                }
            }
        });
        this.collection.trigger('h:remove');
        this.trigger('h:close');
    },
    _editElements(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        if ($(evt.target).closest('.list-group-item').hasClass('h-edit-shape')) {
            this.trigger('h:editShape', this.collection.at(0));
        } else {
            this.trigger('h:edit', this.collection.at(0));
        }
        this.trigger('h:close');
    },
    _setStyleDefinition(group) {
        const style = this.styles.get({id: group}) || this.styles.get({id: this.parentView._defaultGroup});
        const styleAttrs = Object.assign({}, style ? style.toJSON() : {});
        Object.keys(styleAttrs).forEach((k) => {
            if (!['fillColor', 'lineColor', 'lineWidth', 'label', 'pattern'].includes(k)) {
                delete styleAttrs[k];
            }
        });
        styleAttrs.pattern = styleAttrs.pattern || 'none';
        let refresh = false;
        if (this.parentView.drawWidget) {
            this.parentView.drawWidget._skipRenderHTML = 'skip';
        }
        this.collection.each((element) => {
            if (this.parentView.drawWidget && this.parentView.activeAnnotation.id === element.originalAnnotation.id &&
                    element.attributes.group !== group && ['point', 'polyline', 'rectangle', 'ellipse', 'circle'].includes(element.attributes.type)) {
                this.parentView.drawWidget.updateCount(element.attributes.group || this.parentView._defaultGroup, -1);
                this.parentView.drawWidget.updateCount(group || this.parentView._defaultGroup, 1);
                refresh = true;
            }
            if (group) {
                styleAttrs.group = group;
            } else {
                element.unset('group', {delaySave: true});
            }
            element.set(styleAttrs, {delaySave: true});
        });
        this.collection.trigger('h:save');
        this.trigger('h:close');
        if (this.parentView.drawWidget) {
            delete this.parentView.drawWidget._skipRenderHTML;
        }
        if (this.parentView.drawWidget && refresh) {
            this.parentView.drawWidget.render();
        }
    },
    _getAnnotationGroups() {
        // restrict to the allowed groups of the annotation that owns the selected/right-clicked
        // element, not whichever annotation happens to be active in the Annotations panel
        const referenceElement = this.collection.at(0);
        const referenceAnnotation = (referenceElement && referenceElement.originalAnnotation) || this.parentView.activeAnnotation;
        const allowed = getAllowedGroups(referenceAnnotation);
        let groups = this.styles.map((style) => style.id);
        if (allowed) {
            groups = groups.filter((groupId) => allowed.includes(groupId));
        }
        groups.sort((a, b) => {
            const countA = this._cachedGroupCount[a] || 0;
            const countB = this._cachedGroupCount[b] || 0;
            if (countA !== countB) {
                return countB - countA;
            }
            if (a < b) {
                return -1;
            } else if (a > b) {
                return 1;
            } else {
                return 0;
            }
        });
        return groups;
    },
    _setGroup(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        const group = $(evt.currentTarget).data('group');
        this._setStyleDefinition(group);
    },
    _removeGroup(evt) {
        evt.preventDefault();
        evt.stopPropagation();

        this._setStyleDefinition(null);
    }
});

export default AnnotationContextMenu;
