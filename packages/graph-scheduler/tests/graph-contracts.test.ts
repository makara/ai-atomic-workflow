/**
 * Graph contract tests — dispatch, approval routing, and guard hygiene checks
 * implemented per fix-graph-dispatch-timing-contracts.
 *
 * Covers:
 * - 2.5 skill optional on main; 'agent' type unregistered → load-time GraphDefinitionError
 * - 2.6 topology assertion: approval ready only when review node done
 * - 2.7 skill-author dual-guard mutual exclusivity (static field references)
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
import type { FsmState } from '../src/fsm/transition.js';
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
  'graph-generate.taskflow.yaml',
  'implement.taskflow.yaml',
  'plan-generate.taskflow.yaml',
  'skill-author.taskflow.yaml',
  'skill-change-workflow.taskflow.yaml',
  'skill-delete.taskflow.yaml',
  'openspec-create.taskflow.yaml',
  'openspec-engineer.taskflow.yaml',
  'openspec-pipeline.taskflow.yaml',
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
      c: { status: 'skipped', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
    },
  };
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
// 2.2 — approval dependsOn convergence + explicit targets
// ---------------------------------------------------------------------------

describe('2.2 approval routing contract', () => {
  it('rejects approval with multi-node dependsOn', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
        { id: 'ap', type: 'approval', dependsOn: ['r', 'w'] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('approval dependsOn must contain exactly'))).toBe(true);
  });

  it('rejects approval with empty dependsOn (no upstream — vacuous approval)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [{ id: 'ap', type: 'approval', dependsOn: [] }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('approval dependsOn must contain exactly'))).toBe(true);
  });

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

  it('warns on retry/jump without explicit target', () => {
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
    expect(errors.some((e) => e.includes('targets missing phase'))).toBe(true);
  });

  it('errors on eval target referencing missing phase', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          eval: [{ when: 'r output shows fail', action: 'retry', target: 'ghost' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('targets missing phase'))).toBe(true);
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

  it('jump warning references M2 snapshot expansion (not dependsOn fallback)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: { actions: [{ action: 'jump', label: 'Back' }] },
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(warnings[0]).toContain('snapshot.nodes');
  });

  it('warns on unbounded auto-rework eval condition (no retryAttempt bound)', () => {
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
          eval: [{ when: 'r output shows overall: fail', action: 'retry', target: 'w' }],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unbounded'))).toBe(true);
  });

  it('warns on auto-rework eval retry targeting the reviewer node', () => {
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
          eval: [
            {
              when: 'r output shows overall: fail AND retryAttempt < 2',
              action: 'retry',
              target: 'r',
            },
          ],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('reviewer'))).toBe(true);
  });

  it('accepts bounded auto-rework eval with writer target (no warnings)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          eval: [
            {
              when: 'r output shows overall: fail AND retryAttempt < 2',
              action: 'retry',
              target: 'w',
            },
          ],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('unbounded') || w.includes('reviewer'))).toHaveLength(0);
  });

  it('built-in approvals converge on single review dependency with explicit targets', () => {
    for (const name of BUILTIN_GRAPHS) {
      const { errors, warnings } = validateGraphContracts(loadGraph(name), name);
      expect(errors, `${name} errors`).toHaveLength(0);
      expect(warnings, `${name} warnings`).toHaveLength(0);
    }
  });

  it('built-in gates converge on single review dependency with bounded writer-targeted eval', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const gates = (graph.phases ?? []).filter((p) => p.type === 'gate');
      for (const g of gates) {
        // arch-review-loop/loop-gate is the loop-router exception — it declares
        // eval-CONTEXT inputs (loop-entry + review-accept) beyond the review dep;
        // its exact shape is asserted in 2.13.
        if (name === 'arch-review-loop.taskflow.yaml' && g.id === 'loop-gate') continue;
        expect(g.dependsOn?.length, `${name}/${g.id} dependsOn`).toBe(1);
        expect(g.eval?.length ?? 0, `${name}/${g.id} eval`).toBeGreaterThanOrEqual(1);
        for (const rule of g.eval ?? []) {
          expect(['retry', 'jump'], `${name}/${g.id} action`).toContain(rule.action);
          if (rule.action === 'retry') {
            expect(String(rule.when), `${name}/${g.id} bound`).toMatch(/retryAttempt|round\s*</);
            expect(rule.target, `${name}/${g.id} target`).toBeDefined();
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2.3 — when guard hygiene
// ---------------------------------------------------------------------------

describe('2.3 when guard hygiene', () => {
  it('rejects hardcoded .taskflow/outputs path in guard', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], when: '.taskflow/outputs/a.output.txt shows x', task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('hardcodes runtime output path'))).toBe(true);
  });

  it('rejects sibling-output-existence guard', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'b',
          type: 'main',
          dependsOn: ['a'],
          when: 'a output has save_location and no sibling output present',
          task: 'x',
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
    { id: 'write-a', type: 'main', dependsOn: [], task: 'x' },
    { id: 'write-b', type: 'main', dependsOn: [], task: 'x' },
    {
      id: 'review',
      type: 'main',
      dependsOn: ['write-a', 'write-b'],
      join: 'any',
      skill: 'code-review',
      task: 'x',
    },
    { id: 'accept', type: 'approval', dependsOn: ['review'] },
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
// 2.7 — skill-author dual-guard mutual exclusivity (static field references)
// ---------------------------------------------------------------------------

describe('2.7 skill-author mode guards reference scope-confirm fields only', () => {
  const graph = loadGraph('skill-author.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const guardOf = (id: string): string => String(phases.find((p) => p.id === id)?.when ?? '');

  it('skill-write guard requires save_location and no skill_path', () => {
    const g = guardOf('skill-write');
    expect(g).toMatch(/save_location/);
    expect(g).toMatch(/no skill_path/);
    expect(g).not.toMatch(/output present/);
  });

  it('skill-select guard requires skill_path', () => {
    const g = guardOf('skill-select');
    expect(g).toMatch(/skill_path/);
  });

  it('both guards reference scope-confirm output (direct upstream)', () => {
    expect(guardOf('skill-write')).toMatch(/scope-confirm output/);
    expect(guardOf('skill-select')).toMatch(/scope-confirm output/);
  });

  it('guards are mutually exclusive by field presence', () => {
    // create: save_location AND NOT skill_path; edit: skill_path — no overlap
    const create = guardOf('skill-write');
    const edit = guardOf('skill-select');
    expect(create).toMatch(/save_location/);
    expect(create).toMatch(/no skill_path/);
    expect(edit).toMatch(/skill_path/);
    expect(edit.includes('save_location')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2.9 — implement graph: input-source-aware topology + conditional finalize
// ---------------------------------------------------------------------------

describe('2.9 implement graph topology', () => {
  const graph = loadGraph('implement.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases in dependency order with single entry', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'work-input',
      'implement',
      'implement-review',
      'implement-gate',
      'implement-accept',
      'openspec-finalize',
    ]);
    const entries = phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['work-input']);
  });

  it('implement chain depends linearly', () => {
    expect(phaseOf('implement').dependsOn).toEqual(['work-input']);
    expect(phaseOf('implement-review').dependsOn).toEqual(['implement']);
    expect(phaseOf('implement-gate').dependsOn).toEqual(['implement-review']);
    expect(phaseOf('implement-accept').dependsOn).toEqual(['implement-gate']);
  });

  it('finalize depends on gate only — work-input via node: channel (no redundant transitive dep)', () => {
    const fin = phaseOf('openspec-finalize');
    expect(fin.dependsOn).toEqual(['implement-accept']);
    expect(fin.channels).toContain('node:work-input');
    // guard references channel-injected upstream output — plan-generate ticket-split precedent
    expect(String(fin.when)).toMatch(/work-input output shows input_source: openspec-change/);
  });

  it('gate auto-rework is bounded, contract-field, writer-targeted', () => {
    const gate = phaseOf('implement-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['implement-review']);
    const evalRules = gate.eval as Array<Record<string, unknown>>;
    expect(evalRules).toHaveLength(1);
    expect(String(evalRules[0].when)).toMatch(/overall: fail AND retryAttempt < 2/);
    expect(evalRules[0].action).toBe('retry');
    expect(evalRules[0].target).toBe('implement');
  });

  it('implement-accept is pure human card — no eval, depends on gate', () => {
    const accept = phaseOf('implement-accept');
    expect(accept.type).toBe('approval');
    expect(accept.dependsOn).toEqual(['implement-gate']);
    expect(accept.eval).toBeUndefined();
  });

  it('routing targets resolve to existing phases', () => {
    const accept = phaseOf('implement-accept');
    const routing = accept.routing as { actions: Array<Record<string, unknown>> };
    const targets = routing.actions.map((a) => a.target).filter(Boolean);
    for (const t of targets) {
      expect(phases.map((p) => p.id)).toContain(t);
    }
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

  it('seven phases in dependency order with single entry', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'to-spec',
      'to-tickets',
      'implement',
      'implement-review',
      'implement-gate',
      'implement-accept',
      'openspec-archive',
    ]);
    const entries = phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['to-spec']);
  });

  it('implements linear chain to the terminal', () => {
    expect(phaseOf('to-tickets').dependsOn).toEqual(['to-spec']);
    expect(phaseOf('implement').dependsOn).toEqual(['to-tickets']);
    expect(phaseOf('implement-review').dependsOn).toEqual(['implement']);
    expect(phaseOf('implement-gate').dependsOn).toEqual(['implement-review']);
    expect(phaseOf('implement-accept').dependsOn).toEqual(['implement-gate']);
    expect(phaseOf('openspec-archive').dependsOn).toEqual(['implement-accept']);
  });

  it('channels resolve in-track only — zero cross-level references', () => {
    const allChannels = phases.flatMap((p) => (p.channels ?? []) as string[]);
    for (const ch of allChannels) {
      if (ch.startsWith('node:')) {
        const target = ch.slice('node:'.length);
        expect(
          phases.map((p) => p.id),
          `channel ${ch} resolves in-track`,
        ).toContain(target);
      }
    }
    expect(phaseOf('implement').channels).toContain('node:implement-review');
    expect(phaseOf('implement-review').channels).toEqual(
      expect.arrayContaining(['skill:atom-graph-spec', 'node:to-spec', 'node:to-tickets']),
    );
    expect(phaseOf('openspec-archive').channels).toEqual(expect.arrayContaining(['node:to-spec', 'node:implement']));
  });

  it('gate auto-rework is bounded, contract-field, writer-targeted', () => {
    const gate = phaseOf('implement-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['implement-review']);
    const evalRules = gate.eval as Array<Record<string, unknown>>;
    expect(evalRules).toHaveLength(1);
    expect(String(evalRules[0].when)).toMatch(/overall: fail AND retryAttempt < 2/);
    expect(evalRules[0].action).toBe('retry');
    expect(evalRules[0].target).toBe('implement');
  });

  it('accept is pure human card with explicit in-track routing targets', () => {
    const accept = phaseOf('implement-accept');
    expect(accept.type).toBe('approval');
    expect(accept.dependsOn).toEqual(['implement-gate']);
    expect(accept.eval).toBeUndefined();
    const routing = accept.routing as { actions: Array<Record<string, unknown>> };
    const targets = routing.actions.map((a) => a.target).filter(Boolean);
    for (const t of targets) {
      expect(phases.map((p) => p.id)).toContain(t);
    }
  });

  it('accept preText discloses rework semantics', () => {
    const accept = phaseOf('implement-accept');
    const preText = String(accept.preText);
    expect(preText).toMatch(/re-run to-spec \+ to-tickets/);
    expect(preText).toMatch(/seam confirmation and granularity\s+quiz re-asked/);
    expect(preText).toMatch(/node:implement-review/);
  });

  it('skill declarations match upstream contract reuse', () => {
    expect(phaseOf('implement').skill).toBe('implement');
    expect(phaseOf('implement-review').skill).toBe('code-review');
    expect(phaseOf('openspec-archive').skill).toBe('atom-openspec-archive');
  });
});

// ---------------------------------------------------------------------------
// 2.11 — openspec-pipeline graph: full-lifecycle composition (grill → create → gate → tracks)
// ---------------------------------------------------------------------------

describe('2.11 openspec-pipeline v2 lifecycle topology', () => {
  const graph = loadGraph('openspec-pipeline.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases: idea entry → create flow → human gate → twin flow tracks → terminal', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'grill',
      'create',
      'pipeline-accept',
      'minimal-track',
      'detailed-track',
      'pipeline-done',
    ]);
    // legacy judgment-chain nodes deleted
    expect(phases.map((p) => p.id)).not.toEqual(expect.arrayContaining(['change-detect', 'arch-decision', 'adr-gate']));
    const entries = phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['grill']);
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

  it('entry and create are flows — grill-with-docs + openspec-create composition', () => {
    expect(phaseOf('grill').type).toBe('flow');
    expect(phaseOf('grill').use).toBe('grill-with-docs');
    expect(phaseOf('create').type).toBe('flow');
    expect(phaseOf('create').use).toBe('openspec-create');
  });

  it('tracks are flows — openspec-apply literal reuse + openspec-engineer', () => {
    expect(phaseOf('minimal-track').type).toBe('flow');
    expect(phaseOf('minimal-track').use).toBe('openspec-apply');
    expect(phaseOf('detailed-track').type).toBe('flow');
    expect(phaseOf('detailed-track').use).toBe('openspec-engineer');
  });

  it('track when guards are complementary on the ADR judgment echoed by spec-generate', () => {
    const minimal = String(phaseOf('minimal-track').when);
    const detailed = String(phaseOf('detailed-track').when);
    // when-guard carrier = flattened create flow terminal (create/spec-generate echo), not arch-decision
    expect(minimal).toMatch(/create\/spec-generate output shows spec_status: ok AND adr_created: false/);
    expect(detailed).toMatch(/create\/spec-generate output shows spec_status: ok AND adr_created: true/);
    // blocked → both guards false → both tracks cascade as skipped
    expect(minimal).toMatch(/spec_status: ok/);
    expect(detailed).toMatch(/spec_status: ok/);
  });

  it('pipeline-accept is the human quality gate — continue/retry/jump explicit targets', () => {
    const gate = phaseOf('pipeline-accept');
    expect(gate.type).toBe('approval');
    const actions = (gate.routing as { actions: Array<Record<string, unknown>> }).actions;
    expect(actions.map((a) => a.action)).toEqual(['continue', 'retry', 'jump']);
    const retry = actions.find((a) => a.action === 'retry');
    expect(retry?.target).toBe('create');
    const jump = actions.find((a) => a.action === 'jump');
    expect(jump?.target).toBe('grill');
  });

  it('terminal receives flattened grill consensus + create terminal outputs via channels', () => {
    const done = phaseOf('pipeline-done');
    expect(done.type).toBe('main');
    expect(done.channels).toEqual(expect.arrayContaining(['node:grill/grilling', 'node:create/spec-generate']));
    expect(done.channels).not.toEqual(expect.arrayContaining(['node:grill/grill-accept']));
    expect(String(done.task)).toMatch(/decisions \(echo from grill\)/);
    expect(String(done.task)).toMatch(/candidates \(echo from spec-generate when blocked\)/);
  });

  it('terminal flags incomplete ADR judgment — no silent no-op completion', () => {
    const done = phaseOf('pipeline-done');
    const task = String(done.task);
    expect(task).toMatch(/judgment_incomplete: true/);
    expect(task).toMatch(/graph_jump back to create/);
  });
});

// ---------------------------------------------------------------------------
// 2.12 — openspec-create graph: inline ADR judgment (arch-decision node removed)
// ---------------------------------------------------------------------------

describe('2.12 openspec-create v2 inline ADR topology', () => {
  const graph = loadGraph('openspec-create.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('three phases — arch-decision node deleted, spec-accept-scope removed (approval redundancy rule)', () => {
    expect(phases.map((p) => p.id)).toEqual(['spec-scope', 'spec-gate', 'spec-generate']);
    expect(phases.map((p) => p.id)).not.toEqual(expect.arrayContaining(['arch-decision', 'spec-accept-scope']));
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
    const evalRules = gate.eval as Array<Record<string, unknown>>;
    expect(evalRules).toHaveLength(1);
    expect(String(evalRules[0].when)).toMatch(
      /\(scope_complete false or missing OR adr_created missing\) AND retryAttempt < 2/,
    );
    expect(evalRules[0].action).toBe('retry');
    expect(evalRules[0].target).toBe('spec-scope');
  });

  it('spec-generate echoes adr_created for downstream when-guard carrier', () => {
    const gen = phaseOf('spec-generate');
    expect(String(gen.task)).toMatch(/adr_created \(echo\)/);
  });
});

// ---------------------------------------------------------------------------
// 2.13 — arch-review-loop v5 round-origin topology: loop-entry (per-round scope
// re-confirm, round origin) + review flow dependsOn [loop-entry] + implement flow
// dependsOn [review-accept] + round-end approval (Loop again → loop-entry default,
// no-Top-Rec normal end)
// ---------------------------------------------------------------------------

describe('2.13 arch-review-loop v5 round-origin topology', () => {
  const graph = loadGraph('arch-review-loop.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('seven phases in declaration order — loop-entry FIRST, no verify node', () => {
    // Declaration order is load-bearing: findActiveNode dispatches the first
    // active node — loop-entry (entry interview) must precede review/implement.
    expect(phases.map((p) => p.id)).toEqual([
      'loop-entry',
      'review',
      'review-accept',
      'implement',
      'loop-gate',
      'loop-accept',
      'loop-done',
    ]);
    expect(phaseOf('loop-entry').type).toBe('main');
    expect(phaseOf('loop-entry').dependsOn).toEqual([]);
    expect(phaseOf('review-accept').type).toBe('approval');
    expect(phaseOf('loop-accept').type).toBe('approval');
    // verify deleted — its re-review role moved into arch-review existing mode
    expect(phases.map((p) => p.id)).not.toContain('verify');
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

  it('no autoWhen fields anywhere — Run Mode is a run field (v2 migration, replaces node-level field era)', () => {
    const raw = String(phases.map((p) => JSON.stringify(p)));
    expect(raw).not.toMatch(/autoWhen/);
  });

  it('review + implement are flows; review dependsOn [loop-entry], implement dependsOn [review-accept] (round reset closure)', () => {
    expect(phaseOf('review').type).toBe('flow');
    expect(phaseOf('review').use).toBe('arch-review');
    // round origin — a jump to loop-entry resets the whole review segment
    expect(phaseOf('review').dependsOn).toEqual(['loop-entry']);
    expect(phaseOf('review').when === undefined || phaseOf('review').when === null).toBe(true);
    // report_path + mode delivered via the dependency edge — no redundant channel
    // declaration (contract warning "node already covered by depends" must stay silent)
    expect(phaseOf('review').channels).toBeUndefined();
    expect(phaseOf('implement').type).toBe('flow');
    expect(phaseOf('implement').use).toBe('openspec-pipeline');
    // implement follows the round's accept decision — jump closure resets it via review-accept
    expect(phaseOf('implement').dependsOn).toEqual(['review-accept']);
  });

  it('implement channels carry the report path (node:loop-entry — single source of truth)', () => {
    // review-accept IS upstream (dependsOn) — implement follows the accept decision;
    // node:loop-entry channel still delivers the current report path each round
    expect(phaseOf('implement').channels).toEqual(
      expect.arrayContaining(['node:review/arch-review', 'node:loop-entry']),
    );
  });

  it('implement when-guard keys on top_rec_remaining AND decision label OR existing report input (no forbidden patterns)', () => {
    const when = String(phaseOf('implement').when);
    // implementation runs only while a Top Recommendation remains — no empty rounds
    expect(when).toMatch(/review\/arch-review output shows top_rec_remaining: true/);
    expect(when).toMatch(/review-accept output shows decision label Implement Top Recommendation/);
    expect(when).toMatch(/report_input: existing/);
    expect(when).toMatch(/Stop — report only/);
    // contract checks: no hardcoded runtime output path, no sibling-existence phrasing
    expect(when).not.toMatch(/\.taskflow\/outputs\//);
    expect(when).not.toMatch(/no\s+[\w-]+\s+output\s+present/i);
  });

  it('review flow ALWAYS runs — no existing-mode skip (re-review is the round worker)', () => {
    // v4: arch-review re-reviews existing reports in place — the flow must not skip
    expect(phaseOf('review').when === undefined || phaseOf('review').when === null).toBe(true);
    // review-accept keeps the existing-mode skip — report pre-accepted at entry
    expect(String(phaseOf('review-accept').when)).toMatch(/report_input: existing/);
  });

  it('review-accept branches — implement / stop only (Revise removed)', () => {
    const actions = (phaseOf('review-accept').routing as { actions: Array<Record<string, unknown>> }).actions;
    expect(actions.map((a) => a.action)).toEqual(['continue', 'continue']);
    expect(actions.map((a) => a.label)).toEqual(['Implement Top Recommendation', 'Stop — report only']);
    expect(actions.some((a) => String(a.label).includes('Revise'))).toBe(false);
  });

  it('arch-review node task is dual-mode — report_input branch + unified output contract', () => {
    const arch = loadGraph('arch-review.taskflow.yaml');
    const phases2 = arch.phases as Array<Record<string, unknown>>;
    const reviewNode = phases2.find((p) => p.id === 'arch-review');
    expect(reviewNode).toBeDefined();
    const task = String(reviewNode?.task);
    // dual mode — fresh writes new report, existing re-reviews in place
    expect(task).toMatch(/report_input: fresh/);
    expect(task).toMatch(/report_input: existing/);
    expect(task).toMatch(/closed-loop re-review mode/);
    expect(task).toMatch(/NO path re-confirmation/);
    // unified structured output contract (both modes) — gate eval field source
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

  it('loop-gate — auto loop router: eval reads review/arch-review output, retry target loop-entry', () => {
    const gate = phaseOf('loop-gate');
    expect(gate.type).toBe('gate');
    expect(gate.dependsOn).toEqual(['review/arch-review', 'loop-entry', 'review-accept']);
    const evals = gate.eval as Array<Record<string, unknown>>;
    expect(evals).toHaveLength(1);
    const cond = String(evals[0].when);
    expect(cond).toMatch(/run mode is auto/);
    expect(cond).toMatch(/Implement Top Recommendation OR loop-entry output shows report_input: existing/);
    // field source = the round worker's unified output (was verify — deleted)
    expect(cond).toMatch(/review\/arch-review output shows top_rec_remaining: true/);
    expect(cond).not.toMatch(/verify output/);
    // retry bounded by the reviewer iteration counter (hygiene — not a termination
    // mechanism; ending the loop is always a human decision)
    expect(cond).toMatch(/round < 8/);
    expect(evals[0].action).toBe('retry');
    // round origin — the loop re-runs from loop-entry (scope re-confirmed each round)
    expect(evals[0].target).toBe('loop-entry');
  });

  it('loop-accept — round-end approval: Loop again default (retry loop-entry), no-Top-Rec normal end', () => {
    const gate = phaseOf('loop-accept');
    // when-skip — no Top Recommendation remains → normal end (loop-done), NOT force-end
    expect(String(gate.when)).toMatch(/top_rec_remaining: false/);
    const actions = (gate.routing as { actions: Array<Record<string, unknown>> }).actions;
    expect(actions.map((a) => a.action)).toEqual(['retry', 'continue']);
    expect(actions.map((a) => a.label)).toEqual(['Loop again — re-review the report', 'Complete loop']);
    // default = repeat → retry loop-entry (round origin, scope re-confirmed); end = explicit user choice
    expect(actions[0].action).toBe('retry');
    expect(actions[0].target).toBe('loop-entry');
    expect(actions[1].action).toBe('continue');
    expect(actions.some((a) => String(a.label).includes('Revise'))).toBe(false);
  });

  it('loop-done is the sole execution terminal (implement follows review-accept — single forward path)', () => {
    const done = phaseOf('loop-done');
    expect(done.type).toBe('main');
    expect(done.dependsOn).toEqual(['loop-accept']);
    const hasDownstream = new Set<string>();
    for (const p of phases) {
      for (const dep of (p.dependsOn ?? []) as string[]) hasDownstream.add(dep);
    }
    // implement (flow) has no raw-graph downstream dependent — it is a flow whose
    // flattened children terminate inside the pipeline; loop-done is the run-path
    // terminal (declared last). The forward path is linear:
    // loop-entry → review → review-accept → implement → loop-gate → loop-accept → loop-done
    const terminals = phases.filter((p) => !hasDownstream.has(String(p.id))).map((p) => String(p.id));
    expect(terminals.sort()).toEqual(['implement', 'loop-done']);
    expect(phases.map((p) => p.id).indexOf('loop-done')).toBe(phases.length - 1);
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
        { nodeId: 'c', status: 'skipped', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
      ]),
    );
    expect(snap.status).toBe('running');
    expect(snap.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('completed and skipped nodes enumerable for jump targeting', () => {
    const snap = buildSnapshot(runningState());
    const eligible = snap.nodes.filter((n) => n.status === 'done' || n.status === 'skipped');
    expect(eligible.map((n) => n.nodeId).sort()).toEqual(['a', 'c']);
  });

  it('idle snapshot has empty nodes', () => {
    const snap = buildSnapshot({ status: 'idle' });
    expect(snap.nodes).toEqual([]);
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
