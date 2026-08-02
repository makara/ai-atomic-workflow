/**
 * Tests for flattenFlowPhases — merge-at-load.
 *
 * TDD red phase: flattenFlowPhases exported from flow-flatten.ts.
 * Tests cover single-level use, def inline, recursive flatten,
 * max depth, dynamic expression rejection, name conflicts.
 */
import { describe, expect, it } from 'vitest';
import { flattenFlowPhases } from '../../src/flow-flatten.js';
import type { Taskflow } from '../../src/schemas/index.js';
import type { FlowPhaseError } from '../../src/types.js';

/** Child graph: two-node chain — scope-confirm → skill-write */
function childGraph(): Taskflow {
  return {
    name: 'skill-create',
    phases: [
      { id: 'scope-confirm', type: 'main', task: 'confirm scope', dependsOn: [] },
      {
        id: 'skill-write',
        type: 'main',
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
        { id: 'plan', type: 'main', dependsOn: [] },
        { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: ['plan'] },
        { id: 'review', type: 'main', dependsOn: ['skill-ops'] },
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

describe('flattenFlowPhases — def removed', () => {
  it('flow requires use — def inline is no longer a valid source', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'validate', type: 'flow', dependsOn: [] }],
    };
    expect(() => flattenFlowPhases(parent, staticLoader, 1, 5)).toThrow(/must have 'use'/);
  });
});

