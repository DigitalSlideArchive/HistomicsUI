import io
import os

from girder.models.folder import Folder
from girder.models.upload import Upload

from .datastore import datastore


def namedFolder(user, folderName='Public'):
    return Folder().find({
        'parentId': user['_id'],
        'name': folderName,
    })[0]


def uploadFile(filePath, user, assetstore, folderName='Public', name=None, reference=None):
    if name is None:
        name = os.path.basename(filePath)
    folder = namedFolder(user, folderName)
    file = Upload().uploadFromFile(
        open(filePath, 'rb'), os.path.getsize(filePath), name,
        parentType='folder', parent=folder, user=user, assetstore=assetstore,
        reference=reference)
    return file


def uploadExternalFile(hashPath, user, assetstore, folderName='Public', name=None, reference=None):
    imagePath = datastore.fetch(hashPath)
    return uploadFile(
        imagePath, user=user, assetstore=assetstore, folderName=folderName,
        name=name, reference=reference)


def uploadTestFile(fileName, user, assetstore, folderName='Public', name=None, reference=None):
    testDir = os.path.dirname(os.path.realpath(__file__))
    imagePath = os.path.join(testDir, 'test_files', fileName)
    return uploadFile(
        imagePath, user=user, assetstore=assetstore, folderName=folderName,
        name=None, reference=reference)


def uploadText(text, user, assetstore, folder, name):
    file = Upload().uploadFromFile(
        io.BytesIO(text.encode()), len(text), name,
        parentType='folder', parent=folder, user=user, assetstore=assetstore)
    return file


def respStatus(resp):
    return int(resp.output_status.split()[0])


def getBody(response, text=True):
    """
    Returns the response body as a text type or binary string.

    :param response: The response object from the server.
    :param text: If true, treat the data as a text string, otherwise, treat
                 as binary.
    """
    data = '' if text else b''

    for chunk in response.body:
        if text and isinstance(chunk, bytes):
            chunk = chunk.decode()
        elif not text and not isinstance(chunk, bytes):
            chunk = chunk.encode()
        data += chunk

    return data
