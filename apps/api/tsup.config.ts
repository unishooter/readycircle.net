import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  sourcemap: true,
  clean: true,
  // Bundle workspace packages (they ship raw TypeScript source with no
  // build step of their own) while leaving real npm dependencies external
  // so production installs `node_modules` normally.
  noExternal: [/^@readycircle\//],
  dts: false,
});
