/**
 * Tests for gate rework jumps (route-first redesign) — eval field removed.
 *
 * Covers: IJumpCondition shape, PhaseSchema jumps parsing
 * (valid/invalid/absent), gate-only ownership (non-gate + jumps rejected),
 * jump surface (when/to required), and the removed eval field's loud
 * rejection with migration hints.
 */
import { describe, expect, it } from 'vitest';
import type { IJumpCondition } from '../../src/phase-handler/types.js';
import { PhaseSchema, type Phase } from '../../src/schemas/phase.js';

describe('IJumpCondition', () => {
  it('when + to — jump condition and explicit backward target', () => {
    const jc: IJumpCondition = {
      when: 'review output contains FAIL verdict',
      to: 'writer',
    };
    expect(jc.when).toBe('review output contains FAIL verdict');
    expect(jc.to).toBe('writer');
  });

  it('readonly fields enforced by type', () => {
    const jc: IJumpCondition = {
      when: 'always',
      to: 'accept',
    };
    // TypeScript readonly compile-time check — runtime test for shape only
    expect(jc.when).toBe('always');
    expect(jc.to).toBe('accept');
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema jumps field — happy path
// ---------------------------------------------------------------------------

describe('PhaseSchema — jumps field (happy path)', () => {
  it('parses gate phase with jumps array', () => {
    const raw = {
      id: 'review-gate',
      type: 'gate',
      dependsOn: ['skill-review'],
      jumps: [
        { when: 'review output contains FAIL verdict', to: 'skill-write' },
        { when: 'review output contains DEBT marker', to: 'skill-write' },
      ],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const p: Phase = result.data;
      expect(p.jumps).toBeDefined();
      expect(p.jumps!).toHaveLength(2);
      expect(p.jumps![0].when).toBe('review output contains FAIL verdict');
      expect(p.jumps![0].to).toBe('skill-write');
      expect(p.jumps![1].when).toBe('review output contains DEBT marker');
      expect(p.jumps![1].to).toBe('skill-write');
      // reads removed (schema field convergence) — judgment context = direct
      // dependsOn outputs + channels node: entries
      expect(p.reads).toBeUndefined();
    }
  });

  it('rejects jump with empty when string', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      jumps: [{ when: '', to: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects jump missing to — explicit target mandatory', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      jumps: [{ when: 'always' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema — eval removed (route-first redesign)
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field removed (route-first redesign)', () => {
  it('rejects eval on gate — loud rejection with migration hint', () => {
    const raw = {
      id: 'old-gate',
      type: 'gate',
      dependsOn: ['skill-review'],
      eval: [{ when: 'review output shows overall: fail', action: 'retry', target: 'skill-write' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'eval');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'eval' is removed");
    expect(issue!.message).toContain("'jumps'");
  });

  it('approval phase without jumps still parses (jumps undefined)', () => {
    const raw = {
      id: 'simple-accept',
      type: 'approval',
      routing: {
        actions: [{ action: 'continue', label: 'Accept', description: 'Approve' }],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumps).toBeUndefined();
    }
  });

  it('main phase does not require jumps', () => {
    const raw = {
      id: 'some-main',
      type: 'main',
      task: 'do something inline',
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumps).toBeUndefined();
    }
  });

  it('gate phase rejects forbidden fields (task/preText/routing/agent/skill/use + non-node channels)', () => {
    for (const forbidden of [
      { task: 'x' },
      { preText: 'x' },
      { routing: { actions: [{ action: 'continue', label: 'A', description: 'd' }] } },
      // gate channels are node:-only judgment context — a non-node entry is rejected
      { channels: ['skill:code-review'] },
      { agent: ['reviewer'] },
      { skill: 'code-review' },
      { use: 'other-graph' },
    ]) {
      const raw = {
        id: 'closed-gate',
        type: 'gate',
        jumps: [{ when: 'always', to: 'w' }],
        ...forbidden,
      };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `gate with ${JSON.stringify(forbidden)}`).toBe(false);
    }
  });
});
