/**
 * Tests for IEvalCondition type + PhaseSchema eval field.
 *
 * Covers: IEvalCondition shape, PhaseSchema eval parsing (valid/invalid/absent),
 * gate-only ownership (approval + eval rejected), eval action closure (retry/jump only).
 */
import { describe, expect, it } from 'vitest';
import type { IEvalCondition } from '../../src/phase-handler/types.js';
import { PhaseSchema, type Phase } from '../../src/schemas/phase.js';

describe('IEvalCondition', () => {
  it('retry with when + note — no target needed', () => {
    const ec: IEvalCondition = {
      when: 'review output contains FAIL verdict',
      action: 'retry',
      note: 'auto: review found blocking issues',
    };
    expect(ec.when).toBe('review output contains FAIL verdict');
    expect(ec.action).toBe('retry');
    expect(ec.target).toBeUndefined();
    expect(ec.note).toBe('auto: review found blocking issues');
  });

  it('jump with target when specified', () => {
    const ec: IEvalCondition = {
      when: 'review output references scope change',
      action: 'jump',
      target: 'scope-confirm',
    };
    expect(ec.action).toBe('jump');
    expect(ec.target).toBe('scope-confirm');
  });

  it('continue is not expressible on eval conditions (gate is machine retry/jump only)', () => {
    // Type-level check: IEvalCondition.action is 'retry' | 'jump'. A literal
    // 'continue' fails the type — runtime shape test mirrors the schema enum.
    const ec: IEvalCondition = {
      when: 'always',
      // @ts-expect-error — continue removed from eval action closure (gate never auto-approves)
      action: 'continue',
    };
    expect(ec.when).toBe('always');
  });

  it('readonly fields enforced by type', () => {
    const ec: IEvalCondition = {
      when: 'always',
      action: 'retry',
    };
    // TypeScript readonly compile-time check — runtime test for shape only
    expect(ec.when).toBe('always');
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — happy path
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (happy path)', () => {
  it('parses gate phase with eval array', () => {
    const raw = {
      id: 'review-gate',
      type: 'gate',
      dependsOn: ['skill-review'],
      eval: [
        { when: 'review output contains FAIL verdict', action: 'retry', note: 'auto: blocking issues' },
        { when: 'review output contains DEBT marker', action: 'retry', note: 'auto: tech debt' },
      ],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const p: Phase = result.data;
      expect(p.eval).toBeDefined();
      expect(p.eval!).toHaveLength(2);
      expect(p.eval![0].when).toBe('review output contains FAIL verdict');
      expect(p.eval![0].action).toBe('retry');
      expect(p.eval![0].note).toBe('auto: blocking issues');
      expect(p.eval![1].when).toBe('review output contains DEBT marker');
      expect(p.eval![1].action).toBe('retry');
    }
  });

  it('parses eval with jump action + target', () => {
    const raw = {
      id: 'jump-gate',
      type: 'gate',
      eval: [{ when: 'scope changed', action: 'jump', target: 'scope-confirm' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eval![0].target).toBe('scope-confirm');
    }
  });

  it('rejects eval with continue action', () => {
    const raw = {
      id: 'auto-accept',
      type: 'gate',
      eval: [{ when: 'trivial change', action: 'continue', note: 'auto: trivial' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — gate ownership (approval + eval rejected)
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (gate ownership)', () => {
  it('approval phase without eval still parses (eval undefined)', () => {
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
      expect(result.data.eval).toBeUndefined();
    }
  });

  it('approval phase with eval is rejected — dual-authority residue', () => {
    const raw = {
      id: 'review-gate',
      type: 'approval',
      dependsOn: ['skill-review'],
      eval: [{ when: 'review output shows overall: fail', action: 'retry', target: 'skill-write' }],
      routing: {
        actions: [{ action: 'continue', label: 'Accept', description: 'Approve and advance' }],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('main phase does not require eval', () => {
    const raw = {
      id: 'some-main',
      type: 'main',
      task: 'do something inline',
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eval).toBeUndefined();
    }
  });

  it('main phase with eval is rejected', () => {
    const raw = {
      id: 'some-main',
      type: 'main',
      task: 'do something inline',
      eval: [{ when: 'always', action: 'retry', target: 'x' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('gate phase without eval is rejected — eval required', () => {
    const raw = {
      id: 'empty-gate',
      type: 'gate',
      dependsOn: ['review'],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('gate phase rejects forbidden fields (task/preText/routing/channels/agent/skill/use)', () => {
    for (const forbidden of [
      { task: 'x' },
      { preText: 'x' },
      { routing: { actions: [{ action: 'continue', label: 'A', description: 'd' }] } },
      { channels: ['node:review'] },
      { agent: ['reviewer'] },
      { skill: 'code-review' },
      { use: 'other-graph' },
    ]) {
      const raw = {
        id: 'closed-gate',
        type: 'gate',
        eval: [{ when: 'always', action: 'retry', target: 'w' }],
        ...forbidden,
      };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — invalid input
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (invalid input)', () => {
  it('rejects eval with missing when', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      eval: [{ action: 'retry' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval with invalid action', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      eval: [{ when: 'always', action: 'invalid' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval when not an array', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      eval: { when: 'always', action: 'retry' },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval with empty when string', () => {
    const raw = {
      id: 'bad-gate',
      type: 'gate',
      eval: [{ when: '', action: 'retry' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});
