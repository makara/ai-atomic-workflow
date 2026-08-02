/**
 * Tests for IEvalCondition type + PhaseSchema eval field.
 *
 * Covers: IEvalCondition shape, PhaseSchema eval parsing (valid/invalid/absent),
 * backward compat (eval optional), invalid input rejection.
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

  it('continue with when only — minimal valid condition', () => {
    const ec: IEvalCondition = {
      when: 'review output is clean',
      action: 'continue',
    };
    expect(ec.action).toBe('continue');
    expect(ec.target).toBeUndefined();
    expect(ec.note).toBeUndefined();
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

  it('readonly fields enforced by type', () => {
    const ec: IEvalCondition = {
      when: 'always',
      action: 'continue',
    };
    // TypeScript readonly compile-time check — runtime test for shape only
    expect(ec.when).toBe('always');
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — happy path
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (happy path)', () => {
  it('parses approval phase with eval array', () => {
    const raw = {
      id: 'review-gate',
      type: 'approval',
      dependsOn: ['skill-review'],
      eval: [
        { when: 'review output contains FAIL verdict', action: 'retry', note: 'auto: blocking issues' },
        { when: 'review output contains DEBT marker', action: 'retry', note: 'auto: tech debt' },
      ],
      routing: {
        actions: [{ action: 'continue', label: 'Accept', description: 'Approve and advance' }],
      },
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
      type: 'approval',
      eval: [{ when: 'scope changed', action: 'jump', target: 'scope-confirm' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eval![0].target).toBe('scope-confirm');
    }
  });

  it('parses eval with continue action', () => {
    const raw = {
      id: 'auto-accept',
      type: 'approval',
      eval: [{ when: 'trivial change', action: 'continue', note: 'auto: trivial' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.eval![0].action).toBe('continue');
    }
  });
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — optional (backward compatible)
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (backward compatible)', () => {
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
});

// ---------------------------------------------------------------------------
// PhaseSchema eval field — invalid input
// ---------------------------------------------------------------------------

describe('PhaseSchema — eval field (invalid input)', () => {
  it('rejects eval with missing when', () => {
    const raw = {
      id: 'bad-gate',
      type: 'approval',
      eval: [{ action: 'retry' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval with invalid action', () => {
    const raw = {
      id: 'bad-gate',
      type: 'approval',
      eval: [{ when: 'always', action: 'invalid' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval when not an array', () => {
    const raw = {
      id: 'bad-gate',
      type: 'approval',
      eval: { when: 'always', action: 'retry' },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects eval with empty when string', () => {
    const raw = {
      id: 'bad-gate',
      type: 'approval',
      eval: [{ when: '', action: 'retry' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});
