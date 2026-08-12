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
      { id: 'scope-confirm', type: 'main', mode: 'exclusive', task: 'confirm scope', dependsOn: [], operations: [] },
      {
        id: 'skill-write',
        type: 'main',
        mode: 'exclusive',
        task: 'write skill',
        dependsOn: ['scope-confirm'],

        operations: [],
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'skill-ops', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: ['plan'] },
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: ['skill-ops'], operations: [] },
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
describe('flattenFlowPhases — route propagation', () => {
  /** Child graph mirroring spec-implement: un-routed members + own-route tracks. */
  function routedChild(): Taskflow {
    return {
      name: 'routed-child',
      phases: [
        { id: 'extract', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'minimal', type: 'main', dependsOn: ['extract'], route: 'minimal-track', task: 'x', operations: [] },
        { id: 'detailed', type: 'main', dependsOn: ['extract'], route: 'detailed-track', task: 'x', operations: [] },
        { id: 'done', type: 'main', dependsOn: ['minimal', 'detailed'], join: 'any', task: 'x', operations: [] },
      ],
    };
  }
  const routedLoader = (name: string): Taskflow | null => (name === 'routed-child' ? routedChild() : null);

  it('propagates the flow route to children without their own route; own routes win', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'ops', type: 'flow', use: 'routed-child', dependsOn: [], route: 'proceed' },
        { id: 'tail', type: 'main', dependsOn: ['ops'], operations: [] },
      ],
    };
    const result = flattenFlowPhases(parent, routedLoader, 1, 5);
    const routeOf = (id: string): string | undefined =>
      (result.phases.find((p) => p.id === id) as { route?: string } | undefined)?.route;
    // un-routed children inherit the flow's route — the empty-round guarantee
    // (unselected proceed → extract/done never activate)
    expect(routeOf('ops/extract')).toBe('proceed');
    expect(routeOf('ops/done')).toBe('proceed');
    // children with their own route keep it — track coexistence (cp.route ?? phase.route)
    expect(routeOf('ops/minimal')).toBe('minimal-track');
    expect(routeOf('ops/detailed')).toBe('detailed-track');
    // parent-level phases untouched
    expect(routeOf('tail')).toBeUndefined();
  });

  it('flow without route leaves children on the implicit default route', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'ops', type: 'flow', use: 'routed-child', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, routedLoader, 1, 5);
    const extract = result.phases.find((p) => p.id === 'ops/extract') as { route?: string };
    expect(extract.route).toBeUndefined();
    // own-route children keep theirs regardless
    const minimal = result.phases.find((p) => p.id === 'ops/minimal') as { route?: string };
    expect(minimal.route).toBe('minimal-track');
  });
});

