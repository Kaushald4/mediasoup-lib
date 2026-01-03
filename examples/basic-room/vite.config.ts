import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@bytepulse/pulsewave-shared': new URL('../../packages/shared/src', import.meta.url).pathname,
      '@bytepulse/pulsewave-client': new URL('../../packages/client/src', import.meta.url).pathname,
    },
  },
  server: {
    port: 5173,
    allowedHosts: ['localhost', '5a41d8a145e3.ngrok-free.app'],
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
