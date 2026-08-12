/**
 * Graph contract tests — dispatch, approval routing, and gate jump hygiene
 * checks per the route-first v4 redesign.
 *
 * Covers:
 * - 2.5 skill optional on main; 'agent' type unregistered → load-time GraphDefinitionError
 * - 2.2 route-first contract: gate jumps backward-only + bounded, route-hygiene
 *   warning, redundant transitive dependency rejection
 * - route-first fleet contract: no end nodes, no branches/default/mode/when/eval,
 *   approvals declare no written routing except the pipeline branch-route scenario,
 *   every gate jump is backward + retryCount-bounded
 * - 2.3 gate jump condition hygiene (hardcoded output path / sibling existence)
 * - 2.6 topology assertion: approval ready only when review node done
 * - 2.7-2.13 migrated built-in graph topologies (final route-first shapes)
 * - 2.8 snapshot nodes: advance/jump snapshot enumerates per-node states (M2)
 */
import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { toTaskflowGraph } from '../src/api/graph-loader.js';
import { buildSnapshot } from '../src/api/snapshot.js';
import { validateGraphContracts } from '../src/context/contracts.js';
import type { FsmState, TaskflowGraph } from '../src/fsm/transition.js';
import type { Taskflow } from '../src/graph-definition.js';
import { PhaseSchema } from '../src/schemas/phase.js';
import { resolveReady } from '../src/topology.js';
import type { Phase } from '../src/types.js';

const PKG_ROOT = join(__dirname, '..');

/** built-in graphs dispatched to contract checks (fleet scans) */
const BUILTIN_GRAPHS = [
  'arch-review.taskflow.yaml',
  'arch-review-loop.taskflow.yaml',
  'e2e-minimal.taskflow.yaml',
  'graph-generate.taskflow.yaml',
  'adopt-with-docs.taskflow.yaml',
  'openspec-apply.taskflow.yaml',
  'openspec-engineer.taskflow.yaml',
  'spec-implement.taskflow.yaml',
  'estate-maintain.taskflow.yaml',
  'release-prep.taskflow.yaml',
] as const;

function loadGraph(name: string): Record<string, unknown> {
  const raw = readFileSync(join(PKG_ROOT, 'graphs', name), 'utf-8');
  return parseYaml(raw) as Record<string, unknown>;
}

/** typed FsmState builder — no silent field loss via double casts */
function runningState(): FsmState {
  return {
    status: 'running',
    runId: 'run-1',
    graphName: 'g',
    startedAt: '2026-08-01T00:00:00.000Z',
    phases: {
      a: {
        status: 'done',
        retryCount: 0,
        startedAt: '2026-08-01T00:00:00.000Z',
        completedAt: '2026-08-01T00:01:00.000Z',
      },
      b: { status: 'active', retryCount: 0, startedAt: '2026-08-01T00:02:00.000Z' },
      c: {
        status: 'aborted',
        retryCount: 1,
        startedAt: '2026-08-01T00:00:00.000Z',
        completedAt: '2026-08-01T00:00:30.000Z',
      },
    },
    routes: {},
  };
}

