import { defineConfig } from 'tsup';

/**
 * Standalone SDK build — one library entry plus an adapters entry.
 * The SDK has no platform runtime dependencies (platform packages are
 * type-only imports, erased at compile time), so no inlining is needed
 * and the bundles stay dependency-free.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  target: ['node22'],
  format: ['esm'],
  // clean: false — the root build chain (yarn build = workspaces foreach
  // run tsup) runs tsup directly; a clean would wipe the tsc-emitted
  // type declarations. The package build script removes dist itself.
  clean: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  // dts: false — rollup-plugin-dts crashes under TS7 (repo-known); type
  // declarations are emitted by build:types via tsc (graph-fidelity parity).
  dts: false,
  treeshake: true,
} as const);
