import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // Forward API calls to the CodeIgniter 4 backend (cd backend && php spark serve)
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://127.0.0.1:8080',
          changeOrigin: true,
          configure: (proxy) => {
            // Explain a stopped backend in the app instead of a bare 500
            proxy.on('error', (_err, _req, res) => {
              const out = res as import('http').ServerResponse;
              if (!out.headersSent) {
                out.writeHead(503, {'Content-Type': 'application/json'});
              }
              out.end(JSON.stringify({
                error: 'Server backend tidak berjalan. Buka terminal baru, masuk ke folder backend, lalu jalankan: php spark serve',
                code: 'backend-unavailable',
              }));
            });
          },
        },
      },
    },
  };
});