describe('flattenFlowPhases — child id prefixing', () => {
  it('prefixes ALL child ids inside flows — no reserved ids exist', () => {
    const child = (): Taskflow => ({
      name: 'child-graph',
      phases: [
        { id: 'entry-node', type: 'main', mode: 'exclusive', dependsOn: [], task: 'x', operations: [] },
        { id: 'child-node', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
      ],
    });
    const loader = (name: string): Taskflow | null => (name === 'child-graph' ? child() : null);
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'child-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const ids = result.phases.map((p) => p.id);
    // Every child id gets the flow prefix
    expect(ids).toContain('ops/entry-node');
    expect(ids).toContain('ops/child-node');
    expect(ids).not.toContain('entry-node');
  });

  it('rewrites dependsOn references inside children with the prefix', () => {
    const child = (): Taskflow => ({
      name: 'child-graph',
      phases: [
        { id: 'entry-node', type: 'main', mode: 'exclusive', dependsOn: [], task: 'x', operations: [] },
        { id: 'child-node', type: 'main', mode: 'exclusive', dependsOn: ['entry-node'], operations: [] },
      ],
    });
    const loader = (name: string): Taskflow | null => (name === 'child-graph' ? child() : null);
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'child-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const childPhase = result.phases.find((p) => p.id === 'ops/child-node');
    expect(childPhase?.dependsOn).toEqual(['ops/entry-node']);
  });
});

describe('flattenFlowPhases — def removed', () => {
  it('flow requires use — def inline is no longer a valid source', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'validate', type: 'flow', mode: 'exclusive', dependsOn: [] }],
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
          phases: [{ id: 'inner-node', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] }],
        };
      }
      if (name === 'outer-child') {
        return {
          name: 'outer-child',
          phases: [
            { id: 'pre', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
            { id: 'mid', type: 'flow', mode: 'exclusive', use: 'inner-flow', dependsOn: ['pre'] },
            { id: 'post', type: 'main', mode: 'exclusive', dependsOn: ['mid'], operations: [] },
          ],
        };
      }
      return null;
    };
    const parent: Taskflow = {
      name: 'root',
      phases: [
        { id: 'start', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'outer', type: 'flow', mode: 'exclusive', use: 'outer-child', dependsOn: ['start'] },
        { id: 'end', type: 'main', mode: 'exclusive', dependsOn: ['outer'], operations: [] },
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
      phases: [{ id: 'deep', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: [] }],
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
      phases: [{ id: 'dyn', type: 'flow', mode: 'exclusive', use: '{upstream.output}', dependsOn: [] }],
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
        { id: 'skill-ops', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: [] },
        { id: 'skill-ops/scope-confirm', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
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
      phases: [{ id: 'missing', type: 'flow', mode: 'exclusive', use: 'nonexistent', dependsOn: [] }],
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

    phases: [
      { id: 'skill-select', type: 'main', mode: 'exclusive', dependsOn: [], task: 'select skill', operations: [] },
      {
        id: 'impact-analysis',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['skill-select'],
        task: 'analyze impact',

        operations: [],
      },
      {
        id: 'delete-confirm',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['impact-analysis'],
        task: 'confirm delete',

        operations: [],
      },
      {
        id: 'skill-delete-execute',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['delete-confirm'],
        task: 'execute delete',

        operations: [],
      },
      {
        id: 'delete-review',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['skill-delete-execute'],
        task: 'review',

        operations: [],
      },
      { id: 'delete-accept', type: 'approval', mode: 'exclusive', dependsOn: ['delete-review'] },
    ],
  };
}
/** doc-sync child graph (fixture — legacy doc-update shape) */
function docSyncGraph(): Taskflow {
  return {
    name: 'doc-sync',

    phases: [
      { id: 'doc-trigger', type: 'main', mode: 'exclusive', dependsOn: [], task: 'classify trigger', operations: [] },
      {
        id: 'doc-maintain',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['doc-trigger'],
        task: 'maintain',
        operations: [],
      },
      {
        id: 'doc-review',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['doc-maintain'],
        task: 'review',
        operations: [],
      },
      { id: 'doc-accept', type: 'approval', mode: 'exclusive', dependsOn: ['doc-review'] },
    ],
  };
}
/** Multi-graph loader for orchestrated workflow */
function orchestrationLoader(name: string): Taskflow | null {
  if (name === 'skill-delete') return skillDeleteGraph();
  if (name === 'doc-sync') return docSyncGraph();
  return null;
}
describe('flattenFlowPhases — orchestrated workflow (skill-change-workflow)', () => {
  it('flattens multiple flow phases with correct prefix and terminal rewiring', () => {
    const parent: Taskflow = {
      name: 'skill-change-workflow',

      phases: [
        { id: 'plan-scope', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan scope', operations: [] },
        { id: 'plan-accept', type: 'approval', mode: 'exclusive', dependsOn: ['plan-scope'] },
        {
          id: 'skill-delete-foo',
          type: 'flow',
          mode: 'exclusive',
          use: 'skill-delete',
          dependsOn: ['plan-accept'],
        },
        {
          id: 'doc-sync',
          type: 'flow',
          mode: 'exclusive',
          use: 'doc-sync',
          dependsOn: ['plan-accept'],
        },
        {
          id: 'cross-review',
          type: 'main',
          mode: 'exclusive',
          skill: 'code-review',
          dependsOn: ['skill-delete-foo', 'doc-sync'],

          operations: [],
        },
        { id: 'change-accept', type: 'approval', mode: 'exclusive', dependsOn: ['cross-review'] },
      ],
    };
    const result = flattenFlowPhases(parent, orchestrationLoader, 1, 5);
    const ids = result.phases.map((p) => p.id);
    // Parent phases preserved
    expect(ids).toContain('plan-scope');
    expect(ids).toContain('plan-accept');
    // Flow phases removed
    expect(ids).not.toContain('skill-delete-foo');
    expect(ids).not.toContain('doc-sync');
    // Skill-delete child phases prefixed
    expect(ids).toContain('skill-delete-foo/skill-select');
    expect(ids).toContain('skill-delete-foo/impact-analysis');
    expect(ids).toContain('skill-delete-foo/delete-confirm');
    expect(ids).toContain('skill-delete-foo/skill-delete-execute');
    expect(ids).toContain('skill-delete-foo/delete-review');
    expect(ids).toContain('skill-delete-foo/delete-accept');
    // Doc-sync child phases prefixed
    expect(ids).toContain('doc-sync/doc-trigger');
    expect(ids).toContain('doc-sync/doc-maintain');
    expect(ids).toContain('doc-sync/doc-review');
    expect(ids).toContain('doc-sync/doc-accept');
    // Cross-review rewired to child terminals (delete-accept, doc-accept)
    const crossReview = result.phases.find((p) => p.id === 'cross-review');
    expect(crossReview?.dependsOn).toContain('skill-delete-foo/delete-accept');
    expect(crossReview?.dependsOn).toContain('doc-sync/doc-accept');
    expect(crossReview?.dependsOn).not.toContain('skill-delete-foo');
    expect(crossReview?.dependsOn).not.toContain('doc-sync');
    // change-accept preserved
    expect(ids).toContain('change-accept');
  });
  it('flattens a flow with static metadata on the flow phase', () => {
    const parent: Taskflow = {
      name: 'orchestrated',

      phases: [
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan', operations: [] },
        {
          id: 'skill-ops',
          type: 'flow',
          mode: 'exclusive',
          use: 'skill-delete',
          dependsOn: ['plan'],
        },
        { id: 'done', type: 'main', mode: 'exclusive', dependsOn: ['skill-ops'], operations: [] },
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

      phases: [
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan', operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'skill-delete', dependsOn: ['plan'] },
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

      phases: [
        {
          id: 'plan',
          type: 'main',
          mode: 'exclusive',
          dependsOn: [],
          task: 'plan work',
          channels: ['atom-kernel'],

          operations: [],
        },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'skill-delete', dependsOn: ['plan'] },
        {
          id: 'review',
          type: 'main',
          mode: 'exclusive',
          skill: 'code-review',
          dependsOn: ['ops'],
          task: 'cross review',
          channels: ['code-review'],

          operations: [],
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan', operations: [] },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['plan'], task: 'verify', operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'skill-delete', dependsOn: ['plan', 'verify'] },
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
        { id: 'step1', type: 'main', mode: 'exclusive', dependsOn: [], task: 'do the work', operations: [] },
        { id: 'step2', type: 'main', mode: 'exclusive', dependsOn: ['step1'], task: 'finish', operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => {
      if (name === 'template-test') return childWithTemplate;
      return null;
    };
    const parent: Taskflow = {
      name: 'with-test',
      phases: [
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan', operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'template-test', dependsOn: ['plan'] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const step1 = result.phases.find((p) => p.id === 'ops/step1');
    expect(step1?.task).toBe('do the work');
    const step2 = result.phases.find((p) => p.id === 'ops/step2');
    expect(step2?.task).toBe('finish');
  });
  it('passes child task/channels through untouched — no with substitution', () => {
    const child: Taskflow = {
      name: 'pass-test',
      phases: [
        {
          id: 'load',
          type: 'main',
          mode: 'exclusive',
          dependsOn: [],
          task: 'load',
          channels: ['atom-kernel'],

          operations: [],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => {
      if (name === 'pass-test') return child;
      return null;
    };
    const parent: Taskflow = {
      name: 'pass-parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'pass-test', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const load = result.phases.find((p) => p.id === 'ops/load');
    expect(load?.task).toBe('load');
    expect(load?.channels).toEqual(['atom-kernel']);
    // preText removed (schema field convergence) — approval card static text merges into task
    expect(load?.preText).toBeUndefined();
    // when removed (branch-routing redesign) — flow guards express as preceding gate branches
    expect(load?.when).toBeUndefined();
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
        { id: 'writer', type: 'main', mode: 'exclusive', dependsOn: [], channels: [], operations: [] },
        {
          id: 'reader',
          type: 'main',
          mode: 'exclusive',
          dependsOn: ['writer'],
          channels: ['node:writer'],

          operations: [],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: ['seed'] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const reader = result.phases.find((p) => p.id === 'ops/reader');
    expect(reader?.channels).toEqual(['node:ops/writer']);
  });
  it('keeps node: channel targets pointing at parent-level nodes unprefixed', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'writer', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:seed'], operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const writer = result.phases.find((p) => p.id === 'ops/writer');
    // seed is a parent-level node — cross-level reference stays as-is
    expect(writer?.channels).toEqual(['node:seed']);
  });
});
describe('flattenFlowPhases — flow channels rejected (no input interface)', () => {
  it('does NOT propagate flow channels to entry children — schema rejects them at load', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'a', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['./CONTEXT.md'], operations: [] },
        { id: 'b', type: 'main', mode: 'exclusive', dependsOn: [], channels: [], operations: [] },
        { id: 'c', type: 'main', mode: 'exclusive', dependsOn: ['a'], operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        {
          id: 'ops',
          type: 'flow',
          mode: 'exclusive',
          use: 'sub-graph',
          dependsOn: [],
          // Legacy declaration — schema rejects; flatten must not resurrect propagation.
          channels: ['node:grill/grilling'],
        },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const a = result.phases.find((p) => p.id === 'ops/a');
    const b = result.phases.find((p) => p.id === 'ops/b');
    const c = result.phases.find((p) => p.id === 'ops/c');
    // entry children keep ONLY their own channels — no flow-level entries merged
    expect(a?.channels).toEqual(['./CONTEXT.md']);
    expect(b?.channels).toBeUndefined();
    expect(c?.channels).toBeUndefined();
  });
  it('flow without channels — child behavior unchanged', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:seed'], operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // parent-level target stays unprefixed; no flow channels to merge
    expect(entry?.channels).toEqual(['node:seed']);
  });
  it('child node: channel to non-child id stays unprefixed — cross-flow read edge (spec-extract pattern)', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        {
          id: 'entry',
          type: 'main',
          mode: 'exclusive',
          dependsOn: [],
          channels: ['node:adopt/spec-propose'],
          operations: [],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'adopt', type: 'flow', mode: 'exclusive', use: 'other-graph', dependsOn: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] },
      ],
    };
    const loader2 = (name: string): Taskflow | null =>
      name === 'sub-graph'
        ? child
        : name === 'other-graph'
          ? ({
              name: 'other-graph',
              phases: [{ id: 'spec-propose', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] }],
            } as Taskflow)
          : null;
    const result = flattenFlowPhases(parent, loader2, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // sibling-flow flattened id (adopt/spec-propose) resolves in the composed
    // run scope — kept unprefixed; child-internal refs get the flow prefix
    expect(entry?.channels).toEqual(['node:adopt/spec-propose']);
  });
  it('child node: channel to child-internal id prefixed', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:sibling'], operations: [] },
        { id: 'sibling', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // child-internal target prefixed to match the flattened child id
    expect(entry?.channels).toEqual(['node:ops/sibling']);
  });
});

describe('flattenFlowPhases — child graph-level context inheritance', () => {
  it('merges child top-level context into ALL child phases (ambient layer)', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      context: ['./CONTEXT.md', 'skill:atom-graph-spec'],
      phases: [
        { id: 'a', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:x'], operations: [] },
        { id: 'b', type: 'main', mode: 'exclusive', dependsOn: [], channels: [], operations: [] },
        { id: 'c', type: 'main', mode: 'exclusive', dependsOn: ['a'], operations: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const a = result.phases.find((p) => p.id === 'ops/a');
    const b = result.phases.find((p) => p.id === 'ops/b');
    const c = result.phases.find((p) => p.id === 'ops/c');
    // every child phase gets the child graph's ambient layer, own channels preserved after;
    // node:x is not a child phase — kept unprefixed (resolves against the composed run scope)
    expect(a?.channels).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec', 'node:x']);
    expect(b?.channels).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec']);
    expect(c?.channels).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec']);
  });

  it('merges child graph context < phase channels with dedup', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      context: ['./CONTEXT.md'],
      phases: [
        {
          id: 'entry',
          type: 'main',
          mode: 'exclusive',
          dependsOn: [],
          channels: ['./CONTEXT.md', 'node:own'],
          operations: [],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // node:own is not a child phase — kept unprefixed (childRef rule)
    expect(entry?.channels).toEqual(['./CONTEXT.md', 'node:own']);
  });

  it('rewrites child graph-level node: targets like phase entries (child-sibling prefixed, parent-level kept)', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      context: ['node:sibling'],
      phases: [{ id: 'sibling', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] }],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/sibling');
    expect(entry?.channels).toEqual(['node:ops/sibling']);
  });

  it('fails composed load on child graph-level bare-name entry — entry rules not bypassed', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      context: ['atom-graph-spec'],
      phases: [{ id: 'sibling', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] }],
    };
    expect(() => flattenFlowPhases(parent, loader, 1, 5)).toThrow(/bare name/);
  });
});
describe('flattenFlowPhases — parent routing/eval target remap', () => {
  it('remaps parent routing target naming flow id to flattened entry node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'review', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: [] },
        {
          id: 'accept',
          type: 'approval',
          mode: 'exclusive',
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
  it('remaps parent gate jump target naming flow id to flattened entry node', () => {
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'writer', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: [] },
        {
          id: 'accept',
          type: 'gate',
          mode: 'exclusive',
          dependsOn: ['writer'],
          jumps: [{ when: 'writer output shows fail', to: 'writer' }],
        },
      ],
    };
    const result = flattenFlowPhases(parent, staticLoader, 1, 5);
    const accept = result.phases.find((p) => p.id === 'accept');
    expect(accept?.jumps?.[0].to).toBe('writer/scope-confirm');
  });
  it('prefixes child gate jump targets/channels — child-internal refs get the flow prefix, parent refs stay', () => {
    const child = (): Taskflow => ({
      name: 'child',
      phases: [
        { id: 'write', type: 'main', mode: 'exclusive', task: 'x', dependsOn: [], operations: [] },
        {
          id: 'gate',
          type: 'gate',
          mode: 'exclusive',
          dependsOn: ['write'],
          channels: ['node:write', 'node:parent-node'],
          jumps: [
            { when: 'write output shows fail', to: 'write' },
            { when: 'parent-node output shows go', to: 'parent-node' },
          ],
        },
      ],
    });
    const parent: Taskflow = {
      name: 'test',
      phases: [
        { id: 'parent-node', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'child', dependsOn: [] },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'child' ? child() : null);
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const gate = result.phases.find((p) => p.id === 'ops/gate');
    expect(gate).toBeDefined();
    // reads removed (schema field convergence) — judgment context = direct
    // dependsOn outputs + channels node: entries; child-internal refs prefixed
    expect(gate!.reads).toBeUndefined();
    expect(gate!.channels).toEqual(['node:ops/write', 'node:parent-node']);
    expect(gate!.jumps?.[0].to).toBe('ops/write');
    expect(gate!.jumps?.[1].to).toBe('parent-node');
    // when-propagation removed — no when fields anywhere in the flattened graph
    for (const p of result.phases) {
      expect(p.when).toBeUndefined();
    }
  });
  it('keeps child routing targets prefixed — regression', () => {
    const child = (): Taskflow => ({
      name: 'child',
      phases: [
        { id: 'write', type: 'main', mode: 'exclusive', task: 'x', dependsOn: [], operations: [] },
        {
          id: 'gate',
          type: 'approval',
          mode: 'exclusive',
          dependsOn: ['write'],
          routing: {
            actions: [{ action: 'retry', target: 'write', label: 'Redo', description: 're-write' }],
          },
        },
      ],
    });
    const parent: Taskflow = {
      name: 'test',
      phases: [{ id: 'ops', type: 'flow', mode: 'exclusive', use: 'child', dependsOn: [] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'child' ? child() : null);
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const gate = result.phases.find((p) => p.id === 'ops/gate');
    expect(gate?.routing?.actions[0].target).toBe('ops/write');
  });
});
// ---------------------------------------------------------------------------
// Composition inheritance — parent graph flows the built-in spec-implement
// graph (G3: merge-at-load carries phases + channels into the parent)
// ---------------------------------------------------------------------------
describe('flattenFlowPhases — composition inheritance of spec-implement', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const { parse: parseYaml } = require('yaml');
  const pkgRoot = join(__dirname, '..', '..');
  const implementGraph = parseYaml(
    readFileSync(join(pkgRoot, 'graphs', 'spec-implement.taskflow.yaml'), 'utf-8'),
  ) as Taskflow;
  const graphsDir = join(pkgRoot, 'graphs');
  const loader = (name: string): Taskflow | null => {
    if (name === 'spec-implement') return implementGraph;
    try {
      return parseYaml(readFileSync(join(graphsDir, `${name}.taskflow.yaml`), 'utf-8')) as Taskflow;
    } catch {
      return null;
    }
  };
  const parent: Taskflow = {
    name: 'idea-to-ship',
    phases: [{ id: 'implement', type: 'flow', mode: 'exclusive', use: 'spec-implement', dependsOn: [] }],
  };
  const result = flattenFlowPhases(parent, loader, 1, 5);
  it('pipeline-done channels passthrough with prefixed targets', () => {
    const done = result.phases.find((p) => p.id === 'implement/pipeline-done');
    expect(done?.channels).toEqual([
      'node:implement/spec-extract',
      'node:implement/minimal-track/archive',
      'node:implement/detailed-track/openspec-archive',
    ]);
  });
  it('spec-extract skill + dependsOn preserved', () => {
    const extract = result.phases.find((p) => p.id === 'implement/spec-extract');
    expect(extract?.dependsOn).toEqual([]);
  });
  it('full child phase set inherited with flow prefix', () => {
    const ids = result.phases.map((p) => p.id);
    expect(ids).toContain('implement/spec-extract');
    expect(ids).toContain('implement/pipeline-accept');
    expect(ids).toContain('implement/minimal-track/apply-change');
    expect(ids).toContain('implement/detailed-track/to-spec');
    expect(ids).toContain('implement/pipeline-done');
  });
  // NOTE: the historical implement graph (work-input/openspec-finalize) is
  // gone — spec-implement is the current implementation graph (spec-extract
  // → track gate → minimal/detailed tracks → pipeline-done); the unselected
  // route never completes and never blocks (route-first).
});
// ---------------------------------------------------------------------------
// Entry-rooted flow — dependsOn: [] (arch-review-loop closed-loop pattern):
// entry child inherits empty upstream (JUMP closure stays empty), child gate
// jump targets/channels get the flow prefix, parent routing target rewrites to
// the entry node so a loop retry re-runs only the flow segment. when
// propagation removed (branch-routing redesign).
// ---------------------------------------------------------------------------
describe('flattenFlowPhases — entry-rooted flow branch prefixing and loop target rewrite', () => {
  function loopChild(): Taskflow {
    return {
      name: 'pipeline',
      phases: [
        { id: 'grill', type: 'main', mode: 'exclusive', task: 'grill', dependsOn: [], operations: [] },
        { id: 'create', type: 'main', mode: 'exclusive', task: 'create', dependsOn: ['grill'], operations: [] },
        {
          id: 'accept',
          type: 'gate',
          mode: 'exclusive',
          dependsOn: ['create'],
          jumps: [{ when: 'create output shows ok', to: 'create' }],
        },
      ],
    };
  }
  function loopLoader(name: string): Taskflow | null {
    if (name === 'pipeline') return loopChild();
    return null;
  }
  it('entry-rooted flow keeps empty upstream on entry child; child gate jump refs get the flow prefix', () => {
    const parent: Taskflow = {
      name: 'loop',
      phases: [
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'review-accept', type: 'approval', mode: 'exclusive', dependsOn: ['review'] },
        { id: 'implement', type: 'flow', mode: 'exclusive', use: 'pipeline', dependsOn: [] },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['implement'], operations: [] },
      ],
    };
    const result = flattenFlowPhases(parent, loopLoader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'implement/grill');
    const create = result.phases.find((p) => p.id === 'implement/create');
    const accept = result.phases.find((p) => p.id === 'implement/accept');
    // Entry child inherits flow dependsOn (empty) — JUMP upstream closure stays empty
    expect(entry?.dependsOn).toEqual([]);
    // Child internal chain preserved
    expect(create?.dependsOn).toEqual(['implement/grill']);
    expect(accept?.dependsOn).toEqual(['implement/create']);
    // reads removed (schema field convergence) — reads == dependsOn here, so
    // nothing to migrate to channels; jump refs prefixed (child-internal refs)
    expect(accept?.reads).toBeUndefined();
    expect(accept?.channels).toBeUndefined();
    expect(accept?.jumps?.[0].to).toBe('implement/create');
    // when propagation removed — nothing carries a guard
    for (const p of result.phases) {
      expect(p.when).toBeUndefined();
    }
    // Downstream parent node rewired to child terminal (the gate — no end marker)
    const verify = result.phases.find((p) => p.id === 'verify');
    expect(verify?.dependsOn).toEqual(['implement/accept']);
  });
  it('parent routing target naming the flow rewrites to the entry node — loop retry re-runs only the segment', () => {
    const parent: Taskflow = {
      name: 'loop',
      phases: [
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: [], operations: [] },
        { id: 'review-accept', type: 'approval', mode: 'exclusive', dependsOn: ['review'] },
        { id: 'implement', type: 'flow', mode: 'exclusive', use: 'pipeline', dependsOn: [] },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['implement'], operations: [] },
        {
          id: 'loop-accept',
          type: 'approval',
          mode: 'exclusive',
          dependsOn: ['verify'],
          routing: {
            actions: [
              { action: 'retry', target: 'implement', label: 'Loop pipeline again', description: 're-run' },
              { action: 'jump', target: 'review', label: 'Re-scope review', description: 'fresh scope' },
            ],
          },
        },
      ],
    };
    const result = flattenFlowPhases(parent, loopLoader, 1, 5);
    const gate = result.phases.find((p) => p.id === 'loop-accept');
    const actions = gate?.routing?.actions ?? [];
    const retry = actions.find((a) => a.action === 'retry');
    // Flow-id target rewritten to the flattened entry node — findUpstream(entry) = []
    expect(retry?.target).toBe('implement/grill');
    const jump = actions.find((a) => a.action === 'jump');
    // Non-flow target untouched (parent-level node stays unprefixed)
    expect(jump?.target).toBe('review');
  });
  it('flow-level when is rejected at schema level — guards never flatten', () => {
    // when removed (branch-routing redesign): a flow phase declaring one fails schema parsing
    const parent: Taskflow = {
      name: 'loop',
      phases: [
        {
          id: 'implement',
          type: 'flow',
          mode: 'exclusive',
          use: 'pipeline',
          dependsOn: [],
          when: 'flow-level guard',
        },
      ],
    };
    // flattenFlowPhases is schema-agnostic — it strips nothing and never
    // propagates; the schema is the single enforcement point for when removal.
    const result = flattenFlowPhases(parent, loopLoader, 1, 5);
    const grill = result.phases.find((p) => p.id === 'implement/grill');
    const create = result.phases.find((p) => p.id === 'implement/create');
    // no propagation, no copy — child guards stay absent
    expect(grill?.when).toBeUndefined();
    expect(create?.when).toBeUndefined();
  });
});
