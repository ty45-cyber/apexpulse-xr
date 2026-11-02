import { iwsdkDev } from '@iwsdk/vite-plugin-dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [iwsdkDev({ https: false })],
  server: {
    host: '0.0.0.0',
    port: 5174,
  },
});
