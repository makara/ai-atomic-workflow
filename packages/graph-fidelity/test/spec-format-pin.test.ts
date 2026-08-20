import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DELTA_SPEC = resolve(repoRoot, 'openspec/changes/graph-fidelity-r2-suspend/specs/graph-fidelity/spec.md');
const MAIN_SPEC = resolve(repoRoot, 'openspec/specs/graph-fidelity/spec.md');

/** Canonical discipline-line format — identity pointer + progress, R1 only. */
const CANONICAL = '▣ [seam] node <id> · N/M';

function specText(): string | null {
  // Delta spec is authoritative while the change is live; main spec after archive.
  const delta = existsSync(DELTA_SPEC) ? readFileSync(DELTA_SPEC, 'utf8') : null;
  if (delta !== null) return delta;
  return existsSync(MAIN_SPEC) ? readFileSync(MAIN_SPEC, 'utf8') : null;
}

describe.skipIf(specText() === null)('Discipline-line format pin (spec side)', () => {
  it('spec states the canonical identity-only format', () => {
    expect(specText()).toContain(CANONICAL);
  });
});
