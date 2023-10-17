from girder.models.folder import Folder
from girder.models.model_base import ValidationException

from .cohort import Cohort
from .meta import TCGAModel


class Case(TCGAModel, Folder):

    TCGAType = 'case'
    TCGAIndices = [
        'tcga.label',
    ]

    def validate(self, doc, **kwargs):
        if doc.get('parentCollection') != 'folder':
            msg = 'A Case model must be a child of a folder'
            raise ValidationException(
                msg,
            )
        super().validate(doc, **kwargs)
        cohort = Cohort().load(
            doc['parentId'], force=True)
        if not cohort or self.getTCGAType(cohort) != 'cohort':
            msg = 'A Case model must be a child of a cohort'
            raise ValidationException(
                msg,
            )
        if not self.case_re.match(self.getTCGA(doc).get('label', '')):
            msg = 'Invalid label in TCGA metadata'
            raise ValidationException(
                msg,
            )
        return doc

    def importDocument(self, doc, **kwargs):
        from .slide import Slide

        recurse = kwargs.get('recurse', False)
        parent = Cohort().load(
            doc.get('parentId'), force=True,
        )
        if not parent:
            msg = 'Invalid folder document'
            raise ValidationException(
                msg,
            )
        tcga = self.getTCGA(parent)
        tcga['label'] = doc['name']
        tcga['caseId'] = doc['_id']
        self.setTCGA(doc, **tcga)
        doc = super().importDocument(doc, **kwargs)
        if not recurse:
            return doc

        childModel = Slide()
        children = Folder().childFolders(
            doc, 'folder', user=kwargs.get('user'),
        )
        for child in children:
            try:
                childModel.importDocument(child, **kwargs)
            except ValidationException:
                pass
        return doc
