/**
 * Spec-format pin — the graph-fidelity delta spec's discipline-line format
 * string must be a live contract: the exact inline format appears verbatim
 * in the spec, and a rendered echo line matches the frame-contract pin
 * (test/frame-contract.test.ts) byte-for-byte in shape.
 *
 * Skip-aware: the delta spec lives under openspec/changes/ and moves on
 * archive — the pin then skips (the format is preserved in the main spec
 * after sync, pinned by frame-contract.test.ts) instead of failing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderDisciplineLine } from '../src/core/discipline.js';

const SPEC_PATH = resolve(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../openspec/specs/graph-fidelity/spec.md',
);

/** Canonical inline format — must match the spec text AND the pin regex. */
const CANONICAL_FORMAT = '[seam] node <id> declares <operations> · out of scope: <list> — per run frame';

const FRAME_PIN = /^\[seam\] node [\w\-/]+ declares \[[^\]]*\] · out of scope: <[^>]*> — per run frame$/;

const FRAME = `## Run Frame
Run ebb5c6aa · node requirement/arch-review · type main · task: Execute architecture review.
declared operations [locate, read, write, review] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.`;

const specPresent = existsSync(SPEC_PATH);

describe.skipIf(!specPresent)('spec-format pin', () => {
  it('spec carries the canonical inline format verbatim', () => {
    const spec = readFileSync(SPEC_PATH, 'utf8');
    expect(spec).toContain(CANONICAL_FORMAT);
  });

  it('rendered echo line matches the frame-contract pin shape', () => {
    const line = renderDisciplineLine([FRAME]);
    expect(line).toBeDefined();
    expect(line).toMatch(FRAME_PIN);
  });

  it('spec uses the unified renderDisciplineLine spelling', () => {
    const spec = readFileSync(SPEC_PATH, 'utf8');
    expect(spec).toContain('renderDisciplineLine');
  });
});
