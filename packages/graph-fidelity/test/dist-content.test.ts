import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Dist content contract — every `exports` target must exist after a build.
 *
 * The bundler (`tsup`) writes `dist/`; a bundler clean or an
 * interrupted build can leave a partial dist whose declared exports
 * targets are missing (e.g. `exports["./omp"]` dangling). This test
 * guards the contract: when a build has run (bundle present),
 * every declared target MUST exist — a stale/partial dist fails the suite
 * naming the missing paths. On a fresh clone (no dist at all) the
 * assertions skip with a documented reason (dist is gitignored build
 * output; consumers build before use).
 */

const pkgRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(pkgRoot, 'package.json'), 'utf8')) as {
  exports: Record<string, string | { types?: string }>;
};

const BUNDLE_MARKER = resolve(pkgRoot, 'dist', 'omp.js');

/** All declared exports file targets (string form or { types }). */
function declaredTargets(): string[] {
  const targets: string[] = [];
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    const file = typeof target === 'string' ? target : target.types;
    if (file !== undefined) targets.push(file);
    else throw new Error(`exports["${subpath}"] has no file target`);
  }
  return targets;
}

describe('dist content contract — exports targets exist', () => {
  const distPresent = existsSync(BUNDLE_MARKER);

  // Skip on fresh clone: dist/ is gitignored build output — no build, no
  // content to assert; the contract binds post-build states only.
  it.skipIf(!distPresent)('every exports target resolves to an existing file', () => {
    const missing = declaredTargets().filter((file) => !existsSync(resolve(pkgRoot, file)));
    expect(missing).toEqual([]);
  });

  it.skipIf(!distPresent)('no stale residue — removed surface d.ts files are absent', () => {
    // The platform-binding module (R2 docking wiring) was removed with
    // the SDK delivery cutover (ADR 0193): its stale declaration output
    // must never survive a clean build. The R1 chain modules moved to
    // the SDK (ADR 0195): lifecycle/display-feedback/contracts
    // declarations must never reappear.
    for (const stale of [
      'dist/interfaces/platform-binding.d.ts',
      'dist/interfaces/lifecycle.d.ts',
      'dist/interfaces/interfaces/signal-lifecycle.d.ts',
      'dist/interfaces/interfaces/display-feedback.d.ts',
      'dist/interfaces/interfaces/contracts.d.ts',
      // sdk-surface-convergence: the ./interfaces export is removed —
      // ToolDeny is SDK-owned; the whole interfaces declaration tree is
      // gone with tsconfig.interfaces.json.
      'dist/interfaces/index.d.ts',
      'dist/interfaces/interfaces/tool-deny.d.ts',
    ]) {
      expect(existsSync(resolve(pkgRoot, stale))).toBe(false);
    }
  });

  // NOTE (sdk-surface-convergence): the deny contract is SDK-owned
  // (platform-hooks-sdk core/types.ts, ADR 0177); the package's former
  // src/interfaces/tool-deny.ts re-export shim was deleted (sdk-slim-round5)
  // — consumers import SDK types directly; the interfaces declaration
  // program (tsconfig.interfaces.json) was removed with the ./interfaces export.
});
