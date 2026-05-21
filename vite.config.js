import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localFoundInSpacePackages = [
  '@found-in-space/anchored-image',
  '@found-in-space/hr-diagram',
  '@found-in-space/journey',
  '@found-in-space/skykit',
  '@found-in-space/spatial',
  '@found-in-space/star-octree-provider',
  '@found-in-space/star-trees',
  '@found-in-space/three-star-field',
];

export default defineConfig({
  base: './',
  resolve: {
    alias: [
      {
        find: '@found-in-space/journey-video/editor',
        replacement: path.resolve(__dirname, 'src/editor.js'),
      },
      {
        find: '@found-in-space/journey-video/export/node',
        replacement: path.resolve(__dirname, 'src/export-node.js'),
      },
      {
        find: '@found-in-space/journey-video/export',
        replacement: path.resolve(__dirname, 'src/export.js'),
      },
      {
        find: '@found-in-space/journey-video',
        replacement: path.resolve(__dirname, 'src/index.js'),
      },
    ],
  },
  optimizeDeps: {
    exclude: [
      '@found-in-space/journey-video',
      '@found-in-space/journey-video/editor',
      '@found-in-space/journey-video/export',
      '@found-in-space/journey-video/export/node',
      ...localFoundInSpacePackages,
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
    fs: {
      allow: ['..'],
    },
  },
});
