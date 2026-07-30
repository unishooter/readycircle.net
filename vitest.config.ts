import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: [
      'packages/*/src/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'apps/worker/src/**/*.test.ts',
      'apps/web/src/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    environmentMatchGlobs: [['apps/web/**', 'jsdom']],
    setupFiles: ['apps/web/src/test/setup.ts'],
    testTimeout: 15000,
    hookTimeout: 20000,
  },
});
