import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    fs: {
      // '..' keeps the project root served: an explicit allow list replaces Vite's default.
      allow: ['..', '../fixtures'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  plugins: [
    {
      name: 'prod-csp',
      apply: 'build',
      // Dev keeps localhost origins; the shipped bundle must not trust them (or ws:).
      transformIndexHtml(html: string): string {
        return html.replace(' ws: wss: http://localhost:8787 http://127.0.0.1:8787', '');
      },
    },
  ],
  build: {
    rollupOptions: {
      // Multi-page: locale gateway at / plus the editor at /app/.
      input: {
        main: 'index.html',
        app: 'app/index.html',
      },
    },
  },
});
