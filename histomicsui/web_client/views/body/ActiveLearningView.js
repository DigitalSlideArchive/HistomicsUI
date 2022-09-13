import View from '../View';
import { restRequest, getApiRoot } from '@girder/core/rest';
import _ from 'underscore';

import router from '../../router';

import learningTemplate from '../../templates/body/learning.pug';
import ActiveLearningContainer from '../../vue/components/ActiveLearning/ActiveLearningContainer.vue';

var ActiveLearningView = View.extend({
    initialize(settings) {
        router.setQuery(); // ??? don't think I should need to do this, but ok...
        this.trainingDataFolderId = router.getQuery('folder');
        this.imageItemsById = {};
        this.annotationsByImageId = {};
        this.sortedSuperpixelIndices = [];

        restRequest({
            url: `folder/${this.trainingDataFolderId}`
        }).then((response) => {
            this.annotationBaseName = response.meta['active_learning_annotation_name'];
            this.getAnnotations();
        });
        this.render();
    },

    mountVueComponent() {
        const el = this.$('.h-active-learning-container').get(0);
        const vm = new ActiveLearningContainer({
            el,
            propsData: {
                router: router,
                trainingDataFolderId: this.trainingDataFolderId,
                annotationsByImageId: this.annotationsByImageId,
                annotationBaseName: this.annotationBaseName,
                sortedSuperpixelIndices: this.sortedSuperpixelIndices,
                apiRoot: getApiRoot()
            }
        });
        this.vueApp = vm;
    },

    render() {
        this.$el.html(learningTemplate());
        return this;
    },

    getAnnotations() {
        console.log('getting annotations...');
        const annotationsToFetchByImage = {};
        restRequest({
            url: 'item',
            data: {
                folderId: this.trainingDataFolderId
            }
        }).then((response) => {
            _.forEach(response, (item) => {
                if (item.largeImage) {
                    this.imageItemsById[item._id] = item;
                    this.annotationsByImageId[item._id] = {};

                    restRequest({
                        url: 'annotation',
                        data: {
                            itemId: item._id,
                            sort: 'created',
                            sortdir: -1
                        }
                    }).then((response) => {
                        // note: refine name checking
                        const predictionsAnnotations = _.filter(response, (annotation) => {
                            return this.annotationIsValid(annotation) && annotation.annotation.name.includes('Predictions');
                        });
                        const superpixelAnnotations = _.filter(response, (annotation) => {
                            return this.annotationIsValid(annotation) && !annotation.annotation.name.includes('Predictions');
                        });
                        annotationsToFetchByImage[item._id] = {
                            predictions: predictionsAnnotations[0]._id,
                            superpixels: superpixelAnnotations[0]._id
                        };
                        this.fetchAnnotations(annotationsToFetchByImage);
                    });
                }
            })
        });
    },

    annotationIsValid(annotation) {
        return true;
    },

    fetchAnnotations(annotationsToFetchByImage) {
        const promises = [];
        // use $.when to resolve trigger creation of vue component
        _.forEach(Object.keys(annotationsToFetchByImage), (imageId) => {
            _.forEach(['predictions', 'superpixels'], (key) => {
                promises.push(restRequest({
                    url: `annotation/${annotationsToFetchByImage[imageId][key]}`
                }).done((res) => {
                    // check validity of annotation
                    this.annotationsByImageId[imageId][key] = res;
                }));
            });
        });
        $.when(...promises).then(() => {
            console.log('retrieved annotations...');
            this.getSortedSuperpixelIndices();
            this.mountVueComponent();
        });
    },

    getSortedSuperpixelIndices() {
        console.time("sorting");
        const superPixelConfidenceData = [];
        _.forEach(Object.keys(this.annotationsByImageId), (imageId) => {
            const annotation = this.annotationsByImageId[imageId].predictions;
            console.log(annotation);
            const userData = annotation.annotation.elements[0].user;
            const superpixelImageId = annotation.annotation.elements[0].girderId;
            const boundaries = annotation.annotation.elements[0].boundaries;
            const scale = annotation.annotation.elements[0].transform.matrix[0][0];
            console.log(userData);
            _.forEach(userData.confidence, (score, index) => {
                const bbox = userData.bbox.slice(index * 4, index * 4 + 4);
                superPixelConfidenceData.push({
                    index: index,
                    confidence: score,
                    imageId: imageId,
                    superpixelImageId: superpixelImageId,
                    boundaries: boundaries,
                    scale: scale,
                    bbox: bbox
                });
            });
        });
        this.sortedSuperpixelIndices = _.sortBy(superPixelConfidenceData, 'confidence');
        console.timeEnd("sorting");
    }

});

export default ActiveLearningView;
