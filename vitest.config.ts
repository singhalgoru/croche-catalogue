import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { 'npm:mmdb-lib@3.0.3': 'mmdb-lib' } },
  plugins: [
    react(),
    {
      name: 'test-pwa-register',
      resolveId(id) {
        if (id === 'virtual:pwa-register/react') return '\0test-pwa-register';
      },
      load(id) {
        if (id === '\0test-pwa-register') return 'export const useRegisterSW = () => {};';
      },
    },
  ],
  test: {
    environment: 'jsdom',
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
