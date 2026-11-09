import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [iwsdkDev({ https: false })],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
