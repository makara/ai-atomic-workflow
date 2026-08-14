import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    omp: 'src/adapters/omp.ts',
    opencode: 'src/adapters/opencode.ts',
  },
  target: ['node22'],
  format: ['esm'],
  // clean: false — the interfaces type declarations (tsc output) live under
  // dist/interfaces/; a bundler clean would wipe them, leaving a partial
  // dist (exports["./interfaces"].types dangling). The build script removes
  // ONLY the bundle outputs before tsup runs; the type-emission directory
  // is never touched by the bundler (dist content contract test guards).
  clean: false,
  splitting: false,
  sourcemap: false,
  minify: true,
  dts: false,
  treeshake: true,
  // tsup externalizes `dependencies` by default — the SDK must be INLINE
  // (deployments are bare folder copies with no node_modules).
  noExternal: ['@modelcontextprotocol/sdk'],
  tsconfig: './tsconfig.json',
});