describe('flattenFlowPhases — recursive', () => {
  it('flattens nested flow phases (2 levels)', () => {
    // Child with its own flow phase inside
    const grandchildLoader = (name: string): Taskflow | null => {
      if (name === 'inner-flow') {
        return {
          name: 'inner-flow',
          phases: [{ id: 'inner-node', type: 'main', dependsOn: [] }],
        };
      }
      if (name === 'outer-child') {
        return {
          name: 'outer-child',
          phases: [
            { id: 'pre', type: 'main', dependsOn: [] },
            { id: 'mid', type: 'flow', use: 'inner-flow', dependsOn: ['pre'] },
            { id: 'post', type: 'main', dependsOn: ['mid'] },
          ],
        };
      }
      return null;
    };

    const parent: Taskflow = {
      name: 'root',
      phases: [
        { id: 'start', type: 'main', dependsOn: [] },
        { id: 'outer', type: 'flow', use: 'outer-child', dependsOn: ['start'] },
        { id: 'end', type: 'main', dependsOn: ['outer'] },
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
});

describe('flattenFlowPhases — name conflict', () => {
  it('throws when child ID conflicts with existing prefixed node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'skill-ops', type: 'flow', use: 'skill-create', dependsOn: [] },
        { id: 'skill-ops/scope-confirm', type: 'main', dependsOn: [] },
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

// ---------------------------------------------------------------------------
// Skill change workflow — orchestrated flow phases
// ---------------------------------------------------------------------------

/** skill-delete child graph */
function skillDeleteGraph(): Taskflow {
  return {
    name: 'skill-delete',
    version: 1,
    phases: [
      { id: 'skill-select', type: 'main', dependsOn: [], task: 'select skill' },
      { id: 'impact-analysis', type: 'main', dependsOn: ['skill-select'], task: 'analyze impact' },
      { id: 'delete-confirm', type: 'main', dependsOn: ['impact-analysis'], task: 'confirm delete' },
      { id: 'skill-delete-execute', type: 'main', dependsOn: ['delete-confirm'], task: 'execute delete' },
      { id: 'delete-review', type: 'main', dependsOn: ['skill-delete-execute'], task: 'review' },
      { id: 'delete-accept', type: 'approval', dependsOn: ['delete-review'] },
    ],
  };
}

/** doc-update child graph */
function docUpdateGraph(): Taskflow {
  return {
    name: 'doc-update',
    version: 1,
    phases: [
      { id: 'doc-scope', type: 'main', dependsOn: [], task: 'scope docs' },
      { id: 'doc-write', type: 'main', dependsOn: ['doc-scope'], task: 'write' },
      { id: 'doc-review', type: 'main', dependsOn: ['doc-write'], task: 'review' },
      { id: 'doc-accept', type: 'approval', dependsOn: ['doc-review'] },
    ],
  };
}

/** Multi-graph loader for orchestrated workflow */
function orchestrationLoader(name: string): Taskflow | null {
  if (name === 'skill-delete') return skillDeleteGraph();
  if (name === 'doc-update') return docUpdateGraph();
  return null;
}

describe('flattenFlowPhases — orchestrated workflow (skill-change-workflow)', () => {
  it('flattens multiple flow phases with correct prefix and terminal rewiring', () => {
    const parent: Taskflow = {
      name: 'skill-change-workflow',
      version: 1,
      phases: [
        { id: 'plan-scope', type: 'main', dependsOn: [], task: 'plan scope' },
        { id: 'plan-accept', type: 'approval', dependsOn: ['plan-scope'] },
        {
          id: 'skill-delete-foo',
          type: 'flow',
          use: 'skill-delete',
          with: { skillName: 'example' },
          dependsOn: ['plan-accept'],
        },
        {
          id: 'doc-update',
          type: 'flow',
          use: 'doc-update',
          with: { docs: ['CONTEXT.md'] },
          dependsOn: ['plan-accept'],
        },
        {
          id: 'cross-review',
          type: 'main',
          skill: 'code-review',
          dependsOn: ['skill-delete-foo', 'doc-update'],
        },
        { id: 'change-accept', type: 'approval', dependsOn: ['cross-review'] },
      ],
    };

    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);
    const ids = result.phases.map((p) => p.id);

    // Parent phases preserved
    expect(ids).toContain('plan-scope');
    expect(ids).toContain('plan-accept');

    // Flow phases removed
    expect(ids).not.toContain('skill-delete-foo');
    expect(ids).not.toContain('doc-update');

    // Skill-delete child phases prefixed
    expect(ids).toContain('skill-delete-foo/skill-select');
    expect(ids).toContain('skill-delete-foo/impact-analysis');
    expect(ids).toContain('skill-delete-foo/delete-confirm');
    expect(ids).toContain('skill-delete-foo/skill-delete-execute');
    expect(ids).toContain('skill-delete-foo/delete-review');
    expect(ids).toContain('skill-delete-foo/delete-accept');

    // Doc-update child phases prefixed
    expect(ids).toContain('doc-update/doc-scope');
    expect(ids).toContain('doc-update/doc-write');
    expect(ids).toContain('doc-update/doc-review');
    expect(ids).toContain('doc-update/doc-accept');

    // Cross-review rewired to child terminals (delete-accept, doc-accept)
    const crossReview = result.phases.find((p) => p.id === 'cross-review');
    expect(crossReview?.dependsOn).toContain('skill-delete-foo/delete-accept');
    expect(crossReview?.dependsOn).toContain('doc-update/doc-accept');
    expect(crossReview?.dependsOn).not.toContain('skill-delete-foo');
    expect(crossReview?.dependsOn).not.toContain('doc-update');

    // change-accept preserved
    expect(ids).toContain('change-accept');
  });

  it('injects with: args statically on flow phase (preserved as metadata)', () => {
    const parent: Taskflow = {
      name: 'orchestrated',
      version: 1,
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan' },
        {
          id: 'skill-ops',
          type: 'flow',
          use: 'skill-delete',
          with: { skillName: 'foo', dryRun: true },
          dependsOn: ['plan'],
        },
        { id: 'done', type: 'main', dependsOn: ['skill-ops'] },
      ],
    };

    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);

    // Child entry node inherits flow phase's dependsOn
    const entry = result.phases.find((p) => p.id === 'skill-ops/skill-select');
    expect(entry).toBeDefined();
    expect(entry?.dependsOn).toEqual(['plan']);

    // Plan remains entry node in flattened graph
    const plan = result.phases.find((p) => p.id === 'plan');
    expect(plan).toBeDefined();
    expect(plan?.dependsOn).toEqual([]);

    // downstream done rewired to child terminal
    const done = result.phases.find((p) => p.id === 'done');
    expect(done?.dependsOn).toContain('skill-ops/delete-accept');
    expect(done?.dependsOn).not.toContain('skill-ops');
  });

  it('child dependsOn rewired with prefix inside child graph', () => {
    const parent: Taskflow = {
      name: 'orchestrated',
      version: 1,
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan' },
        { id: 'ops', type: 'flow', use: 'skill-delete', dependsOn: ['plan'] },
      ],
    };

    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);

    // Child internal dependsOn should be prefixed
    const impactAnalysis = result.phases.find((p) => p.id === 'ops/impact-analysis');
    expect(impactAnalysis?.dependsOn).toEqual(['ops/skill-select']);

    const deleteConfirm = result.phases.find((p) => p.id === 'ops/delete-confirm');
    expect(deleteConfirm?.dependsOn).toEqual(['ops/impact-analysis']);
  });

  it('preserves non-flow phase properties through flatten', () => {
    const parent: Taskflow = {
      name: 'orchestrated',
      version: 1,
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan work', channels: ['atom-kernel'] },
        { id: 'ops', type: 'flow', use: 'skill-delete', dependsOn: ['plan'] },
        {
          id: 'review',
          type: 'main',
          skill: 'code-review',
          dependsOn: ['ops'],
          task: 'cross review',
          channels: ['code-review'],
        },
      ],
    };

    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);

    // Plan preserved with task and channels
    const plan = result.phases.find((p) => p.id === 'plan');
    expect(plan?.task).toBe('plan work');
    expect(plan?.channels).toEqual(['atom-kernel']);

    // Review preserved with skill and channels
    const review = result.phases.find((p) => p.id === 'review');
    expect(review?.skill).toBe('code-review');
    expect(review?.channels).toEqual(['code-review']);
  });

  it('child entry inherits flow phase dependsOn — FSM can not activate before upstream', () => {
    const parent: Taskflow = {
      name: 'topo-test',
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan' },
        { id: 'verify', type: 'main', dependsOn: ['plan'], task: 'verify' },
        { id: 'ops', type: 'flow', use: 'skill-delete', dependsOn: ['plan', 'verify'] },
      ],
    };

    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);

    // Entry node must inherit BOTH plan + verify
    const entry = result.phases.find((p) => p.id === 'ops/skill-select');
    expect(entry?.dependsOn).toEqual(['plan', 'verify']);

    // Child internal dependsOn still prefixed but entry's inherited deps come first
    const impact = result.phases.find((p) => p.id === 'ops/impact-analysis');
    expect(impact?.dependsOn).toEqual(['ops/skill-select']);
  });

  it('passes child task through untouched — no with substitution', () => {
    const childWithTemplate: Taskflow = {
      name: 'template-test',
      phases: [
        { id: 'step1', type: 'main', dependsOn: [], task: 'do the work' },
        { id: 'step2', type: 'main', dependsOn: ['step1'], task: 'finish' },
      ],
    };
    const loader = (name: string): Taskflow | null => {
      if (name === 'template-test') return childWithTemplate;
      return null;
    };

    const parent: Taskflow = {
      name: 'with-test',
      phases: [
        { id: 'plan', type: 'main', dependsOn: [], task: 'plan' },
        { id: 'ops', type: 'flow', use: 'template-test', dependsOn: ['plan'] },
      ],
    };

    const result = flattenFlowPhases(parent, loader, 1, 5);

    const step1 = result.phases.find((p) => p.id === 'ops/step1');
    expect(step1?.task).toBe('do the work');

    const step2 = result.phases.find((p) => p.id === 'ops/step2');
    expect(step2?.task).toBe('finish');
  });

  it('passes child when/channels/preText through untouched — no with substitution', () => {
    const child: Taskflow = {
      name: 'pass-test',
      phases: [
        {
          id: 'load',
          type: 'main',
          dependsOn: [],
          task: 'load',
          when: 'env == "prod"',
          channels: ['atom-kernel'],
          preText: 'card text',
        },
      ],
    };
    const loader = (name: string): Taskflow | null => {
      if (name === 'pass-test') return child;
      return null;
    };

    const parent: Taskflow = {
      name: 'pass-parent',
      phases: [{ id: 'ops', type: 'flow', use: 'pass-test', dependsOn: [] }],
    };

    const result = flattenFlowPhases(parent, loader, 1, 5);

    const load = result.phases.find((p) => p.id === 'ops/load');
    expect(load?.task).toBe('load');
    expect(load?.when).toBe('env == "prod"');
    expect(load?.channels).toEqual(['atom-kernel']);
    expect(load?.preText).toBe('card text');
  });
});

