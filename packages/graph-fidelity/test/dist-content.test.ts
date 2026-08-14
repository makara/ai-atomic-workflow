import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Dist content contract — every `exports` target must exist after a build.
 *
 * The bundler (`tsup`) and the type-emission step (`tsc -p
 * tsconfig.interfaces.json`) share `dist/`; a bundler clean or an
 * interrupted build can leave a partial dist whose declared exports
 * targets are missing (e.g. `exports["./interfaces"].types` dangling).
 * This test guards the contract: when a build has run (bundle present),
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

  it.skipIf(!distPresent)('interfaces types target exists (type-only surface)', () => {
    const entry = pkg.exports['./interfaces'];
    const types = typeof entry === 'string' ? entry : entry.types;
    expect(types).toBeDefined();
    expect(existsSync(resolve(pkgRoot, types!))).toBe(true);
  });

  // NOTE (graph-fidelity-deny-removal): the deny implementation is
  // permanently removed (ADR 0180) — its sources were never part of the
  // interfaces declaration program (tsconfig.interfaces.json), so no
  // deny.d.ts/deny.js artifacts exist in dist; the ToolDeny contract
  // types remain under dist/interfaces/interfaces/. No stale-residue
  // zero-match assertion for dist/interfaces/core/: a clean rebuild
  // proved that directory is CURRENT tsc declaration output (interfaces
  // modules type-import core modules).
});
