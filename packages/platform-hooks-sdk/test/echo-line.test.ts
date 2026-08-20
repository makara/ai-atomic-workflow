/**
 * R1 identity echo renderer pins — identity pointer + progress only
 * (`core/echo-line.ts` `renderIdentityEcho`). The value-ratio graphic
 * is NOT part of the echo line (user ruling, round 17 — it lives on
 * the context module's settlement line). The shared render helpers
 * (renderCompact / renderBenefitSegment / prefixClassOf) moved to the
 * platform-hooks-sdk `./utils` subpath (round 18, change
 * graph-fidelity-context-r18-fixes) — their authoritative pins live in
 * the SDK utils test suite.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderIdentityEcho } from '../src/core/echo-line.js';

describe('renderIdentityEcho', () => {
  it('renders the identity pointer alone when nothing else applies', () => {
    expect(renderIdentityEcho({ nodeId: 'requirement/arch-review' })).toBe('▣ [seam] node requirement/arch-review');
  });

  it('omits the progress segment when the frame carries none', () => {
    expect(renderIdentityEcho({ nodeId: 'a/b' })).toBe('▣ [seam] node a/b');
    expect(renderIdentityEcho({ nodeId: 'a/b', progress: '' })).toBe('▣ [seam] node a/b');
  });

  it('renders the progress segment when the frame carries N/M', () => {
    expect(renderIdentityEcho({ nodeId: 'a/b', progress: '3/25' })).toBe('▣ [seam] node a/b · 3/25');
    expect(renderIdentityEcho({ nodeId: 'requirement/scope-entry', progress: '3/25' })).toBe(
      '▣ [seam] node requirement/scope-entry · 3/25',
    );
  });

  it('never renders the benefit graphic, metering deltas, or status flags', () => {
    const line = renderIdentityEcho({ nodeId: 'a/b', progress: '3/25' });
    expect(line).not.toContain('│');
    expect(line).not.toContain('%');
    expect(line).not.toContain('mode');
    expect(line).not.toContain('⚠');
    expect(line).not.toContain('req');
  });

  it('never copies the frame clause (identity pointer only)', () => {
    const line = renderIdentityEcho({ nodeId: 'requirement/arch-review' });
    expect(line).not.toContain('declares');
    expect(line).not.toContain('out of scope');
  });

  it('stays compact for a fully-loaded identity line', () => {
    const line = renderIdentityEcho({ nodeId: 'requirement/arch-review', progress: '25/25' });
    expect(line).toBe('▣ [seam] node requirement/arch-review · 25/25');
    expect(line.length).toBeLessThanOrEqual(140);
  });
});

/**
 * Spec ↔ renderer pin — the canonical format string SHALL stay
 * byte-consistent with the glyph-anchored single-line echo requirement
 * (openspec/specs/graph-fidelity/spec.md). Single home: the renderer's
 * contract is pinned next to the renderer (sdk-slim-round5); the
 * consumer-side spec pin lives in graph-fidelity spec-format-pin.test.ts.
 */
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');
const DELTA_SPEC = resolve(repoRoot, 'openspec/changes/graph-fidelity-r2-suspend/specs/graph-fidelity/spec.md');
const MAIN_SPEC = resolve(repoRoot, 'openspec/specs/graph-fidelity/spec.md');
const CANONICAL = '▣ [seam] node <id> · N/M';

function specText(): string | null {
  const delta = existsSync(DELTA_SPEC) ? readFileSync(DELTA_SPEC, 'utf8') : null;
  if (delta !== null) return delta;
  return existsSync(MAIN_SPEC) ? readFileSync(MAIN_SPEC, 'utf8') : null;
}

describe.skipIf(specText() === null)('Discipline-line format pin (renderer side)', () => {
  it('renderer output equals the spec-declared canonical format byte-for-byte', () => {
    expect(specText()).toContain(CANONICAL);
    expect(renderIdentityEcho({ nodeId: '<id>', progress: 'N/M' })).toBe(CANONICAL);
  });
});