/** transitive upstream closure — shared by the fleet jump-upstream check */
function upstreamClosureOf(id: string, byId: Map<string, Record<string, unknown>>): Set<string> {
  const seen = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    const phase = byId.get(cur);
    if (!phase) continue;
    for (const dep of (phase.dependsOn ?? []) as string[]) {
      if (dep && !seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  seen.delete(id);
  return seen;
}

// ---------------------------------------------------------------------------
// 2.5 — skill optional on main phases; 'agent' phase type unregistered
// skill-less main passes contract
// validation, and the removed 'agent' type fails at load (toTaskflowGraph →
// GraphDefinitionError).
// ---------------------------------------------------------------------------

// Load-time rejection — toTaskflowGraph is runtime-free (static type dispatch).

describe('2.5 main phase skill optional; agent type unregistered', () => {
  it('skill-less main phase passes validation', () => {
    const graph = {
      name: 'test',

      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('main phase with explicit skill passes validation', () => {
    const graph = {
      name: 'test',

      phases: [{ id: 'a', type: 'main', dependsOn: [], skill: 'code-review', task: 'x', operations: [] }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('main and approval phases are exempt', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'ap', type: 'approval', dependsOn: ['m'] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects agent phase type at load — GraphDefinitionError (unregistered)', async () => {
    const tf = {
      name: 'test',

      phases: [{ id: 'a', type: 'agent', dependsOn: [], skill: 'code-review', task: 'x' }],
    } as unknown as Taskflow;
    await expect(Effect.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/Unknown phase type 'agent'/);
    await expect(Effect.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/Registered types:/);
  });

  it('built-in fleet declares zero agent phases (unregistered)', () => {
    for (const name of BUILTIN_GRAPHS) {
      const tf = loadGraph(name);
      const phases = (tf.phases ?? []) as Array<Record<string, unknown>>;
      const agentPhases = phases.filter((p) => p.type === 'agent');
      expect(agentPhases, `${name} agent phases`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2.2 — route-first contract: gate jump hygiene + route hygiene
// (approval dependsOn convergence was removed with the review-convergence rule;
//  approval routing actions are validated in the runtime branch-route path)
// ---------------------------------------------------------------------------

describe('2.2 route-first contract', () => {
  it('rejects redundant transitive dependencies on any phase', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x', operations: [] },
        { id: 'c', type: 'main', dependsOn: ['a', 'b'], task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('redundant transitive dependency'))).toBe(true);
  });

  it('accepts minimal direct dependencies', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x', operations: [] },
        { id: 'c', type: 'main', dependsOn: ['b'], task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects gate jump targeting a non-upstream (forward) phase', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: 'a output shows fail', to: 'downstream' }],
        },
        { id: 'downstream', type: 'main', dependsOn: ['g'], task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes("gate jump targets 'downstream' which is NOT upstream of the gate"))).toBe(
      true,
    );
  });

  it('rejects gate jump targeting a missing phase', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: 'a output shows fail', to: 'ghost' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    // missing target is not upstream — the backward-only error fires
    expect(errors.some((e) => e.includes("gate jump targets 'ghost' which is NOT upstream of the gate"))).toBe(true);
  });

  it('warns on unbounded jump (no retryCount bound)', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: 'a output shows overall: fail', to: 'a' }],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unbounded (no retryCount bound)'))).toBe(true);
  });

  it('warns on jump retrying the reviewer node', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'r', type: 'main', dependsOn: ['w'], skill: 'code-review', task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          channels: ['node:w'],
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'r' }],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('jump targets reviewer node'))).toBe(true);
  });

  it('errors on jump condition referencing a node outside the judgment context', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          // 'w' is referenced but not a direct dep, not a node: channel, and
          // not a jump target (to: r) — out of scope
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'r' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(
      errors.some((e) => e.includes("references 'w'") && e.includes('outside the declared judgment context')),
    ).toBe(true);
  });

  it('accepts jump condition referencing a declared node: channel target', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          channels: ['node:w'],
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'w' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('errors on join: any whose upstreams span a single route', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'b', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'j', type: 'main', dependsOn: ['a', 'b'], join: 'any', task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(
      errors.some((e) => e.includes('join: any requires direct upstreams spanning at least 2 distinct routes')),
    ).toBe(true);
  });

  it('accepts join: any whose upstreams span two routes (track convergence)', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], route: 'track-a', task: 'x', operations: [] },
        { id: 'b', type: 'main', dependsOn: [], route: 'track-b', task: 'x', operations: [] },
        { id: 'j', type: 'main', dependsOn: ['a', 'b'], join: 'any', task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('accepts bounded jump with writer target (no warnings)', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'w' }],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('unbounded') || w.includes('reviewer'))).toHaveLength(0);
  });

  it('warns on a declared route with no approvals at all (provably unselectable)', () => {
    const graph = {
      name: 'test',

      phases: [{ id: 'a', type: 'main', route: 'orphan', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes("route 'orphan' is declared"))).toBe(true);
  });

  it('warns on a route NOT referenced by any written routing action — AI-dynamic activation is a soft path even when an approval exists', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'r', type: 'main', route: 'dyn', dependsOn: [], task: 'x', operations: [] },
        { id: 'ap', type: 'approval', dependsOn: ['r'], task: 't' },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes("route 'dyn' is declared"))).toBe(true);
    expect(warnings.some((w) => w.includes('no written routing action targets it'))).toBe(true);
  });

  it('does NOT warn on a route referenced by a written routing action target', () => {
    const graph = {
      name: 'test',

      phases: [
        {
          id: 'ap',
          type: 'approval',
          dependsOn: [],
          task: 't',
          routing: { actions: [{ action: 'continue', target: 'track-a', value: 'track-a', label: 'A' }] },
        },
        { id: 'a', type: 'flow', use: 'openspec-apply', route: 'track-a', dependsOn: ['ap'] },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes("route 'track-a' is declared"))).toBe(false);
  });

  it('warns on retry/jump without explicit target — AI dynamic options need none', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: {
            actions: [
              { action: 'retry', label: 'Fix' },
              { action: 'jump', label: 'Back' },
            ],
          },
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    const targetWarnings = warnings.filter((w) => w.includes('lacks explicit target'));
    expect(targetWarnings.length).toBe(2);
    for (const w of targetWarnings) expect(w).toContain('lacks explicit target');
  });

  it('errors on routing target referencing missing phase', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: {
            actions: [{ action: 'retry', target: 'ghost', label: 'Fix', description: 'x' }],
          },
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('targets missing phase/route'))).toBe(true);
  });

  it('accepts flow-id target pre-flatten and flattened-style prefixed target', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'create', type: 'flow', use: 'spec-implement', dependsOn: [] },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['create'],
          routing: {
            actions: [
              { action: 'retry', target: 'create', label: 'Re-run flow', description: 'x' },
              { action: 'jump', target: 'create/minimal-track/apply-change', label: 'Regen', description: 'x' },
            ],
          },
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Route-first fleet contract — all built-in graphs follow the v4 shape:
// no end nodes, no removed fields, approvals without written routing (except
// the pipeline branch-route scenario), gates as bounded backward jumps.
// Raw assertions only — load-path validation lives in the graph-loading tests.
// ---------------------------------------------------------------------------

