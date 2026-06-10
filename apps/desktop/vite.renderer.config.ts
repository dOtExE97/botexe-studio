import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': path.resolve(__dirname, 'src/renderer'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@botexe/trigger-engine': path.resolve(__dirname, '../../packages/trigger-engine/src'),
      '@botexe/overlay-engine': path.resolve(__dirname, '../../packages/overlay-engine/src'),
    },
  },
});
