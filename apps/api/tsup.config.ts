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
  // pino does internal dynamic `require()`s (for its worker-thread-based
  // transport system, e.g. `pino-pretty`) that esbuild cannot safely
  // convert when bundling to ESM -- inlining it crashes at runtime with
  // "Dynamic require of ... is not supported". Bundling `@readycircle/
  // observability` via `noExternal` above pulls its `pino` import along
  // with it unless explicitly excluded here; pino is a real npm
  // dependency anyway (installed normally via `pnpm install --prod`), so
  // there's no reason to bundle it.
  // openai, @react-pdf/renderer, and react (pulled in via bundling
  // @readycircle/plan-engine) stay external for the same reason: they are
  // real npm dependencies with internals (dynamic requires, font assets)
  // that do not survive ESM bundling.
  external: ['pino', 'openai', '@react-pdf/renderer', 'react'],
  dts: false,
});