describe('route-first fleet contract', () => {
  it('no end nodes; no branches/default/mode/when/eval anywhere', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
      for (const p of phases) {
        const id = String(p.id);
        expect(p.type, `${name}/${id} no end`).not.toBe('end');
        expect(p.branches, `${name}/${id} branches removed`).toBeUndefined();
        expect(p.default, `${name}/${id} default removed`).toBeUndefined();
        expect(p.mode, `${name}/${id} mode removed`).toBeUndefined();
        expect(p.when, `${name}/${id} when removed`).toBeUndefined();
        expect(p.eval, `${name}/${id} eval removed`).toBeUndefined();
      }
    }
  });

  it('approvals declare no written routing — except pipeline-accept branch-route, and never default: true', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
      for (const p of phases) {
        if (p.type !== 'approval') continue;
        const actions = ((p.routing as Record<string, unknown> | undefined)?.actions ?? []) as Array<
          Record<string, unknown>
        >;
        if (
          (name === 'spec-implement.taskflow.yaml' && p.id === 'pipeline-accept') ||
          (name === 'arch-review-loop.taskflow.yaml' && p.id === 'round-continue')
        ) {
          // the ONLY branch-route scenarios — pipeline track selection and the
          // loop content gate (continue → proceed route + declared end); no default
          expect(actions.length, `${name}/${String(p.id)} branch-route actions`).toBe(2);
          for (const a of actions) {
            expect(a.default, `${name}/${String(p.id)} no default:true`).toBeUndefined();
          }
        } else {
          expect(actions.length, `${name}/${String(p.id)} no written actions`).toBe(0);
        }
      }
    }
  });

  it('every gate jump targets an upstream phase and is retryCount-bounded', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
      const byId = new Map(phases.map((p) => [String(p.id), p]));
      for (const g of phases.filter((p) => p.type === 'gate')) {
        const id = String(g.id);
        const jumps = (g.jumps ?? []) as Array<Record<string, unknown>>;
        expect(jumps.length, `${name}/${id} jumps present`).toBeGreaterThanOrEqual(1);
        const gateUpstream = upstreamClosureOf(id, byId);
        for (const jump of jumps) {
          const target = String(jump.to);
          // flow-qualified target (flowId/nodeId) is upstream when the flow is
          // in the closure and the node lives inside it — jumps target the
          // flow's entry node, e.g. requirement/scope-entry in arch-review-loop
          const [flowId, nodeId] = target.split('/');
          const isUpstream =
            gateUpstream.has(target) || (nodeId !== undefined && byId.has(flowId) && gateUpstream.has(flowId));
          expect(isUpstream, `${name}/${id} jump ${target} upstream`).toBe(true);
          expect(String(jump.when), `${name}/${id} jump bound`).toMatch(/retryCount/);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2.3 — gate jump condition hygiene
// ---------------------------------------------------------------------------

describe('2.3 gate jump condition hygiene', () => {
  it('accepts inert .taskflow/outputs text in jump condition — path checks removed', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: '.taskflow/outputs/a.output.txt shows x', to: 'a' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    // Runtime path checks removed — the path no longer exists; inert text passes clean.
    expect(errors).toEqual([]);
  });

  it('rejects sibling-output-existence jump condition', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: 'a output has save_location and no sibling output present', to: 'a' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('sibling output existence'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.6 — approval readiness follows review conclusion (topology)
// ---------------------------------------------------------------------------

describe('2.6 approval readiness depends on review node only', () => {
  const phases: Phase[] = [
    // join absent = default all (explicit 'all' rejected by schema — redundant default)
    { id: 'write-a', type: 'main', dependsOn: [], task: 'x', mode: 'exclusive', operations: [] },
    { id: 'write-b', type: 'main', dependsOn: [], task: 'x', mode: 'exclusive', operations: [] },
    {
      id: 'review',
      type: 'main',
      dependsOn: ['write-a', 'write-b'],
      join: 'any',
      skill: 'code-review',
      task: 'x',
      mode: 'exclusive',

      operations: [],
    },
    { id: 'accept', type: 'approval', dependsOn: ['review'], mode: 'exclusive' },
  ];

  it('writer done + review active → approval NOT ready', () => {
    const terminal = new Set(['write-a']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'pending' },
      review: { status: 'active' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).not.toContain('accept');
  });

  it('review done → approval ready', () => {
    const terminal = new Set(['write-a', 'write-b', 'review']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'done' },
      review: { status: 'done' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).toContain('accept');
  });

  it('review join:any ready when first writer done', () => {
    const terminal = new Set(['write-a']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'pending' },
      review: { status: 'pending' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).toContain('review');
    expect(ready.map((p) => p.id)).not.toContain('accept');
  });
});

// ---------------------------------------------------------------------------
// 2.14 — graph-generate concrete maker graph (identity redesign):
// entry → spec → spec-accept → implement → review → gate → accept. Single
// kind (graph), single operation (create); no skeleton, no kind switch, no
// skill co-production. Implement writes .taskflow.yaml + registry entry +
// attached doc at .graph-scheduler/docs/<name>.md.
// ---------------------------------------------------------------------------

describe('2.14 graph-generate concrete maker graph topology', () => {
  const graph = loadGraph('graph-generate.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('seven phases in dependency order — entry node, no end marker, no flow composition', () => {
    expect(phases.map((p) => p.id)).toEqual(['entry', 'spec', 'spec-accept', 'implement', 'review', 'gate', 'accept']);
    expect(phases.some((p) => p.type === 'flow')).toBe(false);
    expect(phaseOf('entry').skill).toBe('atom-scope-interview');
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('linear chain — spec before implement (spec-first), gate after review, bounded to implement', () => {
    expect(phaseOf('spec').dependsOn).toEqual(['entry']);
    expect(phaseOf('spec-accept').dependsOn).toEqual(['spec']);
    expect(phaseOf('implement').dependsOn).toEqual(['spec-accept']);
    expect(phaseOf('review').dependsOn).toEqual(['implement']);
    expect(phaseOf('gate').dependsOn).toEqual(['review']);
    expect(phaseOf('accept').dependsOn).toEqual(['gate']);
  });

  it('two approval layers — spec-accept + final accept, nothing more', () => {
    const approvals = phases.filter((p) => p.type === 'approval');
    expect(approvals.map((p) => p.id)).toEqual(['spec-accept', 'accept']);
  });

  it('gate is a pure backward rework jump to the writer phase, bounded, no default', () => {
    const gate = phaseOf('gate');
    expect(gate.type).toBe('gate');
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(String(jumps[0].when)).toMatch(/overall: fail AND implement retryCount < 2/);
    expect(jumps[0].to).toBe('implement');
    expect(gate.default).toBeUndefined();
  });

  it('entry declares foreign-project degradation + no skill co-production', () => {
    const entry = phaseOf('entry');
    // CONTEXT.md lives in the config default layer (global channel) —
    // entry no longer declares per-phase channels
    expect(entry.channels).toBeUndefined();
    expect(graph.context).toEqual(expect.arrayContaining(['skill:atom-graph-spec']));
    const task = String(entry.task);
    expect(task).toMatch(/context=optional/);
    expect(task).toMatch(/no skill co-production/i);
    expect(task).not.toMatch(/kind=skill/);
    expect(task).not.toMatch(/operation.*(edit|delete)/);
  });

  it('implement output contract covers the three-path bundle + load-probe validation', () => {
    const implement = phaseOf('implement');
    const task = String(implement.task);
    expect(task).toMatch(/artifact_path/);
    expect(task).toMatch(/registry_path/);
    expect(task).toMatch(/doc_path/);
    expect(task).toMatch(/graph_start/);
    expect(task).toMatch(/graph_force_end/);
    expect(task).not.toMatch(/graph_init/);
    expect(task).toMatch(/\.graph-scheduler\/docs\//);
  });

  it('spec/implement declare production skills — contract-driven spec injection', () => {
    expect(phaseOf('spec').skill).toBe('atom-graph-design');
    expect(phaseOf('implement').skill).toBe('atom-graph-writer');
  });

  it('review declares code-review with node inputs; atom-graph-spec inherited at graph level', () => {
    const review = phaseOf('review');
    expect(review.skill).toBe('code-review');
    expect(review.channels).toEqual(expect.arrayContaining(['node:entry', 'node:spec']));
    // atom-graph-spec moved to graph-level ambient scope — no per-node repeat
    expect(review.channels).not.toContain('skill:atom-graph-spec');
    expect(review.channels).not.toContain('node:implement');
  });

  it('no kind switch, no skill co-production — no spec_skill enum anywhere', () => {
    for (const p of phases) {
      const task = String(p.task ?? '');
      expect(task).not.toMatch(/spec_skill/);
      expect(task).not.toMatch(/atom-skill-spec/);
      expect(task).not.toMatch(/operation \(create \| edit/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2.15 — openspec-apply / openspec-engineer spec-skill loading rule
// (scenario split): implementation + review nodes declare the deterministic
// domain → spec-skill mapping rule (graph → atom-graph-spec, skill →
// atom-skill-spec, doc → atom-doc-maintain); no static single-kind
// skill:atom-graph-spec channel remains.
// ---------------------------------------------------------------------------

describe('2.15 openspec-apply / openspec-engineer spec-skill rule', () => {
  const RULE = /atom-skill-spec.*atom-doc-maintain|graph → atom-graph-spec/s;

  it('openspec-apply: apply-change + change-review declare the mapping rule', () => {
    const graph = loadGraph('openspec-apply.taskflow.yaml');
    const phases = graph.phases as Array<Record<string, unknown>>;
    for (const id of ['apply-change', 'change-review']) {
      const p = phases.find((ph) => ph.id === id);
      expect(p, `phase ${id} present`).toBeDefined();
      expect(String(p?.task ?? '')).toMatch(RULE);
      expect(String(p?.task ?? '')).toMatch(/atom-doc-maintain/);
    }
  });

  it('openspec-engineer: implement + implement-review declare the mapping rule', () => {
    const graph = loadGraph('openspec-engineer.taskflow.yaml');
    const phases = graph.phases as Array<Record<string, unknown>>;
    for (const id of ['implement', 'implement-review']) {
      const p = phases.find((ph) => ph.id === id);
      expect(p, `phase ${id} present`).toBeDefined();
      expect(String(p?.task ?? '')).toMatch(RULE);
      expect(String(p?.task ?? '')).toMatch(/atom-doc-maintain/);
    }
  });

  it('no static skill:atom-graph-spec channel in either implementation graph', () => {
    for (const name of ['openspec-apply.taskflow.yaml', 'openspec-engineer.taskflow.yaml']) {
      const graph = loadGraph(name);
      const phases = graph.phases as Array<Record<string, unknown>>;
      for (const p of phases) {
        const channels = (p.channels as Array<string> | undefined) ?? [];
        expect(channels, `${name} ${String(p.id)} channels`).not.toContain('skill:atom-graph-spec');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2.9 — spec-implement graph (pure implementation machinery): entry extract →
// track gate → archive → doc maintenance → terminal. No spec generation, no
// auto-loop gate — the change comes from the adopt stage (adopt-with-docs
// spec-propose); rework is the single loop in arch-review-loop.
// ---------------------------------------------------------------------------

describe('2.9 spec-implement graph topology', () => {
  const graph = loadGraph('spec-implement.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('five phases in dependency order with single entry and no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'spec-extract',
      'pipeline-accept',
      'minimal-track',
      'detailed-track',
      'pipeline-done',
    ]);
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['spec-extract']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
    // no spec production, no auto-loop gate — the single loop lives in
    // arch-review-loop
    expect(phases.some((p) => p.id === 'spec-generate')).toBe(false);
    expect(phases.some((p) => p.id === 'implement-loop-gate')).toBe(false);
  });

  it('machinery chain depends linearly — twin tracks any-join to terminal; no doc-maintenance stage', () => {
    expect(phaseOf('pipeline-accept').dependsOn).toEqual(['spec-extract']);
    expect(phaseOf('minimal-track').dependsOn).toEqual(['pipeline-accept']);
    expect(phaseOf('detailed-track').dependsOn).toEqual(['pipeline-accept']);
    expect(phaseOf('pipeline-done').dependsOn).toEqual(['minimal-track', 'detailed-track']);
    expect(phaseOf('pipeline-done').join).toBe('any');
    // pipeline-done is the terminal — no gate after it (single loop in the
    // composition); tracks own their post-archive closure
  });

  it('spec-extract is extraction-only — change resolution, no generation skill', () => {
    const extract = phaseOf('spec-extract');
    expect(extract.type).toBe('main');
    expect(extract.skill).toBeUndefined();
    const task = String(extract.task);
    expect(task).toMatch(/upstream channel when composed/);
    expect(task).toMatch(/\{args\.changeName\}/);
    expect(task).not.toMatch(/reportPath/);
    expect(task).not.toMatch(/openspec-propose/);
    expect(task).toMatch(/adr_created ECHOES the adoption record/);
  });

  it('pipeline-accept is the branch-route approval — two continue actions, no default', () => {
    const accept = phaseOf('pipeline-accept');
    expect(accept.type).toBe('approval');
    const routing = accept.routing as Record<string, unknown>;
    const actions = (routing.actions ?? []) as Array<Record<string, unknown>>;
    expect(actions).toHaveLength(2);
    expect(actions.map((a) => a.action)).toEqual(['continue', 'continue']);
    expect(actions.map((a) => a.target)).toEqual(['minimal-track', 'detailed-track']);
    expect(actions.every((a) => a.default === undefined)).toBe(true);
  });

  it('no auto-loop gate — pipeline-done is the terminal (single loop in arch-review-loop)', () => {
    expect(phases.some((p) => p.type === 'gate')).toBe(false);
    expect(phaseOf('pipeline-done').channels).toEqual(
      expect.arrayContaining([
        'node:spec-extract',
        'node:minimal-track/archive',
        'node:detailed-track/openspec-archive',
      ]),
    );
  });

  it('track flows declare routes — post-archive doc maintenance owned by the tracks', () => {
    expect(phaseOf('minimal-track').type).toBe('flow');
    expect(phaseOf('minimal-track').use).toBe('openspec-apply');
    expect(phaseOf('minimal-track').route).toBe('minimal-track');
    expect(phaseOf('detailed-track').type).toBe('flow');
    expect(phaseOf('detailed-track').use).toBe('openspec-engineer');
    expect(phaseOf('detailed-track').route).toBe('detailed-track');
    // openspec-apply / openspec-engineer own their post-archive closure
    // (plain archive / atom-doc-lifecycle) — spec-implement declares no
    // doc-update flow
    expect(phases.filter((p) => p.type === 'flow' && p.use === 'doc-update')).toHaveLength(0);
  });

  it('entry/terminal channels carry the composition read edges + archive echoes', () => {
    // spec-extract declares the composition read edges (produced change +
    // adoption record from the adopt stage); stripped at dispatch in
    // standalone runs (run-scope gate)
    expect(phaseOf('spec-extract').channels).toEqual(['node:adopt/spec-propose', 'node:adopt/adopting']);
    expect(phaseOf('pipeline-done').channels).toEqual([
      'node:spec-extract',
      'node:minimal-track/archive',
      'node:detailed-track/openspec-archive',
    ]);
  });

  it('skill declarations — no generation skill in spec-implement; openspec-propose lives in the adopt stage', () => {
    expect(phaseOf('spec-extract').skill).toBeUndefined();
    expect(phases.some((p) => p.skill === 'openspec-propose')).toBe(false);
    const adopt = loadGraph('adopt-with-docs.taskflow.yaml');
    const adoptPhases = adopt.phases as Array<Record<string, unknown>>;
    const propose = adoptPhases.find((p) => p.id === 'spec-propose');
    expect(propose?.skill).toBe('openspec-propose');
    expect(propose?.dependsOn).toEqual(['adopt-accept']);
  });
});

// ---------------------------------------------------------------------------
// 2.10 — openspec-engineer graph: detailed track topology
// ---------------------------------------------------------------------------

describe('2.10 openspec-engineer graph topology', () => {
  const graph = loadGraph('openspec-engineer.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('seven phases in dependency order with single entry and no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'to-spec',
      'to-tickets',
      'implement',
      'implement-review',
      'implement-gate',
      'implement-accept',
      'openspec-archive',
    ]);
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['to-spec']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('implements linear chain to the terminal', () => {
    expect(phaseOf('to-tickets').dependsOn).toEqual(['to-spec']);
    expect(phaseOf('implement').dependsOn).toEqual(['to-tickets']);
    expect(phaseOf('implement-review').dependsOn).toEqual(['implement']);
    expect(phaseOf('implement-gate').dependsOn).toEqual(['implement-review']);
    expect(phaseOf('implement-accept').dependsOn).toEqual(['implement-gate']);
    expect(phaseOf('openspec-archive').dependsOn).toEqual(['implement-accept']);
  });

  it('to-spec is the decided entry — single in-degree-0 entry, no interview node', () => {
    const toSpec = phaseOf('to-spec');
    // decided journey entry: the decision is already recorded — no
    // interview skill, no input-source detection; the machinery track is
    // entered raw with the recorded decision
    expect(toSpec.dependsOn).toEqual([]);
    expect(toSpec.skill).toBeUndefined();
    expect(toSpec.input).toBeUndefined();
    expect(String(toSpec.task)).toMatch(/No interview/);
  });

  it('confirmation prose is de-hardcoded — approvals live in the skills', () => {
    // to-spec / to-tickets / implement confirmation instructions belong to
    // the skills' approval() checkpoints — graph task text never hardcodes
    // user-confirmation sentences (auto mode would stall on them)
    const tasks = phases.map((p) => String(p.task ?? ''));
    const all = tasks.join('\n');
    expect(all).not.toMatch(/confirm once with the user/);
    expect(all).not.toMatch(/quiz the user/);
    expect(all).not.toMatch(/seam confirmation \(question once\)/);
    // skills own the checkpoints — task text references them
    expect(tasks[0]).toMatch(/approval\(\)/); // to-spec
    expect(tasks[1]).toMatch(/approval\(\)/); // to-tickets
  });

  it('gate auto-rework is bounded, contract-field, writer-targeted', () => {
    const gate = phaseOf('implement-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['implement-review']);
    // reads removed — reads == dependsOn, judgment context auto-injects
    expect(gate.reads).toBeUndefined();
    expect(gate.channels).toBeUndefined();
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(String(jumps[0].when)).toMatch(/overall: fail AND implement retryCount < 2/);
    expect(jumps[0].to).toBe('implement');
    expect(gate.default).toBeUndefined();
  });

  it('accept is pure human card with no written routing', () => {
    const accept = phaseOf('implement-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routing).toBeUndefined();
    // reads removed — approval reads migrate to node: channels
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toEqual(['node:implement-review']);
  });

  it('skill declarations match upstream contract reuse', () => {
    expect(phaseOf('implement').skill).toBe('implement');
    expect(phaseOf('implement-review').skill).toBe('code-review');
    expect(phaseOf('openspec-archive').skill).toBe('atom-doc-lifecycle');
  });
});

// ---------------------------------------------------------------------------
// 2.13 — arch-review-loop three-stage partition topology (route-first):
// requirement flow = arch-review production graph (scope-entry entry node →
// report machinery → review-accept 'Requirement ready?' terminal) + adopt
// flow = adopt-with-docs adoption graph (receives the report as input
// document, appends dated appendix, produces the OpenSpec change) + implement
// flow = spec-implement implementation graph (consumes the produced change →
// track machinery → terminal, no internal auto-iteration gate) + loop-gate
// bounded backward jump (THE single loop) to requirement/scope-entry +
// round-end approval (no written routing).
// ---------------------------------------------------------------------------

describe('2.13 arch-review-loop three-stage partition topology (requirement + adopt + implement flows)', () => {
  const graph = loadGraph('arch-review-loop.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six root phases — requirement + round-continue + adopt + implement flows, loop-gate, loop-accept; no end marker', () => {
    // Declaration order is load-bearing: findActiveNode dispatches the first
    // active node — the requirement flow precedes round-continue (content
    // gate), which precedes adopt, which precedes implement. No top-level
    // grill — adoption is the adopt stage (adopt-with-docs), NOT composed
    // into arch-review.
    expect(phases.map((p) => p.id)).toEqual([
      'requirement',
      'round-continue',
      'adopt',
      'implement',
      'loop-gate',
      'loop-accept',
    ]);
    expect(phaseOf('requirement').type).toBe('flow');
    expect(phaseOf('round-continue').type).toBe('approval');
    expect(phaseOf('adopt').type).toBe('flow');
    expect(phaseOf('implement').type).toBe('flow');
    expect(phaseOf('loop-gate').type).toBe('gate');
    expect(phaseOf('loop-accept').type).toBe('approval');
    // deleted: loop-entry (per-round input absorbed into the requirement
    // flow's scope-entry), root review-accept / spec-extract (both moved into
    // their flows), verify, review-accept-gate (forward gate), loop-done end
    // marker, top-level grill, refine stage id (renamed adopt), any
    // implement-loop-gate anywhere in the composition
    expect(phases.map((p) => p.id)).not.toEqual(
      expect.arrayContaining([
        'loop-entry',
        'review',
        'review-accept',
        'spec-extract',
        'verify',
        'review-accept-gate',
        'loop-done',
        'grill',
        'refine',
      ]),
    );
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('review/scope-entry carries the scope interview contract — no Run Mode topic', () => {
    // the per-round entry node lives inside the arch-review flow — composed as
    // review/scope-entry in the loop
    const arch = loadGraph('arch-review.taskflow.yaml');
    const archPhases = arch.phases as Array<Record<string, unknown>>;
    const entry = archPhases.find((p) => p.id === 'scope-entry');
    expect(entry).toBeDefined();
    const task = String(entry?.task);
    expect(entry?.skill).toBe('atom-scope-interview');
    // Run Mode is a per-activation decision at graph_start (args.mode) — graphs declare nothing
    // (args.mode or a question) — graphs declare nothing
    expect(task).not.toMatch(/Auto-approve mode|auto_approve/);
    expect(task).not.toMatch(/routingActions\[0\]/);
    // report input — existing report path (true closed loop) vs fresh review
    expect(task).toMatch(/report_input/);
    expect(task).toMatch(/existing/);
    expect(task).toMatch(/scope_complete/);
    // per-round mandatory scope re-confirmation — every activation re-acquires
    // (loop jump-backs target this node), never auto-skipped; declared via the
    // entry-skill callee contract — Behavior flags, not prose
    expect(task).toMatch(/Topics:/);
    expect(task).toMatch(/Behavior: confirm=mandatory/);
    expect(task).toMatch(/output path=user_owned/);
    expect(task).not.toMatch(/Mandatory scope confirmation/);
    expect(task).not.toMatch(/NEVER auto-skip/);
    expect(task).not.toMatch(/never re-asked/);
  });

  it('all three entry task texts declare the callee contract', () => {
    // every atom-scope-interview dispatch declares Topics / Behavior /
    // Output contract — the parameter channel; the doc-update
    // classification-only variant no longer exists (graph deleted)
    const entries = [
      { graph: 'arch-review.taskflow.yaml', node: 'scope-entry' },
      { graph: 'graph-generate.taskflow.yaml', node: 'entry' },
      { graph: 'adopt-with-docs.taskflow.yaml', node: 'adopt-scope' },
    ];
    for (const entry of entries) {
      const g = loadGraph(entry.graph);
      const phases = g.phases as ReadonlyArray<{ id: string; task?: unknown; skill?: unknown }>;
      const phase = phases.find((p) => p.id === entry.node);
      expect(phase, entry.graph + ' ' + entry.node).toBeDefined();
      const task = String(phase?.task);
      expect(phase?.skill).toBe('atom-scope-interview');
      expect(task, entry.graph + ' ' + entry.node + ' directive').toMatch(/per atom-scope-interview/);
    }
    const gen = loadGraph('graph-generate.taskflow.yaml');
    const genTask = String(
      (gen.phases as ReadonlyArray<{ id: string; task?: unknown }>).find((p) => p.id === 'entry')?.task,
    );
    expect(genTask).toMatch(/dual-name check=graph_name/);
    expect(genTask).toMatch(/context=optional/);
    expect(genTask).toMatch(/output path=user_owned/);
    const adopt = loadGraph('adopt-with-docs.taskflow.yaml');
    const adoptTask = String(
      (adopt.phases as ReadonlyArray<{ id: string; task?: unknown }>).find((p) => p.id === 'adopt-scope')?.task,
    );
    expect(adoptTask).toMatch(/output path=derived/);
    expect(adoptTask).not.toMatch(/user_owned/);
  });

  it('no phase-level when fields — Run Mode is a run field, rework is gate jumps', () => {
    const raw = String(phases.map((p) => JSON.stringify(p)));
    expect(raw).not.toMatch(/autoWhen/);
    for (const p of phases) {
      expect(p.when, `${String(p.id)} phase-level when`).toBeUndefined();
    }
  });

  it('requirement = arch-review flow; adopt = adopt-with-docs flow (report input); implement = spec-implement flow', () => {
    expect(phaseOf('requirement').use).toBe('arch-review');
    // requirement is the loop's entry stage — in-degree 0 via the composition;
    // its entry (scope-entry) is the per-round entry node inside arch-review;
    // adoption is NOT inside arch-review — it is the adopt stage
    expect(phaseOf('requirement').dependsOn).toEqual([]);
    expect(phaseOf('requirement').channels).toBeUndefined();
    // adopt = the adoption stage — adopt-with-docs receives the produced
    // report as input document via the global channel
    // (two-scope model — node:requirement/arch-review promoted, all phases)
    expect(phaseOf('adopt').use).toBe('adopt-with-docs');
    expect(phaseOf('adopt').dependsOn).toEqual(['requirement']);
    expect(phaseOf('adopt').channels).toBeUndefined();
    expect(graph.context).toEqual(['node:requirement/arch-review']);
    // adopt sits on the proceed route — activated only by round-continue
    // continue (empty-round structural short-circuit: unselected route members
    // never activate)
    expect(phaseOf('adopt').route).toBe('proceed');
    // implement = the shared spec-implement machinery — on the proceed route
    // like adopt (sequenced after it by dependsOn [adopt]); the produced
    // change + adoption record arrive via composition read edges declared on
    // spec-implement's entry (spec-extract) — no flow channels
    expect(phaseOf('implement').use).toBe('spec-implement');
    expect(phaseOf('implement').route).toBe('proceed');
    expect(phaseOf('implement').dependsOn).toEqual(['adopt']);
    expect(phaseOf('implement').channels).toBeUndefined();
  });

  it('review-accept is the Requirement-ready terminal — no written routing, judgment context via node: channels', () => {
    // the requirement accept terminal lives inside the arch-review flow —
    // composed as review/review-accept in the loop
    const arch = loadGraph('arch-review.taskflow.yaml');
    const archPhases = arch.phases as Array<Record<string, unknown>>;
    const accept = archPhases.find((p) => p.id === 'review-accept');
    expect(accept).toBeDefined();
    expect(accept?.type).toBe('approval');
    expect(accept?.routing).toBeUndefined();
    // reads removed (schema field convergence) — review/arch-review is covered
    // by the direct dependsOn (flow review → flattened terminal); only the
    // cross-level scope-entry ref migrates to channels (no redundant node: for
    // the direct dependsOn — declaration surface = effective surface)
    expect(accept?.reads).toBeUndefined();
    expect(accept?.channels).toEqual(['node:scope-entry']);
    // requirement-ready terminal card — Continue = requirement ready (activates
    // the implement part in the loop composition), Loop again = retry
    // scope-entry, End = no requirement
    expect(String(accept?.task)).toMatch(/Requirement ready\?/);
  });

  it('round-continue — content gate: explicit branch-route routing [continue→proceed, end]; adopt/implement on proceed', () => {
    const gate = phaseOf('round-continue');
    expect(gate.type).toBe('approval');
    // sequenced after the requirement flow — judges the report state
    expect(gate.dependsOn).toEqual(['requirement']);
    // judgment context — the round worker's top_rec_remaining field via
    // graph-level ambient channel (inherited, no per-node declaration)
    expect(gate.channels).toBeUndefined();
    // branch-route scenario: declared routing with explicit target + value
    const actions = (gate.routing as { actions: Array<Record<string, unknown>> }).actions;
    expect(actions).toHaveLength(2);
    const cont = actions.find((a) => a.action === 'continue');
    expect(cont?.target).toBe('proceed');
    expect(cont?.value).toBe('continue');
    const end = actions.find((a) => a.action === 'end');
    expect(end).toBeDefined();
    expect(end?.value).toBe('end');
    // recommendation rules encoded in the card — single structured field
    expect(String(gate.task)).toMatch(/top_rec_remaining: true/);
    expect(String(gate.task)).toMatch(/end when nothing remains/);
    // loop-gate is the only gate — round-continue is a decision, not a gate
    expect(gate.jumps).toBeUndefined();
  });

  it('loop-gate — auto loop router: bounded backward jump to requirement/scope-entry (requirement entry node)', () => {
    const gate = phaseOf('loop-gate');
    expect(gate.type).toBe('gate');
    // dependsOn [implement] only — the implement flow's terminal transitively
    // includes the adopt flow's terminal (sequencing preserved); leaf-deps
    // rule (2.2b) now applies to gates too
    expect(gate.dependsOn).toEqual(['implement']);
    // reads removed — cross-level judgment refs migrate to node: channels;
    // requirement/arch-review arrives via the graph-level ambient channel;
    // scope-entry is covered by the jump target (declared judgment scope)
    expect(gate.reads).toBeUndefined();
    expect(gate.channels).toBeUndefined();
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(jumps[0].to).toBe('requirement/scope-entry');
    const cond = String(jumps[0].when);
    // consumption boundary — gate is pure machine judgment, no run mode
    expect(cond).not.toMatch(/run mode/);
    expect(cond).toMatch(/top_rec_remaining: true/);
    // bounded by the round counter (hygiene — not a termination mechanism;
    // ending the loop is always a human decision)
    expect(cond).toMatch(/requirement\/scope-entry retryCount < 8/);
    expect(gate.default).toBeUndefined();
  });

  it('implement flow carries NO internal auto-iteration gate — the loop is single (loop-gate only)', () => {
    // the machinery has no internal gate — flattened composition contains no
    // implement/implement-loop-gate; rework is the single loop-gate
    const machinery = loadGraph('spec-implement.taskflow.yaml');
    const machineryPhases = machinery.phases as Array<Record<string, unknown>>;
    expect(machineryPhases.some((p) => p.id === 'implement-loop-gate')).toBe(false);
    expect(machineryPhases.some((p) => p.type === 'gate')).toBe(false);
    // and the composition's only gate is loop-gate
    expect(phases.filter((p) => p.type === 'gate').map((p) => p.id)).toEqual(['loop-gate']);
  });

  it('loop-accept — round-end decision card, no written routing', () => {
    const accept = phaseOf('loop-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routing).toBeUndefined();
    // reads removed — approval reads migrate to node: channels; the report
    // arrives via the graph-level ambient channel (inherited)
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toBeUndefined();
  });

  it('arch-review = standalone requirement production: scope-entry → arch-review → review-accept; no grill flow', () => {
    const arch = loadGraph('arch-review.taskflow.yaml');
    const phases2 = arch.phases as Array<Record<string, unknown>>;
    // three-phase requirement production graph — scope-entry entry node,
    // arch-review main (improve-codebase-architecture — producer #1),
    // review-accept approval terminal; adoption is NOT composed here (the
    // loop's adopt stage owns adoption, keeping both graphs standalone)
    expect(phases2.map((p) => p.id)).toEqual(['scope-entry', 'arch-review', 'review-accept']);
    expect(phases2.some((p) => p.type === 'end')).toBe(false);
    const entry = phases2.find((p) => p.id === 'scope-entry');
    expect(entry?.type).toBe('main');
    expect(entry?.dependsOn).toEqual([]);
    expect(entry?.skill).toBe('atom-scope-interview');
    // no flow phase references adopt-with-docs — adoption is external
    expect(phases2.some((p) => p.type === 'flow' && p.use === 'adopt-with-docs')).toBe(false);
    const reviewNode = phases2.find((p) => p.id === 'arch-review');
    expect(reviewNode?.type).toBe('main');
    expect(reviewNode?.skill).toBe('improve-codebase-architecture');
    expect(reviewNode?.dependsOn).toEqual(['scope-entry']);
    const accept = phases2.find((p) => p.id === 'review-accept');
    expect(accept?.type).toBe('approval');
    expect(accept?.dependsOn).toEqual(['arch-review']);
    expect(accept?.channels).toEqual(['node:scope-entry']);

    // the machinery node lives INLINE in arch-review — no review-machinery
    // child graph exists
    const task = String(reviewNode?.task);
    // dual mode — fresh writes new report, existing re-reviews in place
    expect(task).toMatch(/report_input fresh/);
    expect(task).toMatch(/re-review/);
    expect(task).toMatch(/single source of truth/);
    expect(task).toMatch(/NO path re-confirmation/);
    // unified structured output contract (both modes) — gate jump source
    expect(task).toMatch(/top_rec_remaining/);
    expect(task).toMatch(/round/);
    expect(task).toMatch(/implemented/);
    expect(task).toMatch(/new_findings/);
    // fresh-origin transition (D19) — fresh + existing report file (round ≥ 2)
    // switches to re-review semantics; the loop closure promise holds for both origins
    expect(task).toMatch(/round ≥ 2/);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — M2 snapshot enumerates per-node states
// ---------------------------------------------------------------------------

describe('2.8 snapshot nodes enumeration (M2)', () => {
  it('snapshot nodes are one-line rows; changed carries full state fields', () => {
    const snap = buildSnapshot(runningState());
    expect(snap.nodes).toHaveLength(3);
    // One-line rows — jump-target enumeration + progress only
    expect(snap.nodes).toEqual(
      expect.arrayContaining([
        { nodeId: 'a', status: 'done', retryCount: 0 },
        { nodeId: 'b', status: 'active', retryCount: 0 },
        { nodeId: 'c', status: 'aborted', retryCount: 1 },
      ]),
    );
    // First dispatch — every row is changed (no prior cursor): full fields
    expect(snap.changed).toEqual(
      expect.arrayContaining([
        {
          nodeId: 'a',
          status: 'done',
          retryCount: 0,
          startedAt: '2026-08-01T00:00:00.000Z',
          completedAt: '2026-08-01T00:01:00.000Z',
          durationMs: 60000,
        },
        {
          nodeId: 'b',
          status: 'active',
          retryCount: 0,
          startedAt: '2026-08-01T00:02:00.000Z',
          completedAt: null,
          durationMs: null,
        },
        {
          nodeId: 'c',
          status: 'aborted',
          retryCount: 1,
          startedAt: '2026-08-01T00:00:00.000Z',
          completedAt: '2026-08-01T00:00:30.000Z',
          durationMs: 30000,
        },
      ]),
    );
  });

  it('delta snapshot — unchanged rows are dropped from changed on later builds', () => {
    // Unique run id — the cursor cache is per-run; other tests may have
    // already cached 'run-1' signatures with identical state.
    const base = runningState();
    const state: FsmState = { ...base, runId: 'delta-run-1', status: 'running' } as FsmState;
    const first = buildSnapshot(state);
    expect(first.changed).toHaveLength(3);
    // Same state again — signatures unchanged → no changed rows
    const second = buildSnapshot({ ...state });
    expect(second.changed).toBeUndefined();
  });

  it('snapshot meta fields present', () => {
    const snap = buildSnapshot(runningState());
    expect(snap.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('done and aborted nodes enumerable for jump targeting', () => {
    const snap = buildSnapshot(runningState());
    const eligible = snap.nodes.filter((n) => n.status === 'done' || n.status === 'aborted');
    expect(eligible.map((n) => n.nodeId).sort()).toEqual(['a', 'c']);
  });

  it('idle snapshot has empty nodes', () => {
    const snap = buildSnapshot({ status: 'idle' });
    expect(snap.nodes).toEqual([]);
  });

  it('snapshot annotates pending nodes on inactive routes with unactivated: true', () => {
    const graph: TaskflowGraph = {
      name: 'g',
      phases: [
        { id: 'a', type: 'main', operations: [] },
        { id: 'gate', type: 'gate', dependsOn: ['a'], jumps: [{ when: 'a output shows x', to: 'a' }] },
        { id: 't1', type: 'main', dependsOn: ['gate'], operations: [] },
        { id: 't2', type: 'main', dependsOn: ['gate'], route: 'alt', operations: [] },
        { id: 'done', type: 'main', dependsOn: ['t1'], operations: [] },
      ],
    };
    const state: FsmState = {
      status: 'running',
      runId: 'run-1',
      graphName: 'g',
      startedAt: '2026-08-01T00:00:00.000Z',
      phases: {
        a: { status: 'done', retryCount: 0 },
        gate: { status: 'done', retryCount: 0 },
        t1: { status: 'active', retryCount: 0 },
        t2: { status: 'pending', retryCount: 0 },
        done: { status: 'pending', retryCount: 0 },
      },
      routes: {},
    };
    const snap = buildSnapshot(state, graph);
    // t2 sits on the inactive 'alt' route — never activates (full row in changed)
    expect(snap.changed?.find((n) => n.nodeId === 't2')?.unactivated).toBe(true);
    // default-route t1 and done — no annotation
    expect(snap.changed?.find((n) => n.nodeId === 't1')?.unactivated).toBeUndefined();
    expect(snap.changed?.find((n) => n.nodeId === 'done')?.unactivated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4.6 — main channels validation scenarios
// ---------------------------------------------------------------------------

describe('4.6 main channels validation', () => {
  it('accepts main phase with channels — ban lifted', () => {
    const graph = {
      name: 't',

      phases: [
        {
          id: 'm',
          type: 'main',
          skill: 'atom-graph-spec',
          channels: ['node:up'],
          dependsOn: ['up'],
          task: 'x',
          operations: [],
        },
        { id: 'up', type: 'main', dependsOn: [], task: 'x', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('channels'))).toBe(false);
  });

  it('main preText rejected at schema level — contract layer has no duplicate mirror', () => {
    const graph = {
      name: 't',

      phases: [{ id: 'm', type: 'main', preText: 'x', task: 't', operations: [] }],
    };
    // Schema superRefine is the single enforcement point — contract layer passes.
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('preText'))).toBe(false);
    // Schema itself rejects.
    const parsed = PhaseSchema.safeParse({ id: 'm', type: 'main', preText: 'x', task: 't', operations: [] });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4.7 — task text declared-inputs contract
// ---------------------------------------------------------------------------

describe('4.7 task text contract', () => {
  it('accepts task text mentioning .taskflow/outputs/ — runtime path checks removed', () => {
    const graph = {
      name: 't',

      phases: [
        {
          id: 'm',
          type: 'main',
          dependsOn: [],
          task: 'Read upstream manually from .taskflow/outputs/up.output.txt',
          operations: [],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    // Runtime path checks removed — the path no longer exists; inert text passes clean.
    expect(errors).toEqual([]);
  });

  it('task-text content checks moved agent-side — engine stays silent (shapes only)', () => {
    const graph = {
      name: 't',

      phases: [
        {
          id: 'm',
          type: 'main',
          dependsOn: [],
          task: 'Read ghost-node output (injected via node:ghost-node channel).\nOutput (main agent collects): a, b',
          operations: [],
        },
      ],
    };
    // Declared-input claims + Task Content Spec spellings are agent-side
    // consistency-gate checks (estate-maintain) — the engine validates shapes.
    const { errors, warnings } = validateGraphContracts(graph, 't.yaml');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
    expect(warnings.some((w) => w.includes('Output contract'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 4.8 — Task Content Spec: canonical output contract + dedup rules
// ---------------------------------------------------------------------------

describe('4.8 task content spec — moved agent-side', () => {
  it('engine no longer enforces task-text content rules — loads clean (shapes only)', () => {
    const graph = {
      name: 't',

      phases: [
        {
          id: 'm',
          type: 'main',
          dependsOn: [],
          task: 'Work.\nOutput (main agent collects): a, b\nOutput: legacy',
          operations: [],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 't.yaml');
    expect(errors).toEqual([]);
    expect(warnings.some((w) => w.includes('non-canonical'))).toBe(false);
    expect(warnings.some((w) => w.includes('legacy'))).toBe(false);
  });
});
