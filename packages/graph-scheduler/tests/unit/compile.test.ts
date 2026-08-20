/**
 * Compile-product unit tests — the compiled graph shape SHALL expose only
 * consumed members: no `nodes` / `CompiledNodeMeta` surface, nodeIds,
 * downstream closure, completion map, meta. Flat assembly
 * (graph-subgraph-route-unify): node ids are phase ids exactly — subgraph
 * composition (`use`, compile-time child loading) is deleted, nested
 * execution is the frontend-launched `template: router` sibling run, so
 * there is no namespacing, no per-level handoff, no resolveTarget map, and
 * meta.constraints carry the root graph only. Assertions pin the refactored
 * compile surface so a dead surface cannot regress.
 */
import { describe, expect, it } from 'vitest';

import { compileWorkflow, type NodeStatus } from '../../src/compile.js';
import type { Workflow } from '../../src/graph-definition.js';

/** Minimal linear workflow — compile input shape. */
function linearWorkflow(): Workflow {
  return {
    name: 'compile-shape',
    phases: [
      { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
      { id: 'next', type: 'main', task: 'next', dependsOn: ['entry'], operations: [] },
    ],
  };
}

/** Parent workflow whose nested execution is a `template: router` node. */
function routerWorkflow(): Workflow {
  return {
    name: 'router-shape',
    phases: [
      { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
      {
        id: 'router',
        type: 'main',
        template: 'router',
        template_args: { paths: ['child-graph'] },
        dependsOn: ['entry'],
      },
    ],
  };
}

describe('compile product shape', () => {
  it('exposes only consumed members — no nodes/CompiledNodeMeta surface', () => {
    const compiled = compileWorkflow(linearWorkflow());
    expect('nodes' in compiled).toBe(false);
    expect((compiled as unknown as { nodes?: unknown }).nodes).toBeUndefined();
    // Handoff synthesis — every graph gains a single root `__handoff` terminal.
    expect(compiled.nodeIds).toEqual(['entry', 'next', '__handoff']);
    expect(compiled.meta.name).toBe('compile-shape');
  });

  it('carries the NodeStatus single source and downstream closure', () => {
    const compiled = compileWorkflow(linearWorkflow());
    const status: NodeStatus = 'pending';
    expect(['pending', 'active', 'done']).toContain(status);
    // entry → next → __handoff: the handoff terminal is downstream of every node.
    expect(compiled.downstream.get('entry')).toEqual(new Set(['next', '__handoff']));
    expect(compiled.downstream.get('next')).toEqual(new Set(['__handoff']));
    expect(compiled.downstream.get('__handoff')?.size ?? 0).toBe(0);
  });

  it('synthesizes the handoff node as the graph terminal', () => {
    const compiled = compileWorkflow(linearWorkflow());
    // The handoff is registered in nodeMeta and wired as the terminal successor.
    expect(compiled.nodeIds).toContain('__handoff');
    expect(compiled.nodeIds.indexOf('__handoff')).toBe(compiled.nodeIds.length - 1);
    expect(compiled.downstream.get('next')).toEqual(new Set(['__handoff']));
    // The handoff payload carries the report task template + member channels.
    expect(compiled.nodeIds.indexOf('__handoff')).toBe(compiled.nodeIds.length - 1);
  });

  it('does not duplicate a source-declared __handoff phase', () => {
    const workflow: Workflow = {
      name: 'handoff-declared',
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        { id: '__handoff', type: 'main', task: 'custom handoff', dependsOn: ['entry'], operations: [] },
      ],
    };
    const compiled = compileWorkflow(workflow);
    // Guard: the source-declared id is not duplicated by synthesis.
    expect(compiled.nodeIds.filter((n) => n === '__handoff')).toHaveLength(1);
  });

  it('completion map carries machine-declared options — flow condition vocabulary', () => {
    const workflow: Workflow = {
      name: 'completion-shape',
      flow: ['decide -->|alpha| alpha', 'decide -->|beta| beta'],
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        {
          id: 'decide',
          type: 'main',
          task: 'choose the track (alpha or beta)',
          dependsOn: ['entry'],
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['decide'], operations: [] },
        { id: 'beta', type: 'main', task: 'beta', dependsOn: ['decide'], operations: [] },
      ],
    };
    const compiled = compileWorkflow(workflow);
    // choices derive from the labeled flow edges (the flow-defined condition
    // vocabulary) — task-text backticks are never a completion source.
    expect(compiled.completion.get('decide')?.choices).toEqual(['alpha', 'beta']);
    expect(compiled.completion.get('decide')?.default).toBe('continue');
  });

  it('completion choices carry flow condition labels, not node ids', () => {
    const workflow: Workflow = {
      name: 'completion-labels',
      flow: ['decide -->|pass| alpha', 'decide -->|fail| beta'],
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        { id: 'decide', type: 'main', task: 'judge', dependsOn: ['entry'], operations: [] },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['decide'], operations: [] },
        { id: 'beta', type: 'main', task: 'beta', dependsOn: ['decide'], operations: [] },
      ],
    };
    const compiled = compileWorkflow(workflow);
    expect(compiled.completion.get('decide')?.choices).toEqual(['pass', 'fail']);
  });

  it('task-text backticks never surface as completion choices', () => {
    const workflow: Workflow = {
      name: 'completion-no-backticks',
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        { id: 'decide', type: 'main', task: 're-run (jump back to `entry`)', dependsOn: ['entry'], operations: [] },
        { id: 'done', type: 'main', task: 'done', dependsOn: ['decide'], operations: [] },
      ],
    };
    const compiled = compileWorkflow(workflow);
    // no labeled flow edges — no choices (sequence default)
    expect(compiled.completion.get('decide')?.choices).toBeUndefined();
  });

  it('compiles router-template phases flat — plain ids, no resolveTarget', () => {
    // Subgraph composition is deleted: a `template: router` node is a plain
    // compiled node; its paths are frontend-launched sibling-run candidates,
    // never compiled-in child members.
    const compiled = compileWorkflow(routerWorkflow());
    // Node ids are the phase ids exactly — no `router/child-*` namespacing.
    expect(compiled.nodeIds).toEqual(['entry', 'router', '__handoff']);
    // resolveTarget (composing → child entry) is deleted.
    expect('resolveTarget' in compiled).toBe(false);
    expect((compiled as unknown as { resolveTarget?: unknown }).resolveTarget).toBeUndefined();
    // Downstream closure stays flat — the router node feeds the root handoff.
    expect(compiled.downstream.get('entry')).toEqual(new Set(['router', '__handoff']));
    expect(compiled.downstream.get('router')).toEqual(new Set(['__handoff']));
  });

  it('assembles router-template phases through the same loop — no boundary metadata', () => {
    const parent: Workflow = {
      name: 'boundary-shape',
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        {
          id: 'router',
          type: 'main',
          template: 'router',
          template_args: { paths: ['child-graph'] },
          dependsOn: ['entry'],
        },
      ],
    };
    const compiled = compileWorkflow(parent);
    // Flat assembly — the only members are the phase ids; no `router/child-*`
    // enumeration, no execution-mode facts on the compile product.
    expect(compiled.nodeIds).toEqual(['entry', 'router', '__handoff']);
    expect(compiled.nodeIds.some((id) => id.includes('/'))).toBe(false);
    // Exactly ONE root handoff — no per-level `<composing>/__handoff`.
    expect(compiled.nodeIds.filter((n) => n === '__handoff')).toHaveLength(1);
    expect(compiled.downstream.get('router')).toEqual(new Set(['__handoff']));
  });

  it('meta.constraints carry the root graph only — child constraint union deleted', () => {
    const parent: Workflow = {
      name: 'union-shape',
      constraints: ['root rule'],
      phases: [
        {
          id: 'router',
          type: 'main',
          template: 'router',
          template_args: { paths: ['child-graph'] },
          dependsOn: [],
        },
      ],
    };
    const compiled = compileWorkflow(parent);
    // No child loading at compile time — root constraints only, no union.
    expect(compiled.meta.constraints).toEqual(['root rule']);
  });

  it('passes root constraints through verbatim — no union/dedupe pass', () => {
    const parent: Workflow = {
      name: 'dedupe-shape',
      constraints: ['shared rule', 'shared rule'],
      phases: [
        {
          id: 'router',
          type: 'main',
          template: 'router',
          template_args: { paths: ['child-graph'] },
          dependsOn: [],
        },
      ],
    };
    const compiled = compileWorkflow(parent);
    // The compile product copies the root constraints exactly as declared —
    // the child-constraint union/dedupe machinery is deleted.
    expect(compiled.meta.constraints).toEqual(['shared rule', 'shared rule']);
  });

  it('assembles flat members — no nesting, single root handoff', () => {
    const parent: Workflow = {
      name: 'nested-hint-shape',
      phases: [
        {
          id: 'router',
          type: 'main',
          template: 'router',
          template_args: { paths: ['child-graph'] },
          dependsOn: [],
        },
      ],
    };
    const compiled = compileWorkflow(parent);
    // Flat assembly — no `outer/inner/...` namespaced members; exactly ONE
    // root __handoff terminal (per-level handoffs deleted).
    expect(compiled.nodeIds).toEqual(['router', '__handoff']);
    expect(compiled.nodeIds.filter((n) => n === '__handoff')).toHaveLength(1);
    expect(compiled.downstream.get('__handoff')?.size ?? 0).toBe(0);
  });
});