// ---------------------------------------------------------------------------
// node: channel target prefixing (load-time contract alignment)
// ---------------------------------------------------------------------------

describe('flattenFlowPhases — node: channel prefixing', () => {
  it('prefixes node: channel targets pointing at child-sibling nodes', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'writer', type: 'main', dependsOn: [], channels: [] },
        {
          id: 'reader',
          type: 'main',
          dependsOn: ['writer'],
          channels: ['node:writer'],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);

    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', dependsOn: [] },
        { id: 'ops', type: 'flow', use: 'sub-graph', dependsOn: ['seed'] },
      ],
    };

    const result = flattenFlowPhases(parent, loader, 1, 5);
    const reader = result.phases.find((p) => p.id === 'ops/reader');
    expect(reader?.channels).toEqual(['node:ops/writer']);
  });

  it('keeps node: channel targets pointing at parent-level nodes unprefixed', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [{ id: 'writer', type: 'main', dependsOn: [], channels: ['node:seed'] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);

    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', dependsOn: [] },
        { id: 'ops', type: 'flow', use: 'sub-graph', dependsOn: [] },
      ],
    };

    const result = flattenFlowPhases(parent, loader, 1, 5);
    const writer = result.phases.find((p) => p.id === 'ops/writer');
    // seed is a parent-level node — cross-level reference stays as-is
    expect(writer?.channels).toEqual(['node:seed']);
  });
});

