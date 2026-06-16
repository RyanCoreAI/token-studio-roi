import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react';
          if (id.includes('node_modules/echarts')) return 'echarts';
          return null;
        }
      }
    },
    chunkSizeWarningLimit: 1500
  },
  server: {
    proxy: {
      '/api': `http://127.0.0.1:${process.env.API_PORT || 4173}`
    }
  }
});
