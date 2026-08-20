import { defineConfig } from 'tsup';

const shared = {
  target: ['node22'] as const,
  format: ['esm'] as const,
  // clean: true — a stale bundle from a renamed/removed entry is wiped
  // before tsup runs. The dist-content contract test guards the
  // post-build state (no interfaces declaration tree — the ./interfaces
  // export is removed, sdk-surface-convergence).
  clean: true,
  splitting: false,
  sourcemap: false,
  minify: true,
  dts: false,
  treeshake: true,
  // tsup externalizes `dependencies` by default — the SDK must be INLINE
  // (deployments are bare folder copies with no node_modules; the R1
  // chain ships inside the SDK per ADR 0195).
  noExternal: ['effect', '@ai-atomic-workflow/platform-hooks-sdk'],
} as const;

/**
 * Adapter bundles only (ADR 0195 — the shared lifecycle module is gone;
 * the R1 chain is inlined via the SDK dependency, no external/rewrite
 * normalization exists).
 */
export default defineConfig({
  ...shared,
  entry: { omp: 'src/adapter-omp.ts', opencode: 'src/adapter-opencode.ts' },
});