describe('flattenFlowPhases — parent routing/eval target remap', () => {
  it('remaps parent routing target naming flow id to flattened entry node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'review', type: 'flow', use: 'skill-create', dependsOn: [] },
        {
          id: 'accept',
          type: 'approval',
          dependsOn: ['review'],
          routing: {
            actions: [{ action: 'retry', target: 'review', label: 'Revise', description: 're-run review' }],
          },
        },
      ],
    };

    const result = flattenFlowPhases(parent, staticLoader, 1, 5);
    const accept = result.phases.find((p) => p.id === 'accept');
    expect(accept?.routing?.actions[0].target).toBe('review/scope-confirm');
  });

  it('remaps parent eval target naming flow id to flattened entry node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'review', type: 'flow', use: 'skill-create', dependsOn: [] },
        {
          id: 'accept',
          type: 'approval',
          dependsOn: ['review'],
          eval: [{ when: 'review output shows fail', action: 'retry', target: 'review' }],
        },
      ],
    };

    const result = flattenFlowPhases(parent, staticLoader, 1, 5);
    const accept = result.phases.find((p) => p.id === 'accept');
    expect(accept?.eval?.[0].target).toBe('review/scope-confirm');
  });

  it('keeps child routing targets prefixed — regression', () => {
    const child = (): Taskflow => ({
      name: 'child',
      phases: [
        { id: 'write', type: 'main', task: 'x', dependsOn: [] },
        {
          id: 'gate',
          type: 'approval',
          dependsOn: ['write'],
          routing: {
            actions: [{ action: 'retry', target: 'write', label: 'Redo', description: 're-write' }],
          },
        },
      ],
    });
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'ops', type: 'flow', use: 'child', dependsOn: [] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'child' ? child() : null);

    const result = flattenFlowPhases(parent, loader, 1, 5);
    const gate = result.phases.find((p) => p.id === 'ops/gate');
    expect(gate?.routing?.actions[0].target).toBe('ops/write');
  });
});
