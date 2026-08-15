/**
 * Drift guard for the derived JSON Schema artifact.
 *
 * The zod WorkflowSchema is the single source of truth; the committed
 * `schemas/workflow.schema.json` must equal the zod-derived output —
 * a mismatch means the artifact was hand-edited or the source changed
 * without regeneration (dual-write drift).
 *
 * Comparison is prettier-normalized on both sides: the generation channel
 * (scripts/schema-gen.ts) writes the prettier-formatted artifact, and the
 * committed file is prettier-formatted by repo-wide formatting — formatting
 * differences alone never fail the guard; content drift always does.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import prettier from 'prettier';
import { describe, expect, it } from 'vitest';
import { workflowJsonSchema } from '../../src/schemas/workflow.js';

/** Normalize a JSON document with the repo prettier config (parser: json). */
function normalize(json: string): Promise<string> {
  // filepath anchors .prettierrc resolution — same config the generation
  // channel uses and the repo-wide `prettier --write` applies.
  return prettier.format(json, {
    parser: 'json',
    filepath: join(__dirname, '..', '..', 'schemas', 'workflow.schema.json'),
  });
}

describe('workflow.schema.json — derived artifact drift guard', () => {
  it('matches the zod-derived JSON Schema (draft 2020-12, no dual-write)', async () => {
    const committed = readFileSync(join(__dirname, '..', '..', 'schemas', 'workflow.schema.json'), 'utf-8');
    const derived = await normalize(JSON.stringify(workflowJsonSchema(), null, 2) + '\n');
    expect(derived).toBe(committed);
  });

  it('declares the draft 2020-12 dialect', () => {
    const committed = readFileSync(join(__dirname, '..', '..', 'schemas', 'workflow.schema.json'), 'utf-8');
    expect(committed).toContain('https://json-schema.org/draft/2020-12/schema');
  });
});
