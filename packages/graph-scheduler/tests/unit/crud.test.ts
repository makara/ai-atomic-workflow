/**
 * Unit tests for the SchedulerRuntime write operations — observable-contract
 * tests over the v2 adapter facade (syntax v2).
 *
 * Exercises graphStart, graphAdvance (continue + direct-end), graphJump,
 * graphForceEnd, and graphStatus through createRuntime (in-memory SQLite).
 * v2 snapshot contract: the interrupted dispatch node shows status 'active'
 * (currentPhaseId = its id) while the run is running; completed nodes are
 * 'done'; force-end terminates the run without per-node aborted annotations;
 * direct-end (advance end:true) completes the run as 'completed'.
 * FSM-internal assertions (transition events, effects, route maps,
 * WorkflowGraph) are deleted — only the pull-based observable contract stays.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  GraphAdvanceSchema,
  GraphAssetsSchema,
  GraphCleanAllSchema,
  GraphCleanCompletedSchema,
  GraphForceEndSchema,
  GraphInitSchema,
  GraphJumpSchema,
  GraphListSchema,
  GraphStartSchema,
  GraphStatusSchema,
} from '../../server.js';
import type { NodeDetail } from '../../src/adapter.js';
import { compileWorkflow } from '../../src/compile.js';
import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/** Read the `_tag` from a domain error — the facade rejects with the raw tagged object. */
function errorTag(err: unknown): string | null {
  if (err !== null && typeof err === 'object' && '_tag' in err) {
    return String((err as { _tag: unknown })._tag);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface Fixture {
  taskflowDir: string;
  rt: SchedulerRuntime;
  cleanup: () => void;
}

/** Write graph YAML (as JSON string — valid YAML subset) to temp dir and create runtime. */
async function makeFixture(graphs: Record<string, string>): Promise<Fixture> {
  const taskflowDir = join(tmpdir(), `crud-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  for (const [name, json] of Object.entries(graphs)) {
    writeFileSync(join(taskflowDir, `${name}.yaml`), json);
  }

  // Builtin registry covers main/flow — no project override needed.
  // context: [] — hermetic: ambient .graph-scheduler/config.json (gitignored,
  // cwd-dependent) must not leak project-layer channels into assertions.
  const rt = await Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      context: [],
    }),
  );

  return {
    taskflowDir,
    rt,
    cleanup: () => {
      rmSync(taskflowDir, { recursive: true, force: true });
    },
  };
}

/** Minimal two-node linear graph (natural drain completion). */
function linearAgentGraph(): string {
  return JSON.stringify({
    name: 'linear-agent',

    phases: [
      { id: 'agent-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
      { id: 'agent-b', type: 'main', skill: 'test-agent-skill', task: 'do b', dependsOn: ['agent-a'], operations: [] },
    ],
  });
}

/** Main graph with per-node skill override on second phase. */
function skillOverrideGraph(): string {
  return JSON.stringify({
    name: 'skill-override',

    phases: [
      { id: 'agent-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
      {
        id: 'agent-b',
        type: 'main',
        skill: 'custom-agent-skill',
        task: 'do b',
        dependsOn: ['agent-a'],
        operations: [],
      },
    ],
  });
}

/** Graph with plain main phases (agent-hint field removed). */
function hintGraph(): string {
  return JSON.stringify({
    name: 'hints',

    phases: [
      {
        id: 'hinted',
        type: 'main',
        skill: 'review-skill',
        task: 'review',
        operations: [],
      },
      { id: 'plain', type: 'main', skill: 'other-skill', task: 'plain', dependsOn: ['hinted'], operations: [] },
    ],
  });
}

/** Invalid YAML for error testing. */
const BAD_YAML = 'not valid yaml {{{';

/**
 * Start a run — the common test preamble. Runs start directly at their
 * first author node (activation facts live at graph_start).
 */
async function startRun(rt: SchedulerRuntime, graphName: string): Promise<{ runId: string; node: NodeDetail | null }> {
  return rt.graphStart(graphName);
}

// ---------------------------------------------------------------------------
// graphStart
// ---------------------------------------------------------------------------

describe('graphStart', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('starts a new run and returns runId + first author node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    expect(result.runId).toBeTruthy();
    // runId is UUID v4 — no longer run-* prefix
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
    // The run starts at its first author node — the dispatched NodeDetail
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.type).toBe('main');
  });

  it('returns run snapshot — isomorphic envelope, first node active, no $ nodes', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    // Isomorphic envelope: runId echoed on the snapshot
    expect(result.snapshot.runId).toBe(result.runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.snapshot.nodeCount).toBe(3);
    expect(result.snapshot.completedCount).toBe(0);
    // The interrupted node shows active while the run is running — the first
    // author node is the current dispatch; the rest stay pending.
    expect(result.snapshot.currentPhaseId).toBe('agent-a');
    // Compact hot-path delivery: progress line + full-field changed rows, no
    // full nodes array — the complete enumeration is served by graph_status.
    expect(result.snapshot.progress).toBe('0/3 · agent-a');
    expect(result.snapshot.nodes).toBeUndefined();
    expect(result.snapshot.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'agent-a', status: 'active', retryCount: 0 }),
        expect.objectContaining({ nodeId: 'agent-b', status: 'pending', retryCount: 0 }),
      ]),
    );
    // No activation prologue rows — author nodes only
    const status = await fix.rt.graphStatus(result.runId);
    expect(status.nodes!.some((n) => n.nodeId.startsWith('$'))).toBe(false);
  });

  it('start persists baseline node rows — first node active, timestamps null', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    // A fresh status query carries every row as a full-field changed row:
    // nothing has run yet — the interrupted node is active, the rest pending,
    // all timestamps null.
    const status = await fix.rt.graphStatus(result.runId);
    expect(status.nodeCount).toBe(3);
    expect(status.changed).toHaveLength(3);
    const a = status.changed?.find((n) => n.nodeId === 'agent-a');
    const b = status.changed?.find((n) => n.nodeId === 'agent-b');
    expect(a?.status).toBe('active');
    expect(b?.status).toBe('pending');
    for (const row of status.changed ?? []) {
      expect(row.retryCount).toBe(0);
      expect(row.startedAt).toBeNull();
      expect(row.completedAt).toBeNull();
    }
  });

  it('starts a run without args.mode — MODE_REQUIRED removed, mode is opaque run data', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    // No mode argument — the run starts (no MODE_REQUIRED gate)
    const plain = await fix.rt.graphStart('linear-agent');
    expect(plain.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(plain.node?.nodeId).toBe('agent-a');

    // Arbitrary mode values are accepted as opaque invocation args
    const weird = await fix.rt.graphStart('linear-agent', { mode: 'fast' });
    expect(weird.runId).toMatch(/^[0-9a-f-]{36}$/);
    const numeric = await fix.rt.graphStart('linear-agent', { mode: 1 });
    expect(numeric.runId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('NodeDetail carries agent only when declared — absent declaration → undefined (graph-phase-agent-restore)', async () => {
    fix = await makeFixture({ hints: hintGraph() });
    const started = await startRun(fix.rt, 'hints');
    expect(started.node?.nodeId).toBe('hinted');
    expect(started.node?.agent).toBeUndefined();

    const second = await fix.rt.graphAdvance(started.runId, 'hinted');
    expect(second.node?.nodeId).toBe('plain');
    expect(second.node?.agent).toBeUndefined();
  });

  it('throws when graph file is missing', async () => {
    fix = await makeFixture({});
    await expect(fix.rt.graphStart('missing', { mode: 'auto' })).rejects.toThrow();
  });

  it('NodeDetail carries dependsOn for main phases', async () => {
    fix = await makeFixture({
      'dep-graph': JSON.stringify({
        name: 'dep-graph',

        phases: [
          { id: 'w', type: 'main', task: 'write', operations: [] },
          { id: 'm', type: 'main', task: 'read', dependsOn: ['w'], operations: [] },
          { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'dispatch', dependsOn: ['m'], operations: [] },
        ],
      }),
    });

    const started = await startRun(fix.rt, 'dep-graph');
    expect(started.node?.nodeId).toBe('w');
    expect(started.node?.dependsOn).toBeUndefined();

    const second = await fix.rt.graphAdvance(started.runId, 'w');
    expect(second.node?.nodeId).toBe('m');
    expect(second.node?.dependsOn).toEqual(['w']);

    const third = await fix.rt.graphAdvance(started.runId, 'm');
    expect(third.node?.nodeId).toBe('a');
    expect(third.node?.dependsOn).toEqual(['m']);
  });

  it('throws on invalid YAML graph file', async () => {
    fix = await makeFixture({ 'bad-graph': BAD_YAML });
    await expect(fix.rt.graphStart('bad-graph', { mode: 'auto' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphAdvance
// ---------------------------------------------------------------------------

describe('graphAdvance', () => {
  let fix: Fixture;
  let runId: string;

  beforeEach(async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId: rid } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    runId = rid;
  });

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('advances to next node after reporting completion', async () => {
    const result = await fix.rt.graphAdvance(runId, 'agent-a');

    expect(result.snapshot.runId).toBe(runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-b');
    // Compact snapshot — progress line + delta rows for the moved nodes
    expect(result.snapshot.progress).toBe('1/3 · agent-b');
    expect(result.snapshot.nodes).toBeUndefined();
    expect(result.snapshot.changed?.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'agent-a', 'agent-b']);
    expect(result.snapshot.changed?.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    // The completed node is persisted as done; the next dispatch shows active —
    // full enumeration via graph_status
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).toBe('active');
    expect(status.currentPhaseId).toBe('agent-b');
  });

  it('completes the run by natural drain when the last node completes (route-first)', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a');
    // agent-b completes → the synthesized __handoff terminal activates; ONE
    // more advance drains the run (no end marker node)
    const handoff = await fix.rt.graphAdvance(runId, 'agent-b');
    expect(handoff.node?.nodeId).toBe('__handoff');
    const result = await fix.rt.graphAdvance(runId, '__handoff');
    expect(result.snapshot.fsmState).toBe('completed');
    expect(result.node).toBeNull();
    // No active phase once the run is no longer running
    expect(result.snapshot.currentPhaseId).toBeNull();
  });

  it('nodeId is validated — an unknown nodeId fails loudly (InvalidStateError)', async () => {
    // v2.1: nodeId must name the active node (or a completed re-report) — an
    // unrecognized nodeId never resumes the current interrupt silently.
    try {
      await fix.rt.graphAdvance(runId, 'nonexistent');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
      if (err !== null && typeof err === 'object' && 'message' in err) {
        expect(String(err.message)).toMatch(/not the active node/);
      } else {
        expect.unreachable('InvalidStateError should carry a message');
      }
    }
    // No state transition occurred — the run still sits on agent-a
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).toBe('pending');
  });

  it('nodeId naming a pending node fails loudly — not active, not completed', async () => {
    // agent-b is a real node but pending — re-reporting it is neither the
    // active node nor a completed re-report → loud InvalidStateError.
    try {
      await fix.rt.graphAdvance(runId, 'agent-b');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
    }
  });

  it('duplicate advance of the same nodeId is idempotent — no double dispatch', async () => {
    const first = await fix.rt.graphAdvance(runId, 'agent-a');
    expect(first.node?.nodeId).toBe('agent-b');

    // Re-reporting the same nodeId without a branch is a no-op success — the
    // run state is unchanged (agent-a done, agent-b still the dispatch), no
    // double dispatch. The delta vs the pre-dispatch state is empty apart
    // from the active display row.
    const second = await fix.rt.graphAdvance(runId, 'agent-a');
    expect(second.node?.nodeId).toBe('agent-b');
    expect(second.snapshot.changed?.map((n) => n.nodeId)).toEqual(['agent-b', '__handoff']);
    expect(second.snapshot.progress).toBe('1/3 · agent-b');
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).toBe('active');
    expect(status.currentPhaseId).toBe('agent-b');
  });

  it('throws when advancing a completed run', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a');
    await fix.rt.graphAdvance(runId, 'agent-b');
    // The run is not completed until the synthesized __handoff terminal drains
    await fix.rt.graphAdvance(runId, '__handoff');
    await expect(fix.rt.graphAdvance(runId, 'agent-a')).rejects.toThrow(/completed/);
  });
});

// ---------------------------------------------------------------------------
// graphAdvance — decision transport (condition/jump/end channels; rework/loop
// are flow self-edges, branch is the router sibling run — no branchTo parameter)
// ---------------------------------------------------------------------------

describe('graphAdvance decision', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  /** seed → gate (declarative rework task text — no branchTo surface) → alpha — no end node (drain completion). */
  function gateRunGraph(): string {
    return JSON.stringify({
      name: 'gate-run',

      phases: [
        { id: 'seed', type: 'main', task: 'seed', operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['seed'],
          task: 'Rework decision — IF seed output shows source: bad AND seed retryCount < 2 the decision output carries the rework target seed; ELSE no target.',
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['gate'], operations: [] },
      ],
    });
  }

  it('plain continue (no branch parameter) activates the downstream node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');
    const gate = await fix.rt.graphAdvance(runId, 'gate');

    // No branch parameter — the decision node completes and the graph advances downstream
    expect(gate.node?.nodeId).toBe('alpha');
    expect(gate.snapshot.nodes).toBeUndefined();
    expect(gate.snapshot.changed?.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'alpha', 'gate']);
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'seed')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'gate')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('rework is operator graph_jump — the only backward reset, target re-dispatches directly', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');

    // Operator jump (PCL back/jump) — the single backward reset in the
    // system (graph definitions never declare jumps; loop/rework = flow
    // self-edges — condition-matched transitions). The reset target
    // re-dispatches directly (active) with its incremented retry visible.
    const jump = await fix.rt.graphJump(runId, 'seed');
    expect(jump.node?.nodeId).toBe('seed');
    expect(jump.node?.retryCount).toBe(1);
    // Compact snapshot — progress + delta rows; full state via graph_status
    expect(jump.snapshot.currentPhaseId).toBe('seed');
    expect(jump.snapshot.progress).toBe('1/4 · seed');
    expect(jump.snapshot.nodes).toBeUndefined();
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'seed')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'seed')?.retryCount).toBe(1);
    // The decision node itself completed
    expect(status.nodes!.find((n) => n.nodeId === 'gate')?.status).toBe('done');
  });

  it('graph_jump to a terminal upstream resets target + downstream terminal, upstream kept — then re-drains', async () => {
    const g = JSON.stringify({
      name: 'gate-rework',

      phases: [
        { id: 'u', type: 'main', task: 'upstream', operations: [] },
        { id: 'w', type: 'main', task: 'write', dependsOn: ['u'], operations: [] },
        { id: 'r', type: 'main', task: 'review', dependsOn: ['w'], operations: [] },
        {
          id: 'g',
          type: 'main',
          dependsOn: ['r'],
          task: 'Rework decision — IF r output shows overall: fail AND w retryCount < 2 the decision output carries the rework target w; ELSE no target.',
          operations: [],
        },
        { id: 'a', type: 'main', task: 'accept', dependsOn: ['g'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'gate-rework': g });

    const { runId } = await startRun(fix.rt, 'gate-rework');
    await fix.rt.graphAdvance(runId, 'u');
    await fix.rt.graphAdvance(runId, 'w');
    await fix.rt.graphAdvance(runId, 'r');

    // Operator jump to w (terminal upstream) → backward reset: target +
    // downstream terminal nodes (r) → pending with retryCount++ never zeroed;
    // upstream u is untouched (kept done). The reset target re-dispatches
    // (active).
    const jump = await fix.rt.graphJump(runId, 'w');
    expect(jump.node?.nodeId).toBe('w');
    expect(jump.node?.retryCount).toBe(1);
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'u')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'w')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    expect(status.nodes!.find((n) => n.nodeId === 'r')?.status).toBe('pending');
    expect(status.nodes!.find((n) => n.nodeId === 'r')?.retryCount).toBe(1);
    expect(status.nodes!.find((n) => n.nodeId === 'g')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'a')?.status).toBe('pending');

    // Re-drain: the reset chain re-runs; the decision passes through on the
    // second round and the run completes by natural drain.
    await fix.rt.graphAdvance(runId, 'w');
    await fix.rt.graphAdvance(runId, 'r');
    const pass = await fix.rt.graphAdvance(runId, 'g');
    expect(pass.node?.nodeId).toBe('a');
    const handoff = await fix.rt.graphAdvance(runId, 'a');
    expect(handoff.node?.nodeId).toBe('__handoff');
    const done = await fix.rt.graphAdvance(runId, '__handoff');
    expect(done.snapshot.fsmState).toBe('completed');
    expect(done.node).toBeNull();
    // retryCounts survive — never zeroed by the reset
    const final = await fix.rt.graphStatus(runId);
    expect(final.nodes!.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    expect(final.nodes!.find((n) => n.nodeId === 'r')?.retryCount).toBe(1);
  });

  it('run completes by natural drain — no end marker node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');
    await fix.rt.graphAdvance(runId, 'gate');
    const handoff = await fix.rt.graphAdvance(runId, 'alpha');
    expect(handoff.node?.nodeId).toBe('__handoff');
    const done = await fix.rt.graphAdvance(runId, '__handoff');
    expect(done.snapshot.fsmState).toBe('completed');
    expect(done.node).toBeNull();
  });

  it('dependency activation is the only forward routing — a task-text branch choice is informational, no in-run activation', async () => {
    const g = JSON.stringify({
      name: 'forward',

      phases: [
        { id: 'entry', type: 'main', task: 'entry', operations: [] },
        {
          id: 'decide',
          type: 'main',
          dependsOn: ['entry'],
          task: 'Pick the work track — `alpha`',
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['decide'], operations: [] },
      ],
    });
    fix = await makeFixture({ forward: g });

    const { runId } = await startRun(fix.rt, 'forward');
    await fix.rt.graphAdvance(runId, 'entry');

    // No branchTo parameter — the decide node completes and dependency
    // activation routes its successors (the backtick choice is delivered in
    // the completion payload as information, never routed by the engine).
    const activated = await fix.rt.graphAdvance(runId, 'decide');
    expect(activated.node?.nodeId).toBe('alpha');
    expect(activated.node?.retryCount).toBe(0);
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'decide')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('invalid nodeId fails loudly — InvalidStateError naming the node, no transition', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');

    // A nodeId that is not the active node never silently resumes a different
    // interrupt.
    try {
      await fix.rt.graphAdvance(runId, 'ghost');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
      if (err !== null && typeof err === 'object' && 'message' in err) {
        expect(String(err.message)).toMatch(/ghost/);
      } else {
        expect.unreachable('InvalidStateError should carry a message');
      }
    }
    // No state transition occurred — gate is still the active dispatch
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'seed')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'gate')?.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// graphJump
// ---------------------------------------------------------------------------

describe('graphJump', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('jump resets the target + downstream terminal nodes — retryCount incremented, never zeroed', async () => {
    const g = JSON.stringify({
      name: 'three',

      phases: [
        { id: 'w', type: 'main', task: 'write', operations: [] },
        { id: 'r', type: 'main', task: 'review', dependsOn: ['w'], operations: [] },
        { id: 'a', type: 'main', task: 'accept', dependsOn: ['r'], operations: [] },
      ],
    });
    fix = await makeFixture({ three: g });
    const { runId } = await startRun(fix.rt, 'three');

    // w and r completed (a is the current interrupt) — then jump back to w
    await fix.rt.graphAdvance(runId, 'w');
    await fix.rt.graphAdvance(runId, 'r');

    const result = await fix.rt.graphJump(runId, 'w');
    expect(result.snapshot.runId).toBe(runId);
    expect(result.node?.nodeId).toBe('w');
    expect(result.node?.retryCount).toBe(1);
    // Compact snapshot — progress line + delta rows (no full nodes array)
    expect(result.snapshot.currentPhaseId).toBe('w');
    expect(result.snapshot.progress).toBe('1/4 · w');
    expect(result.snapshot.nodes).toBeUndefined();
    const status = await fix.rt.graphStatus(runId);
    // target reset, retryCount 0 → 1 (never zeroed) and re-dispatched (active)
    expect(status.nodes!.find((n) => n.nodeId === 'w')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    // downstream TERMINAL node r reset to pending with the same increment
    expect(status.nodes!.find((n) => n.nodeId === 'r')?.status).toBe('pending');
    expect(status.nodes!.find((n) => n.nodeId === 'r')?.retryCount).toBe(1);
    // the interrupted node completes as the jump's source
    expect(status.nodes!.find((n) => n.nodeId === 'a')?.status).toBe('done');
    // Reset SHALL clear execution timestamps — stale completedAt must NOT
    // survive on the reset closure (spec: "a later status query ... SHALL
    // NOT show stale timestamps on pending nodes"). Full `nodes` rows carry
    // nodeId/status/retryCount only; timestamps live in `changed` rows.
    const changedW = result.snapshot.changed?.find((n) => n.nodeId === 'w');
    const changedR = result.snapshot.changed?.find((n) => n.nodeId === 'r');
    expect(changedW?.startedAt).toBeNull();
    expect(changedW?.completedAt).toBeNull();
    expect(changedR?.startedAt).toBeNull();
    expect(changedR?.completedAt).toBeNull();
  });

  it('jump re-dispatches the target directly in a running linear run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startRun(fix.rt, 'linear-agent');

    // Advance to phase-2
    await fix.rt.graphAdvance(runId, 'agent-a');

    // Jump back to the ENTRY node — the reset target re-dispatches directly
    const result = await fix.rt.graphJump(runId, 'agent-a');
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.retryCount).toBe(1);
    // The persisted state agrees with the dispatch — full snapshot via graph_status
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.retryCount).toBe(1);
    expect(status.currentPhaseId).toBe('agent-a');
  });

  it('jump on a terminated run fails loudly — InvalidStateError, no transition', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    await fix.rt.graphForceEnd(runId);

    try {
      await fix.rt.graphJump(runId, 'agent-a');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
    }
    // No state transition — still terminated
    expect((await fix.rt.graphStatus(runId)).fsmState).toBe('terminated');
  });

  it('jump on a completed run fails loudly — InvalidStateError (guard parity with advance)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startRun(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(runId, 'agent-a');
    await fix.rt.graphAdvance(runId, 'agent-b');
    // The run is not completed until the synthesized __handoff terminal drains
    await fix.rt.graphAdvance(runId, '__handoff');

    try {
      await fix.rt.graphJump(runId, 'agent-a');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
    }
  });

  it('jump to an unknown target fails loudly — InvalidStateError naming the target', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startRun(fix.rt, 'linear-agent');

    try {
      await fix.rt.graphJump(runId, 'ghost');
      expect.unreachable('expected InvalidStateError');
    } catch (err) {
      expect(errorTag(err)).toBe('InvalidStateError');
      if (err !== null && typeof err === 'object' && 'message' in err) {
        expect(String(err.message)).toMatch(/ghost/);
      } else {
        expect.unreachable('InvalidStateError should carry a message');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// graphForceEnd
// ---------------------------------------------------------------------------

describe('graphForceEnd', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('force-ends a running run — run terminated, no aborted annotations', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    const result = await fix.rt.graphForceEnd(runId);
    expect(result.snapshot.fsmState).toBe('terminated');
    expect(result.snapshot.runId).toBe(runId);
    // Same envelope as advance/jump — terminated run has no next node
    expect(result.node).toBeNull();
    // No per-node aborted annotations — nothing is marked aborted; the
    // interrupted node's persisted status stays pending (never done/aborted)
    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('terminated');
    for (const n of status.nodes!) {
      expect(n.status, `node ${n.nodeId} must not be aborted`).not.toBe('aborted');
    }
  });

  it('force-end preserves completed nodes — no aborted annotations', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    // agent-a completes, agent-b is the current interrupt
    await fix.rt.graphAdvance(runId, 'agent-a');

    // Force-end the run mid-flight
    const result = await fix.rt.graphForceEnd(runId);
    expect(result.snapshot.fsmState).toBe('terminated');
    expect(result.node).toBeNull();
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).not.toBe('aborted');

    // Terminated is terminal — further advances are rejected
    await expect(fix.rt.graphAdvance(runId, 'agent-b')).rejects.toThrow(/terminated/);
  });

  it('force-ending a completed run is a no-op — run stays completed', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    await fix.rt.graphAdvance(runId, 'agent-a');
    const last = await fix.rt.graphAdvance(runId, 'agent-b');
    expect(last.node?.nodeId).toBe('__handoff');
    // The run is not completed until the synthesized __handoff terminal drains
    await fix.rt.graphAdvance(runId, '__handoff');

    const result = await fix.rt.graphForceEnd(runId);
    expect(result.snapshot.fsmState).toBe('completed');
    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  it('force-ending a terminated run is a no-op', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    await fix.rt.graphForceEnd(runId);

    const result = await fix.rt.graphForceEnd(runId);
    expect(result.snapshot.fsmState).toBe('terminated');
  });

  it('advance with the end decision drains the run to completed', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    // Direct-end at the first node — reported node done, run completes as
    // `completed` via adapter-level completion (graph not resumed; never
    // force_end, never terminated).
    const result = await fix.rt.graphAdvance(runId, 'agent-a', true);
    expect(result.node).toBeNull();
    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    // Unfinished branch nodes stay pending — not aborted, not activated
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).toBe('pending');
  });

  it('throws when force-ending a non-existent run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphForceEnd('nonexistent-run')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphStatus
// ---------------------------------------------------------------------------

describe('graphStatus', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('reports running state for an active run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    const status = await fix.rt.graphStatus(runId);
    expect(status.runId).toBe(runId);
    // author nodes only — no activation prefix rows
    expect(status.nodeCount).toBe(3);
    expect(status.graphName).toBe('linear-agent');
  });

  it('status returns the shared delta shape — one-line nodes + full-field changed rows', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    const status = await fix.rt.graphStatus(runId);
    // One-line rows — jump-target enumeration + progress display
    expect(status.nodes).toEqual(
      expect.arrayContaining([
        { nodeId: 'agent-a', status: 'active', retryCount: 0 },
        { nodeId: 'agent-b', status: 'pending', retryCount: 0 },
      ]),
    );
    // Status query baseline — every row is a changed (full-field) row
    expect(status.changed).toHaveLength(3);
    expect(status.changed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'agent-a',
          status: 'active',
          retryCount: 0,
          startedAt: null,
          completedAt: null,
        }),
        expect.objectContaining({
          nodeId: 'agent-b',
          status: 'pending',
          retryCount: 0,
          startedAt: null,
          completedAt: null,
        }),
      ]),
    );
  });

  it('graph_status serves the full snapshot; hot-path dispatches carry the compact shape', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    const dispatched = await fix.rt.graphAdvance(runId, 'agent-a');
    const status = await fix.rt.graphStatus(runId);
    // One builder, two delivery shapes: hot path = compact (progress + changed,
    // no nodes array); graph_status = full (nodes + changed + progress).
    expect(dispatched.snapshot.nodes).toBeUndefined();
    expect(dispatched.snapshot.progress).toBe('1/3 · agent-b');
    expect(status.nodes!.length).toBe(3);
    expect(status.progress).toBe('1/3 · agent-b');
    expect(dispatched.snapshot.changed?.length).toBeGreaterThan(0);
    expect(status.changed?.length).toBeGreaterThan(0);
    // The dispatch diff carries the rows that changed vs the pre-dispatch state
    expect(dispatched.snapshot.changed?.map((n) => n.nodeId).sort()).toEqual(['__handoff', 'agent-a', 'agent-b']);
    // The dispatched completion is persisted as done
    expect(dispatched.snapshot.changed?.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
  });

  it('reports completed state after full advance (natural drain)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startRun(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(runId, 'agent-a');
    await fix.rt.graphAdvance(runId, 'agent-b');
    // The run is not completed until the synthesized __handoff terminal drains
    await fix.rt.graphAdvance(runId, '__handoff');

    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  it('rejects an unknown runId with NotFoundError', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    try {
      await fix.rt.graphStatus('nonexistent-run');
      expect.unreachable('expected NotFoundError');
    } catch (err) {
      expect(errorTag(err)).toBe('NotFoundError');
    }
  });

  it('graphAdvance rejects an unknown runId with NotFoundError', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    try {
      await fix.rt.graphAdvance('nonexistent-run', 'agent-a');
      expect.unreachable('expected NotFoundError');
    } catch (err) {
      expect(errorTag(err)).toBe('NotFoundError');
    }
  });

  it('per-node skill override is visible in node detail', async () => {
    fix = await makeFixture({ 'skill-override': skillOverrideGraph() });
    const started = await startRun(fix.rt, 'skill-override');

    // First author node uses phase skill (skill from phase.skill — no registry fallback)
    expect(started.node?.skill).toBe('test-agent-skill');

    // Advance to node-b which has per-node skill override
    const advResult = await fix.rt.graphAdvance(started.runId, 'agent-a');
    expect(advResult.node?.skill).toBe('custom-agent-skill');
  });

  it('rejects unregistered agent type at load (GraphDefinitionError)', async () => {
    const graph = JSON.stringify({
      name: 'agent-type',

      phases: [{ id: 'a1', type: 'agent', task: 'do a' }],
    });
    fix = await makeFixture({ 'agent-type': graph });
    // Phase type 'agent' is no longer registered — load fails at validation
    // naming the type (GraphDefinitionError).
    const err = await fix.rt.graphStart('agent-type', { mode: 'auto' }).then(
      () => null,
      (e: { _tag?: string; message?: string }) => e,
    );
    expect(err).not.toBeNull();
    expect(err?._tag).toBe('GraphDefinitionError');
    expect(String(err?.message)).toContain('agent');
  });
});

// ---------------------------------------------------------------------------
// Activation — mode at graph_start, no prologue nodes
// ---------------------------------------------------------------------------

describe('activation — no prologue nodes', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('a graph with a decision phase starts at its first author node — no $ nodes synthesized', async () => {
    const withAccept = JSON.stringify({
      name: 'with-accept',

      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
        { id: 'accept', type: 'main', dependsOn: ['a'], task: 'Accept?', operations: [] },
      ],
    });
    fix = await makeFixture({ 'with-accept': withAccept });
    const { runId, node } = await fix.rt.graphStart('with-accept');
    const snapshot = await fix.rt.graphStatus(runId);

    expect(node?.nodeId).toBe('a');
    // No prologue rows — the run contains author nodes only
    expect(snapshot.nodes!.filter((n) => n.nodeId.startsWith('$'))).toEqual([]);
    // constraints ARE carried as dispatch facts — empty when the graph declares none
    expect(node && 'constraints' in node).toBe(true);
    expect(node?.constraints).toEqual([]);
  });

  it('graph-level constraints ride every NodeDetail as [graph] dispatch facts', async () => {
    const withConstraints = JSON.stringify({
      name: 'with-constraints',
      constraints: ['reports in Chinese', 'no git write operations'],
      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
        { id: 'accept', type: 'main', dependsOn: ['a'], task: 'Accept?', operations: [] },
      ],
    });
    fix = await makeFixture({ 'with-constraints': withConstraints });
    const { runId, node } = await fix.rt.graphStart('with-constraints');
    const next = await fix.rt.graphAdvance(runId, node!.nodeId);

    expect(node?.constraints).toEqual(['[graph] reports in Chinese', '[graph] no git write operations']);
    expect(next.node?.constraints).toEqual(['[graph] reports in Chinese', '[graph] no git write operations']);
    await fix.rt.graphForceEnd(runId);
  });

  it('router-template node dispatches flat — no namespaced composed members', async () => {
    const child = JSON.stringify({
      name: 'child-graph',
      phases: [
        { id: 'child-a', type: 'main', skill: 'test-agent-skill', task: 'do child a', operations: [] },
        { id: 'child-b', type: 'main', dependsOn: ['child-a'], task: 'do child b', operations: [] },
      ],
    });
    const parent = JSON.stringify({
      name: 'composed-pos',
      phases: [
        { id: 'track', type: 'main', template: 'router', template_args: { paths: ['child-graph'] }, dependsOn: [] },
      ],
    });
    fix = await makeFixture({ 'child-graph': child, 'composed-pos': parent });

    // The router node is a plain compiled node (subgraph composition is
    // deleted) — dispatch by its phase id, no namespaced child members; no
    // position, no executionMode.
    const c = await fix.rt.graphStart('composed-pos');
    expect(c.node?.nodeId).toBe('track');
    expect(c.node).not.toHaveProperty('position');
    expect(c.node).not.toHaveProperty('executionMode');
    expect(c.snapshot).not.toHaveProperty('subgraphs');
    // Machine-declared candidate paths ride the dispatch payload — the
    // sibling-run candidates (never compiled-in members).
    expect(c.node?.template_args).toEqual({ paths: ['child-graph'] });
    await fix.rt.graphForceEnd(c.runId);
  });

  it('root constraints ride every NodeDetail — child constraint union deleted', async () => {
    const child = JSON.stringify({
      name: 'child-union',
      constraints: ['child-only rule'],
      phases: [{ id: 'c-a', type: 'main', skill: 'test-agent-skill', task: 'do c a', operations: [] }],
    });
    const parent = JSON.stringify({
      name: 'parent-union',
      constraints: ['parent-only rule'],
      phases: [
        { id: 'router', type: 'main', template: 'router', template_args: { paths: ['child-union'] }, dependsOn: [] },
      ],
    });
    fix = await makeFixture({ 'child-union': child, 'parent-union': parent });
    const { runId, node } = await fix.rt.graphStart('parent-union');
    // Root constraints only — the router path validates as a registered graph
    // name, but the child contributes no constraints (union deleted).
    expect(node?.constraints).toEqual(['[graph] parent-only rule']);
    await fix.rt.graphForceEnd(runId);
  });

  it('author entry is the first dispatch — no prefix to advance', async () => {
    const withAccept = JSON.stringify({
      name: 'with-accept',

      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
        { id: 'accept', type: 'main', dependsOn: ['a'], task: 'Accept?', operations: [] },
      ],
    });
    fix = await makeFixture({ 'with-accept': withAccept });
    const { runId } = await fix.rt.graphStart('with-accept');

    const n1 = await fix.rt.graphAdvance(runId, 'a');
    expect(n1.node?.nodeId).toBe('accept');
  });

  it('MCP schema: top-level mode rejected (strict), args.mode accepted as opaque data', () => {
    expect(GraphStartSchema.safeParse({ graphName: 'x', mode: 'auto' }).success).toBe(false);
    expect(GraphStartSchema.safeParse({ graphName: 'x', args: { mode: 'auto' } }).success).toBe(true);
    expect(GraphStartSchema.safeParse({ graphName: 'x', args: { mode: 42 } }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// graph_advance input schema — strict, runId/nodeId/end only
// (end = direct-end adapter-level completion; branchTo removed — branch
//  semantics are the router sibling run, loop/rework are flow self-edges;
//  endRun/skip/durationMs removed)
// ---------------------------------------------------------------------------

describe('graph_advance input schema', () => {
  it('accepts runId/nodeId', () => {
    const minimal = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n' });
    expect(minimal.success).toBe(true);
  });

  it('accepts the end param (direct-end decision)', () => {
    const ok = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', end: true });
    expect(ok.success).toBe(true);
  });

  it('rejects branchTo — removed parameter, strict schema', () => {
    const withBranch = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', branchTo: 'target' });
    expect(withBranch.success).toBe(false);
  });

  it('rejects removed params — endRun/durationMs/skip are gone, strict schema', () => {
    const withEndRun = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', endRun: true });
    expect(withEndRun.success).toBe(false);
    const withDuration = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 10 });
    expect(withDuration.success).toBe(false);
    const withSkip = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', skip: true });
    expect(withSkip.success).toBe(false);
    const withUnknown = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', garbage: 1 });
    expect(withUnknown.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispatch-time run-scope gate — out-of-run node: channels stripped
// ---------------------------------------------------------------------------

describe('run-scope channel gate', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('strips node: channel targets outside the run node set at dispatch', async () => {
    // standalone graph referencing loop-entry (exists only in composed runs)
    const standalone = JSON.stringify({
      name: 'standalone',

      phases: [
        {
          id: 'main-a',
          type: 'main',
          task: 'do a',
          channels: ['node:loop-entry'],

          operations: [],
        },
      ],
    });
    fix = await makeFixture({ standalone });
    const { runId, node } = await startRun(fix.rt, 'standalone');
    expect(node?.nodeId).toBe('main-a');
    // node:loop-entry stripped (outside run set); convention layer + project
    // default context survive the merge
    expect(node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);
    expect(runId).toBeTruthy();
  });

  it('keeps node: channel targets inside the run node set', async () => {
    const g = JSON.stringify({
      name: 'two-node',

      phases: [
        { id: 'writer', type: 'main', task: 'write', operations: [] },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'], channels: ['node:writer'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'two-node': g });
    const started = await startRun(fix.rt, 'two-node');
    expect(started.node?.nodeId).toBe('writer');

    const next = await fix.rt.graphAdvance(started.runId, 'writer');
    // effective channels = convention layer + project default layer + phase channels (global first, dedup)
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md', 'node:writer']);
  });
});

// ---------------------------------------------------------------------------
// Global channel — effective merge at dispatch (two-scope context model)
// ---------------------------------------------------------------------------

describe('global channel — effective merge at dispatch', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('merges graph-level context into every phase — dedup, phase own preserved', async () => {
    const g = JSON.stringify({
      name: 'scoped',

      context: ['skill:atom-graph-spec'],
      phases: [
        { id: 'writer', type: 'main', task: 'write', channels: ['.graph-scheduler/graphs/x.yaml'], operations: [] },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'], channels: ['node:writer'], operations: [] },
      ],
    });
    fix = await makeFixture({ scoped: g });
    const { runId, node } = await startRun(fix.rt, 'scoped');
    expect(node?.nodeId).toBe('writer');
    // convention layer first, global next, phase own preserved, exact dedup
    expect(node?.channels).toEqual([
      './CONTEXT.md',
      'docs/domains.md',
      'skill:atom-graph-spec',
      '.graph-scheduler/graphs/x.yaml',
    ]);

    const next = await fix.rt.graphAdvance(runId, 'writer');
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md', 'skill:atom-graph-spec', 'node:writer']);
  });

  it('merges project-level context — convention layer first, config default layer next', async () => {
    const g = JSON.stringify({
      name: 'project-scoped',

      phases: [{ id: 'only', type: 'main', task: 'do', operations: [] }],
    });
    const taskflowDir = join(tmpdir(), `crud-test-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'project-scoped.yaml'), g);
    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir,
        context: ['docs/adr/*.md', 'skill:atom-graph-spec'],
      }),
    );
    try {
      const started = await startRun(rt, 'project-scoped');
      expect(started.node?.channels).toEqual([
        './CONTEXT.md',
        'docs/domains.md',
        'docs/adr/*.md',
        'skill:atom-graph-spec',
      ]);
    } finally {
      rt.dispose();
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });

  it('a decision phase receives inherited graph-level context — uniform channels', async () => {
    const g = JSON.stringify({
      name: 'scoped-accept',

      phases: [
        { id: 'main-a', type: 'main', task: 'do a', operations: [] },
        { id: 'approve', type: 'main', task: 'OK?', dependsOn: ['main-a'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'scoped-accept': g });
    const { runId, node } = await startRun(fix.rt, 'scoped-accept');
    expect(node?.nodeId).toBe('main-a');
    // convention layer default-loaded into every phase — main phases alike
    expect(node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);

    const next = await fix.rt.graphAdvance(runId, 'main-a');
    expect(next.node?.nodeId).toBe('approve');
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);
  });

  it('promoted stream rides to its owning node — no self-skip in v2', async () => {
    const g = JSON.stringify({
      name: 'self-skip',

      context: ['node:writer'],
      phases: [
        { id: 'writer', type: 'main', task: 'write', operations: [] },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'self-skip': g });
    const { runId, node } = await startRun(fix.rt, 'self-skip');
    // The graph-level promoted stream is merged into the OWNING node too
    // (v2 additive merge — no self-skip carve-out)
    expect(node?.nodeId).toBe('writer');
    expect(node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md', 'node:writer']);

    const next = await fix.rt.graphAdvance(runId, 'writer');
    // downstream node receives the promoted stream as ambient (convention + project default layers first)
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md', 'node:writer']);
  });

  it('graph-level node: target missing from flattened set fails load', async () => {
    const g = JSON.stringify({
      name: 'ghost-scope',

      context: ['node:ghost-phase'],
      phases: [{ id: 'only', type: 'main', task: 'do', operations: [] }],
    });
    fix = await makeFixture({ 'ghost-scope': g });
    // load fails at contract pass — graph-level node: membership error
    await expect(fix.rt.graphStart('ghost-scope', { mode: 'auto' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// completion block — machine-declared decision options (v2.1)
// ---------------------------------------------------------------------------

describe('completion block — machine-declared decision options', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('plain node — completion.default only (continue)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const started = await startRun(fix.rt, 'linear-agent');
    expect(started.node?.completion).toEqual({ default: 'continue' });

    const second = await fix.rt.graphAdvance(started.runId, 'agent-a');
    expect(second.node?.completion).toEqual({ default: 'continue' });
  });

  it('branch node — completion.choices lists the flow condition vocabulary', async () => {
    const g = JSON.stringify({
      name: 'branch-dec',
      flow: ['decide -->|alpha| alpha', 'decide -->|beta| beta'],

      phases: [
        { id: 'entry', type: 'main', task: 'entry', operations: [] },
        {
          id: 'decide',
          type: 'main',
          dependsOn: ['entry'],
          task: 'Pick the work track (alpha or beta)',
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['decide'], operations: [] },
        { id: 'beta', type: 'main', task: 'beta', dependsOn: ['decide'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'branch-dec': g });
    const { runId } = await startRun(fix.rt, 'branch-dec');
    const decide = await fix.rt.graphAdvance(runId, 'entry');
    // choices derive from the labeled flow edges — the flow-defined condition
    // vocabulary (machine-declared; task-text backticks never surface).
    expect(decide.node?.completion).toEqual({ default: 'continue', choices: ['alpha', 'beta'] });
  });

  it('completion choices carry flow labels — prose backticks never surface', () => {
    const compiled = compileWorkflow({
      name: 'choices-flow-labels',
      flow: ['decide -->|pass| alpha', 'decide -->|fail| beta'],
      phases: [
        { id: 'entry', type: 'main', task: 'entry', dependsOn: [], operations: [] },
        {
          id: 'decide',
          type: 'main',
          task: 'judge — re-run (jump back to `entry`) on fail',
          dependsOn: ['entry'],
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['decide'], operations: [] },
        { id: 'beta', type: 'main', task: 'beta', dependsOn: ['decide'], operations: [] },
      ],
    });
    // the flow condition vocabulary (pass/fail) surfaces; the task-text
    // backtick `entry` never does
    expect(compiled.completion.get('decide')?.choices).toEqual(['pass', 'fail']);
  });

  it('direct-end node — completion.direct_end carries the declared label', async () => {
    const g = JSON.stringify({
      name: 'direct-end',

      phases: [
        { id: 'write', type: 'main', task: 'write', operations: [] },
        {
          id: 'final-check',
          type: 'main',
          dependsOn: ['write'],
          task: 'Confirm delivery — direct end: Ship now',
          operations: [],
        },
      ],
    });
    fix = await makeFixture({ 'direct-end': g });
    const { runId } = await startRun(fix.rt, 'direct-end');
    const check = await fix.rt.graphAdvance(runId, 'write');
    expect(check.node?.completion).toEqual({ default: 'continue', direct_end: 'Ship now' });
  });

  it('rework-declaring task text — completion carries no choices (flow edges are the only completion source)', async () => {
    const g = JSON.stringify({
      name: 'rework-dec',

      phases: [
        { id: 'seed', type: 'main', task: 'seed', operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['seed'],
          task: 'Rework decision — IF seed shows bad report the rework condition (`seed`); ELSE no condition.',
          operations: [],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['gate'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'rework-dec': g });
    const { runId } = await startRun(fix.rt, 'rework-dec');
    const gate = await fix.rt.graphAdvance(runId, 'seed');
    // No labeled flow edges — no choices (sequence default). The backtick
    // channel is retired: task-text quoting never contributes completion
    // options (loop/rework = flow self-edges — condition-matched
    // transitions, never task-text targets).
    expect(gate.node?.completion).toEqual({ default: 'continue' });
  });
});

// ---------------------------------------------------------------------------
// MCP tool input schemas — strict (v2.1): all ten tools reject unknown keys
// ---------------------------------------------------------------------------

describe('MCP tool input schemas — strict (v2.1)', () => {
  interface SchemaLike {
    safeParse(input: unknown): { success: boolean; error?: { issues: Array<{ message: string }> } };
  }

  const schemas: Array<{ name: string; schema: SchemaLike; valid: Record<string, unknown> }> = [
    { name: 'graph_start', schema: GraphStartSchema, valid: { graphName: 'g' } },
    { name: 'graph_advance', schema: GraphAdvanceSchema, valid: { runId: 'r', nodeId: 'n' } },
    { name: 'graph_jump', schema: GraphJumpSchema, valid: { runId: 'r', targetPhaseId: 't' } },
    { name: 'graph_force_end', schema: GraphForceEndSchema, valid: { runId: 'r' } },
    { name: 'graph_status', schema: GraphStatusSchema, valid: { runId: 'r' } },
    { name: 'graph_list', schema: GraphListSchema, valid: {} },
    { name: 'graph_init', schema: GraphInitSchema, valid: {} },
    { name: 'graph_clean_completed', schema: GraphCleanCompletedSchema, valid: { before: '2026-01-01T00:00:00Z' } },
    { name: 'graph_clean_all', schema: GraphCleanAllSchema, valid: {} },
    { name: 'graph_assets', schema: GraphAssetsSchema, valid: {} },
  ];

  it('every schema accepts its declared input', () => {
    for (const { name, schema, valid } of schemas) {
      expect(schema.safeParse(valid).success, `${name}: valid input rejected`).toBe(true);
    }
  });

  it('every schema rejects unknown keys loudly (strict)', () => {
    for (const { name, schema, valid } of schemas) {
      const parsed = schema.safeParse({ ...valid, bogus: 1 });
      expect(parsed.success, `${name}: unknown key accepted`).toBe(false);
      if (!parsed.success) {
        expect(
          parsed.error!.issues.map((i) => i.message).join('\n'),
          `${name}: error must name the rejected key`,
        ).toMatch(/bogus|Unrecognized key/i);
      }
    }
  });

  it('graph_list with {bogus: 1} is rejected', () => {
    const parsed = GraphListSchema.safeParse({ bogus: 1 });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Idempotency from persisted state (v2.1) — restart-safe re-report recognition
// ---------------------------------------------------------------------------

describe('idempotency from persisted state (restart-safe)', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('a completed nodeId re-reported without a branch is a no-op derived from persisted state', async () => {
    // 3-node linear graph — re-report an EARLIER completed node (not the
    // last-reported one), so the idempotency decision can only come from the
    // persisted run state (the in-memory last-reported cursor holds a
    // different nodeId).
    const g = JSON.stringify({
      name: 'three',

      phases: [
        { id: 'w', type: 'main', task: 'write', operations: [] },
        { id: 'r', type: 'main', task: 'review', dependsOn: ['w'], operations: [] },
        { id: 'a', type: 'main', task: 'accept', dependsOn: ['r'], operations: [] },
      ],
    });
    fix = await makeFixture({ three: g });
    const { runId } = await startRun(fix.rt, 'three');
    await fix.rt.graphAdvance(runId, 'w');
    await fix.rt.graphAdvance(runId, 'r');

    // Re-report 'w' (done, but NOT the last-reported node) without a branch —
    // recognized from persisted state as an idempotent no-op: the run stays
    // on the current interrupt, nothing re-dispatches.
    const dup = await fix.rt.graphAdvance(runId, 'w');
    expect(dup.node?.nodeId).toBe('a');
    expect(dup.snapshot.changed?.map((n) => n.nodeId)).toEqual(['a', '__handoff']);
    const status = await fix.rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'w')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'r')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'a')?.status).toBe('active');
  });

  it('duplicate re-report survives a runtime restart (file-backed DB)', async () => {
    const taskflowDir = join(tmpdir(), `crud-restart-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    const dbPath = join(taskflowDir, 'runs.db');
    writeFileSync(join(taskflowDir, 'linear-agent.yaml'), linearAgentGraph());

    const rt1 = await Effect.runPromise(createRuntime({ dbPath, taskflowDir, context: [] }));
    const start = await rt1.graphStart('linear-agent', { mode: 'auto' });
    await rt1.graphAdvance(start.runId, 'agent-a');
    await rt1.dispose();

    // "Restart" — a second runtime over the same persisted DB + checkpoints.
    const rt2 = await Effect.runPromise(createRuntime({ dbPath, taskflowDir, context: [] }));
    // Duplicate re-report of the completed nodeId without a branch — the
    // idempotent no-op survives the restart (recognized from persisted state).
    const dup = await rt2.graphAdvance(start.runId, 'agent-a');
    expect(dup.node?.nodeId).toBe('agent-b');
    expect(dup.snapshot.changed?.map((n) => n.nodeId)).toEqual(['agent-b', '__handoff']);
    const status = await rt2.graphStatus(start.runId);
    expect(status.nodes!.find((n) => n.nodeId === 'agent-a')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'agent-b')?.status).toBe('active');
    await rt2.dispose();
    rmSync(taskflowDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// Cross-run delegation (graph-cross-run-delegation) — router dispatch
// ---------------------------------------------------------------------------

describe('router dispatch — sibling-run delegation', () => {
  it('sequential router nodes dispatch flat by phase id — no namespaced members, single root handoff', async () => {
    // Two sequential router nodes: each selects and launches its candidate
    // graph as a frontend-driven sibling run (no `use` composition, no
    // namespaced members, no per-level handoff) — the graph advances through
    // the plain phase ids to the single root __handoff terminal.
    const first = JSON.stringify({
      name: 'first-scope-graph',
      phases: [{ id: 'f-a', type: 'main', task: 'first work', operations: [] }],
    });
    const second = JSON.stringify({
      name: 'second-scope-graph',
      phases: [{ id: 's-a', type: 'main', task: 'second work', operations: [] }],
    });
    const parent = JSON.stringify({
      name: 'scope-parent',
      phases: [
        { id: 'entry', type: 'main', task: 'entry work', operations: [] },
        {
          id: 'first',
          type: 'main',
          template: 'router',
          template_args: { paths: ['first-scope-graph'] },
          dependsOn: ['entry'],
        },
        {
          id: 'second',
          type: 'main',
          template: 'router',
          template_args: { paths: ['second-scope-graph'] },
          dependsOn: ['first'],
        },
        { id: 'final', type: 'main', dependsOn: ['second'], task: 'final work', operations: [] },
      ],
    });
    const fx = await makeFixture({
      'first-scope-graph': first,
      'second-scope-graph': second,
      'scope-parent': parent,
    });

    const start = await fx.rt.graphStart('scope-parent');
    expect(start.node?.nodeId).toBe('entry');
    let n = await fx.rt.graphAdvance(start.runId, 'entry');
    expect(n.node?.nodeId).toBe('first');
    // The router's machine-declared candidate paths ride the dispatch payload
    // — the sibling-run candidates (never compiled members).
    expect(n.node?.template_args).toEqual({ paths: ['first-scope-graph'] });
    n = await fx.rt.graphAdvance(start.runId, 'first');
    expect(n.node?.nodeId).toBe('second');
    expect(n.node?.template_args).toEqual({ paths: ['second-scope-graph'] });
    n = await fx.rt.graphAdvance(start.runId, 'second');
    expect(n.node?.nodeId).toBe('final');
    // Single root handoff — the graph's only synthesized terminal.
    n = await fx.rt.graphAdvance(start.runId, 'final');
    expect(n.node?.nodeId).toBe('__handoff');
    await fx.rt.graphForceEnd(start.runId);
  });
});
