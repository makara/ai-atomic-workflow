/**
 * atom-scope-interview v2.0 callee contract - the skill body
 * carries zero caller knowledge: no graph names, no per-graph output
 * tables, no caller-identity rules. The caller contract (Topics / Output
 * fields / Behavior) is declared, interview mechanics delegated to
 * atom-kernel interview() consensus.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const skill = readFileSync(resolve(__dirname, '../skills/atom-scope-interview/SKILL.md'), 'utf-8');

describe('atom-scope-interview v2.0 callee contract', () => {
  it('carries zero graph names', () => {
    for (const graph of [
      'arch-review',
      'arch-review-loop',
      'graph-generate',
      'adopt-with-docs',
      'doc-update',
      'doc-sync',
    ]) {
      expect(skill).not.toMatch(graph);
    }
  });

  it('carries no caller-identity rules', () => {
    expect(skill).not.toMatch(/Graph dispatch override/);
    expect(skill).not.toMatch(/when this skill runs as a graph phase/);
  });

  it('declares the caller contract', () => {
    expect(skill).toMatch(/Topics:/);
    expect(skill).toMatch(/Output contract:/);
    expect(skill).toMatch(/Behavior:/);
    expect(skill).toMatch(/confirm: mandatory/);
    expect(skill).toMatch(/output path: user_owned/);
    expect(skill).toMatch(/dual-name check/);
    // three-tier channel model: CONTEXT.md lookup = convention semantics —
    // default-loaded + absence-tolerant (no `context: required` failure mode)
    expect(skill).toMatch(/context: convention/);
    expect(skill).not.toMatch(/context: required/);
  });

  it('delegates interview mechanics - no restatement, no solve mode', () => {
    expect(skill).toMatch(/interview\(\) per atom-kernel over Topics \(confirmation contract\)/);
    expect(skill).toMatch(/participation: as-needed/);
    expect(skill).not.toMatch(/solve mode/);
    expect(skill).not.toMatch(/one question per turn/);
    expect(skill).not.toMatch(/zero-question degradation/);
  });

  it('supports classification-only mode', () => {
    expect(skill).toMatch(/Absent or empty -> classification-only mode - no interview, no questions/);
  });
});
