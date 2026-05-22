import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: '@found-in-space/skykit-studio/editor',
        replacement: path.resolve(__dirname, 'src/editor.js'),
      },
      {
        find: '@found-in-space/skykit-studio/export/node',
        replacement: path.resolve(__dirname, 'src/export-node.js'),
      },
      {
        find: '@found-in-space/skykit-studio/export',
        replacement: path.resolve(__dirname, 'src/export.js'),
      },
      {
        find: '@found-in-space/skykit-studio',
        replacement: path.resolve(__dirname, 'src/index.js'),
      },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@found-in-space/skykit-studio',
      '@found-in-space/skykit-studio/editor',
      '@found-in-space/skykit-studio/export',
      '@found-in-space/skykit-studio/export/node',
    ],
  },
  build: {
    rollupOptions: {
      input: {
        editor: path.resolve(__dirname, 'index.html'),
        editorExample: path.resolve(__dirname, 'examples/editor/index.html'),
        renderExample: path.resolve(__dirname, 'examples/render/index.html'),
      },
    },
  },
  server: {
    allowedHosts: true,
  },
});
