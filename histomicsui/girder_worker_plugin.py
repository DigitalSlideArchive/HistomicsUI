import os

from girder_worker import GirderWorkerPluginABC


class HistomicsUIWorkerPlugin(GirderWorkerPluginABC):
    def __init__(self, app, *args, **kwargs):
        if os.getenv('CELERY_TASK_ALWAYS_EAGER', False):
            app.conf.task_always_eager = True
            app.conf.task_eager_propagates = True
        self.app = app

    def task_imports(self):
        return ['histomicsui.handlers']
