/**
 * Unit tests for PhaseSchema — zod schema for a single phase/node definition.
 *
 * Covers: closed type enum (main/approval/flow), removed fields (retry/def/
 * with/maxDepth/topic/context — rejected loudly), flow use
 * requirement, type-semantics superRefine (single enforcement point).
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
      skill: 'skill://my-agent',
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
      expect(p.skill).toBe('skill://my-agent');
      expect(p.task).toBe('Run analysis task');
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
// Removed fields — rejected loudly, never functional
// ---------------------------------------------------------------------------

describe('PhaseSchema — removed fields rejected loudly', () => {
  it('rejects retry — no retry config surface', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', retry: { max: 3 } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.join('.') === 'retry')).toBe(true);
  });

  it('rejects topic — approval title comes from task', () => {
    const raw = { id: 'approval-1', type: 'approval', topic: 'My Topic' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.join('.') === 'topic')).toBe(true);
  });

  it('rejects legacy context field', () => {
    const raw = { id: 'p1', type: 'main', task: 'x', context: ['legacy'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.join('.') === 'context')).toBe(true);
  });

  it('rejects flow with/maxDepth/def — flow requires use only', () => {
    const raw = { id: 'f1', type: 'flow', use: 'child', with: { k: 'v' }, maxDepth: 3, def: { phases: [] } };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((i) => i.path.join('.'));
    expect(paths).toContain('with');
    expect(paths).toContain('maxDepth');
    expect(paths).toContain('def');
  });

  it('rejects routing.context', () => {
    const raw = {
      id: 'approval-1',
      type: 'approval',
      routing: { actions: [{ action: 'continue', label: 'Go', description: 'Advance' }], context: ['legacy'] },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.join('.') === 'routing.context')).toBe(true);
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

  it('rejects channels on approval type', () => {
    const raw = { id: 'approval-1', type: 'approval', channels: ['x'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects agent hints on approval type', () => {
    const raw = { id: 'approval-1', type: 'approval', agent: ['reviewer', 'task'] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    const messages = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    expect(messages).toContain('approval');
    expect(messages).toContain('agent');
  });

  it('rejects eval on main type — approval-only field', () => {
    const raw = {
      id: 'p1',
      type: 'main',
      task: 'x',
      eval: [{ when: 'x', action: 'retry', target: 'w' }],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
    expect(result.error.issues.some((i) => i.path.join('.') === 'eval')).toBe(true);
  });

  it('accepts eval on approval type', () => {
    const raw = {
      id: 'a1',
      type: 'approval',
      eval: [{ when: 'x', action: 'retry', target: 'w' }],
    };
    expect(PhaseSchema.safeParse(raw).success).toBe(true);
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

describe('PhaseSchema — join mode', () => {
  it('parses join: "all" (default)', () => {
    const raw = { id: 'p1', type: 'main', join: 'all' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('all');
    }
  });

  it('parses join: "any"', () => {
    const raw = { id: 'p1', type: 'main', join: 'any' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('any');
    }
  });

  it('defaults join to "all" when absent', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('all');
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

describe('PhaseSchema — when guard', () => {
  it('parses when string field', () => {
    const raw = { id: 'p1', type: 'main', when: 'upstream output indicates skip' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBe('upstream output indicates skip');
    }
  });

  it('allows absent when field', () => {
    const raw = { id: 'p1', type: 'main' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBeUndefined();
    }
  });

  it('rejects when that is not a string', () => {
    const raw = { id: 'p1', type: 'main', when: true };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
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
