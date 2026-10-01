import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { defineConfig } from 'vite';

const frontendRoot = __dirname;
const appRoot = path.resolve(frontendRoot, '..');
const siteUrl = process.env.BOOKS_SITE_URL ?? 'http://localhost:8000';
const siteProxy = {
  target: siteUrl,
  // frappe-ui names the site after the page's host; use the proxied site instead.
  headers: { 'X-Frappe-Site-Name': new URL(siteUrl).hostname },
};

export default defineConfig(async () => {
  const { lucideIconsPlugin } =
    await import('frappe-ui/vite/lucideIconsPlugin');

  return {
    base: '/assets/frappe_books/books/',
    plugins: [lucideIconsPlugin(), vue()],
    resolve: {
      alias: {
        fyo: path.resolve(frontendRoot, 'fyo'),
        src: path.resolve(frontendRoot, 'src'),
        schemas: path.resolve(frontendRoot, 'schemas'),
        models: path.resolve(frontendRoot, 'models'),
        utils: path.resolve(frontendRoot, 'utils'),
        reports: path.resolve(frontendRoot, 'reports'),
        // `frappe-ui/experimental` fails vue-tsc (frappe/frappe-ui#1247).
        'frappe-ui-command-palette': path.resolve(
          frontendRoot,
          'node_modules/frappe-ui/experimental/CommandPalette/index.ts',
        ),
        'frappe-ui-accordion': path.resolve(
          frontendRoot,
          'node_modules/frappe-ui/experimental/Accordion/index.ts',
        ),
      },
    },
    define: {
      'import.meta.env.VITE_ROUTER_BASE': JSON.stringify('/books/'),
    },
    build: {
      outDir: path.resolve(appRoot, 'frappe_books/public/books'),
      emptyOutDir: true,
      target: 'es2020',
      sourcemap: false,
    },
    server: {
      port: 6969,
      proxy: { '/api': siteProxy, '/assets': siteProxy, '/files': siteProxy },
    },
  };
});
