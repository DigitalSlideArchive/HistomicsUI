import fs from 'fs';
import path, { resolve } from 'path';

import { defineConfig, type UserConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { compileClient } from 'pug';
import vue from '@vitejs/plugin-vue2';

function pugPlugin() {
  return {
    name: 'pug',
    transform(src: string, id: string) {
      if (id.endsWith('.pug')) {
        return {
          code: `${compileClient(src, {filename: id})}\nexport default template`,
          map: null,
        };
      }
    },
  };
}

function inlineFaviconPlugin(relFaviconPath, mimeType) {
  return {
    name: 'inline-favicon',
    transformIndexHtml(html, ctx) {
      if (ctx && ctx.server) {
        return html;
      }

      const faviconAbsPath = path.resolve(process.cwd(), relFaviconPath);
      try {
        const faviconData = fs.readFileSync(faviconAbsPath);
        const base64 = faviconData.toString('base64');
        const dataUri = `data:${mimeType};base64,${base64}`;
        return html.replace(
          /<link\s+rel="(?:shortcut\s+icon|icon)"[^>]*href=["'][^"']*["'][^>]*>/i,
          `<link rel="icon" type="${mimeType}" href="${dataUri}">`
        );
      } catch (err) {
        console.warn(`[inline-favicon] Failed to inline favicon ${relFaviconPath}:`, err);
        return html;
      }
    }
  };
}

const buildTarget = process.env.BUILD_TARGET;

const config: UserConfig = {
  plugins: [
    pugPlugin(),
    vue(),
    inlineFaviconPlugin('static/favicon.png', 'image/png'),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/plotly.js/dist/plotly.min.js',
          dest: 'extra',
          rename: () => 'plotly.js',
        }
      ]
    })
  ],
  build: {
    sourcemap: !process.env.SKIP_SOURCE_MAPS
  },
  define: {
    __BUILD_TIMESTAMP__: `${+new Date()}`,
    'process.env': {},  // for legacy Vue 2
  },
};

if (buildTarget === 'plugin') {
  config.build.lib = {
    entry: resolve(__dirname, 'main.js'),
    name: 'GirderPluginHistomicsUI',
    fileName: 'girder-plugin-histomics-ui',
  };
} else {
  config.build.outDir = 'dist-app';
  config.base = './';
}

export default defineConfig(config);
