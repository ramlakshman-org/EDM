import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'https://www.tnedms.com', changeOrigin: true },
      '/report-files': { target: 'https://www.tnedms.com', changeOrigin: true },
    },
  },
  build: {
    emptyOutDir: false,
  },
});
