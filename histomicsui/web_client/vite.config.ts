import { resolve } from 'path';

import { defineConfig, type UserConfig } from 'vite';
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
  ],
  build: {
    sourcemap: true,
  },
  define: {
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
