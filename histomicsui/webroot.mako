<!DOCTYPE html>
<html lang="en">
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <link rel="stylesheet" href="${staticPublicPath}/built/girder_lib.min.css">
    <link rel="icon" type="image/png" href="${staticPublicPath}/built/plugins/histomicsui/favicon.png">
    % for plugin in pluginCss:
    <link rel="stylesheet" href="${staticPublicPath}/built/plugins/${plugin}/plugin.min.css">
    % endfor
  </head>
  <body>
    <div id="g-global-info-apiroot" class="hide">${apiRoot}</div>
    <div id="g-global-info-staticroot" class="hide">${staticPublicPath}</div>
    <script src="${staticPublicPath}/built/girder_lib.min.js"></script>
    <script src="${staticPublicPath}/built/girder_app.min.js"></script>
    <script>
    $(function () {
      $('body').addClass('hui-body')
      girder.router.enabled(false);
      girder.events.trigger('g:appload.before');
      var app = new girder.plugins.histomicsui.App({
        el: 'body',
        parentView: null,
        brandName: '${huiBrandName | js}',
        brandColor: '${huiBrandColor | js}',
        bannerColor: '${huiBannerColor | js}',
      });
      app.bindRoutes();
      girder.events.trigger('g:appload.after');
    });
    </script>
    % for plugin in pluginJs:
    <script src="${staticPublicPath}/built/plugins/${plugin}/plugin.min.js"></script>
    % endfor
  </body>
</html>
