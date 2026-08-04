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
      { id: 'scope-confirm', type: 'main', mode: 'exclusive', task: 'confirm scope', dependsOn: [] },
      {
        id: 'skill-write',
        type: 'main',
        mode: 'exclusive',
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'skill-ops', type: 'flow', mode: 'exclusive', use: 'skill-create', dependsOn: ['plan'] },
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: ['skill-ops'] },
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
          phases: [{ id: 'inner-node', type: 'main', mode: 'exclusive', dependsOn: [] }],
        };
      }
      if (name === 'outer-child') {
        return {
          name: 'outer-child',
          phases: [
            { id: 'pre', type: 'main', mode: 'exclusive', dependsOn: [] },
            { id: 'mid', type: 'flow', mode: 'exclusive', use: 'inner-flow', dependsOn: ['pre'] },
            { id: 'post', type: 'main', mode: 'exclusive', dependsOn: ['mid'] },
          ],
        };
      }
      return null;
    };
    const parent: Taskflow = {
      name: 'root',
      phases: [
        { id: 'start', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'outer', type: 'flow', mode: 'exclusive', use: 'outer-child', dependsOn: ['start'] },
        { id: 'end', type: 'main', mode: 'exclusive', dependsOn: ['outer'] },
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
        { id: 'skill-ops/scope-confirm', type: 'main', mode: 'exclusive', dependsOn: [] },
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
    version: 1,
    phases: [
      { id: 'skill-select', type: 'main', mode: 'exclusive', dependsOn: [], task: 'select skill' },
      {
        id: 'impact-analysis',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['skill-select'],
        task: 'analyze impact',
      },
      {
        id: 'delete-confirm',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['impact-analysis'],
        task: 'confirm delete',
      },
      {
        id: 'skill-delete-execute',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['delete-confirm'],
        task: 'execute delete',
      },
      {
        id: 'delete-review',
        type: 'main',
        mode: 'exclusive',
        dependsOn: ['skill-delete-execute'],
        task: 'review',
      },
      { id: 'delete-accept', type: 'approval', mode: 'exclusive', dependsOn: ['delete-review'] },
    ],
  };
}
/** doc-update child graph */
function docUpdateGraph(): Taskflow {
  return {
    name: 'doc-update',
    version: 1,
    phases: [
      { id: 'doc-scope', type: 'main', mode: 'exclusive', dependsOn: [], task: 'scope docs' },
      { id: 'doc-write', type: 'main', mode: 'exclusive', dependsOn: ['doc-scope'], task: 'write' },
      { id: 'doc-review', type: 'main', mode: 'exclusive', dependsOn: ['doc-write'], task: 'review' },
      { id: 'doc-accept', type: 'approval', mode: 'exclusive', dependsOn: ['doc-review'] },
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
        { id: 'plan-scope', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan scope' },
        { id: 'plan-accept', type: 'approval', mode: 'exclusive', dependsOn: ['plan-scope'] },
        {
          id: 'skill-delete-foo',
          type: 'flow',
          mode: 'exclusive',
          use: 'skill-delete',
          with: { skillName: 'example' },
          dependsOn: ['plan-accept'],
        },
        {
          id: 'doc-update',
          type: 'flow',
          mode: 'exclusive',
          use: 'doc-update',
          with: { docs: ['CONTEXT.md'] },
          dependsOn: ['plan-accept'],
        },
        {
          id: 'cross-review',
          type: 'main',
          mode: 'exclusive',
          skill: 'code-review',
          dependsOn: ['skill-delete-foo', 'doc-update'],
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan' },
        {
          id: 'skill-ops',
          type: 'flow',
          mode: 'exclusive',
          use: 'skill-delete',
          with: { skillName: 'foo', dryRun: true },
          dependsOn: ['plan'],
        },
        { id: 'done', type: 'main', mode: 'exclusive', dependsOn: ['skill-ops'] },
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan' },
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
      version: 1,
      phases: [
        {
          id: 'plan',
          type: 'main',
          mode: 'exclusive',
          dependsOn: [],
          task: 'plan work',
          channels: ['atom-kernel'],
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
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan' },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['plan'], task: 'verify' },
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
        { id: 'step1', type: 'main', mode: 'exclusive', dependsOn: [], task: 'do the work' },
        { id: 'step2', type: 'main', mode: 'exclusive', dependsOn: ['step1'], task: 'finish' },
      ],
    };
    const loader = (name: string): Taskflow | null => {
      if (name === 'template-test') return childWithTemplate;
      return null;
    };
    const parent: Taskflow = {
      name: 'with-test',
      phases: [
        { id: 'plan', type: 'main', mode: 'exclusive', dependsOn: [], task: 'plan' },
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
        { id: 'writer', type: 'main', mode: 'exclusive', dependsOn: [], channels: [] },
        {
          id: 'reader',
          type: 'main',
          mode: 'exclusive',
          dependsOn: ['writer'],
          channels: ['node:writer'],
        },
      ],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [] },
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
      phases: [{ id: 'writer', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:seed'] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const writer = result.phases.find((p) => p.id === 'ops/writer');
    // seed is a parent-level node — cross-level reference stays as-is
    expect(writer?.channels).toEqual(['node:seed']);
  });
});
describe('flattenFlowPhases — flow input interface channel propagation', () => {
  it('propagates flow channels to every entry child, merged with child channels', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [
        { id: 'a', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['./CONTEXT.md'] },
        { id: 'b', type: 'main', mode: 'exclusive', dependsOn: [], channels: [] },
        { id: 'c', type: 'main', mode: 'exclusive', dependsOn: ['a'] },
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
          channels: ['node:grill/grilling'],
        },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const a = result.phases.find((p) => p.id === 'ops/a');
    const b = result.phases.find((p) => p.id === 'ops/b');
    const c = result.phases.find((p) => p.id === 'ops/c');
    // entry children get flow channels first + own channels preserved
    expect(a?.channels).toEqual(['node:grill/grilling', './CONTEXT.md']);
    expect(b?.channels).toEqual(['node:grill/grilling']);
    // non-entry child untouched
    expect(c?.channels).toBeUndefined();
  });
  it('dedups identical entries — flow-first, string equality', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [{ id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['./CONTEXT.md'] }],
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
          channels: ['./CONTEXT.md', 'node:grill/grilling'],
        },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    expect(entry?.channels).toEqual(['./CONTEXT.md', 'node:grill/grilling']);
  });
  it('child node: channel to non-parent id still prefixed — distinct from flow-level entry', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [{ id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:grill/grilling'] }],
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
          channels: ['node:grill/grilling'],
        },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // child ref is a child-sibling target (prefixed ops/grill/grilling); flow ref targets the composed graph — both kept
    expect(entry?.channels).toEqual(['node:grill/grilling', 'node:ops/grill/grilling']);
  });
  it('flow without channels — child behavior unchanged', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [{ id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [], channels: ['node:seed'] }],
    };
    const loader = (name: string): Taskflow | null => (name === 'sub-graph' ? child : null);
    const parent: Taskflow = {
      name: 'parent',
      phases: [
        { id: 'seed', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'ops', type: 'flow', mode: 'exclusive', use: 'sub-graph', dependsOn: [] },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    // parent-level target stays unprefixed; no flow channels to merge
    expect(entry?.channels).toEqual(['node:seed']);
  });
  it('flow channels never silently dropped — entries always carry them', () => {
    const child: Taskflow = {
      name: 'sub-graph',
      phases: [{ id: 'entry', type: 'main', mode: 'exclusive', dependsOn: [] }],
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
          channels: ['node:grill/grilling'],
        },
      ],
    };
    const result = flattenFlowPhases(parent, loader, 1, 5);
    const entry = result.phases.find((p) => p.id === 'ops/entry');
    expect(entry?.channels).toEqual(['node:grill/grilling']);
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
        { id: 'write', type: 'main', mode: 'exclusive', task: 'x', dependsOn: [] },
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
        { id: 'parent-node', type: 'main', mode: 'exclusive', dependsOn: [] },
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
        { id: 'write', type: 'main', mode: 'exclusive', task: 'x', dependsOn: [] },
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
// Composition inheritance — parent graph flows the built-in implement graph
// (G3: merge-at-load carries openspec-finalize + when guard + channels into
// the parent; idea-to-ship not yet created — this test IS the inheritance proof)
// ---------------------------------------------------------------------------
describe('flattenFlowPhases — composition inheritance of implement finalize', () => {
  const { readFileSync } = require('node:fs');
  const { join } = require('node:path');
  const { parse: parseYaml } = require('yaml');
  const pkgRoot = join(__dirname, '..', '..');
  const implementGraph = parseYaml(
    readFileSync(join(pkgRoot, 'graphs', 'implement.taskflow.yaml'), 'utf-8'),
  ) as Taskflow;
  const loader = (name: string): Taskflow | null => (name === 'implement' ? implementGraph : null);
  const parent: Taskflow = {
    name: 'idea-to-ship',
    phases: [{ id: 'implement', type: 'flow', mode: 'exclusive', use: 'implement', dependsOn: [] }],
  };
  const result = flattenFlowPhases(parent, loader, 1, 5);
  it('finalize channels passthrough with prefixed targets', () => {
    const finalize = result.phases.find((p) => p.id === 'implement/openspec-finalize');
    expect(finalize?.channels).toEqual(['node:implement/work-input']);
  });
  it('finalize skill + dependsOn preserved', () => {
    const finalize = result.phases.find((p) => p.id === 'implement/openspec-finalize');
    expect(finalize?.skill).toBe('atom-openspec-archive');
    expect(finalize?.dependsOn).toEqual(['implement/implement-accept']);
  });
  it('gate jump target remapped to flattened writer', () => {
    const gate = result.phases.find((p) => p.id === 'implement/implement-gate');
    expect(gate?.jumps?.[0].to).toBe('implement/implement');
  });
  it('full child phase set inherited', () => {
    const ids = result.phases.map((p) => p.id);
    expect(ids).toEqual([
      'implement/work-input',
      'implement/implement',
      'implement/implement-review',
      'implement/implement-gate',
      'implement/implement-accept',
      'implement/openspec-finalize',
    ]);
  });
  // NOTE: 'finalize-gate inherited with reads prefixed and branch carrying
  // the input-source condition' and 'end marker inherited with prefixed
  // dependsOn' DELETED — the migrated implement graph has no finalize-gate
  // (input-source judgment moved into openspec-finalize case-5) and no end
  // marker (route-first: no end type; completion is natural drain).
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
        { id: 'grill', type: 'main', mode: 'exclusive', task: 'grill', dependsOn: [] },
        { id: 'create', type: 'main', mode: 'exclusive', task: 'create', dependsOn: ['grill'] },
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
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'review-accept', type: 'approval', mode: 'exclusive', dependsOn: ['review'] },
        { id: 'implement', type: 'flow', mode: 'exclusive', use: 'pipeline', dependsOn: [] },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['implement'] },
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
        { id: 'review', type: 'main', mode: 'exclusive', dependsOn: [] },
        { id: 'review-accept', type: 'approval', mode: 'exclusive', dependsOn: ['review'] },
        { id: 'implement', type: 'flow', mode: 'exclusive', use: 'pipeline', dependsOn: [] },
        { id: 'verify', type: 'main', mode: 'exclusive', dependsOn: ['implement'] },
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
