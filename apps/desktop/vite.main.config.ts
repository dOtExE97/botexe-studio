import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@main': path.resolve(__dirname, 'src/main'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@botexe/trigger-engine': path.resolve(__dirname, '../../packages/trigger-engine/src'),
      '@botexe/overlay-engine': path.resolve(__dirname, '../../packages/overlay-engine/src'),
    },
  },
  build: {
    rollupOptions: {
      // Nur Module external lassen, die es wirklich brauchen (dynamische
      // Loads / optionale native Bindings). Pure-JS-Deps werden gebundlet.
      external: [
        'electron',
        // ws hat optionale native deps
        'ws',
        'bufferutil',
        'utf-8-validate',
        // tiktok-live-connector lädt protobuf-Files dynamisch
        'tiktok-live-connector',
      ],
    },
  },
});
