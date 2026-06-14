import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // deck.gl uses dynamic requires that confuse Vite's pre-bundler
    include: ['maplibre-gl'],
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
});
