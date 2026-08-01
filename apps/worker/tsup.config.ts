import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  noExternal: [/^@readycircle\//],
  // See apps/api/tsup.config.ts for why these must stay external.
  external: ['pino', 'openai', '@react-pdf/renderer', 'react'],
  dts: false,
});
