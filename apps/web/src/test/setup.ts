import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// vitest.config.ts does not enable `test.globals`, so testing-library's
// automatic per-test cleanup (which relies on detecting a global
// `afterEach`) never registers itself. Register it explicitly instead.
afterEach(() => {
  cleanup();
});
