import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const siteChrome = `
  <!-- 100% privacy-first analytics -->
  <script data-collect-dnt="true" async src="https://scripts.simpleanalyticscdn.com/latest.js"></script>
  <noscript><img src="https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true" alt="" referrerpolicy="no-referrer-when-downgrade" /></noscript>
  <footer class="fis-made-by-kaj" aria-label="Site credit">
    Made with <span aria-hidden="true">❤️</span> by <a href="https://k-si.com/">Kaj</a>
  </footer>
  <style>
    .fis-made-by-kaj {
      position: fixed; left: max(0.5rem, env(safe-area-inset-left)); bottom: max(0.5rem, env(safe-area-inset-bottom)); z-index: 2147483647;
      box-sizing: border-box; max-width: calc(100vw - 1rem); margin: 0; padding: 0.28rem 0.52rem; border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 999px;
      color: rgba(255, 255, 255, 0.72); background: rgba(5, 8, 12, 0.76); box-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.24);
      font: 500 0.72rem/1.35 system-ui, sans-serif; letter-spacing: 0.01em; white-space: nowrap; backdrop-filter: blur(8px); pointer-events: none;
    }
    .fis-made-by-kaj a { color: #9fbcff; text-decoration: none; pointer-events: auto; }
    .fis-made-by-kaj a:hover, .fis-made-by-kaj a:focus-visible { text-decoration: underline; }
  </style>
`;

function analyticsAndCreditPlugin() {
  return {
    name: 'found-in-space-analytics-and-credit',
    transformIndexHtml(html) {
      return html.replace(/<\/body>/i, `${siteChrome}</body>`);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [analyticsAndCreditPlugin()],
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
