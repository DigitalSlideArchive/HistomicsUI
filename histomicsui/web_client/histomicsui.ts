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
          girder.rest.restRequest({
              url: `system/public_settings`,
              method: 'GET',
          }).done(async (resp: any) => {
              // We use dynamic import because this app's code depends on other plugins'
              // code having been loaded under `girder.plugins.xxx` at import time.
              const App = (await import('./app') as any).default;
              const app = new App({
                  el,
                  parentView: null,
                  // TODO get all these values using the former HistomicsUI webroot logic
                  contactEmail: resp['core.contact_email_address'],
                  privacyNoticeHref: resp['core.privacy_notice'],
                  brandName: resp['core.brand_name'],
                  bannerColor: resp['core.banner_color'],
                  registrationPolicy: resp['core.registration_policy'],
                  enablePasswordLogin: resp['core.enable_password_login'],
              });
              document.title = resp['core.brand_name'];
              app.bindRoutes();
              girder.events.trigger('g:appload.after', app);
              resolve(app);
          }).fail((resp: any) => {
              girder.events.trigger('g:error', resp);
              reject(new Error("Could not retrieve public settings from server."));
          });
      });
  });
};

const apiRoot = '/api/v1';

(async () => {
  const origin = apiRoot.startsWith('/') ? window.origin : new URL(apiRoot).origin;
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
