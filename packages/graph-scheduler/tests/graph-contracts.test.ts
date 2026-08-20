/**
 * Graph contract tests — v2 (syntax v2) contract pass + built-in fleet
 * topology checks.
 *
 * Covers:
 * - 2.5 skill optional on main; 'agent' type unregistered → schema rejection
 * - 2.2 v2 contract pass: task-text branch-target resolution, redundant
 *   transitive dependency rejection, graph-level `node:` context resolution
 *   (flat engine — own-phase targets only; composition deleted)
 * - route-first fleet contract (v2 shapes): type {main} only, no
 *   route/routing/join, no removed fields
 * - 2.6 AND convergence — a node dispatches only after all upstreams are
 *   terminal (facade-observable)
 * - 2.14/2.15/2.9/2.10/2.13 migrated built-in graph topologies (final v2 shapes)
 * - 2.8 snapshot nodes: facade snapshots — one-line rows + delta changed rows
 * - 4.6-4.9 channels / task text / inventory
 */
import { Effect } from 'effect';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { validateGraphContracts, validateGraphInventory } from '../src/context/contracts.js';
import { createRuntime, type SchedulerRuntime } from '../src/scheduler-runtime.js';
import { PhaseSchema } from '../src/schemas/phase.js';
import { WorkflowSchema } from '../src/schemas/workflow.js';
import { scopeEntryTaskTemplate } from '../src/task-templates/index.js';

const PKG_ROOT = join(__dirname, '..');

/** built-in graphs dispatched to contract checks (fleet scans) */
const BUILTIN_GRAPHS = [
  'arch-review.yaml',
  'arch-review-loop.yaml',
  'e2e-minimal.yaml',
  'graph-generate.yaml',
  'adopt-with-docs.yaml',
  'openspec-apply.yaml',
  'openspec-engineer.yaml',
  'spec-implement.yaml',
  'estate-maintain.yaml',
  'release-prep.yaml',
] as const;

