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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { toTaskflowGraph } from '../src/api/graph-loader.js';
import { buildSnapshot } from '../src/api/snapshot.js';
import { validateEntrySkillContracts, validateGraphContracts } from '../src/context/contracts.js';
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
  'doc-update.taskflow.yaml',
  'e2e-minimal.taskflow.yaml',
  'graph-generate.taskflow.yaml',
  'grill-with-docs.taskflow.yaml',
  'implement.taskflow.yaml',
  'openspec-apply.taskflow.yaml',
  'openspec-create.taskflow.yaml',
  'openspec-engineer.taskflow.yaml',
  'openspec-pipeline.taskflow.yaml',
  'plan-generate.taskflow.yaml',
  'skill-author.taskflow.yaml',
  'skill-change-workflow.taskflow.yaml',
  'skill-delete.taskflow.yaml',
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
      a: { status: 'done', retryCount: 0, startedAt: 't0', completedAt: 't1', durationMs: 1 },
      b: { status: 'active', retryCount: 0, startedAt: 't1' },
      c: { status: 'aborted', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
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
      version: 1,
      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x' }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('main phase with explicit skill passes validation', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [{ id: 'a', type: 'main', dependsOn: [], skill: 'code-review', task: 'x' }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('main and approval phases are exempt', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'x' },
        { id: 'ap', type: 'approval', dependsOn: ['m'] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects agent phase type at load — GraphDefinitionError (unregistered)', async () => {
    const tf = {
      name: 'test',
      version: 1,
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
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x' },
        { id: 'c', type: 'main', dependsOn: ['a', 'b'], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('redundant transitive dependency'))).toBe(true);
  });

  it('accepts minimal direct dependencies', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x' },
        { id: 'c', type: 'main', dependsOn: ['b'], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects gate jump targeting a non-upstream (forward) phase', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: 'a output shows fail', to: 'downstream' }],
        },
        { id: 'downstream', type: 'main', dependsOn: ['g'], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], skill: 'code-review', task: 'x' },
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
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: [], task: 'x' },
        { id: 'j', type: 'main', dependsOn: ['a', 'b'], join: 'any', task: 'x' },
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
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], route: 'track-a', task: 'x' },
        { id: 'b', type: 'main', dependsOn: [], route: 'track-b', task: 'x' },
        { id: 'j', type: 'main', dependsOn: ['a', 'b'], join: 'any', task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('accepts bounded jump with writer target (no warnings)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
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
      version: 1,
      phases: [{ id: 'a', type: 'main', route: 'orphan', dependsOn: [], task: 'x' }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes("route 'orphan' is declared"))).toBe(true);
  });

  it('warns on a route NOT referenced by any written routing action — AI-dynamic activation is a soft path even when an approval exists', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', route: 'dyn', dependsOn: [], task: 'x' },
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
      version: 1,
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
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
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
      version: 1,
      phases: [
        { id: 'create', type: 'flow', use: 'openspec-create', dependsOn: [] },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['create'],
          routing: {
            actions: [
              { action: 'retry', target: 'create', label: 'Re-run flow', description: 'x' },
              { action: 'jump', target: 'create/spec-generate', label: 'Regen', description: 'x' },
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
        if (name === 'openspec-pipeline.taskflow.yaml' && p.id === 'pipeline-accept') {
          // the ONLY branch-route scenario — two continue actions, no default
          expect(actions.length, `${name}/${String(p.id)} branch-route actions`).toBe(2);
          for (const a of actions) {
            expect(a.default, `${name}/${String(p.id)} no default:true`).toBeUndefined();
            expect(a.action).toBe('continue');
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
          expect(gateUpstream.has(target), `${name}/${id} jump ${target} upstream`).toBe(true);
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
  it('rejects hardcoded .taskflow/outputs path in jump condition', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['a'],
          jumps: [{ when: '.taskflow/outputs/a.output.txt shows x', to: 'a' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('hardcodes runtime output path'))).toBe(true);
  });

  it('rejects sibling-output-existence jump condition', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
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
    { id: 'write-a', type: 'main', dependsOn: [], task: 'x', mode: 'exclusive' },
    { id: 'write-b', type: 'main', dependsOn: [], task: 'x', mode: 'exclusive' },
    {
      id: 'review',
      type: 'main',
      dependsOn: ['write-a', 'write-b'],
      join: 'any',
      skill: 'code-review',
      task: 'x',
      mode: 'exclusive',
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
// 2.7 — skill-author migrated topology (route-first): mode-gate deleted,
// linear writers with case-5 self-judgment, approval card without routing.
// ---------------------------------------------------------------------------

describe('2.7 skill-author migrated topology', () => {
  const graph = loadGraph('skill-author.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const depsOf = (id: string): unknown => phases.find((p) => p.id === id)?.dependsOn;

  it('eight linear phases — mode-gate deleted, no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'scope-confirm',
      'skill-write',
      'skill-select',
      'edit-scope-confirm',
      'skill-edit-write',
      'skill-review',
      'skill-accept',
      'output-examples',
    ]);
    expect(phases.map((p) => p.id)).not.toContain('mode-gate');
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('linear dependsOn chain — no forward gates', () => {
    expect(depsOf('scope-confirm')).toEqual([]);
    expect(depsOf('skill-write')).toEqual(['scope-confirm']);
    expect(depsOf('skill-select')).toEqual(['scope-confirm']);
    expect(depsOf('edit-scope-confirm')).toEqual(['skill-select']);
    expect(depsOf('skill-edit-write')).toEqual(['edit-scope-confirm']);
    expect(depsOf('skill-review')).toEqual(['skill-write', 'skill-edit-write']);
    expect(depsOf('skill-accept')).toEqual(['skill-review']);
    expect(depsOf('output-examples')).toEqual(['skill-accept']);
    expect(phases.filter((p) => p.type === 'gate')).toHaveLength(0);
  });

  it('skill-accept is a decision card with no written routing', () => {
    const accept = phases.find((p) => p.id === 'skill-accept');
    expect(accept?.type).toBe('approval');
    expect(accept?.routing).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2.9 — implement graph: input-source-aware topology, finalize self-judgment
// ---------------------------------------------------------------------------

describe('2.9 implement graph topology', () => {
  const graph = loadGraph('implement.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases in dependency order with single entry and no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'work-input',
      'implement',
      'implement-review',
      'implement-gate',
      'implement-accept',
      'openspec-finalize',
    ]);
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['work-input']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('implement chain depends linearly', () => {
    expect(phaseOf('implement').dependsOn).toEqual(['work-input']);
    expect(phaseOf('implement-review').dependsOn).toEqual(['implement']);
    expect(phaseOf('implement-gate').dependsOn).toEqual(['implement-review']);
    expect(phaseOf('implement-accept').dependsOn).toEqual(['implement-gate']);
    expect(phaseOf('openspec-finalize').dependsOn).toEqual(['implement-accept']);
  });

  it('gate auto-rework is bounded and writer-targeted — no default', () => {
    const gate = phaseOf('implement-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['implement-review']);
    // reads removed (schema field convergence) — reads == dependsOn, so the
    // judgment context auto-injects; nothing migrated to channels
    expect(gate.reads).toBeUndefined();
    expect(gate.channels).toBeUndefined();
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(String(jumps[0].when)).toMatch(/overall: fail AND implement retryCount < 2/);
    expect(jumps[0].to).toBe('implement');
    expect(gate.default).toBeUndefined();
  });

  it('openspec-finalize self-judges case-5 — no finalize-gate, no end marker', () => {
    const finalize = phaseOf('openspec-finalize');
    expect(finalize.skill).toBe('atom-openspec-archive');
    expect(finalize.type).toBe('main');
    // case-5 self-judgment — input not change-bound → NO WORK, archive_status: none
    expect(String(finalize.task)).toMatch(/input_source: openspec-change/);
    expect(String(finalize.task)).toMatch(/archive_status: none/);
  });

  it('implement-accept is pure human card — no routing, judgment context via node: channel', () => {
    const accept = phaseOf('implement-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routing).toBeUndefined();
    // reads removed (schema field convergence) — approval reads migrate to
    // node: channels (review output not covered by direct dependsOn)
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toEqual(['node:implement-review']);
  });

  it('skill declarations match upstream contract reuse', () => {
    expect(phaseOf('implement').skill).toBe('implement');
    expect(phaseOf('implement-review').skill).toBe('code-review');
    expect(phaseOf('openspec-finalize').skill).toBe('atom-openspec-archive');
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
    expect(phaseOf('openspec-archive').skill).toBe('atom-openspec-archive');
  });
});

// ---------------------------------------------------------------------------
// 2.11 — openspec-pipeline v3 lifecycle topology (route-first branch-route):
// grill → create → branch-route approval → twin flow tracks → terminal
// ---------------------------------------------------------------------------

describe('2.11 openspec-pipeline v3 lifecycle topology', () => {
  const graph = loadGraph('openspec-pipeline.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases: idea entry → create flow → branch-route approval → twin flow tracks → terminal', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'grill',
      'create',
      'pipeline-accept',
      'minimal-track',
      'detailed-track',
      'pipeline-done',
    ]);
    // track-gate deleted — forward routing is the approval branch-route decision
    expect(phases.map((p) => p.id)).not.toContain('track-gate');
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['grill']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('composition chain: grill → create → pipeline-accept → tracks → terminal', () => {
    expect(phaseOf('create').dependsOn).toEqual(['grill']);
    expect(phaseOf('pipeline-accept').dependsOn).toEqual(['create']);
    expect(phaseOf('minimal-track').dependsOn).toEqual(['pipeline-accept']);
    expect(phaseOf('detailed-track').dependsOn).toEqual(['pipeline-accept']);
    expect(phaseOf('pipeline-done').dependsOn).toEqual(['minimal-track', 'detailed-track']);
  });

  it('create flow declares input interface — grill consensus channel', () => {
    const create = phaseOf('create');
    expect(create.type).toBe('flow');
    expect(create.channels).toEqual(expect.arrayContaining(['node:grill/grilling']));
  });

  it('entry and create are flows; tracks are flows with declared branch routes', () => {
    expect(phaseOf('grill').type).toBe('flow');
    expect(phaseOf('grill').use).toBe('grill-with-docs');
    expect(phaseOf('create').type).toBe('flow');
    expect(phaseOf('create').use).toBe('openspec-create');
    expect(phaseOf('minimal-track').type).toBe('flow');
    expect(phaseOf('minimal-track').use).toBe('openspec-apply');
    expect(phaseOf('minimal-track').route).toBe('minimal-track');
    expect(phaseOf('detailed-track').type).toBe('flow');
    expect(phaseOf('detailed-track').use).toBe('openspec-engineer');
    expect(phaseOf('detailed-track').route).toBe('detailed-track');
  });

  it('pipeline-accept is the ONLY branch-route approval — continue actions target the route flows, no default:true', () => {
    const accept = phaseOf('pipeline-accept');
    expect(accept.type).toBe('approval');
    // reads removed — the flattened create terminal (create/spec-generate) is
    // the direct dependsOn output, so judgment context auto-injects; no channels
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toBeUndefined();
    const actions = (accept.routing as { actions: Array<Record<string, unknown>> }).actions;
    expect(actions.map((a) => a.action)).toEqual(['continue', 'continue']);
    expect(actions.map((a) => a.target)).toEqual(['minimal-track', 'detailed-track']);
    for (const a of actions) {
      expect(a.default).toBeUndefined();
      expect(String(a.label)).toMatch(/track/);
    }
  });

  it('terminal receives flattened grill consensus + create terminal outputs via channels', () => {
    const done = phaseOf('pipeline-done');
    expect(done.type).toBe('main');
    expect(done.channels).toEqual(expect.arrayContaining(['node:grill/grilling', 'node:create/spec-generate']));
    expect(String(done.task)).toMatch(/decisions \(echo from grill\)/);
    expect(String(done.task)).toMatch(/candidates \(echo from spec-generate when blocked\)/);
    // terminal flags incomplete ADR judgment — no silent no-op completion
    expect(String(done.task)).toMatch(/judgment_incomplete: true/);
    expect(String(done.task)).toMatch(/graph_jump back to create/);
  });
});

// ---------------------------------------------------------------------------
// 2.12 — openspec-create v3 inline ADR topology (spec-done end marker deleted)
// ---------------------------------------------------------------------------

describe('2.12 openspec-create v3 inline ADR topology', () => {
  const graph = loadGraph('openspec-create.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('three phases — spec-done end marker deleted, no arch-decision', () => {
    expect(phases.map((p) => p.id)).toEqual(['spec-scope', 'spec-gate', 'spec-generate']);
    expect(phases.map((p) => p.id)).not.toEqual(
      expect.arrayContaining(['arch-decision', 'spec-accept-scope', 'spec-done']),
    );
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('spec-scope carries ADR judgment — adr_created mandatory in output contract', () => {
    const scope = phaseOf('spec-scope');
    expect(scope.skill).toBe('atom-scope-interview');
    expect(scope.channels).toEqual(expect.arrayContaining(['./CONTEXT.md', 'docs/adr/*.md']));
    const task = String(scope.task);
    // four input sources incl. grill-consensus (reportA E2)
    expect(task).toMatch(/wayfinder-map/);
    expect(task).toMatch(/arch-review/);
    expect(task).toMatch(/grill-consensus/);
    expect(task).toMatch(/direct/);
    // ADR judgment is a conversation side effect — user-confirmed offers, never autonomous
    expect(task).toMatch(/user confirmation/);
    expect(task).toMatch(/adr_created MUST always be present/);
  });

  it('spec-gate bounded rework covers missing ADR judgment', () => {
    const gate = phaseOf('spec-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['spec-scope']);
    // reads removed — reads == dependsOn, judgment context auto-injects
    expect(gate.reads).toBeUndefined();
    expect(gate.channels).toBeUndefined();
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(String(jumps[0].when)).toMatch(
      /\(scope_complete: false or missing OR adr_created: missing\) AND spec-scope retryCount < 2/,
    );
    expect(jumps[0].to).toBe('spec-scope');
    expect(gate.default).toBeUndefined();
  });

  it('spec-generate echoes adr_created for downstream track-route carrier', () => {
    const gen = phaseOf('spec-generate');
    expect(String(gen.task)).toMatch(/adr_created \(echo\)/);
  });
});

// ---------------------------------------------------------------------------
// 2.13 — arch-review-loop v6 round-origin topology (route-first): loop-entry
// (per-round scope re-confirm, round origin) + review flow dependsOn
// [loop-entry] + implement plain composition flow (no route — sequencing by
// dependsOn, end by endRun) + loop-gate bounded backward jump to loop-entry
// + round-end approval (no written routing).
// ---------------------------------------------------------------------------

describe('2.13 arch-review-loop v6 round-origin topology', () => {
  const graph = loadGraph('arch-review-loop.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases — loop-entry FIRST, no end marker', () => {
    // Declaration order is load-bearing: findActiveNode dispatches the first
    // active node — loop-entry (entry interview) must precede review/implement.
    expect(phases.map((p) => p.id)).toEqual([
      'loop-entry',
      'review',
      'review-accept',
      'implement',
      'loop-gate',
      'loop-accept',
    ]);
    expect(phaseOf('loop-entry').type).toBe('main');
    expect(phaseOf('loop-entry').dependsOn).toEqual([]);
    expect(phaseOf('review').type).toBe('flow');
    expect(phaseOf('review-accept').type).toBe('approval');
    expect(phaseOf('implement').type).toBe('flow');
    expect(phaseOf('loop-gate').type).toBe('gate');
    expect(phaseOf('loop-accept').type).toBe('approval');
    // deleted: verify, review-accept-gate (forward gate), loop-done end marker
    expect(phases.map((p) => p.id)).not.toEqual(expect.arrayContaining(['verify', 'review-accept-gate', 'loop-done']));
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('loop-entry carries the scope interview contract — no Run Mode topic', () => {
    const task = String(phaseOf('loop-entry').task);
    expect(phaseOf('loop-entry').skill).toBe('atom-scope-interview');
    // Run Mode is a run field (graph_start mode param) — graphs declare nothing
    expect(task).not.toMatch(/Auto-approve mode|auto_approve/);
    expect(task).not.toMatch(/routingActions\[0\]/);
    // report input — existing report path (true closed loop) vs fresh review
    expect(task).toMatch(/report_input/);
    expect(task).toMatch(/existing report path/);
    expect(task).toMatch(/scope_complete/);
    // per-round mandatory scope re-confirmation — round origin, never auto-skipped
    expect(task).toMatch(/Mandatory per-round scope confirmation/);
    expect(task).toMatch(/MUST be confirmed or\n.*adjusted by the user each run/);
    expect(task).not.toMatch(/never re-asked/);
  });

  it('no phase-level when fields — Run Mode is a run field, rework is gate jumps', () => {
    const raw = String(phases.map((p) => JSON.stringify(p)));
    expect(raw).not.toMatch(/autoWhen/);
    for (const p of phases) {
      expect(p.when, `${String(p.id)} phase-level when`).toBeUndefined();
    }
  });

  it('review is a flow on loop-entry; implement is plain composition entered mechanically after review-accept', () => {
    expect(phaseOf('review').use).toBe('arch-review');
    // round origin — a jump to loop-entry resets the whole review segment
    expect(phaseOf('review').dependsOn).toEqual(['loop-entry']);
    expect(phaseOf('review').channels).toBeUndefined();
    expect(phaseOf('implement').use).toBe('openspec-pipeline');
    // no route — a single-path route would make activation depend on the agent
    // emitting branchTo (missed target silently drains the run); sequencing is
    // dependsOn + endRun
    expect(phaseOf('implement').route).toBeUndefined();
    expect(phaseOf('implement').dependsOn).toEqual(['review-accept']);
    expect(phaseOf('implement').channels).toEqual(
      expect.arrayContaining(['node:review/arch-review', 'node:loop-entry']),
    );
  });

  it('review-accept is a decision card — no written routing, judgment context via node: channel', () => {
    const accept = phaseOf('review-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routing).toBeUndefined();
    // reads removed (schema field convergence) — review/arch-review is covered
    // by the direct dependsOn (flow review → flattened terminal); only the
    // cross-level loop-entry ref migrates to channels
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toEqual(['node:loop-entry']);
  });

  it('loop-gate — auto loop router: bounded backward jump to loop-entry', () => {
    const gate = phaseOf('loop-gate');
    expect(gate.type).toBe('gate');
    // dependsOn [implement] only — the implement flow's terminal transitively
    // includes review-accept (sequencing preserved); leaf-deps rule (2.2b) now
    // applies to gates too
    expect(gate.dependsOn).toEqual(['implement']);
    // reads removed — cross-level judgment refs migrate to node: channels
    expect(gate.reads).toBeUndefined();
    expect(gate.channels).toEqual(['node:review/arch-review', 'node:loop-entry']);
    const jumps = gate.jumps as Array<Record<string, unknown>>;
    expect(jumps).toHaveLength(1);
    expect(jumps[0].to).toBe('loop-entry');
    const cond = String(jumps[0].when);
    expect(cond).toMatch(/run mode is auto/);
    expect(cond).toMatch(/top_rec_remaining: true/);
    // bounded by the round counter (hygiene — not a termination mechanism;
    // ending the loop is always a human decision)
    expect(cond).toMatch(/loop-entry retryCount < 8/);
    expect(gate.default).toBeUndefined();
  });

  it('loop-accept — round-end decision card, no written routing', () => {
    const accept = phaseOf('loop-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routing).toBeUndefined();
    // reads removed — approval reads migrate to node: channels
    expect(accept.reads).toBeUndefined();
    expect(accept.channels).toEqual(['node:review/arch-review']);
  });

  it('arch-review node task is dual-mode — report_input branch + unified output contract', () => {
    const arch = loadGraph('arch-review.taskflow.yaml');
    const phases2 = arch.phases as Array<Record<string, unknown>>;
    // flat two-phase graph — scope-detect-interview entry, arch-review follows
    expect(phases2.map((p) => p.id)).toEqual(['scope-detect-interview', 'arch-review']);
    expect(phases2.some((p) => p.type === 'end')).toBe(false);
    const reviewNode = phases2.find((p) => p.id === 'arch-review');
    expect(reviewNode).toBeDefined();
    expect(reviewNode?.dependsOn).toEqual(['scope-detect-interview']);
    const task = String(reviewNode?.task);
    // dual mode — fresh writes new report, existing re-reviews in place
    expect(task).toMatch(/report_input: fresh/);
    expect(task).toMatch(/report_input: existing/);
    expect(task).toMatch(/closed-loop re-review mode/);
    expect(task).toMatch(/NO path re-confirmation/);
    // unified structured output contract (both modes) — gate jump source
    expect(task).toMatch(/top_rec_remaining/);
    expect(task).toMatch(/round \(increment\)/);
    expect(task).toMatch(/implemented \(list\)/);
    expect(task).toMatch(/new_findings \(count\)/);
    // fresh-origin transition (D19) — fresh + existing report file (round ≥ 2)
    // switches to re-review semantics; the loop closure promise holds for both origins
    expect(task).toMatch(/report_input: fresh AND the report file at report_path already exists/);
    expect(task).toMatch(/round ≥ 2/);
    expect(task).toMatch(/transition to re-review semantics/);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — M2 snapshot enumerates per-node states
// ---------------------------------------------------------------------------

describe('2.8 snapshot nodes enumeration (M2)', () => {
  it('snapshot includes nodes with full state fields', () => {
    const snap = buildSnapshot(runningState());
    expect(snap.nodes).toHaveLength(3);
    expect(snap.nodes).toEqual(
      expect.arrayContaining([
        { nodeId: 'a', status: 'done', retryCount: 0, startedAt: 't0', completedAt: 't1', durationMs: 1 },
        { nodeId: 'b', status: 'active', retryCount: 0, startedAt: 't1', completedAt: null, durationMs: null },
        { nodeId: 'c', status: 'aborted', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
      ]),
    );
    expect(snap.status).toBe('running');
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
        { id: 'a', type: 'main' },
        { id: 'gate', type: 'gate', dependsOn: ['a'], jumps: [{ when: 'a output shows x', to: 'a' }] },
        { id: 't1', type: 'main', dependsOn: ['gate'] },
        { id: 't2', type: 'main', dependsOn: ['gate'], route: 'alt' },
        { id: 'done', type: 'main', dependsOn: ['t1'] },
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
    // t2 sits on the inactive 'alt' route — never activates
    expect(snap.nodes.find((n) => n.nodeId === 't2')?.unactivated).toBe(true);
    // default-route t1 and done — no annotation
    expect(snap.nodes.find((n) => n.nodeId === 't1')?.unactivated).toBeUndefined();
    expect(snap.nodes.find((n) => n.nodeId === 'done')?.unactivated).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// D6 — entry skill contract alignment (upstream coverage + orphan detection)
// ---------------------------------------------------------------------------

describe('D6 entry skill contract alignment', () => {
  function makeSkillsDir(): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'skills-'));
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('flags orphan entry skill (declares upstream, zero dispatch)', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ghost-skill'));
      writeFileSync(
        join(dir, 'ghost-skill', 'SKILL.md'),
        `---\nname: ghost-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- some-phase\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: { name: 'g', version: 1, phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x' }] },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes("orphan entry skill 'ghost-skill'"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('reports upstream coverage mismatch', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'picker'));
      writeFileSync(
        join(dir, 'picker', 'SKILL.md'),
        `---\nname: picker\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- scope-confirm\n- missing-node\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                // missing-node exists in the graph but is NOT injected into the picker phase
                { id: 'missing-node', type: 'main', dependsOn: [], task: 'x' },
                { id: 'p', type: 'main', skill: 'picker', dependsOn: ['scope-confirm'], task: 'x' },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('missing-node'))).toBe(true);
      expect(errors.some((e) => e.includes('scope-confirm'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('reports placeholder contract error for dispatched skill', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ref-skill'));
      writeFileSync(
        join(dir, 'ref-skill', 'SKILL.md'),
        `---\nname: ref-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- <nodeId>\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [{ id: 'p', type: 'main', skill: 'ref-skill', dependsOn: [], task: 'x' }],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('placeholder'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('ignores fenced placeholder examples — inert, never errors nor orphan', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ref-skill'));
      writeFileSync(
        join(dir, 'ref-skill', 'SKILL.md'),
        `---\nname: ref-skill\ndescription: x\n---\n\n## Body\n\nExample only — real contract lives in the graph:\n\n\`\`\`markdown\n## Context Requirements\n\n### From upstream\n\n- <nodeId>\n\n### Reference skills\n\n- <skill-name>\n\n### Files\n\n- <glob>\n\`\`\`\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [{ filePath: 'g.yaml', graph: { name: 'g', version: 1, phases: [] } }],
        dir,
      );
      expect(errors).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('rejects bare-name channels on contract-less review-type skill', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'review-skill'));
      writeFileSync(
        join(dir, 'review-skill', 'SKILL.md'),
        `---\nname: review-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n<!-- contract graph-decided — dispatching graphs declare explicit channels -->\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'direct-up', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'r',
                  type: 'main',
                  skill: 'review-skill',
                  dependsOn: ['direct-up'],
                  channels: ['direct-up', 'node:other', 'skill:atom-graph-spec', 'docs/adr/*.md'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // bare 'direct-up' fails; explicit node:/skill: prefixes and file globs pass
      expect(errors.some((e) => e.includes('bare name') && e.includes('direct-up'))).toBe(true);
      expect(errors.some((e) => e.includes('node:other'))).toBe(false);
      expect(errors.some((e) => e.includes('skill:atom-graph-spec'))).toBe(false);
      expect(errors.some((e) => e.includes('docs/adr/*.md'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('reports missing reference channel (forward coverage)', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'writer-skill'));
      writeFileSync(
        join(dir, 'writer-skill', 'SKILL.md'),
        `---\nname: writer-skill\ndescription: x\n---\n\n## Context Requirements\n\n### Reference skills\n\n- atom-skill-spec\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [{ id: 'w', type: 'main', skill: 'writer-skill', dependsOn: [], task: 'x' }],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('atom-skill-spec') && e.includes('channels'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('warns on phantom bare node channel and cross-level suggestion', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'review-skill'));
      writeFileSync(
        join(dir, 'review-skill', 'SKILL.md'),
        `---\nname: review-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- direct-up\n`,
      );
      const { errors, warnings } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'direct-up', type: 'main', dependsOn: [], task: 'x' },
                { id: 'other-node', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'r',
                  type: 'main',
                  skill: 'review-skill',
                  dependsOn: ['direct-up'],
                  channels: ['other-node'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // other-node is a real graph node outside dependsOn → warning suggesting node: prefix
      expect(warnings.some((w) => w.includes('other-node') && w.includes('node:other-node'))).toBe(true);
      expect(errors.some((e) => e.includes('other-node'))).toBe(false);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 4.6 — main channels validation scenarios
// ---------------------------------------------------------------------------

describe('4.6 main channels validation', () => {
  it('accepts main phase with channels — ban lifted', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'm', type: 'main', skill: 'atom-graph-spec', channels: ['node:up'], dependsOn: ['up'], task: 'x' },
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('channels'))).toBe(false);
  });

  it('main preText rejected at schema level — contract layer has no duplicate mirror', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [{ id: 'm', type: 'main', preText: 'x', task: 't' }],
    };
    // Schema superRefine is the single enforcement point — contract layer passes.
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('preText'))).toBe(false);
    // Schema itself rejects.
    const parsed = PhaseSchema.safeParse({ id: 'm', type: 'main', preText: 'x', task: 't' });
    expect(parsed.success).toBe(false);
  });

  it('rejects contract-less main bare-name channel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 't.yaml',
            graph: { name: 't', version: 1, phases: [{ id: 'm', type: 'main', channels: ['upstream'], task: 'x' }] },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('bare name'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts contract-less main with explicit prefixes only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 't.yaml',
            graph: {
              name: 't',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  channels: ['node:up', 'skill:atom-graph-spec', 'docs/*.md'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('bare name'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports contract Reference gap for main phase — forward coverage applies to main', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n\n### Reference skills\n\n- ref-one\n\n### Files\n\n- docs/*.md\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'docs/*.md'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes("declares reference 'ref-one' not declared"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns on phantom graph-node channel for main phase (node: prefix suggestion)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n`,
      );
      const { warnings, errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'up', type: 'main', dependsOn: [], task: 'x' },
                { id: 'other', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'other'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // 'other' is a real graph node outside dependsOn → warning suggesting node: prefix
      expect(warnings.some((w) => w.includes('other') && w.includes('node:other'))).toBe(true);
      expect(errors.some((e) => e.includes('other'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors on unresolvable ghost channel for main phase — same strength as agent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'ghost-entry'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('unresolvable channel "ghost-entry"'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 4.7 — task text declared-inputs contract
// ---------------------------------------------------------------------------

describe('4.7 task text contract', () => {
  it('rejects task text hardcoding .taskflow/outputs/ — error', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'Read upstream manually from .taskflow/outputs/up.output.txt' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('hardcodes runtime output path'))).toBe(true);
  });

  it('warns on injection claim of undeclared node', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        {
          id: 'm',
          type: 'main',
          dependsOn: [],
          task: 'Read ghost-node output (injected via node:ghost-node channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes("claims injection of 'ghost-node'"))).toBe(true);
  });

  it('accepts injection claims covered by dependsOn', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        { id: 'down', type: 'main', dependsOn: ['up'], task: 'Read up output (injected).' },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('accepts injection claims covered by node: channel', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'down',
          type: 'main',
          dependsOn: [],
          channels: ['node:up'],
          task: 'Read up output (injected via node:up channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('accepts injection claims suffix-matched to prefixed node ids (composed graphs)', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'ops/up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ops/down',
          type: 'main',
          dependsOn: [],
          channels: ['node:ops/up'],
          task: 'Read up output (injected via node:up channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('ignores implicit-mechanism wording — injected via dependsOn', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'down',
          type: 'main',
          dependsOn: ['up'],
          task: 'Read up output (injected via dependsOn implicit context).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });
});
