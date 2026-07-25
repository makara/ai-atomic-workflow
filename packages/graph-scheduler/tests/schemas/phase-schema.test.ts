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