function loadGraph(name: string): Record<string, unknown> {
  const raw = readFileSync(join(PKG_ROOT, 'graphs', name), 'utf-8');
  return parseYaml(raw) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Runtime fixture — shared by the facade-observable contract tests (2.6, 2.8)
// ---------------------------------------------------------------------------

interface RuntimeFixture {
  taskflowDir: string;
  cleanup: () => void;
}

function makeRuntimeFixture(): RuntimeFixture {
  const taskflowDir = join(tmpdir(), `graph-contracts-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  // Fan-in graph — AND convergence (2.6): w1 + w2 → review → accept
  const fan = {
    name: 'fan-test',
    phases: [
      { id: 'w1', type: 'main', skill: 'scenario-agent-skill', task: 'one', dependsOn: [], operations: [] },
      { id: 'w2', type: 'main', skill: 'scenario-agent-skill', task: 'two', dependsOn: [], operations: [] },
      {
        id: 'review',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'review',
        dependsOn: ['w1', 'w2'],
        operations: [],
      },
      { id: 'accept', type: 'main', task: 'ok', dependsOn: ['review'], operations: [] },
    ],
  };
  writeFileSync(join(taskflowDir, 'fan-test.yaml'), JSON.stringify(fan, null, 2));

  // Linear graph — snapshot lifecycle (2.8)
  const linear = {
    name: 'linear-test',
    phases: [
      { id: 'phase-1', type: 'main', skill: 'scenario-agent-skill', task: 'step 1', dependsOn: [], operations: [] },
      {
        id: 'phase-2',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'step 2',
        dependsOn: ['phase-1'],
        operations: [],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'linear-test.yaml'), JSON.stringify(linear, null, 2));

  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(
    registryPath,
    JSON.stringify({
      graphs: [
        { name: 'fan-test', path: 'fan-test.yaml' },
        { name: 'linear-test', path: 'linear-test.yaml' },
      ],
    }),
  );

  return { taskflowDir, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

async function createTestRuntime(fix: RuntimeFixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fix.taskflowDir,
      registryPaths: [join(fix.taskflowDir, 'registry.json')],
      // Hermetic — ambient config.json context must not leak into checks
      context: [],
    }),
  );
}

// ---------------------------------------------------------------------------
// 2.5 — skill optional on main phases; 'agent' phase type unregistered
// ---------------------------------------------------------------------------

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

  it('main phases are exempt', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'ap', type: 'main', dependsOn: ['m'], operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects agent phase type at load — schema rejection (unregistered)', () => {
    // The type enum is {main} only — the agent type fails at WorkflowSchema
    // parse (the load path), never silently falling back.
    const tf = { name: 'test', phases: [{ id: 'a', type: 'agent', dependsOn: [], skill: 'code-review', task: 'x' }] };
    const result = WorkflowSchema.safeParse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('expected "main"');
      expect(result.error.issues[0]?.path.join('.')).toBe('phases.0.type');
    }
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
// 2.2 — v2 contract pass: branch-target resolution, redundant-dep hygiene,
// graph-level node: context resolution (flat engine — own-phase targets only)
// ---------------------------------------------------------------------------

describe('2.2 v2 contract pass', () => {
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

  it('does not validate backtick-quoted task-text targets — backtick channel retired', () => {
    // The backtick-target machinery is retired (graph-flow capability):
    // rework/branch targets are declared in the top-level `flow` block
    // (labeled edges — flow-defined condition vocabulary), never task-text
    // quoting. Flow-edge endpoint validation (compile-time) is the single
    // machine axis for target resolvability.
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['a'],
          task: 'Rework decision — report the rework condition when the verdict fails (re-enters `ghost` or `ghost/child`).',
          operations: [],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    // a dangling backtick target and a namespaced target both load — no
    // task-text target checks exist
    expect(errors.some((e) => e.includes('task-text branch target'))).toBe(false);
  });

  it('does not warn on a jump-verb task line without a backtick target — advisory retired', () => {
    const graph = {
      name: 'test',

      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['a'],
          task: 'Failures surfaced — never silently patched; rework via the flow rework condition (re-enters entry for a fresh pass).',
          operations: [],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    // the jump-verb advisory (rework condition without an explicit backtick
    // target) is retired — rework paths live in the flow block
    expect(warnings.some((w) => w.includes('rework condition without an explicit backtick target'))).toBe(false);
  });

  it('rejects graph-level node: context entries targeting a missing phase', () => {
    const graph = {
      name: 'test',

      context: ['node:ghost'],
      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes("targets missing phase 'ghost'"))).toBe(true);
  });

  it('accepts graph-level node: context entries resolving to source phases', () => {
    const graph = {
      name: 'test',

      context: ['node:a'],
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'y', operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects graph-level node: context entries with namespaced (composing/child) targets', () => {
    const graph = {
      name: 'test',

      context: ['node:minimal-track/archive'],
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'minimal-track', type: 'main', dependsOn: ['a'], operations: [] },
      ],
    };
    // Flat engine: graph-level node: entries resolve against this graph's own
    // phase set — namespaced (composing/child) targets are literal ids and
    // match no phase.
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(
      errors.some(
        (e) => e.includes("targets missing phase 'minimal-track/archive'") && e.includes("this graph's own phase set"),
      ),
    ).toBe(true);
  });

  it("accepts graph-level node: context entries targeting this graph's own phases", () => {
    const graph = {
      name: 'test',

      context: ['node:minimal-track', 'node:archive'],
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] },
        { id: 'minimal-track', type: 'main', dependsOn: ['a'], operations: [] },
        { id: 'archive', type: 'main', dependsOn: ['minimal-track'], operations: [] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects a composing (use) phase at load — unknown-key schema rejection naming the key', () => {
    // Composition is deleted (graph-subgraph-route-unify): any phase declaring
    // `use` fails strict schema validation at the load path with an
    // unknown-key error naming the key.
    const tf = {
      name: 'test',

      phases: [{ id: 'c', type: 'main', use: 'child-graph', dependsOn: [], operations: [] }],
    };
    const result = WorkflowSchema.safeParse(tf);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain('Unrecognized key: "use"');
      expect(result.error.issues[0]?.path.join('.')).toBe('phases.0');
    }
  });

  it('rejects a graph-level context bare name — explicit prefix required at graph scope', () => {
    const graph = {
      name: 'test',

      context: ['bare-name'],
      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('is a bare name'))).toBe(true);
  });

  it('warns (never errors) on a graph-level convention-file declaration — redundant at graph scope', () => {
    const graph = {
      name: 'test',

      context: ['./CONTEXT.md'],
      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x', operations: [] }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('convention-layer file'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Fleet contract — all built-in graphs follow the v2 shape: type {main} only,
// no route/routing/join/end, no removed fields; rework decisions are main
// nodes with the condition in task text.
// Raw assertions only — load-path validation lives in the graph-loading tests.
// ---------------------------------------------------------------------------

describe('v2 fleet contract', () => {
  it('type {main} only; no route/routing/join/end; no branches/default/mode/when/eval anywhere', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
      for (const p of phases) {
        const id = String(p.id);
        expect(p.type, `${name}/${id} type main only`).toBe('main');
        expect(p.route, `${name}/${id} route removed`).toBeUndefined();
        expect(p.routing, `${name}/${id} routing removed`).toBeUndefined();
        expect(p.join, `${name}/${id} join removed`).toBeUndefined();
        expect(p.branches, `${name}/${id} branches removed`).toBeUndefined();
        expect(p.default, `${name}/${id} default removed`).toBeUndefined();
        expect(p.mode, `${name}/${id} mode removed`).toBeUndefined();
        expect(p.when, `${name}/${id} when removed`).toBeUndefined();
        expect(p.eval, `${name}/${id} eval removed`).toBeUndefined();
        expect(p.reads, `${name}/${id} reads removed`).toBeUndefined();
        expect(p.preText, `${name}/${id} preText removed`).toBeUndefined();
      }
    }
  });

  it('rework decisions are main nodes with the condition in task text — no written routing actions', () => {
    for (const name of BUILTIN_GRAPHS) {
      const graph = loadGraph(name);
      const phases = (graph.phases ?? []) as Array<Record<string, unknown>>;
      for (const p of phases) {
        expect(p.type, `${name}/${String(p.id)} no approval type`).toBe('main');
        const actions = ((p.routing as Record<string, unknown> | undefined)?.actions ?? []) as Array<
          Record<string, unknown>
        >;
        expect(actions.length, `${name}/${String(p.id)} no written actions`).toBe(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2.6 — AND convergence: a node dispatches only after all upstreams are
// terminal (join modes deleted — AND is the only join mode)
// ---------------------------------------------------------------------------

describe('2.6 AND convergence — decision dispatches only after all upstreams complete', () => {
  let fix: RuntimeFixture;
  let rt: SchedulerRuntime;

  beforeEach(async () => {
    fix = makeRuntimeFixture();
    rt = await createTestRuntime(fix);
  });

  afterEach(async () => {
    await rt.dispose();
    fix.cleanup();
  });

  it('fan-in decision dispatches only after both upstreams are terminal', async () => {
    const { runId, node } = await rt.graphStart('fan-test', { mode: 'auto' });
    expect(node!.nodeId).toBe('w1');

    // Advancing the first writer completes the second (parallel START entry)
    // — review (dependsOn both) dispatches only now that both are terminal.
    const r1 = await rt.graphAdvance(runId, 'w1');
    expect(r1.node!.nodeId).toBe('review');
    // Compact hot-path snapshot — progress + delta rows; full enumeration via
    // graph_status.
    expect(r1.snapshot.nodes).toBeUndefined();
    expect(r1.snapshot.progress).toBe('2/5 · review');
    expect(r1.snapshot.changed?.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'accept', 'review', 'w1', 'w2']);
    const status = await rt.graphStatus(runId);
    const statuses = new Map(status.nodes!.map((n) => [n.nodeId, n.status]));
    expect(statuses.get('w1')).toBe('done');
    expect(statuses.get('w2')).toBe('done');
    expect(statuses.get('review')).toBe('active');
    expect(statuses.get('accept')).toBe('pending');
  });

  it('chain dispatches in dependency order to natural drain', async () => {
    const { runId, node } = await rt.graphStart('fan-test', { mode: 'auto' });
    expect(node!.nodeId).toBe('w1');

    const r1 = await rt.graphAdvance(runId, 'w1');
    expect(r1.node!.nodeId).toBe('review');
    const r2 = await rt.graphAdvance(runId, 'review');
    expect(r2.node!.nodeId).toBe('accept');
    const r3 = await rt.graphAdvance(runId, 'accept');
    // The synthesized main terminal dispatches after the last source phase.
    expect(r3.node!.nodeId).toBe('__handoff');
    const r4 = await rt.graphAdvance(runId, '__handoff');
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2.14 — graph-generate concrete maker graph (flow topology): startup →
// entry → spec → spec-accept → implement → review — the implement+review
// round inlined from the former generate-review-body loop body; the loop is
// the flow self-edge review -->|fail| implement (inline bounded loop, never
// a subgraph sibling run). Single kind (graph), single operation (create);
// no skeleton, no kind switch, no skill co-production. The engine
// synthesizes the root __handoff terminal after the round terminal.
// ---------------------------------------------------------------------------

describe('2.14 graph-generate concrete maker graph topology', () => {
  const graph = loadGraph('graph-generate.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('six phases in dependency order — startup template entry, inlined implement+review round, no end marker, no composition', () => {
    expect(phases.map((p) => p.id)).toEqual(['startup', 'entry', 'spec', 'spec-accept', 'implement', 'review']);
    expect(phases.some((p) => p.use !== undefined)).toBe(false);
    expect(phaseOf('startup').template).toBe('startup');
    expect(phaseOf('startup').dependsOn).toEqual([]);
    expect(phaseOf('entry').dependsOn).toEqual(['startup']);
    expect(phaseOf('entry').skill).toBe('atom-scope-interview');
    // the review round terminal is the last source phase — the engine
    // synthesizes the root __handoff terminal after it (compile-time, never
    // in YAML)
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('linear chain — spec-first: spec → spec-accept → implement → review; the round is inlined, no loop node, no gate', () => {
    expect(phaseOf('spec').dependsOn).toEqual(['entry']);
    expect(phaseOf('spec-accept').dependsOn).toEqual(['spec']);
    expect(phaseOf('implement').dependsOn).toEqual(['spec-accept']);
    expect(phaseOf('review').dependsOn).toEqual(['implement']);
    // the loop template node is gone — the round body (implement + review)
    // is inlined and the loop is the flow self-edge
    expect(phases.some((p) => p.id === 'loop')).toBe(false);
    expect(phases.some((p) => p.id === 'gate')).toBe(false);
  });

  it('single decision layer — spec-accept only, nothing more', () => {
    const decisions = phases.filter((p) => p.id === 'spec-accept');
    expect(decisions.map((p) => p.id)).toEqual(['spec-accept']);
    for (const d of decisions) expect(d.type).toBe('main');
  });

  it('the loop is the flow self-edge review -->|fail| implement — round terminal, full coverage', () => {
    // Loop/rework semantics are flow self-edges (graph-flow): the review
    // round terminal reports the flow-defined condition; 'fail' re-enters
    // implement via the transition table — never a template: loop node.
    // Full coverage: the sequence section is declared as unlabeled default
    // edges — every phase appears in the flow block.
    expect(graph.flow).toEqual([
      'startup --> entry',
      'entry --> spec',
      'spec --> spec-accept',
      'spec-accept --> implement',
      'implement --> review',
      'review -->|fail| implement',
      'review -->|pass| __handoff',
    ]);
    const review = phaseOf('review');
    expect(review.type).toBe('main');
    expect(review.template).toBeUndefined();
    expect(review.task).toMatch(/flow-defined\s+round condition/);
    expect(review.task).toMatch(/flow self-edge re-enters implement/);
    expect(review.task).toMatch(/retry bound/);
    // no default edge — review pass (no condition) drains to __handoff
    expect(phaseOf('implement').default).toBeUndefined();
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

  it('implement output contract covers the two-path bundle + load-probe validation (inlined)', () => {
    const implement = phaseOf('implement');
    const task = String(implement.task);
    expect(task).toMatch(/artifact_path/);
    expect(task).toMatch(/registry_path/);
    expect(task).toMatch(/graph_start/);
    expect(task).toMatch(/graph_force_end/);
    expect(task).not.toMatch(/graph_init/);
    // attached doc deleted — two-path bundle (per-node template single-sourcing)
    expect(task).not.toMatch(/doc_path/);
    expect(task).not.toMatch(/\.graph-scheduler\/docs\//);
    expect(task).toMatch(/two-path bundle/i);
  });

  it('spec/implement declare production skills — both inlined in the parent', () => {
    expect(phaseOf('spec').skill).toBe('atom-graph-design');
    expect(phaseOf('implement').skill).toBe('atom-graph-writer');
  });

  it('review declares code-review with the implement stream; atom-graph-spec inherited at graph level', () => {
    const review = phaseOf('review');
    expect(review.skill).toBe('code-review');
    expect(review.channels).toEqual(['node:implement']);
    // atom-graph-spec moved to graph-level ambient scope — no per-node repeat
    expect(review.channels).not.toContain('skill:atom-graph-spec');
    expect(graph.context).toEqual(expect.arrayContaining(['skill:atom-graph-spec']));
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
// (scenario split): implementation + review nodes carry the spec-standards
// mapping rule pointer (single home atom-skill-spec §Domain Spec Standards
// Mapping — graph → atom-graph-spec, skill → atom-skill-spec, doc →
// atom-doc-maintain); no static single-kind skill:atom-graph-spec channel
// remains. openspec-apply and openspec-engineer both inline their
// apply/review + implement/review chains (flow self-edge rework — the loop
// bodies are deleted, graph-flow capability).
// ---------------------------------------------------------------------------

describe('2.15 openspec-apply / openspec-engineer spec-skill rule', () => {
  // Pointerized contract (specs-residue-cleanup F9): the mapping rule body
  // lives once at atom-skill-spec §Domain Spec Standards Mapping; task text
  // carries the pointer only.
  const RULE = /per atom-skill-spec §Domain Spec\s*Standards Mapping/;

  it('openspec-apply: apply-change + change-review (inlined round) declare the mapping rule pointer', () => {
    const graph = loadGraph('openspec-apply.yaml');
    const phases = graph.phases as Array<Record<string, unknown>>;
    for (const id of ['apply-change', 'change-review']) {
      const p = phases.find((ph) => ph.id === id);
      expect(p, `phase ${id} present`).toBeDefined();
      expect(String(p?.task ?? '')).toMatch(RULE);
    }
  });

  it('openspec-engineer: implement + implement-review (inlined round) declare the mapping rule pointer', () => {
    const graph = loadGraph('openspec-engineer.yaml');
    const phases = graph.phases as Array<Record<string, unknown>>;
    for (const id of ['implement', 'implement-review']) {
      const p = phases.find((ph) => ph.id === id);
      expect(p, `phase ${id} present`).toBeDefined();
      expect(String(p?.task ?? '')).toMatch(RULE);
    }
  });

  it('no static skill:atom-graph-spec channel in the parent graphs', () => {
    for (const name of ['openspec-apply.yaml', 'openspec-engineer.yaml']) {
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
// track router (template: router — sibling-run activation, no composing
// phases) → terminal. No spec generation, no auto-loop gate — the change
// comes from the adopt stage (adopt-with-docs spec-propose); rework is the
// single loop in arch-review-loop.
// ---------------------------------------------------------------------------

describe('2.9 spec-implement graph topology', () => {
  const graph = loadGraph('spec-implement.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('three phases in dependency order with single entry and no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual(['spec-extract', 'track-accept', 'workflow-done']);
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['spec-extract']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
    // no spec production, no auto-loop gate — the single loop lives in
    // arch-review-loop
    expect(phases.some((p) => p.id === 'spec-generate')).toBe(false);
    expect(phases.some((p) => p.id === 'implement-loop-gate')).toBe(false);
  });

  it('machinery chain depends linearly — the router converges at the terminal; no doc-maintenance stage', () => {
    expect(phaseOf('track-accept').dependsOn).toEqual(['spec-extract']);
    expect(phaseOf('workflow-done').dependsOn).toEqual(['track-accept']);
    // join modes deleted — AND convergence only; no track terminals exist
    // (the chosen graph runs as a sibling run and its result arrives via the
    // router report)
    expect(phaseOf('workflow-done').join).toBeUndefined();
    // workflow-done is the terminal — no gate after it (single loop in the
    // composition)
  });

  it('spec-extract is extraction-only — change resolution, no generation skill', () => {
    const extract = phaseOf('spec-extract');
    expect(extract.type).toBe('main');
    expect(extract.skill).toBeUndefined();
    const task = String(extract.task);
    expect(task).toMatch(/launching router sibling/);
    expect(task).toMatch(/\{args\.changeName\}/);
    expect(task).not.toMatch(/reportPath/);
    expect(task).not.toMatch(/openspec-propose/);
    expect(task).toMatch(/adr_created\s+ECHOES the adoption record/);
  });

  it('track-accept is the router template node — machine-declared paths, no routing, never asks', () => {
    const accept = phaseOf('track-accept');
    expect(accept.type).toBe('main');
    expect((accept.routing as Record<string, unknown> | undefined)?.actions).toBeUndefined();
    // router template (graph-router-template): the candidate graphs ARE the
    // tracks — machine-declared template_args.paths, no authored task (the
    // template injects it), no composing phases, no branchTo
    expect(accept.template).toBe('router');
    expect(accept.template_args).toEqual({ paths: ['openspec-apply', 'openspec-engineer'] });
    expect(accept.task).toBeUndefined();
    expect(accept.use).toBeUndefined();
  });

  it('no auto-loop gate — workflow-done is the terminal (single loop in arch-review-loop)', () => {
    expect(phases.some((p) => p.type === 'gate')).toBe(false);
    expect(phaseOf('workflow-done').channels).toEqual(
      expect.arrayContaining(['node:spec-extract', 'node:track-accept']),
    );
  });

  it('no composing track phases — paths are graphs started as sibling runs', () => {
    expect(phases.filter((p) => p.use !== undefined)).toHaveLength(0);
    expect(phases.some((p) => p.id === 'minimal-track')).toBe(false);
    expect(phases.some((p) => p.id === 'detailed-track')).toBe(false);
    // openspec-apply / openspec-engineer own their post-archive closure
    // (plain archive / atom-doc-lifecycle) — spec-implement declares no
    // doc-update composition
    expect(phases.filter((p) => p.use === 'doc-update')).toHaveLength(0);
  });

  it('entry reads via graph_start args; terminal channels carry the router result', () => {
    // spec-extract declares no composition read edges — the produced change
    // + adoption record arrive via graph_start args (the launching router
    // sibling); the terminal converges on the router result stream
    expect(phaseOf('spec-extract').channels).toBeUndefined();
    expect(phaseOf('workflow-done').channels).toEqual(['node:spec-extract', 'node:track-accept']);
  });

  it('skill declarations — no generation skill in spec-implement; openspec-propose lives in the adopt stage', () => {
    expect(phaseOf('spec-extract').skill).toBeUndefined();
    expect(phases.some((p) => p.skill === 'openspec-propose')).toBe(false);
    const adopt = loadGraph('adopt-with-docs.yaml');
    const adoptPhases = adopt.phases as Array<Record<string, unknown>>;
    const propose = adoptPhases.find((p) => p.id === 'spec-propose');
    expect(propose?.skill).toBe('openspec-propose');
    // self-deciding pipeline (interaction: none) — the adoption consensus
    // arrives via channels; the accept gate is framework-hosted, never here
    expect(propose?.dependsOn).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2.10 — openspec-engineer graph: detailed track topology (flow self-edge):
// to-spec → to-tickets → implement → implement-review → openspec-archive.
// The implement → implement-review round is inlined in the parent; the
// rework loop is the flow self-edge implement-review -->|fail| implement
// (graph-flow capability — the loop template and the engineer-review-body
// subgraph are deleted).
// ---------------------------------------------------------------------------

describe('2.10 openspec-engineer graph topology (flow self-edge loop)', () => {
  const graph = loadGraph('openspec-engineer.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('five phases in dependency order with single entry and no end marker', () => {
    expect(phases.map((p) => p.id)).toEqual([
      'to-spec',
      'to-tickets',
      'implement',
      'implement-review',
      'openspec-archive',
    ]);
    const entries = phases.filter((p) => ((p.dependsOn ?? []) as unknown[]).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['to-spec']);
    expect(phases.some((p) => p.type === 'end')).toBe(false);
  });

  it('linear chain to the terminal — the implement + review round is inlined with a flow self-edge', () => {
    expect(phaseOf('to-tickets').dependsOn).toEqual(['to-spec']);
    expect(phaseOf('implement').dependsOn).toEqual(['to-tickets']);
    expect(phaseOf('implement-review').dependsOn).toEqual(['implement']);
    expect(phaseOf('openspec-archive').dependsOn).toEqual(['implement-review']);
    // the loop template is gone — the round is inlined; the rework loop is
    // the flow self-edge implement-review -->|fail| implement
    expect(phases.some((p) => p.id === 'loop')).toBe(false);
    expect(graph.flow).toContain('implement-review -->|fail| implement');
  });

  it('to-spec is the decided entry — single in-degree-0 entry, no interview node', () => {
    const toSpec = phaseOf('to-spec');
    // decided journey entry: the decision is already recorded — no
    // interview skill, no input-source detection; the machinery track is
    // entered raw with the recorded decision. Execution skill bound per
    // round-4 F3 (to-spec exists in the global skill set).
    expect(toSpec.dependsOn).toEqual([]);
    expect(toSpec.skill).toBe('to-spec');
    expect(toSpec.input).toBeUndefined();
    expect(String(toSpec.task)).toMatch(/No interview/);
  });

  it('confirmation prose is de-hardcoded — decisions auto-execute, no approval() checkpoints', () => {
    // to-spec / to-tickets / implement confirmation instructions belong to
    // the skills' approval() checkpoints — graph task text never hardcodes
    // user-confirmation sentences (auto mode would stall on them)
    const tasks = phases.map((p) => String(p.task ?? ''));
    const all = tasks.join('\n');
    expect(all).not.toMatch(/confirm once with the user/);
    expect(all).not.toMatch(/quiz the user/);
    expect(all).not.toMatch(/seam confirmation \(question once\)/);
    // post-debt-cleanup: decisions auto-execute — zero approval() references
    expect(all).not.toMatch(/approval\(\)/);
    expect(tasks[0]).toMatch(/select the recommended seam/); // to-spec
    expect(tasks[1]).toMatch(/automatically — no confirmation/); // to-tickets
  });

  it('the loop template is gone — the round rework is the flow self-edge, schema-valid', () => {
    // The loop template is removed; the implement + review round is inlined
    // and the rework loop is the flow self-edge implement-review -->|fail|
    // implement (graph-flow capability). The graph loads clean.
    expect(phases.some((p) => p.template === 'loop')).toBe(false);
    const implementReview = phaseOf('implement-review');
    expect(String(implementReview.task)).toMatch(/review_condition \(fail \| pass\)/);
    const raw = readFileSync(join(PKG_ROOT, 'graphs', 'openspec-engineer.yaml'), 'utf-8');
    const parsed = parseYaml(raw);
    const result = WorkflowSchema.safeParse(parsed);
    expect(result.success).toBe(true);
  });

  it('skill declarations match upstream contract reuse (inlined implement + review round)', () => {
    expect(phaseOf('openspec-archive').skill).toBe('atom-doc-lifecycle');
    // implement → implement-review chain is inlined in the parent (flow
    // self-edge rework — the loop body is deleted, graph-flow capability)
    const implement = phaseOf('implement');
    const implementReview = phaseOf('implement-review');
    expect(implement.skill).toBe('implement');
    expect(implement.dependsOn).toEqual(['to-tickets']);
    expect(implementReview.skill).toBe('code-review');
    expect(implementReview.dependsOn).toEqual(['implement']);
  });
});

// ---------------------------------------------------------------------------
// 2.13 — arch-review-loop three-stage partition topology (flow model):
// startup (template: startup) → scope-entry (framework-hosted
// atom-scope-interview) → requirement = arch-review chain (requirement
// accept loop caller-declared on the router node) →
// adopt interaction (adopting — grilling consensus IS the
// acceptance) → adopt = adopt-with-docs → implement = spec-implement →
// round-report. The former
// loop shell + arch-loop-body are gone — the three-stage partition is
// INLINED and the loop is the flow self-edge round-report -->|remaining|
// scope-entry (inline bounded loop, never a subgraph sibling run). No
// loop-gate, no loop template node.
// ---------------------------------------------------------------------------

describe('2.13 arch-review-loop three-stage partition topology (requirement + adopt + implement flows)', () => {
  const graph = loadGraph('arch-review-loop.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const phaseOf = (id: string): Record<string, unknown> => {
    const p = phases.find((ph) => ph.id === id);
    expect(p, `phase ${id} present`).toBeDefined();
    return p!;
  };

  it('single root (startup template) + the full inlined round chain; no end marker, no loop template', () => {
    // Declaration order is load-bearing: startup, then the three-stage
    // round chain inlined from the former arch-loop-body. The loop is the
    // flow self-edge round-report -->|remaining| scope-entry — no loop
    // template node exists. The accept-node consolidation
    // removed review-accept / adopt-accept — the requirement accept loop is
    // caller-declared on the requirement router node (questions), the
    // adoption consensus ends at adopting (grilling shared_understanding).
    // Deleted: round-continue content gate + proceed route, loop-gate,
    // loop-entry, review-accept-gate, loop-done end marker, top-level grill,
    // refine stage id, any implement-loop-gate in the composition.
    // spec-extract lives in the spec-implement machinery — never a root here.
    expect(phases.map((p) => p.id)).toEqual([
      'startup',
      'scope-entry',
      'requirement',
      'adopting',
      'adopt',
      'implement',
      'round-report',
    ]);
    expect(phaseOf('startup').template).toBe('startup');
    expect(phaseOf('startup').dependsOn).toEqual([]);
    expect(phaseOf('scope-entry').dependsOn).toEqual(['startup']);
    expect(phases.map((p) => p.id)).not.toEqual(
      expect.arrayContaining([
        'loop',
        'loop-entry',
        'round-continue',
        'verify',
        'review-accept-gate',
        'loop-done',
        'loop-accept',
        'grill',
        'refine',
        'loop-gate',
        'review-accept',
        'adopt-accept',
      ]),
    );
    for (const p of phases) expect(p.type).toBe('main');
    expect(phases.some((p) => p.type === 'end')).toBe(false);
    expect(phases.some((p) => p.template === 'loop')).toBe(false);
  });

  it('the loop is the flow self-edge round-report -->|remaining| scope-entry — round terminal, full coverage', () => {
    // Loop/rework semantics are flow self-edges (graph-flow): the round
    // terminal reports the flow-defined condition; 'remaining' re-enters
    // scope-entry via the transition table — never a template: loop node.
    // Full coverage: the sequence section is declared as unlabeled default
    // edges — every phase appears in the flow block.
    expect(graph.flow).toEqual([
      'startup --> scope-entry',
      'scope-entry --> requirement',
      'requirement -->|revise| requirement',
      'requirement --> adopting',
      'adopting --> adopt',
      'adopt --> implement',
      'implement --> round-report',
      'round-report -->|remaining| scope-entry',
      'round-report -->|complete| __handoff',
    ]);
    const roundReport = phaseOf('round-report');
    expect(roundReport.type).toBe('main');
    expect(roundReport.template).toBeUndefined();
    expect(roundReport.dependsOn).toEqual(['implement']);
    expect(String(roundReport.task)).toMatch(/round_condition \(remaining \| complete\)/);
    expect(String(roundReport.task)).toMatch(/flow self-edge re-enters scope-entry/);
    expect(String(roundReport.task)).toMatch(/direct end/);
    // no default edge — 'complete' (no condition) drains to __handoff
    expect(phaseOf('scope-entry').default).toBeUndefined();
    // loop bound vocabulary declared at graph level (constraints)
    const constraints = (graph.constraints ?? []) as Array<string>;
    expect(constraints.some((c) => c.includes('flow self-edge re-entry'))).toBe(true);
  });

  it('scope-entry (framework root) carries the scope interview contract — no Run Mode topic', () => {
    // scope-entry template — the shared chain is single-sourced in
    // task-templates (one template one file); the composed task
    // text carries the atom-scope-interview callee contract (Topics /
    // Behavior / Output contract)
    const scope = phaseOf('scope-entry');
    expect(scope.template).toBe('scope-entry');
    expect(scope.template_args).toEqual({ terminal: 'round-report' });
    const composed = scopeEntryTaskTemplate({ terminal: 'round-report' });
    expect(composed).toMatch(/Topics:/);
    expect(composed).toMatch(/Behavior: confirm=mandatory/);
    expect(composed).toMatch(/output path=user_owned/);
    expect(composed).not.toMatch(/Mandatory scope confirmation/);
    expect(composed).not.toMatch(/NEVER auto-skip/);
    expect(composed).not.toMatch(/never re-asked/);
  });

  it('all three entry task texts declare the callee contract', () => {
    // every atom-scope-interview dispatch declares Topics / Behavior /
    // Output contract — the parameter channel; the framework shared-chain
    // entries compose from the per-node templates (one template one file),
    // the graph-generate entry stays authored. The doc-update
    // classification-only variant no longer exists (graph deleted)
    const entries = [
      { graph: 'arch-review-loop.yaml', node: 'scope-entry' },
      { graph: 'graph-generate.yaml', node: 'entry' },
    ];
    for (const entry of entries) {
      const g = loadGraph(entry.graph);
      const phases = g.phases as ReadonlyArray<{ id: string; task?: unknown; skill?: unknown; template?: unknown }>;
      const phase = phases.find((p) => p.id === entry.node);
      expect(phase, entry.graph + ' ' + entry.node).toBeDefined();
      const task = String(phase?.task ?? '');
      expect(phase?.skill).toBe('atom-scope-interview');
      if (entry.node === 'scope-entry') {
        // template-composed — no authored task text; contract verified via
        // the per-node template functions (task-templates tests)
        expect(phase?.template).toBe(entry.node);
        expect(task).toBe('');
      } else {
        expect(task, entry.graph + ' ' + entry.node + ' directive').toMatch(/per atom-scope-interview/);
      }
    }
    const gen = loadGraph('graph-generate.yaml');
    const genTask = String(
      (gen.phases as ReadonlyArray<{ id: string; task?: unknown }>).find((p) => p.id === 'entry')?.task,
    );
    expect(genTask).toMatch(/dual-name check=graph_name/);
    expect(genTask).toMatch(/context=optional/);
    expect(genTask).toMatch(/output path=user_owned/);
  });

  it('no phase-level when fields — Run Mode is a run field, rework is the decision output', () => {
    const raw = String(phases.map((p) => JSON.stringify(p)));
    expect(raw).not.toMatch(/autoWhen/);
    for (const p of phases) {
      expect(p.when, `${String(p.id)} phase-level when`).toBeUndefined();
    }
  });

  it('requirement/adopt/implement are router-template nodes — sibling-run activation, no composing phases', () => {
    // Flat engine (graph-subgraph-route-unify): the three stages are
    // router-template nodes — each launches its graph as a sibling run
    // (single path — auto-select, zero card). The report path + adoption
    // record pass via graph_start args; channels declare the upstream
    // streams the launch reads.
    expect(phaseOf('requirement').use).toBeUndefined();
    expect(phaseOf('requirement').template).toBe('router');
    expect(phaseOf('requirement').template_args).toEqual({
      paths: ['arch-review'],
      questions: [
        {
          prompt:
            'Requirement ready? accept: proceed to adoption; revise: adjust the requirement input and re-run the arch-review review.',
          condition: 'revise',
        },
      ],
    });
    // scope-entry is the framework root entry (atom-scope-interview) —
    // requirement launches the non-interactive arch-review chain after it;
    // adoption is NOT inside arch-review — it is the adopt stage
    expect(phaseOf('requirement').dependsOn).toEqual(['scope-entry']);
    expect(phaseOf('requirement').channels).toEqual(['node:scope-entry']);
    // adopt = the adoption stage — adopt-with-docs receives the produced
    // report as input document via the global channel
    // (two-scope model — the requirement router's output stream promoted,
    // all phases; the producer terminal carries the report stream)
    expect(phaseOf('adopt').use).toBeUndefined();
    expect(phaseOf('adopt').template).toBe('router');
    expect(phaseOf('adopt').template_args).toEqual({ paths: ['adopt-with-docs'] });
    // adopt activates directly after the adopting grilling consensus (the
    // accept-node consolidation removed adopt-accept — the grilling
    // shared_understanding IS the acceptance); the self-deciding spec
    // pipeline consumes it via channels; no route (the former proceed
    // route and round-continue gate were removed in the cleanup)
    expect(phaseOf('adopt').dependsOn).toEqual(['adopting']);
    expect(phaseOf('adopt').channels).toEqual(['node:adopting']);
    expect(graph.context).toEqual(['node:requirement']);
    // adopt activates by dependency satisfaction — no route (the former
    // proceed route and round-continue gate were removed in the cleanup)
    expect(phaseOf('adopt').route).toBeUndefined();
    // implement = the shared spec-implement machinery — sequenced after adopt
    // by dependsOn [adopt]; the produced change + adoption record arrive via
    // graph_start args (surfaced from the adopting output channel)
    expect(phaseOf('implement').use).toBeUndefined();
    expect(phaseOf('implement').template).toBe('router');
    expect(phaseOf('implement').template_args).toEqual({ paths: ['spec-implement'] });
    expect(phaseOf('implement').route).toBeUndefined();
    expect(phaseOf('implement').dependsOn).toEqual(['adopt']);
    expect(phaseOf('implement').channels).toEqual(['node:adopting']);
  });

  it('requirement carries the caller-declared accept loop — no separate review-accept node', () => {
    // the requirement accept loop is caller-declared on the requirement
    // router node via the questions data parameter — arch-review itself
    // carries no accept node (pure analysis chain); the accept-node
    // consolidation removed the separate review-accept phase
    expect(phases.some((p) => p.id === 'review-accept')).toBe(false);
    const req = phaseOf('requirement');
    expect(req.type).toBe('main');
    expect(req.routing).toBeUndefined();
    expect(req.reads).toBeUndefined();
    expect(req.dependsOn).toEqual(['scope-entry']);
    // questions data parameter — template stays generic, prompt/condition
    // come from the calling graph; the revise choice re-enters
    // via the flow self-edge, accept exits via the unlabeled sequence
    // default into adopting
    const questions =
      (req.template_args as { questions?: Array<{ prompt: string; condition: string }> }).questions ?? [];
    expect(questions).toHaveLength(1);
    expect(questions[0].condition).toBe('revise');
    expect(questions[0].prompt).toMatch(/Requirement ready\?/);
    expect(graph.flow).toContain('requirement -->|revise| requirement');
  });

  it('round-continue/loop-gate — removed; adopt/implement activate by dependency satisfaction', () => {
    // The former round-continue content gate (task-text proceed target + no
    // target on empty) and its proceed route were removed in the cleanup —
    // adopt/implement activate by dependency satisfaction, no route, no gate.
    expect(phases.some((p) => p.id === 'round-continue')).toBe(false);
    // loop-gate removed too — the round loop is the flow self-edge
    expect(phases.some((p) => p.id === 'loop-gate')).toBe(false);
    expect(phases.some((p) => p.template === 'loop')).toBe(false);
    expect(phaseOf('adopt').dependsOn).toEqual(['adopting']);
    expect(phaseOf('implement').dependsOn).toEqual(['adopt']);
  });

  it('implement flow carries NO internal auto-iteration rework node — the round loop is the flow self-edge', () => {
    // the machinery has no internal rework node — the composition contains no
    // implement-loop-gate; the round loop is the parent flow self-edge
    // (round-report -->|remaining| scope-entry)
    const machinery = loadGraph('spec-implement.yaml');
    const machineryPhases = machinery.phases as Array<Record<string, unknown>>;
    expect(machineryPhases.some((p) => p.id === 'implement-loop-gate')).toBe(false);
    // and neither the graph nor the machinery carries a rework-decision node
    const parentRework = phases.filter((p) => /carries the rework\s+target/.test(String(p.task ?? '')));
    expect(parentRework.map((p) => p.id)).toEqual([]);
    const machineryRework = machineryPhases.filter((p) => /carries the rework\s+target/.test(String(p.task ?? '')));
    expect(machineryRework.map((p) => p.id)).toEqual([]);
  });

  it('arch-review = standalone non-interactive analysis chain: explore → first-principles → present-candidates; no entry interview, no accept node', () => {
    const arch = loadGraph('arch-review.yaml');
    const phases2 = arch.phases as Array<Record<string, unknown>>;
    // three-phase pure analysis chain (interaction: none) — the interactive
    // scope-entry and the requirement accept loop (router questions,
    // accept-node consolidation) are hosted by arch-review-loop
    // (inlined round), never here; explore main —
    // improve-codebase-architecture Step 1; first-principles main —
    // first-principles Steps 1–4; present-candidates main —
    // improve-codebase-architecture Step 2, emits the report + output
    // contract; adoption is NOT composed here (the loop's adopt stage owns
    // adoption, keeping both graphs standalone)
    expect(arch.interaction).toBe('none');
    expect(phases2.map((p) => p.id)).toEqual(['explore', 'first-principles', 'present-candidates']);
    expect(phases2.some((p) => p.type === 'end')).toBe(false);
    // no framework-hosted interaction nodes leak into the subgraph
    expect(phases2.some((p) => p.id === 'scope-entry')).toBe(false);
    expect(phases2.some((p) => p.id === 'review-accept')).toBe(false);
    // no composing phase references adopt-with-docs — adoption is external
    expect(phases2.some((p) => p.use === 'adopt-with-docs')).toBe(false);
    // producer chain — three main phases, explore is the entry (in-degree 0),
    // first-principles inserted between Explore and Present candidates
    const exploreNode = phases2.find((p) => p.id === 'explore');
    expect(exploreNode?.type).toBe('main');
    expect(exploreNode?.skill).toBe('improve-codebase-architecture');
    expect(exploreNode?.dependsOn).toEqual([]);
    const principlesNode = phases2.find((p) => p.id === 'first-principles');
    expect(principlesNode?.type).toBe('main');
    expect(principlesNode?.skill).toBe('first-principles');
    expect(principlesNode?.dependsOn).toEqual(['explore']);
    // explore digest is the sole declared input — no scope-entry stream here
    expect(principlesNode?.channels).toEqual(['node:explore']);
    const presentNode = phases2.find((p) => p.id === 'present-candidates');
    expect(presentNode?.type).toBe('main');
    expect(presentNode?.skill).toBe('improve-codebase-architecture');
    expect(presentNode?.dependsOn).toEqual(['first-principles']);
    // upstream streams declared as channels — explore digest + principles output
    expect(presentNode?.channels).toEqual(['node:explore', 'node:first-principles']);

    // the machinery node lives INLINE in arch-review — no review-machinery
    // child graph exists
    const task = String(presentNode?.task);
    // dual mode — fresh writes new report, existing re-reviews in place
    expect(task).toMatch(/report_input fresh/);
    expect(task).toMatch(/re-review/);
    expect(task).toMatch(/single source of truth/);
    expect(task).toMatch(/NO path re-confirmation/);
    // Problems/Solutions built from the first-principles output
    expect(task).toMatch(/principles_output/);
    expect(task).toMatch(/assumption/);
    // unified structured output contract (both modes) — rework decision source
    expect(task).toMatch(/top_rec_remaining/);
    expect(task).toMatch(/round/);
    expect(task).toMatch(/implemented/);
    expect(task).toMatch(/new_findings/);
    // fresh-origin transition (D19) — fresh + existing report file (round ≥ 2)
    // switches to re-review semantics; the loop closure promise holds for both origins
    expect(task).toMatch(/round ≥ 2/);
    // intermediate contracts — explore digest feeds first-principles
    const exploreTask = String(exploreNode?.task);
    expect(exploreTask).toMatch(/explore_digest/);
    const principlesTask = String(principlesNode?.task);
    expect(principlesTask).toMatch(/principles_output/);
  });

  it('first-principles-dev = startup → scope-entry → ... → fp-doc-update; flow self-edge fp-doc-update -->|remaining| scope-entry', () => {
    // framework twin of arch-review-loop (inlined flow model): startup
    // (template: startup) then the full round inlined — scope-entry →
    // arch-review chain (requirement accept loop caller-declared on the
    // router node) → adopt interaction → adopt → implement → fp-doc-update.
    // The loop is the flow self-edge fp-doc-update -->|remaining|
    // scope-entry — no loop template node. Accept-node consolidation
    // (review-accept / adopt-accept deleted): the requirement accept loop
    // is caller-declared on the router node, the adoption consensus ends
    // at adopting (grilling shared_understanding).
    const dev = loadGraph('first-principles-dev.yaml');
    const devPhases = dev.phases as Array<Record<string, unknown>>;
    const devPhaseOf = (id: string): Record<string, unknown> => {
      const p = devPhases.find((ph) => ph.id === id);
      expect(p, `phase ${id} present`).toBeDefined();
      return p!;
    };
    expect(dev.interaction).toBeUndefined(); // absent = enabled — no propagation
    expect(devPhases.map((p) => p.id)).toEqual([
      'startup',
      'scope-entry',
      'requirement',
      'adopting',
      'adopt',
      'implement',
      'fp-doc-update',
    ]);
    // startup template entry — full-startup graph
    expect(devPhaseOf('startup').template).toBe('startup');
    expect(devPhaseOf('startup').dependsOn).toEqual([]);
    expect(devPhaseOf('scope-entry').dependsOn).toEqual(['startup']);
    // the loop is the flow self-edge — no loop template node, no loop-gate;
    // full coverage — the sequence section declared as unlabeled default
    // edges, every phase appears in the flow block
    expect(dev.flow).toEqual([
      'startup --> scope-entry',
      'scope-entry --> requirement',
      'requirement -->|revise| requirement',
      'requirement --> adopting',
      'adopting --> adopt',
      'adopt --> implement',
      'implement --> fp-doc-update',
      'fp-doc-update -->|remaining| scope-entry',
      'fp-doc-update -->|complete| __handoff',
    ]);
    expect(devPhases.some((p) => p.template === 'loop')).toBe(false);
    expect(devPhases.some((p) => p.id === 'loop-gate')).toBe(false);
    expect(devPhases.some((p) => p.id === 'review-accept')).toBe(false);
    expect(devPhases.some((p) => p.id === 'adopt-accept')).toBe(false);
    expect(devPhases.some((p) => p.id === 'adopt-scope')).toBe(false);
    // framework-hosted interactive nodes — atom-scope-interview + grilling
    expect(devPhaseOf('scope-entry').skill).toBe('atom-scope-interview');
    expect(devPhaseOf('adopting').skill).toBe('grilling');
    // stage edges — the three stages are router-template nodes (sibling-run
    // activation, flat engine); the framework interactive nodes stay inline
    expect(devPhaseOf('requirement').use).toBeUndefined();
    expect(devPhaseOf('requirement').template).toBe('router');
    expect(devPhaseOf('requirement').template_args).toEqual({
      paths: ['arch-review'],
      questions: [
        {
          prompt:
            'Requirement ready? accept: proceed to adoption; revise: adjust the requirement input and re-run the arch-review review.',
          condition: 'revise',
        },
      ],
    });
    expect(devPhaseOf('requirement').dependsOn).toEqual(['scope-entry']);
    expect(devPhaseOf('adopt').use).toBeUndefined();
    expect(devPhaseOf('adopt').template).toBe('router');
    expect(devPhaseOf('adopt').template_args).toEqual({ paths: ['adopt-with-docs'] });
    expect(devPhaseOf('adopt').dependsOn).toEqual(['adopting']);
    expect(devPhaseOf('implement').use).toBeUndefined();
    expect(devPhaseOf('implement').template).toBe('router');
    expect(devPhaseOf('implement').template_args).toEqual({ paths: ['spec-implement'] });
    expect(devPhaseOf('implement').dependsOn).toEqual(['adopt']);
    expect(dev.context).toEqual(['node:requirement']);
    // fp fold-back at the end of the round — channels read scope-entry + requirement stream
    expect(devPhaseOf('fp-doc-update').skill).toBe('atom-doc-maintain');
    expect(devPhaseOf('fp-doc-update').dependsOn).toEqual(['implement']);
    expect(devPhaseOf('fp-doc-update').channels).toEqual(['node:scope-entry', 'node:requirement']);
    // round condition vocabulary + loop bound declared at graph level
    const constraints = (dev.constraints ?? []) as Array<string>;
    expect(constraints.some((c) => c.includes('flow self-edge re-entry'))).toBe(true);
    expect(constraints.some((c) => c.includes('remaining | complete'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — M2 snapshot enumerates per-node states (facade-observable)
// ---------------------------------------------------------------------------

describe('2.8 snapshot nodes enumeration (M2)', () => {
  let fix: RuntimeFixture;
  let rt: SchedulerRuntime;

  beforeEach(async () => {
    fix = makeRuntimeFixture();
    rt = await createTestRuntime(fix);
  });

  afterEach(async () => {
    await rt.dispose();
    fix.cleanup();
  });

  it('snapshot nodes are one-line rows; changed carries full state fields', async () => {
    const { runId, snapshot } = await rt.graphStart('linear-test', { mode: 'auto' });
    expect(snapshot.nodeCount).toBe(3);
    // Compact hot-path delivery: progress line + changed rows, NO full nodes
    // array — the one-line enumeration is served by graph_status.
    expect(snapshot.progress).toBe('0/3 · phase-1');
    expect(snapshot.nodes).toBeUndefined();
    const status = await rt.graphStatus(runId);
    expect(status.nodes).toEqual(
      expect.arrayContaining([
        { nodeId: 'phase-1', status: 'active', retryCount: 0 },
        { nodeId: 'phase-2', status: 'pending', retryCount: 0 },
      ]),
    );
    // No pre-dispatch state — every row is a changed (full-field) row
    expect(snapshot.changed).toEqual(
      expect.arrayContaining([
        {
          nodeId: 'phase-1',
          status: 'active',
          retryCount: 0,
          startedAt: null,
          completedAt: null,
          durationMs: null,
        },
        {
          nodeId: 'phase-2',
          status: 'pending',
          retryCount: 0,
          startedAt: null,
          completedAt: null,
          durationMs: null,
        },
      ]),
    );
  });

  it('delta snapshot — changed rows derive from the pre-dispatch state', async () => {
    const { runId } = await rt.graphStart('linear-test', { mode: 'auto' });
    const r1 = await rt.graphAdvance(runId, 'phase-1');
    // Only the rows that moved — phase-1 (done) and the newly dispatched
    // phase-2 (active display) — are emitted as changed
    expect(r1.snapshot.changed?.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'phase-1', 'phase-2']);
    const phase1 = r1.snapshot.changed?.find((n) => n.nodeId === 'phase-1');
    expect(phase1?.status).toBe('done');
    expect(typeof phase1?.completedAt).toBe('string');
    const phase2 = r1.snapshot.changed?.find((n) => n.nodeId === 'phase-2');
    expect(phase2?.status).toBe('active');
    expect(phase2?.completedAt).toBeNull();
  });

  it('snapshot meta fields present', async () => {
    const { runId, snapshot } = await rt.graphStart('linear-test', { mode: 'auto' });
    expect(snapshot.runId).toBe(runId);
    expect(snapshot.graphName).toBe('linear-test');
    expect(snapshot.fsmState).toBe('running');
    expect(snapshot.completedCount).toBe(0);
    expect(typeof snapshot.createdAt).toBe('string');
    expect(typeof snapshot.updatedAt).toBe('string');
  });

  it('done nodes enumerable for jump targeting; run drains to all-done', async () => {
    const { runId } = await rt.graphStart('linear-test', { mode: 'auto' });
    await rt.graphAdvance(runId, 'phase-1');
    const r2 = await rt.graphAdvance(runId, 'phase-2');
    // The synthesized main terminal dispatches after the last source phase.
    expect(r2.node!.nodeId).toBe('__handoff');
    const r3 = await rt.graphAdvance(runId, '__handoff');
    expect(r3.snapshot.fsmState).toBe('completed');
    expect(r3.node).toBeNull();
    // Full enumeration via graph_status — the compact drain snapshot carries
    // no nodes array.
    const status = await rt.graphStatus(runId);
    const eligible = status.nodes!.filter((n) => n.status === 'done');
    expect(eligible.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'phase-1', 'phase-2']);
    // completed is a run-level fsmState — never a node status
    for (const n of status.nodes!) {
      expect(n.status).not.toBe('completed');
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

// ---------------------------------------------------------------------------
// 4.9 — Graph inventory: consistency warnings (never blocking)
// ---------------------------------------------------------------------------

describe('4.9 graph inventory consistency', () => {
  const baseGraph = {
    name: 'inv',
    phases: [
      { id: 'main-a', type: 'main', skill: 'sk-a', task: 'a', dependsOn: [], operations: [] },
      { id: 'app-b', type: 'main', dependsOn: ['main-a'], operations: [] },
      {
        id: 'gate-c',
        type: 'main',
        dependsOn: ['app-b'],
        operations: [],
        task: 'Rework decision — IF x the decision output carries the rework target main-a; ELSE no target.',
      },
      { id: 'composed-d', type: 'main', dependsOn: [], operations: [], task: 'd' },
    ],
  };

  it('matching inventory entries validate warning-free', () => {
    const graph = {
      ...baseGraph,
      inventory: [
        { id: 'main-a', type: 'main', goal: 'Run a then report', constraints: ['does not retry silently'] },
        { id: 'app-b', type: 'main', goal: 'Accept the result' },
        { id: 'gate-c', type: 'main', goal: 'Rework main-a when the verdict fails before the bound is reached' },
        { id: 'composed-d', type: 'main', goal: 'Run the final plain step' },
      ],
    };
    expect(validateGraphInventory(graph, 'inv.yaml')).toHaveLength(0);
  });

  it('inventory entries resolve against the source phase set — no warnings', () => {
    // validateGraphInventory runs per source graph inside the contract pass
    // (runContractsPass) — each entry resolves against its own graph's phase
    // declarations; composition is deleted, so every phase is a plain phase.
    const graph = {
      ...baseGraph,
      inventory: [{ id: 'composed-d', type: 'main', goal: 'Run the final plain step' }],
    };
    expect(validateGraphInventory(graph, 'inv.yaml')).toHaveLength(0);
  });

  it('warns on entry referencing a missing phase — never errors', () => {
    const graph = {
      ...baseGraph,
      inventory: [{ id: 'ghost', type: 'main', goal: 'Nope' }],
    };
    const warnings = validateGraphInventory(graph, 'inv.yaml');
    expect(warnings.some((w) => w.includes('inventory entry "ghost" references no phase'))).toBe(true);
  });

  it('warns on type mismatch', () => {
    const graph = {
      ...baseGraph,
      inventory: [{ id: 'app-b', type: 'flow', goal: 'Wrong type' }],
    };
    const warnings = validateGraphInventory(graph, 'inv.yaml');
    expect(
      warnings.some((w) => w.includes('inventory entry "app-b" type mismatch') && w.includes('declares "flow"')),
    ).toBe(true);
  });

  it('legacy skill key is not a check axis — no warning', () => {
    // Entry shape is { id, type, goal, constraints? }; a legacy `skill` key is
    // stripped at schema parse and must NOT produce a skill-mismatch warning.
    const graph = {
      ...baseGraph,
      inventory: [{ id: 'app-b', type: 'main', goal: 'Accepts the result', skill: 'sk-other' }],
    };
    expect(validateGraphInventory(graph, 'inv.yaml')).toHaveLength(0);
  });

  it('absent inventory changes nothing', () => {
    expect(validateGraphInventory(baseGraph, 'inv.yaml')).toHaveLength(0);
  });
});
