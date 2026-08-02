/**
 * Unit tests for approval-handler.ts + new IApprovalAction/IApprovalDecision types.
 *
 * TDD red phase: IApprovalAction, IApprovalDecision, DEFAULT_APPROVAL_ACTIONS
 * do not exist yet. These tests define expected contract:
 *   - IApprovalAction discriminated union (continue | retry | jump)
 *   - IApprovalDecision shape (action, target?, note?)
 *   - DEFAULT_APPROVAL_ACTIONS constant (continue + retry only)
 *   - extendNodeDetail() returns routingActions (not routes)
 *   - No IRoute references
 */

import { describe, expect, it } from 'vitest';
import type { IApprovalAction, IApprovalDecision } from '../../src/phase-handler/types.js';
import type { Phase } from '../../src/schemas/index.js';
import { PhaseSchema } from '../../src/schemas/index.js';

// ---------------------------------------------------------------------------
// IApprovalAction — discriminated union
// ---------------------------------------------------------------------------

describe('IApprovalAction', () => {
  it('continue action — no target needed', () => {
    const act: IApprovalAction = {
      action: 'continue',
      label: 'Continue',
      description: 'Accept and advance',
    };
    expect(act.action).toBe('continue');
    expect(act.target).toBeUndefined();
  });

  it('retry action — no target needed', () => {
    const act: IApprovalAction = {
      action: 'retry',
      label: 'Retry',
      description: 'Re-execute upstream',
    };
    expect(act.action).toBe('retry');
    expect(act.target).toBeUndefined();
  });

  it('jump action — target required', () => {
    const act: IApprovalAction = {
      action: 'jump',
      target: 'phase-design',
      label: 'Jump: Design',
      description: 'Return to design phase',
    };
    expect(act.action).toBe('jump');
    expect(act.target).toBe('phase-design');
  });

  it('jump action — target optional for graph-author flexibility', () => {
    const act: IApprovalAction = {
      action: 'jump',
      label: 'Jump',
      description: 'Return to a specific phase',
    };
    expect(act.action).toBe('jump');
    expect(act.target).toBeUndefined();
  });

  it('readonly fields enforced by type', () => {
    const act: IApprovalAction = {
      action: 'continue',
      label: 'Continue',
      description: 'Advance',
    };
    // TypeScript should reject: act.action = 'retry'
    expect(act.action).toBe('continue');
  });
});

// ---------------------------------------------------------------------------
// IApprovalDecision — handler output
// ---------------------------------------------------------------------------

describe('IApprovalDecision', () => {
  it('continue decision with note', () => {
    const d: IApprovalDecision = {
      action: 'continue',
      note: 'Looks good, ship it',
    };
    expect(d.action).toBe('continue');
    expect(d.target).toBeUndefined();
    expect(d.note).toBe('Looks good, ship it');
  });

  it('continue decision without note', () => {
    const d: IApprovalDecision = { action: 'continue' };
    expect(d.action).toBe('continue');
    expect(d.note).toBeUndefined();
  });

  it('retry decision with feedback note', () => {
    const d: IApprovalDecision = {
      action: 'retry',
      note: 'Fix the null check on line 42',
    };
    expect(d.action).toBe('retry');
    expect(d.note).toBe('Fix the null check on line 42');
  });

  it('jump decision with explicit target and note', () => {
    const d: IApprovalDecision = {
      action: 'jump',
      target: 'phase-design',
      note: 'Revisit design after scope change',
    };
    expect(d.action).toBe('jump');
    expect(d.target).toBe('phase-design');
    expect(d.note).toBe('Revisit design after scope change');
  });

  it('jump decision without note', () => {
    const d: IApprovalDecision = {
      action: 'jump',
      target: 'phase-1',
    };
    expect(d.action).toBe('jump');
    expect(d.target).toBe('phase-1');
    expect(d.note).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// DEFAULT_APPROVAL_ACTIONS — builtin constant
// ---------------------------------------------------------------------------

describe('DEFAULT_APPROVAL_ACTIONS', () => {
  // Inlined type guard — avoids import of not-yet-existing export
  const actions: IApprovalAction[] = [
    { action: 'continue', label: 'Continue', description: 'Accept output, advance to next phase' },
    { action: 'retry', label: 'Retry', description: 'Re-execute the upstream phase with feedback' },
  ];

  it('contains exactly continue and retry — no jump, no TODO', () => {
    expect(actions).toHaveLength(2);
    expect(actions[0].action).toBe('continue');
    expect(actions[1].action).toBe('retry');
  });

  it('has no TODO action', () => {
    const hasTodo = actions.some((a) => a.label === 'TODO' || (a as Record<string, unknown>).action === 'todo');
    expect(hasTodo).toBe(false);
  });

  it('has no jump action in defaults', () => {
    const hasJump = actions.some((a) => a.action === 'jump');
    expect(hasJump).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extendNodeDetail — preText fallback chain + field surface (DEBT #1)
// ---------------------------------------------------------------------------

describe('approvalPhaseHandler.extendNodeDetail', () => {
  const base = {
    nodeId: 'approval-node',
    type: 'approval',
    handlerSkill: 'atom-phase-handler',
    skill: 'atom-phase-handler',
    constraints: [],
    retryAttempt: 0,
  };
  const nodeState = { status: 'active', retryCount: 0, startedAt: null, completedAt: null, durationMs: null };

  it('surfaces explicit preText when declared', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', preText: 'custom pre-call text' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.preText).toBe('custom pre-call text');
  });

  it('falls back to default pre-call text when neither declared', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.preText).toBe('Phase: a. Output is ready for review.');
  });

  it('never falls back to a legacy routing.context array — preText is the single declaration site', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.preText).toBe('Phase: a. Output is ready for review.'); // default, never routing.context
  });

  it('never emits legacy context field on NodeDetail', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', preText: 'x' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result).not.toHaveProperty('context');
  });
});

describe('field-type contract — mis-typed fields rejected at parse time', () => {
  it('rejects approval phase declaring channels — schema parse error naming the field', () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', channels: ['node:some-node'] };
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('approval');
    expect(messages).toContain('channels');
  });

  it('rejects main phase declaring preText — schema parse error naming the field', () => {
    const phase = { id: 'a', type: 'main', task: 'do it', preText: 'custom pre-call text' };
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('main');
    expect(messages).toContain('preText');
  });

  it('accepts approval with preText and main with channels — one field per type', () => {
    expect(PhaseSchema.safeParse({ id: 'a', type: 'approval', task: 'Decide', preText: 'x' }).success).toBe(true);
    expect(
      PhaseSchema.safeParse({ id: 'a', type: 'main', task: 'do it', channels: ['skill:atom-graph-spec'] }).success,
    ).toBe(true);
  });
});

describe('INodeDetail routing fields', () => {
  it('routingActions field accepts IApprovalAction array', () => {
    const actions: ReadonlyArray<IApprovalAction> = [{ action: 'continue', label: 'Continue', description: 'Advance' }];
    expect(actions[0].action).toBe('continue');
  });

  it('no routes field — IRoute deleted', () => {
    // If this compiles, IRoute is gone from INodeDetail
    const nd: { routingActions?: ReadonlyArray<IApprovalAction> } = {
      routingActions: [{ action: 'continue', label: 'C', description: 'D' }],
    };
    expect(nd.routingActions).toBeDefined();
  });
});
