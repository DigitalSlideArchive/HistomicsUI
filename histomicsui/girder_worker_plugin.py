from girder_worker import GirderWorkerPluginABC


class HistomicsUIWorkerPlugin(GirderWorkerPluginABC):
    def __init__(self, app, *args, **kwargs):
        self.app = app

    def task_imports(self):
        return ['histomicsui.handlers']
