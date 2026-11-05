import { girder } from '@girder/core';

declare global {
  interface Window {
    girder: typeof girder;
  }
}
window.girder = girder;

interface StaticFilesSpec {
  css: string[],
  js: string[],
}


const initializeHistomicsApp = async (apiRoot: string, el: string | HTMLElement = 'body') => {
  return new Promise((resolve, reject) => {
      $(() => {
          girder.rest.setApiRoot(apiRoot);
          girder.router.enabled(false);
          girder.events.trigger('g:appload.before');
          const coreSettingsPromise = girder.rest.restRequest({
            url: 'system/public_settings',
            method: 'GET',
          });
          const histomicsSettingsPromise = girder.rest.restRequest({
              url: 'system/setting/histomicsui',
              method: 'GET',
          });
          Promise.all([coreSettingsPromise, histomicsSettingsPromise]).then(async (resp: any) => {
            const [coreSettings, histomicsSettings] = resp;
              // We use dynamic import because this app's code depends on other plugins'
              // code having been loaded under `girder.plugins.xxx` at import time.
              const App = (await import('./app') as any).default;
              const app = new App({
                  el,
                  parentView: null,
                  brandName: histomicsSettings['histomicsui.brand_name'],
                  brandColor: histomicsSettings['histomicsui.brand_color'],
                  bannerColor: histomicsSettings['histomicsui.banner_color'],
                  helpURL: histomicsSettings['histomicsui.help_url'],
                  helpTooltip: histomicsSettings['histomicsui.help_tooltip'],
                  helpText: histomicsSettings['histomicsui.help_text'],
                  showDownload: coreSettings['core.show_download'],
              });
              document.title = histomicsSettings['histomicsui.brand_name'];
              app.bindRoutes();
              girder.events.trigger('g:appload.after', app);
              resolve(app);

          }).catch((resp: any) => {
              girder.events.trigger('g:error', resp);
              reject(new Error("Could not retrieve public settings from server."));
          });
      });
  });
};

const appElement = document.getElementById('app');
let apiRoot = (appElement && appElement.getAttribute('root')) || '';
apiRoot += (apiRoot.endsWith('/') ? '' : '/') + 'api/v1';
if (!apiRoot.startsWith('/') && apiRoot.indexOf(':') < 0) {
    apiRoot = '/' + apiRoot;
}

(async () => {
  let origin = apiRoot.startsWith('/') ? window.origin : new URL(apiRoot).origin;
  origin += apiRoot.includes('/api/') ? apiRoot.substring(0, apiRoot.indexOf('/api/')) + '/' : '';
  const staticFilesResp = await fetch(`${apiRoot}/system/plugin_static_files`);
  const staticFiles: StaticFilesSpec = await staticFilesResp.json();

  staticFiles.css.forEach((href) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = new URL(href, origin).href;
    document.head.appendChild(link);
  });

  // Because some plugin code depends on other plugin code at import time, we can't
  // await these in parallel. For now load them serially until the server is smart enough to
  // provides a DAG.
  for (const href of staticFiles.js) {
    await new Promise<void>((resolve) => {
      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = new URL(href, origin).href;
      document.head.appendChild(script);
      script.addEventListener('load', function() {
        resolve();
      });
    });
  };

  await initializeHistomicsApp(apiRoot, document.getElementById('app'));
})();