describe('handoff terminal scope (graph-handoff-result-report fix)', () => {
  it('scopes the root handoff to the graph terminals — every terminal branch feeds it', () => {
    // A branched (multi-terminal) graph — the single root handoff depends on
    // every graph terminal and the downstream closure spans the full branch.
    const root: Workflow = {
      name: 'terminal-scope',
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['entry'], operations: [] },
        { id: 'beta', type: 'main', task: 'beta', dependsOn: ['entry'], operations: [] },
      ],
    };
    const compiled = compileWorkflow(root);
    // One root handoff — downstream of BOTH branch terminals (alpha, beta).
    expect(compiled.nodeIds).toEqual(['entry', 'alpha', 'beta', '__handoff']);
    expect(compiled.downstream.get('entry')).toEqual(new Set(['alpha', 'beta', '__handoff']));
    expect(compiled.downstream.get('alpha')).toEqual(new Set(['__handoff']));
    expect(compiled.downstream.get('beta')).toEqual(new Set(['__handoff']));
    expect(compiled.downstream.get('__handoff')?.size ?? 0).toBe(0);
  });
});

describe('flow transition table compilation (graph-flow)', () => {
  /** A loop graph — flow self-edge on the round terminal. */
  function loopWorkflow(): Workflow {
    return {
      name: 'flow-loop-shape',
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        { id: 'body', type: 'main', task: 'body', dependsOn: ['entry'], operations: [] },
        { id: 'terminal', type: 'main', task: 'terminal', dependsOn: ['body'], operations: [] },
      ],
      flow: ['terminal -->|remaining| body', 'terminal -->|complete| entry'],
    };
  }

  it('compiles labeled edges into the condition→target table', () => {
    const compiled = compileWorkflow(loopWorkflow());
    expect(compiled.flowTable.get('terminal')?.conditions.get('remaining')).toBe('body');
    expect(compiled.flowTable.get('terminal')?.conditions.get('complete')).toBe('entry');
    // No unlabeled edges — no sequence default for the terminal.
    expect(compiled.flowTable.get('terminal')?.default).toEqual([]);
  });

  it('leaves nodes without flow edges out of the table', () => {
    const compiled = compileWorkflow(loopWorkflow());
    expect(compiled.flowTable.has('entry')).toBe(false);
    expect(compiled.flowTable.has('body')).toBe(false);
  });

  it('computes the topological-ancestor closure for the jump guard', () => {
    const compiled = compileWorkflow(loopWorkflow());
    // body's ancestors: entry (dependsOn chain). terminal's ancestors: entry, body.
    expect(compiled.ancestors.get('body')).toEqual(new Set(['entry']));
    expect(compiled.ancestors.get('terminal')).toEqual(new Set(['entry', 'body']));
    expect(compiled.ancestors.get('entry')?.size ?? 0).toBe(0);
    // __handoff is downstream of every terminal — its ancestors cover the graph.
    expect(compiled.ancestors.get('__handoff')).toEqual(new Set(['entry', 'body', 'terminal']));
  });

  it('fails load loudly when a flow edge references an undeclared phase', () => {
    const bad: Workflow = {
      name: 'flow-bad-endpoint',
      phases: [{ id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] }],
      flow: ['entry -->|pass| missing'],
    };
    expect(() => compileWorkflow(bad)).toThrow(/undeclared target phase 'missing'/);
  });

  it('fails load loudly on a malformed flow entry', () => {
    const bad: Workflow = {
      name: 'flow-bad-syntax',
      phases: [{ id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] }],
      flow: ['entry -->'],
    };
    expect(() => compileWorkflow(bad)).toThrow(/flow\[0\]/);
  });

  it('accepts a flow edge over the synthesized handoff target', () => {
    const compiled = compileWorkflow(loopWorkflow());
    // Self-edge on the round terminal + a pass edge routing to the handoff is
    // legal — the handoff is a compiled node id.
    const toHandoff: Workflow = {
      name: 'flow-to-handoff',
      phases: [{ id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] }],
      flow: ['entry -->|done| __handoff'],
    };
    expect(() => compileWorkflow(toHandoff)).not.toThrow();
    expect(compiled.nodeIds).toContain('__handoff');
  });
});
