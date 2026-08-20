import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['server.ts'],
  target: ['node22'],
  format: ['esm'],
  clean: true,
  dts: true,
  splitting: false,
  sourcemap: true,
  treeshake: true,
  tsconfig: './tsconfig.json',
  // mermaid/jsdom stay external (runtime deps, resolved from node_modules):
  // with splitting:false a dynamic import would be inlined into the bundle
  // and evaluated eagerly at module top-level — before the jsdom DOM shim
  // runs — breaking the lazy shim-before-import ordering (~5MB eager load).
  external: ['mermaid', 'jsdom'],
});
