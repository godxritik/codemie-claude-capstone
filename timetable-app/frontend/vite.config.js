import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Builds straight into ../public, which server.js already serves as static files.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
});
