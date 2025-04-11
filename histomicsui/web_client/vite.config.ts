import { resolve } from 'path';

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

const buildTarget = process.env.BUILD_TARGET;

const config: UserConfig = {
  plugins: [
    pugPlugin(),
    vue(),
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
  config.base = '/histomics/';
}

export default defineConfig(config);
