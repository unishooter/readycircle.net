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
    // API integration tests share one real Postgres database (no mocks, per
    // this project's testing convention) and now include tests that mutate
    // genuinely global state -- the `platform_settings` invite-only-access
    // override affects every concurrently-connected server, including other
    // test files' dev-auth logins. Running files in parallel made that race
    // real (a different file's "new user" login could get blocked mid-way
    // through the override round-trip test). Sequential file execution
    // trades some wall-clock time for determinism.
    fileParallelism: false,
  },
});
