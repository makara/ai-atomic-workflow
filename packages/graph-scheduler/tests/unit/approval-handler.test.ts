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

  it('value — stable machine identifier for downstream gate conditions (branch-routing redesign)', () => {
    const act: IApprovalAction = {
      action: 'continue',
      value: 'accept',
      label: 'Accept',
      description: 'Approve and advance',
    };
    expect(act.value).toBe('accept');
  });

  it('IApprovalAction carries no default field — recommendation is AI-side (route-first)', () => {
    const act: IApprovalAction = {
      action: 'continue',
      value: 'accept',
      label: 'Accept',
      description: 'Approve and advance',
    };
    // 'default' was removed from the action contract (no written default — the
    // AI recommendation is the default); manual mode presents the full card
    expect(act).not.toHaveProperty('default');
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
// Approval routingActions — branch-route scenario only (route-first)
// ---------------------------------------------------------------------------

describe('approval routingActions', () => {
  it('undeclared approval carries NO written actions — card = Accept + free input + AI options', async () => {
    const { approvalPhaseHandler } = await import('../../src/phase-handler/approval-handler.js');
    const phase = { id: 'p1', type: 'approval' as const, dependsOn: ['up'] };
    const nd = approvalPhaseHandler.extendNodeDetail(
      {
        nodeId: 'p1',
        type: 'approval',
        handlerSkill: 'atom-phase-handler',
        constraints: [],
        runMode: 'manual',
        retryAttempt: 0,
      },
      phase,
      { status: 'active', retryCount: 0 },
    );
    expect(nd.routingActions).toBeUndefined();
  });

  it('declared branch-route actions pass through verbatim', async () => {
    const { approvalPhaseHandler } = await import('../../src/phase-handler/approval-handler.js');
    const phase = {
      id: 'p1',
      type: 'approval' as const,
      dependsOn: ['up'],
      routing: {
        actions: [
          {
            action: 'continue' as const,
            target: 'minimal-track',
            value: 'minimal',
            label: 'Minimal',
            description: 'd',
          },
          {
            action: 'continue' as const,
            target: 'detailed-track',
            value: 'detailed',
            label: 'Detailed',
            description: 'd',
          },
        ],
      },
    };
    const nd = approvalPhaseHandler.extendNodeDetail(
      {
        nodeId: 'p1',
        type: 'approval',
        handlerSkill: 'atom-phase-handler',
        constraints: [],
        runMode: 'manual',
        retryAttempt: 0,
      },
      phase,
      { status: 'active', retryCount: 0 },
    );
    expect(nd.routingActions).toHaveLength(2);
    expect(nd.routingActions?.[0].action).toBe('continue');
    expect(nd.routingActions?.[0].target).toBe('minimal-track');
  });
});

// ---------------------------------------------------------------------------
// extendNodeDetail — topic from task first line + field surface
// ---------------------------------------------------------------------------

describe('approvalPhaseHandler.extendNodeDetail', () => {
  const base = {
    nodeId: 'approval-node',
    type: 'approval',
    handlerSkill: 'atom-phase-handler',
    skill: 'atom-phase-handler',
    constraints: [],
    runMode: 'manual' as const,
    retryAttempt: 0,
  };
  const nodeState = {
    status: 'active',
    retryCount: 0,
    startedAt: undefined,
    completedAt: undefined,
    durationMs: undefined,
  };

  it('derives topic from the task first line', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide now\nCard body follows.' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.topic).toBe('Decide now');
  });

  it('falls back to Decision Required when task absent', async () => {
    const phase = { id: 'a', type: 'approval' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.topic).toBe('Decision Required');
  });

  it('passes node: channels through — judgment context', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', channels: ['node:review/arch-review'] } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result.channels).toEqual(['node:review/arch-review']);
  });

  it('never emits preText on NodeDetail — removed field', async () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide' } as Phase;
    const result = (await import('../../src/phase-handler/approval-handler.js')).approvalPhaseHandler.extendNodeDetail(
      base,
      phase,
      nodeState,
    );
    expect(result).not.toHaveProperty('preText');
  });
});

describe('field-type contract — mis-typed fields rejected at parse time', () => {
  it('accepts approval phase with node: channels — judgment context', () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', channels: ['node:some-node'] };
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(true);
  });

  it('rejects approval phase with non-node channel entry', () => {
    const phase = { id: 'a', type: 'approval', task: 'Decide', channels: ['some-node'] };
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('approval');
    expect(messages).toContain("must be 'node:<id>'");
  });

  it('rejects any phase declaring preText — removed field (schema field convergence)', () => {
    const phase = { id: 'a', type: 'main', task: 'do it', preText: 'custom pre-call text' };
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain("'preText' is removed");
  });

  it('accepts approval with node: channels and main with channels — one mechanism per type', () => {
    expect(PhaseSchema.safeParse({ id: 'a', type: 'approval', task: 'Decide', channels: ['node:x'] }).success).toBe(
      true,
    );
    expect(
      PhaseSchema.safeParse({ id: 'a', type: 'main', task: 'do it', channels: ['skill:atom-graph-spec'] }).success,
    ).toBe(true);
  });

  it('tolerates default: true markers on multiple actions — at-most-one-default rule removed (route-first)', () => {
    const phase = {
      id: 'a',
      type: 'approval',
      task: 'Decide',
      routing: {
        actions: [
          { action: 'continue', default: true, label: 'Accept', description: 'Go' },
          { action: 'retry', default: true, target: 'w', label: 'Retry', description: 'Fix' },
        ],
      },
    };
    // 'default' was removed from the routing-action contract (route-first:
    // no written default — the AI recommendation is the default). The field
    // is stripped by the schema, never an error.
    const result = PhaseSchema.safeParse(phase);
    expect(result.success).toBe(true);
  });

  it('accepts approval with exactly one default: true action', () => {
    const phase = {
      id: 'a',
      type: 'approval',
      task: 'Decide',
      routing: {
        actions: [
          { action: 'continue', value: 'accept', default: true, label: 'Accept', description: 'Go' },
          { action: 'retry', value: 'revise', target: 'w', label: 'Retry', description: 'Fix' },
        ],
      },
    };
    expect(PhaseSchema.safeParse(phase).success).toBe(true);
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
