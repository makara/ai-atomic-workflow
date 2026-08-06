/**
 * Unit tests for PhaseSchema — zod schema for a single phase/node definition.
 *
 * Covers: closed type enum (main/approval/gate/flow), removed fields (older
 * removals retry/def/with/maxDepth/topic/context/constraints/runMode —
 * silently stripped; when/eval — rejected loudly), flow use requirement,
 * type-semantics superRefine (single enforcement point), gate jumps, and the
 * removed end node type.
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema, type Phase } from '../../src/schemas/phase.js';

// ---------------------------------------------------------------------------
// Happy path — main and approval type with complete fields
// ---------------------------------------------------------------------------

describe('PhaseSchema — happy path', () => {
  it('parses main type with all fields', () => {
    const raw = {
      id: 'agent-a',
      type: 'main',
      dependsOn: ['phase-0'],
      agent: ['reviewer', 'task'],
      skill: 'my-agent',
      task: 'Run analysis task',
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const p: Phase = result.data;
      expect(p.id).toBe('agent-a');
      expect(p.type).toBe('main');
      expect(p.dependsOn).toEqual(['phase-0']);
      expect(p.agent).toEqual(['reviewer', 'task']);
      expect(p.skill).toBe('my-agent');
      expect(p.task).toBe('Run analysis task');
    }
  });

  it('rejects URI-form skill value (platform decoupling convention)', () => {
    const raw = {
      id: 'agent-a',
      type: 'main',
      skill: 'skill://my-agent',
      task: 'Run analysis task',
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'skill');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('plain skill name');
    }
  });

  it('parses approval type with complete fields', () => {
    const raw = {
      id: 'approval-step',
      type: 'approval',
      dependsOn: ['agent-a', 'agent-b'],
      task: 'Review the output and decide',
      routing: { actions: [{ action: 'continue', label: 'Go', description: 'Advance' }] },
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('approval');
      expect(result.data.dependsOn).toHaveLength(2);
    }
  });

  it('parses minimal phase — only id + type', () => {
    const raw = { id: 'step-1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('step-1');
      expect(result.data.type).toBe('main');
      expect(result.data.dependsOn).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

describe('PhaseSchema — invalid input', () => {
  it('rejects unknown type string — closed enum', () => {
    const raw = { id: 'p1', type: 'unknown' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects removed agent type', () => {
    const raw = { id: 'p1', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects type that is not a string', () => {
    const raw = { id: 'p1', type: 42 };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const raw = { type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects id that is not a string', () => {
    const raw = { id: null, type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn that is not an array', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: 'phase-0' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn containing non-string elements', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: ['valid', 42] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(PhaseSchema.safeParse('hello').success).toBe(false);
    expect(PhaseSchema.safeParse(123).success).toBe(false);
    expect(PhaseSchema.safeParse(null).success).toBe(false);
    expect(PhaseSchema.safeParse(undefined).success).toBe(false);
    expect(PhaseSchema.safeParse([]).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Removed fields — older removals stripped silently (zod drops unknown keys);
// when/eval keep loud rejection (when-guard describe + eval in type semantics)
// ---------------------------------------------------------------------------

describe('PhaseSchema — removed fields stripped silently', () => {
  it('strips retry — no retry config surface', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', retry: { max: 3 } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('retry' in result.data).toBe(false);
    }
  });

  it('strips topic — approval title comes from task', () => {
    const raw = { id: 'approval-1', type: 'approval', topic: 'My Topic' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('topic' in result.data).toBe(false);
    }
  });

  it('strips legacy context field', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', context: ['legacy'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('context' in result.data).toBe(false);
    }
  });

  it('strips flow with/maxDepth/def — flow requires use only', () => {
    const raw = { id: 'f1', type: 'flow', use: 'child', with: { k: 'v' }, maxDepth: 3, def: { phases: [] } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('with' in result.data).toBe(false);
      expect('maxDepth' in result.data).toBe(false);
      expect('def' in result.data).toBe(false);
    }
  });

  it('strips routing.context', () => {
    const raw = {
      id: 'approval-1',
      type: 'approval',
      routing: { actions: [{ action: 'continue', label: 'Go', description: 'Advance' }], context: ['legacy'] },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('context' in result.data.routing!).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Type-semantics superRefine — single enforcement point
// ---------------------------------------------------------------------------

describe('PhaseSchema — type semantics', () => {
  it('rejects preText on main type', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', preText: 'card text' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts node: channels on approval type — judgment context', () => {
    const raw = { id: 'approval-1', type: 'approval', channels: ['node:review'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts non-node channel entries on approval type — full-type inheritance (node:-only repealed)', () => {
    const raw = { id: 'approval-1', type: 'approval', channels: ['skill:atom-graph-spec', './judgment.md', 'review'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts non-node channel entries on gate type — full-type inheritance (node:-only repealed)', () => {
    const raw = { id: 'g1', type: 'gate', channels: ['skill:atom-graph-spec'], jumps: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('accepts node: channels on gate type', () => {
    const raw = { id: 'g1', type: 'gate', channels: ['node:loop-entry'], jumps: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects agent hints on approval type', () => {
    const raw = { id: 'approval-1', type: 'approval', agent: ['reviewer', 'task'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const messages = result.error!.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('approval');
    expect(messages).toContain('agent');
  });

  it('rejects eval on main type — removed field (route-first redesign), loud rejection', () => {
    const raw = {
      id: 'p1',
      type: 'main',
      task: 'x',
      eval: [{ when: 'x', action: 'retry', target: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'eval');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'eval' is removed");
    expect(issue!.message).toContain("'jumps'");
  });

  it('rejects eval on approval type — removed field (route-first redesign)', () => {
    const raw = {
      id: 'a1',
      type: 'approval',
      eval: [{ when: 'x', action: 'retry', target: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'eval')).toBe(true);
  });

  it('accepts gate type with jumps', () => {
    const raw = {
      id: 'g1',
      type: 'gate',
      dependsOn: ['review'],
      jumps: [{ when: 'x', to: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects gate type without jumps — silent pass-through unexpressible', () => {
    const raw = { id: 'g1', type: 'gate', dependsOn: ['review'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'jumps')).toBe(true);
  });

  it('rejects gate type with empty jumps array', () => {
    const raw = { id: 'g1', type: 'gate', dependsOn: ['review'], jumps: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'jumps')).toBe(true);
  });

  it('rejects gate type with task field — closed field surface', () => {
    const raw = {
      id: 'g1',
      type: 'gate',
      dependsOn: ['review'],
      jumps: [{ when: 'x', to: 'w' }],
      task: 'x',
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'task')).toBe(true);
  });

  it('rejects branches on any type — removed field (route-first redesign)', () => {
    for (const type of ['main', 'approval', 'flow'] as const) {
      const raw = {
        id: 'p1',
        type,
        branches: [{ when: 'x', to: 'w' }],
        ...(type === 'flow' ? { use: 'child' } : {}),
      };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${type} with branches`).toBe(false);
      expect(result.error!.issues.some((i) => i.path.join('.') === 'branches')).toBe(true);
    }
  });

  it('rejects default/mode on any type — removed fields (route-first redesign)', () => {
    for (const type of ['main', 'approval', 'flow'] as const) {
      const raw = { id: 'p1', type, default: 'x', mode: 'exclusive', ...(type === 'flow' ? { use: 'child' } : {}) };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${type} with default/mode`).toBe(false);
    }
  });

  it('rejects reads on main/flow — judgment context is gate/approval-only', () => {
    for (const type of ['main', 'flow'] as const) {
      const raw = { id: 'p1', type, reads: ['up'], ...(type === 'flow' ? { use: 'child' } : {}) };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${type} with reads`).toBe(false);
      expect(result.error!.issues.some((i) => i.path.join('.') === 'reads')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('PhaseSchema — boundary', () => {
  it('allows empty dependsOn array', () => {
    const raw = { id: 'p1', type: 'main', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
    }
  });

  it('allows absent skill field', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skill).toBeUndefined();
    }
  });

  it('allows empty string id', () => {
    // zod string() allows empty strings by default — no min(1) constraint
    const raw = { id: '', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// join mode + when guard
// ---------------------------------------------------------------------------

describe('PhaseSchema — join mode (presence means any)', () => {
  it('rejects explicit join: "all" — redundant default (presence means any)', () => {
    const raw = { id: 'p1', type: 'main', join: 'all' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'join');
    expect(issue).toBeDefined();
  });

  it('parses join: "any"', () => {
    const raw = { id: 'p1', type: 'main', join: 'any' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('any');
    }
  });

  it('join absent stays undefined — consumption defaults to all (topology)', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBeUndefined();
    }
  });

  it('rejects invalid join value', () => {
    const raw = { id: 'p1', type: 'main', join: 'none' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects join that is not a string', () => {
    const raw = { id: 'p1', type: 'main', join: 42 };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe('PhaseSchema — when guard removed (route-first redesign)', () => {
  it('rejects when with migration hint — conditional behavior expresses via gate jumps', () => {
    const raw = { id: 'p1', type: 'main', when: 'upstream output indicates skip' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'when');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'when' is removed");
    expect(issue!.message).toContain('route-first redesign');
    expect(issue!.message).toContain("'jumps'");
  });

  it('allows absent when field', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBeUndefined();
    }
  });

  it('rejects when on gate too — when is never declarable', () => {
    const raw = { id: 'g1', type: 'gate', jumps: [{ when: 'x', to: 'n2' }], when: 'legacy guard' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'when')).toBe(true);
  });
});

describe('PhaseSchema — constraints/runMode removed fields, loud rejection', () => {
  it('rejects constraints with migration hint — project constraints load via $load-constraints', () => {
    const raw = { id: 'p1', type: 'main', constraints: ['no git operations'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'constraints');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'constraints' is removed");
    expect(issue!.message).toContain('$load-constraints');
  });

  it('rejects runMode with migration hint — run mode is decided by $run-mode-confirm', () => {
    const raw = { id: 'p1', type: 'main', runMode: 'auto' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'runMode');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'runMode' is removed");
    expect(issue!.message).toContain('$run-mode-confirm');
  });

  it('rejects both fields on any type — loud rejection, never silent strip', () => {
    for (const type of ['main', 'approval', 'flow'] as const) {
      const raw = {
        id: 'p1',
        type,
        constraints: ['x'],
        runMode: 'auto',
        ...(type === 'flow' ? { use: 'child' } : {}),
      };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${type} with constraints/runMode`).toBe(false);
      expect(result.error!.issues.some((i) => i.path.join('.') === 'constraints')).toBe(true);
      expect(result.error!.issues.some((i) => i.path.join('.') === 'runMode')).toBe(true);
    }
  });

  it('allows absent constraints/runMode fields', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.constraints).toBeUndefined();
      expect(result.data.runMode).toBeUndefined();
    }
  });
});

describe('PhaseSchema — activation prologue reserved ids', () => {
  it('accepts $run-mode-confirm and $load-constraints declarations (override)', () => {
    for (const id of ['$run-mode-confirm', '$load-constraints']) {
      const raw = { id, type: 'main', task: 'custom protocol' };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${id} should be declarable`).toBe(true);
    }
  });

  it('rejects any other $-prefixed id — reserved prefix', () => {
    for (const id of ['$lang-confirm', '$foo', '$run-mode-confirm-extra']) {
      const raw = { id, type: 'main', task: 'x' };
      const result = PhaseSchema.safeParse(raw);
      expect(result.success, `${id} should be rejected`).toBe(false);
      const issue = result.error!.issues.find((i) => i.path.join('.') === 'id');
      expect(issue).toBeDefined();
      expect(issue!.message).toContain("'$' prefix is reserved");
    }
  });

  it('rejects reserved-id declarations with upstream dependencies — must be entry phases', () => {
    const raw = { id: '$load-constraints', type: 'main', dependsOn: ['other'], task: 'x' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'dependsOn');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('entry phases');
  });
});

// ---------------------------------------------------------------------------
// flow phase type — use required
// ---------------------------------------------------------------------------

describe('PhaseSchema — flow phase type', () => {
  it('parses flow type with use field', () => {
    const raw = { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.use).toBe('skill-create');
    }
  });

  it('rejects flow type without use — def removed, use mandatory', () => {
    const raw = { id: 'bad', type: 'flow', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts non-flow types without use (backward compat)', () => {
    const raw = { id: 'agent-1', type: 'main', task: 'do it', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// gate phase — jumps/reads (route-first redesign)
// ---------------------------------------------------------------------------

describe('PhaseSchema — gate jumps routing', () => {
  it('parses gate with jumps and node: channels — judgment context', () => {
    const raw = {
      id: 'g1',
      type: 'gate',
      dependsOn: ['review'],
      channels: ['node:loop-entry'],
      jumps: [
        { when: 'review output shows overall: fail AND review retryCount < 2', to: 'writer' },
        { when: 'loop-entry output shows report_input: existing', to: 'implement' },
      ],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jumps).toHaveLength(2);
      expect(result.data.jumps![0].when).toContain('overall: fail');
      expect(result.data.jumps![0].to).toBe('writer');
      expect(result.data.jumps![1].to).toBe('implement');
      expect(result.data.channels).toEqual(['node:loop-entry']);
    }
  });

  it('rejects residual reads on gate — removed field (schema field convergence)', () => {
    const raw = {
      id: 'g1',
      type: 'gate',
      dependsOn: ['review'],
      reads: ['review'],
      jumps: [{ when: 'x', to: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'reads');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'reads' is removed");
    expect(issue!.message).toContain('channels: [node:');
  });

  it('rejects residual preText on approval — removed field (schema field convergence)', () => {
    const raw = { id: 'a1', type: 'approval', preText: 'card body' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'preText');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain("'preText' is removed");
    expect(issue!.message).toContain("'task'");
  });

  it('rejects jump with empty when — conditions must be meaningful', () => {
    const raw = { id: 'g1', type: 'gate', jumps: [{ when: '', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects jump missing to — explicit target required', () => {
    const raw = { id: 'g1', type: 'gate', jumps: [{ when: 'x' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects reads that is not an array of strings', () => {
    const raw = { id: 'g1', type: 'gate', reads: 'review', jumps: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects mode on gate — removed field (route-first redesign)', () => {
    const raw = { id: 'g1', type: 'gate', mode: 'parallel', jumps: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'mode')).toBe(true);
  });

  it('rejects default on gate — removed field (route-first redesign)', () => {
    const raw = { id: 'g1', type: 'gate', default: 'accept', jumps: [{ when: 'x', to: 'w' }] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'default')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// end phase — removed terminal marker (route-first redesign)
// ---------------------------------------------------------------------------

describe('PhaseSchema — end phase type removed', () => {
  it('rejects end type with dependsOn — closed enum has no end node', () => {
    const raw = { id: 'done', type: 'end', dependsOn: ['finalize'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const issue = result.error!.issues.find((i) => i.path.join('.') === 'type');
    expect(issue).toBeDefined();
    expect(issue!.message).toContain('expected one of');
    expect(issue!.message).not.toContain('"end"');
  });

  it('rejects end type even with a complete field set — no end node exists', () => {
    const raw = { id: 'e1', type: 'end', dependsOn: ['final'], task: 'x', join: 'any' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error!.issues.some((i) => i.path.join('.') === 'type')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// approval routing — value kept, default:true silently stripped
// ---------------------------------------------------------------------------

describe('PhaseSchema — approval routing value/default', () => {
  it('parses routing actions with value; default: true silently stripped (not declared)', () => {
    const raw = {
      id: 'a1',
      type: 'approval',
      task: 'Decide',
      routing: {
        actions: [
          { action: 'continue', value: 'accept', default: true, label: 'Accept', description: 'Go' },
          { action: 'retry', value: 'revise', target: 'w', label: 'Revise', description: 'Fix' },
        ],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.routing!.actions[0].value).toBe('accept');
      expect('default' in result.data.routing!.actions[0]).toBe(false);
      expect('default' in result.data.routing!.actions[1]).toBe(false);
    }
  });

  it('multiple default: true actions still parse — defaults stripped, no schema enforcement', () => {
    const raw = {
      id: 'a1',
      type: 'approval',
      routing: {
        actions: [
          { action: 'continue', default: true, label: 'A', description: 'a' },
          { action: 'retry', default: true, target: 'w', label: 'B', description: 'b' },
        ],
      },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect('default' in result.data.routing!.actions[0]).toBe(false);
      expect('default' in result.data.routing!.actions[1]).toBe(false);
    }
  });

  it('allows zero default actions — manual mode presents the full card', () => {
    const raw = {
      id: 'a1',
      type: 'approval',
      routing: {
        actions: [{ action: 'continue', value: 'accept', label: 'Accept', description: 'Go' }],
      },
    };
    expect(PhaseSchema.safeParse(raw).success).toBe(true);
  });
});
