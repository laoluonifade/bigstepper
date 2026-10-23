import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5177, strictPort: true },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than our code, so they stay cached across deploys.
        manualChunks: { vendor: ['react', 'react-dom', '@tanstack/react-router', '@tanstack/react-query'] },
      },
    },
  },
});
