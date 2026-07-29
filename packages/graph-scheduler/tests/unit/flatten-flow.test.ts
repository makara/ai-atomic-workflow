/**
 * Tests for flattenFlowPhases — merge-at-load (ADR 0043).
 *
 * TDD red phase: flattenFlowPhases exported from graph-definition.ts.
 * Tests cover single-level use, def inline, recursive flatten,
 * max depth, dynamic expression rejection, name conflicts.
 */
import { describe, expect, it } from 'vitest';
import { flattenFlowPhases } from '../../src/graph-definition.js';
import type { Taskflow } from '../../src/schemas/index.js';
import type { FlowPhaseError } from '../../src/types.js';

/** Child graph: two-node chain — scope-confirm → skill-write */
function childGraph(): Taskflow {
  return {
    name: 'skill-create',
    phases: [
      { id: 'scope-confirm', type: 'agent', task: 'confirm scope', dependsOn: [] },
      {
        id: 'skill-write',
        type: 'agent',
        task: 'write skill',
        dependsOn: ['scope-confirm'],
      },
    ],
  };
}

/** Loader that resolves 'skill-create' → childGraph */
function staticLoader(name: string): Taskflow | null {
  if (name === 'skill-create') return childGraph();
  return null;
}

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('flattenFlowPhases — single-level use', () => {
  it('flattens flow phase with use: "skill-create"', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'plan', type: 'agent', dependsOn: [] },
        { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: ['plan'] },
        { id: 'review', type: 'agent', dependsOn: ['skill-ops'] },
      ],
    };

    const result = flattenFlowPhases(parent, staticLoader, 1, 5);

    // Flow phase replaced by child phases with prefix
    const ids = result.phases.map((p) => p.id);
    expect(ids).toContain('plan');
    expect(ids).toContain('skill-ops/scope-confirm');
    expect(ids).toContain('skill-ops/skill-write');
    expect(ids).toContain('review');
    expect(ids).not.toContain('skill-ops'); // flow phase removed

    // Child dependsOn rewritten with prefix
    const skillWrite = result.phases.find((p) => p.id === 'skill-ops/skill-write');
    expect(skillWrite?.dependsOn).toEqual(['skill-ops/scope-confirm']);

    // Parent downstream rewired to child terminals
    const review = result.phases.find((p) => p.id === 'review');
    expect(review?.dependsOn).toContain('skill-ops/skill-write');
    expect(review?.dependsOn).not.toContain('skill-ops');
  });
});

describe('flattenFlowPhases — def inline', () => {
  it('flattens flow phase with def: {phases: [...]}', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'lint', type: 'agent', dependsOn: [] },
        {
          id: 'validate',
          type: 'flow',
          def: { phases: [{ id: 'check', type: 'agent', dependsOn: [] }] },
          dependsOn: ['lint'],
        },
        { id: 'done', type: 'agent', dependsOn: ['validate'] },
      ],
    };

    const result = flattenFlowPhases(parent, staticLoader, 1, 5);

    expect(result.phases.map((p) => p.id)).toEqual(['lint', 'validate/check', 'done']);

    // done depends on validate/check (child terminal)
    const done = result.phases.find((p) => p.id === 'done');
    expect(done?.dependsOn).toContain('validate/check');
    expect(done?.dependsOn).not.toContain('validate');
  });
});

describe('flattenFlowPhases — recursive', () => {
  it('flattens nested flow phases (2 levels)', () => {
    // Child with its own flow phase inside
    const grandchildLoader = (name: string): Taskflow | null => {
      if (name === 'inner-flow') {
        return {
          name: 'inner-flow',
          phases: [{ id: 'inner-node', type: 'agent', dependsOn: [] }],
        };
      }
      if (name === 'outer-child') {
        return {
          name: 'outer-child',
          phases: [
            { id: 'pre', type: 'agent', dependsOn: [] },
            { id: 'mid', type: 'flow', use: 'inner-flow', dependsOn: ['pre'] },
            { id: 'post', type: 'agent', dependsOn: ['mid'] },
          ],
        };
      }
      return null;
    };

    const parent: Taskflow = {
      name: 'root',
      phases: [
        { id: 'start', type: 'agent', dependsOn: [] },
        { id: 'outer', type: 'flow', use: 'outer-child', dependsOn: ['start'] },
        { id: 'end', type: 'agent', dependsOn: ['outer'] },
      ],
    };

    const result = flattenFlowPhases(parent, grandchildLoader, 1, 5);

    const ids = result.phases.map((p) => p.id);
    expect(ids).toContain('start');
    expect(ids).toContain('outer/pre');
    expect(ids).toContain('outer/mid/inner-node'); // double-prefix
    expect(ids).toContain('outer/post');
    expect(ids).toContain('end');
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------

describe('flattenFlowPhases — max depth exceeded', () => {
  it('throws FlowPhaseError at depth >= maxDepth', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'deep', type: 'flow', use: 'skill-create', dependsOn: [] }],
    };

    expect(() => flattenFlowPhases(parent, staticLoader, 5, 5)).toThrow();
    try {
      flattenFlowPhases(parent, staticLoader, 5, 5);
    } catch (e) {
      const err = e as FlowPhaseError;
      expect(err._tag).toBe('FlowPhaseError');
      expect(err.code).toBe('MAX_DEPTH_EXCEEDED');
    }
  });
});

describe('flattenFlowPhases — dynamic expression', () => {
  it('rejects use with {…} expression', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'dyn', type: 'flow', use: '{upstream.output}', dependsOn: [] }],
    };

    expect(() => flattenFlowPhases(parent, staticLoader, 1, 5)).toThrow();
    try {
      flattenFlowPhases(parent, staticLoader, 1, 5);
    } catch (e) {
      const err = e as FlowPhaseError;
      expect(err._tag).toBe('FlowPhaseError');
      expect(err.code).toBe('DYNAMIC_EXPRESSION');
    }
  });
  // Phase 1: def only accepted as object (z.record) through PhaseSchema.
  // Dynamic def as string would fail schema validation before flattenFlowPhases.
  it.todo('rejects def with {…} expression (when def schema supports string)');
});

describe('flattenFlowPhases — name conflict', () => {
  it('throws when child ID conflicts with existing prefixed node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: [] },
        { id: 'skill-ops/scope-confirm', type: 'agent', dependsOn: [] },
      ],
    };

    expect(() => flattenFlowPhases(parent, staticLoader, 1, 5)).toThrow();
    try {
      flattenFlowPhases(parent, staticLoader, 1, 5);
    } catch (e) {
      const err = e as FlowPhaseError;
      expect(err._tag).toBe('FlowPhaseError');
      expect(err.code).toBe('NAME_CONFLICT');
    }
  });
});

describe('flattenFlowPhases — graph not found', () => {
  it('throws when use references unknown graph', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'missing', type: 'flow', use: 'nonexistent', dependsOn: [] }],
    };

    expect(() => flattenFlowPhases(parent, staticLoader, 1, 5)).toThrow();
    try {
      flattenFlowPhases(parent, staticLoader, 1, 5);
    } catch (e) {
      const err = e as FlowPhaseError;
      expect(err._tag).toBe('FlowPhaseError');
      expect(err.code).toBe('GRAPH_NOT_FOUND');
    }
  });
});
