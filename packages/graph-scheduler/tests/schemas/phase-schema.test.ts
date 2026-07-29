/**
 * Unit tests for PhaseSchema — zod schema for a single phase/node definition.
 *
 * TDD red phase: PhaseSchema does not exist yet. These tests define the expected
 * API contract. Phase 3 implementation should make all tests pass.
 */
import { describe, expect, it } from 'vitest';
import { PhaseSchema, type Phase } from '../../src/schemas/phase.js';

// ---------------------------------------------------------------------------
// Happy path — agent and approval type with complete fields
// ---------------------------------------------------------------------------

describe('PhaseSchema — happy path', () => {
  it('parses agent type with all fields', () => {
    const raw = {
      id: 'agent-a',
      type: 'agent',
      dependsOn: ['phase-0'],
      agent: 'my-agent',
      skill: 'skill://my-agent',
      task: 'Run analysis task',
      retry: { max: 3, backoffMs: 200, factor: 2 },
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      const p: Phase = result.data;
      expect(p.id).toBe('agent-a');
      expect(p.type).toBe('agent');
      expect(p.dependsOn).toEqual(['phase-0']);
      expect(p.agent).toBe('my-agent');
      expect(p.skill).toBe('skill://my-agent');
      expect(p.task).toBe('Run analysis task');
      expect(p.retry?.max).toBe(3);
    }
  });

  it('parses approval type with complete fields', () => {
    const raw = {
      id: 'approval-step',
      type: 'approval',
      dependsOn: ['agent-a', 'agent-b'],
      task: 'Review the output and decide',
      retry: { max: 2 },
    };

    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('approval');
      expect(result.data.dependsOn).toHaveLength(2);
    }
  });

  it('parses minimal phase — only id + type', () => {
    const raw = { id: 'step-1', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('step-1');
      expect(result.data.type).toBe('agent');
      expect(result.data.dependsOn).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Invalid input
// ---------------------------------------------------------------------------

describe('PhaseSchema — invalid input', () => {
  it('accepts any type string — validation deferred to PhaseHandlerRegistry (ADR 0025)', () => {
    const raw = { id: 'p1', type: 'unknown' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  it('rejects type that is not a string', () => {
    const raw = { id: 'p1', type: 42 };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects missing id', () => {
    const raw = { type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects id that is not a string', () => {
    const raw = { id: null, type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn that is not an array', () => {
    const raw = { id: 'p1', type: 'agent', dependsOn: 'phase-0' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects dependsOn containing non-string elements', () => {
    const raw = { id: 'p1', type: 'agent', dependsOn: ['valid', 42] };
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

  it('rejects retry with missing max', () => {
    const raw = {
      id: 'p1',
      type: 'agent',
      retry: { backoffMs: 100 },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects retry.max that is not a number', () => {
    const raw = {
      id: 'p1',
      type: 'agent',
      retry: { max: 'three' },
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Boundary conditions
// ---------------------------------------------------------------------------

describe('PhaseSchema — boundary', () => {
  it('allows empty dependsOn array', () => {
    const raw = { id: 'p1', type: 'agent', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dependsOn).toEqual([]);
    }
  });

  it('allows absent skill field', () => {
    const raw = { id: 'p1', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.skill).toBeUndefined();
    }
  });

  it('allows absent agent field on approval type', () => {
    const raw = { id: 'approval-1', type: 'approval' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agent).toBeUndefined();
    }
  });

  it('allows empty string id', () => {
    // zod string() allows empty strings by default — no min(1) constraint
    const raw = { id: '', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ADR 0036 — join mode + when guard
// ---------------------------------------------------------------------------

describe('PhaseSchema — ADR 0036 join mode', () => {
  it('parses join: "all" (default)', () => {
    const raw = { id: 'p1', type: 'agent', join: 'all' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('all');
    }
  });

  it('parses join: "any"', () => {
    const raw = { id: 'p1', type: 'agent', join: 'any' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('any');
    }
  });

  it('defaults join to "all" when absent', () => {
    const raw = { id: 'p1', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('all');
    }
  });

  it('rejects invalid join value', () => {
    const raw = { id: 'p1', type: 'agent', join: 'none' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects join that is not a string', () => {
    const raw = { id: 'p1', type: 'agent', join: 42 };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });
});

describe('PhaseSchema — ADR 0036 when guard', () => {
  it('parses when string field', () => {
    const raw = { id: 'p1', type: 'agent', when: 'upstream output indicates skip' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBe('upstream output indicates skip');
    }
  });

  it('allows absent when field', () => {
    const raw = { id: 'p1', type: 'agent' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.when).toBeUndefined();
    }
  });

  it('rejects when that is not a string', () => {
    const raw = { id: 'p1', type: 'agent', when: true };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('allows when with join together', () => {
    const raw = { id: 'p1', type: 'agent', join: 'any', when: 'condition' };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.join).toBe('any');
      expect(result.data.when).toBe('condition');
    }
  });
});

// ---------------------------------------------------------------------------
// ADR 0043 — flow phase type fields
// ---------------------------------------------------------------------------

describe('PhaseSchema — ADR 0043 flow phase type', () => {
  it('parses flow type with use field', () => {
    const raw = { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.use).toBe('skill-create');
    }
  });

  it('parses flow type with def field', () => {
    const raw = { id: 'inline', type: 'flow', def: { phases: [{ id: 'a', type: 'agent' }] }, dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.def).toEqual({ phases: [{ id: 'a', type: 'agent' }] });
    }
  });

  it('parses flow type with with and maxDepth', () => {
    const raw = {
      id: 'skill-ops',
      type: 'flow',
      use: 'skill-create',
      with: { key: 'value' },
      maxDepth: 3,
      dependsOn: [],
    };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.with).toEqual({ key: 'value' });
      expect(result.data.maxDepth).toBe(3);
    }
  });

  it('defaults maxDepth to 5', () => {
    const raw = { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxDepth).toBe(5);
    }
  });

  it('rejects both use and def together', () => {
    const raw = { id: 'bad', type: 'flow', use: 'g1', def: { phases: [] }, dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('rejects flow type without use or def', () => {
    const raw = { id: 'bad', type: 'flow', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(false);
  });

  it('accepts non-flow types without use/def (backward compat)', () => {
    const raw = { id: 'agent-1', type: 'agent', task: 'do it', dependsOn: [] };
    const result = PhaseSchema.safeParse(raw);
    expect(result.success).toBe(true);
  });
});
