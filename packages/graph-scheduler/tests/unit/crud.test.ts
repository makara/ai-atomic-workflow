/**
 * Unit tests for api/crud.ts — write operations through SchedulerRuntime.
 *
 * Uses temp dirs + createRuntime (in-memory SQLite) to exercise
 * graphStart, graphAdvance, graphJump, graphForceEnd, and graphStatus.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GraphAdvanceSchema, GraphStartSchema } from '../../server.js';
import type { NodeDetail } from '../../src/api/crud.js';
import { graphLoadCache } from '../../src/api/run-caches.js';
import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * ManagedRuntime.runPromise serializes Effect.fail errors as JSON
 * in the Error.message. Parse to recover domain fields like _tag.
 */
function unwrapDomainError(err: unknown): Record<string, unknown> | null {
  if (!(err instanceof Error)) return null;
  try {
    const parsed = JSON.parse(err.message);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // not JSON — raw message
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
    writeFileSync(join(taskflowDir, `${name}.taskflow.yaml`), json);
  }

  // Builtin registry covers main + approval — no project override needed.
  const rt = await Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir,
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

/** Minimal two-node linear graph (route-first: run completes by natural drain). */
function linearAgentGraph(): string {
  return JSON.stringify({
    name: 'linear-agent',
    version: 1,
    phases: [
      { id: 'agent-a', type: 'main', skill: 'test-agent-skill', task: 'do a' },
      { id: 'agent-b', type: 'main', skill: 'test-agent-skill', task: 'do b', dependsOn: ['agent-a'] },
    ],
  });
}

/** Main graph with per-node skill override on second phase. */
function skillOverrideGraph(): string {
  return JSON.stringify({
    name: 'skill-override',
    version: 1,
    phases: [
      { id: 'agent-a', type: 'main', skill: 'test-agent-skill', task: 'do a' },
      { id: 'agent-b', type: 'main', skill: 'custom-agent-skill', task: 'do b', dependsOn: ['agent-a'] },
    ],
  });
}

/** Graph with agent-hint arrays on main phases. */
function hintGraph(): string {
  return JSON.stringify({
    name: 'hints',
    version: 1,
    phases: [
      { id: 'hinted', type: 'main', skill: 'review-skill', agent: ['reviewer', 'task'], task: 'review' },
      { id: 'plain', type: 'main', skill: 'other-skill', task: 'plain', dependsOn: ['hinted'] },
    ],
  });
}

/** Invalid YAML for error testing. */
const BAD_YAML = 'not valid yaml {{{';

/**
 * Start a run and advance through the activation prologue prefix (P nodes)
 * until the first author node dispatches — the common test preamble for
 * graphs whose dispatch order now starts with the built-in prefix.
 */
async function startSkippingPrologue(
  rt: SchedulerRuntime,
  graphName: string,
): Promise<{ runId: string; node: NodeDetail | null }> {
  const start = await rt.graphStart(graphName);
  let node = start.node;
  while (node?.nodeId.startsWith('$')) {
    const next = await rt.graphAdvance(start.runId, node.nodeId, 10);
    node = next.node;
  }
  return { runId: start.runId, node };
}

// ---------------------------------------------------------------------------
// graphStart
// ---------------------------------------------------------------------------

describe('graphStart', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('starts a new run and returns runId + first node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent');

    expect(result.runId).toBeTruthy();
    // runId is UUID v4 — no longer run-* prefix
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
    // First dispatch is the activation prologue prefix (no approvals → load only)
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('$load-constraints');
    expect(result.node?.type).toBe('main');
  });

  it('returns run snapshot — prologue active, author entry pending behind it', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent');

    expect(result.snapshot.runId).toBe(result.runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.snapshot.nodeCount).toBe(3);
    expect(result.snapshot.completedCount).toBe(0);
    expect(result.snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: '$load-constraints', status: 'active', retryCount: 0 }),
        expect.objectContaining({ nodeId: 'agent-a', status: 'pending', retryCount: 0 }),
      ]),
    );
  });

  it('starts with invocation args available on node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'fast' });

    expect(result.node).not.toBeNull();
  });

  it('NodeDetail carries agent-hint array on main phases, absent otherwise', async () => {
    fix = await makeFixture({ hints: hintGraph() });
    const started = await startSkippingPrologue(fix.rt, 'hints');
    expect(started.node?.nodeId).toBe('hinted');
    expect(started.node?.agent).toEqual(['reviewer', 'task']);

    const second = await fix.rt.graphAdvance(started.runId, 'hinted', 10);
    expect(second.node?.nodeId).toBe('plain');
    expect(second.node?.agent).toBeUndefined();
  });

  it('throws when graph file is missing', async () => {
    fix = await makeFixture({});
    await expect(fix.rt.graphStart('missing')).rejects.toThrow();
  });

  it('NodeDetail carries dependsOn for main phases', async () => {
    fix = await makeFixture({
      'dep-graph': JSON.stringify({
        name: 'dep-graph',
        version: 1,
        phases: [
          { id: 'w', type: 'main', task: 'write' },
          { id: 'm', type: 'main', task: 'read', dependsOn: ['w'] },
          { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'dispatch', dependsOn: ['m'] },
        ],
      }),
    });

    const started = await startSkippingPrologue(fix.rt, 'dep-graph');
    expect(started.node?.nodeId).toBe('w');
    expect(started.node?.dependsOn).toBeUndefined();

    const second = await fix.rt.graphAdvance(started.runId, 'w', 10);
    expect(second.node?.nodeId).toBe('m');
    expect(second.node?.dependsOn).toEqual(['w']);

    const third = await fix.rt.graphAdvance(started.runId, 'm', 10);
    expect(third.node?.nodeId).toBe('a');
    expect(third.node?.dependsOn).toEqual(['m']);
  });

  it('throws on invalid YAML graph file', async () => {
    fix = await makeFixture({ 'bad-graph': BAD_YAML });
    await expect(fix.rt.graphStart('bad-graph')).rejects.toThrow();
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
    const { runId: rid, node } = await fix.rt.graphStart('linear-agent');
    runId = rid;
    // Activation prefix — dispatch the built-in load node before author nodes
    if (node?.nodeId.startsWith('$')) {
      await fix.rt.graphAdvance(runId, node.nodeId, 10);
    }
  });

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('advances to next node after reporting completion', async () => {
    const result = await fix.rt.graphAdvance(runId, 'agent-a', 50);

    expect(result.snapshot.runId).toBe(runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-b');
  });

  it('completes the run by natural drain when the last node completes (route-first)', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    // agent-b is the final node — its completion drains the run (no end node)
    const result = await fix.rt.graphAdvance(runId, 'agent-b', 50);
    expect(result.snapshot.fsmState).toBe('completed');
    expect(result.node).toBeNull();
  });

  it('throws when advancing with invalid nodeId', async () => {
    await expect(fix.rt.graphAdvance(runId, 'nonexistent', 50)).rejects.toThrow();
  });

  it('throws when advancing a completed run', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    await fix.rt.graphAdvance(runId, 'agent-b', 50);
    await expect(fix.rt.graphAdvance(runId, 'agent-a', 50)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphAdvance — gate branch transport (branch-routing redesign)
// ---------------------------------------------------------------------------

describe('graphAdvance branchTo', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  /** seed → gate (backward jump to seed) → alpha — no end node (drain completion). */
  function gateRunGraph(): string {
    return JSON.stringify({
      name: 'gate-run',
      version: 1,
      phases: [
        { id: 'seed', type: 'main', task: 'seed' },
        {
          id: 'gate',
          type: 'gate',
          dependsOn: ['seed'],
          jumps: [{ when: 'seed output shows source: bad AND seed retryCount < 2', to: 'seed' }],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['gate'] },
      ],
    });
  }

  it('gate pass-through (absent branchTo) activates the downstream node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startSkippingPrologue(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);
    const gate = await fix.rt.graphAdvance(runId, 'gate', 10);

    expect(gate.node?.nodeId).toBe('alpha');
    expect(gate.snapshot.nodes.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('gate jump branchTo resets the upstream target via JUMP — prologue re-runs (entry target)', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startSkippingPrologue(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);

    // Gate backward jump to the ENTRY node — the activation prefix re-runs
    // (round restart). Gate-only graph: no approval → no $run-mode-confirm —
    // only $load-constraints re-dispatches (approval-only synthesis).
    const jump = await fix.rt.graphAdvance(runId, 'gate', 10, 'seed');
    expect(jump.node?.nodeId).toBe('$load-constraints');
    expect(jump.node?.retryAttempt).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'seed')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'seed')?.status).toBe('pending');
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('pending');

    // After the prefix, the reset target re-dispatches with its retry visible
    const after = await fix.rt.graphAdvance(runId, '$load-constraints', 10);
    expect(after.node?.nodeId).toBe('seed');
    expect(after.node?.retryAttempt).toBe(1);
  });

  it('run completes by natural drain — no end marker node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startSkippingPrologue(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);
    await fix.rt.graphAdvance(runId, 'gate', 10);
    const done = await fix.rt.graphAdvance(runId, 'alpha', 10);
    expect(done.snapshot.fsmState).toBe('completed');
    expect(done.node).toBeNull();
  });

  it('branchTo to a terminal upstream node resets it via JUMP — prologue re-runs (entry target)', async () => {
    const g = JSON.stringify({
      name: 'gate-rework',
      version: 1,
      phases: [
        { id: 'w', type: 'main', task: 'write' },
        { id: 'r', type: 'main', task: 'review', dependsOn: ['w'] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'w' }],
        },
        { id: 'a', type: 'main', task: 'accept', dependsOn: ['g'] },
      ],
    });
    fix = await makeFixture({ 'gate-rework': g });

    const { runId } = await startSkippingPrologue(fix.rt, 'gate-rework');
    await fix.rt.graphAdvance(runId, 'w', 10);
    await fix.rt.graphAdvance(runId, 'r', 10);

    const jump = await fix.rt.graphAdvance(runId, 'g', 10, 'w');
    // Gate-only graph: no approval → no $run-mode-confirm (approval-only synthesis)
    expect(jump.node?.nodeId).toBe('$load-constraints');
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'g')?.status).toBe('pending');

    const after = await fix.rt.graphAdvance(runId, '$load-constraints', 10);
    expect(after.node?.nodeId).toBe('w');
    expect(after.node?.retryAttempt).toBe(1);
  });

  it('approval continue WITHOUT branchTo leaves route members unactivated — run drains (empty-round guarantee)', async () => {
    const g = JSON.stringify({
      name: 'route-gate',
      version: 1,
      phases: [
        { id: 'entry', type: 'main', task: 'entry' },
        {
          id: 'decide',
          type: 'approval',
          dependsOn: ['entry'],
          task: 'Proceed?\nRecommendation follows the report state.',
          routing: {
            actions: [
              {
                action: 'continue',
                target: 'work',
                value: 'continue',
                label: 'Continue',
                description: 'activate the work route',
              },
            ],
          },
        },
        { id: 'w1', type: 'main', task: 'w1', dependsOn: ['decide'], route: 'work' },
        { id: 'w2', type: 'main', task: 'w2', dependsOn: ['w1'], route: 'work' },
        { id: 'tail', type: 'main', task: 'tail', dependsOn: ['w2'] },
      ],
    });
    fix = await makeFixture({ 'route-gate': g });

    const { runId } = await startSkippingPrologue(fix.rt, 'route-gate');
    await fix.rt.graphAdvance(runId, 'entry', 10);

    // continue WITHOUT branchTo — the work route stays unselected; its members
    // never activate; tail depends on an unactivated node → nothing eligible
    const drained = await fix.rt.graphAdvance(runId, 'decide', 10);
    expect(drained.node).toBeNull();
    expect(drained.snapshot.fsmState).toBe('completed');
    const snap = drained.snapshot;
    expect(snap.nodes.find((n) => n.nodeId === 'w1')?.status).toBe('pending');
    expect(snap.nodes.find((n) => n.nodeId === 'w1')?.unactivated).toBe(true);
    expect(snap.nodes.find((n) => n.nodeId === 'w2')?.unactivated).toBe(true);
    // tail sits on the implicit default route — pending on an unmet dependency
    // (w2 never activates), no unactivated annotation
    expect(snap.nodes.find((n) => n.nodeId === 'tail')?.unactivated).toBeUndefined();
  });

  it('branchTo a route id activates every route member (content round)', async () => {
    const g = JSON.stringify({
      name: 'route-gate',
      version: 1,
      phases: [
        { id: 'entry', type: 'main', task: 'entry' },
        {
          id: 'decide',
          type: 'approval',
          dependsOn: ['entry'],
          task: 'Proceed?\nRecommendation follows the report state.',
          routing: {
            actions: [
              {
                action: 'continue',
                target: 'work',
                value: 'continue',
                label: 'Continue',
                description: 'activate the work route',
              },
            ],
          },
        },
        { id: 'w1', type: 'main', task: 'w1', dependsOn: ['decide'], route: 'work' },
        { id: 'w2', type: 'main', task: 'w2', dependsOn: ['w1'], route: 'work' },
        { id: 'tail', type: 'main', task: 'tail', dependsOn: ['w2'] },
      ],
    });
    fix = await makeFixture({ 'route-gate': g });

    const { runId } = await startSkippingPrologue(fix.rt, 'route-gate');
    await fix.rt.graphAdvance(runId, 'entry', 10);

    // branchTo 'work' — the route activates; members dispatch in order
    const activated = await fix.rt.graphAdvance(runId, 'decide', 10, 'work');
    expect(activated.node?.nodeId).toBe('w1');
    expect(activated.snapshot.nodes.find((n) => n.nodeId === 'w1')?.status).toBe('active');
    expect(activated.snapshot.nodes.find((n) => n.nodeId === 'w1')?.unactivated).toBeUndefined();

    await fix.rt.graphAdvance(runId, 'w1', 10);
    await fix.rt.graphAdvance(runId, 'w2', 10);
    const done = await fix.rt.graphAdvance(runId, 'tail', 10);
    expect(done.snapshot.fsmState).toBe('completed');
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

  it('jumps to target phase in a running DAG', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startSkippingPrologue(fix.rt, 'linear-agent');

    // Advance to phase-2
    await fix.rt.graphAdvance(runId, 'agent-a', 50);

    // Jump back to the ENTRY node — the activation prefix re-runs first
    const result = await fix.rt.graphJump(runId, 'agent-a');
    expect(result.snapshot.runId).toBe(runId);
    expect(result.node?.nodeId).toBe('$load-constraints');
    expect(result.node?.retryAttempt).toBe(1);

    // After the prefix, the reset target re-dispatches
    const after = await fix.rt.graphAdvance(runId, '$load-constraints', 10);
    expect(after.node?.nodeId).toBe('agent-a');
    expect(after.node?.retryAttempt).toBe(1);
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

  it('force-ends a running run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');

    const result = await fix.rt.graphForceEnd(runId);
    expect(result.fsmState).toBe('terminated');
    expect(result.runId).toBe(runId);
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
    const { runId } = await fix.rt.graphStart('linear-agent');

    const status = await fix.rt.graphStatus(runId);
    expect(status.runId).toBe(runId);
    // author nodes + the activation prefix node
    expect(status.nodeCount).toBe(3);
    expect(status.graphName).toBe('linear-agent');
  });

  it('reports completed state after full advance (natural drain)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startSkippingPrologue(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    await fix.rt.graphAdvance(runId, 'agent-b', 50);

    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  it('throws for non-existent runId', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphStatus('nonexistent-run')).rejects.toThrow();
  });

  it('per-node skill override is visible in node detail', async () => {
    fix = await makeFixture({ 'skill-override': skillOverrideGraph() });
    const started = await startSkippingPrologue(fix.rt, 'skill-override');

    // First author node uses phase skill (skill from phase.skill — no registry fallback)
    expect(started.node?.skill).toBe('test-agent-skill');

    // Advance to node-b which has per-node skill override
    const advResult = await fix.rt.graphAdvance(started.runId, 'agent-a', 50);
    expect(advResult.node?.skill).toBe('custom-agent-skill');
  });

  it('rejects unregistered agent type at load (GraphDefinitionError)', async () => {
    const graph = JSON.stringify({
      name: 'agent-type',
      version: 1,
      phases: [{ id: 'a1', type: 'agent', task: 'do a' }],
    });
    fix = await makeFixture({ 'agent-type': graph });
    // Phase type 'agent' is no longer registered — load fails at handler
    // resolution (UnknownPhaseTypeError → GraphDefinitionError) naming the type.
    const err = await fix.rt.graphStart('agent-type').then(
      () => null,
      (e: { _tag?: string; message?: string }) => e,
    );
    expect(err).not.toBeNull();
    expect(err?._tag).toBe('GraphDefinitionError');
    expect(String(err?.message)).toContain('agent');
  });
});

// ---------------------------------------------------------------------------
// run caches — graph definition cache: created at start, dropped on force-end/cleanup, kept on jump
// (constraints are NOT process-cached — they snapshot into the run record at graph_start)
// ---------------------------------------------------------------------------

describe('run cache lifecycle', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('populates graph cache at graphStart', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');
    expect(graphLoadCache.has(runId)).toBe(true);
  });

  it('drops graph cache on graphForceEnd', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');
    expect(graphLoadCache.has(runId)).toBe(true);

    await fix.rt.graphForceEnd(runId);
    expect(graphLoadCache.has(runId)).toBe(false);
  });

  it('keeps graph cache on graphJump — run stays active', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');
    await fix.rt.graphJump(runId, 'agent-a');
    expect(graphLoadCache.has(runId)).toBe(true);
  });

  it('drops graph cache for completed runs only on graphCleanCompleted', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId: doneRun } = await startSkippingPrologue(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(doneRun, 'agent-a', 50);
    await fix.rt.graphAdvance(doneRun, 'agent-b', 50);
    const { runId: liveRun } = await fix.rt.graphStart('linear-agent');
    expect(graphLoadCache.has(doneRun)).toBe(true);
    expect(graphLoadCache.has(liveRun)).toBe(true);

    const { deleted } = await fix.rt.graphCleanCompleted();
    expect(deleted).toBe(1);
    expect(graphLoadCache.has(doneRun)).toBe(false);
    // live run untouched
    expect(graphLoadCache.has(liveRun)).toBe(true);
  });

  it('clears all graph caches on graphCleanAll', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const before = graphLoadCache.size;
    await fix.rt.graphStart('linear-agent');
    await fix.rt.graphStart('linear-agent');
    expect(graphLoadCache.size).toBe(before + 2);

    await fix.rt.graphCleanAll();
    expect(graphLoadCache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Activation prologue — first dispatch, graph-aware synthesis
// ---------------------------------------------------------------------------

describe('activation prologue dispatch', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('graph without approvals dispatches $load-constraints first (no confirm)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { node } = await fix.rt.graphStart('linear-agent');

    expect(node?.nodeId).toBe('$load-constraints');
    expect(node?.runMode).toBeUndefined();
    expect(node?.constraints).toBeUndefined();
  });

  it('graph with approvals dispatches $run-mode-confirm first', async () => {
    const withApproval = JSON.stringify({
      name: 'with-approval',
      version: 1,
      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a' },
        { id: 'accept', type: 'approval', dependsOn: ['a'], task: 'Accept?', topic: 'Accept?' },
      ],
    });
    fix = await makeFixture({ 'with-approval': withApproval });
    const { runId } = await fix.rt.graphStart('with-approval');
    const snapshot = await fix.rt.graphStatus(runId);

    // Prologue nodes are run members — visible in the snapshot
    const prologue = snapshot.nodes.filter((n) => n.nodeId.startsWith('$'));
    expect(prologue.map((n) => n.nodeId).sort()).toEqual(['$load-constraints', '$run-mode-confirm']);
    expect(prologue.every((n) => n.status === 'active')).toBe(true);
  });

  it('author entry waits for the prologue prefix', async () => {
    const withApproval = JSON.stringify({
      name: 'with-approval',
      version: 1,
      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a' },
        { id: 'accept', type: 'approval', dependsOn: ['a'], task: 'Accept?', topic: 'Accept?' },
      ],
    });
    fix = await makeFixture({ 'with-approval': withApproval });
    const { runId } = await fix.rt.graphStart('with-approval');

    // Complete the prefix — author node activates only after both P nodes
    const n1 = await fix.rt.graphAdvance(runId, '$run-mode-confirm', 10);
    expect(n1.node?.nodeId).toBe('$load-constraints');
    const n2 = await fix.rt.graphAdvance(runId, '$load-constraints', 10);
    expect(n2.node?.nodeId).toBe('a');
  });

  it('rejects a mode parameter at the MCP schema layer (strict)', () => {
    // The mode param is removed — graph-level mode travels via args.mode
    expect(GraphStartSchema.safeParse({ graphName: 'x', mode: 'auto' }).success).toBe(false);
    expect(GraphStartSchema.safeParse({ graphName: 'x', args: { mode: 'auto' } }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// graph_advance input schema — strict, branchTo only (branch-routing redesign, skip removed)
// ---------------------------------------------------------------------------

describe('graph_advance input schema', () => {
  it('accepts runId/nodeId/durationMs/branchTo', () => {
    const ok = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 10, branchTo: 'target' });
    expect(ok.success).toBe(true);
    const minimal = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 0 });
    expect(minimal.success).toBe(true);
  });

  it('rejects unknown params — skip is gone, strict schema (branch-routing redesign)', () => {
    const withSkip = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 10, skip: true });
    expect(withSkip.success).toBe(false);
    const withUnknown = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 10, garbage: 1 });
    expect(withUnknown.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Dispatch-time run-scope gate — cross-run node: channels stripped
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
      version: 1,
      phases: [
        {
          id: 'main-a',
          type: 'main',
          task: 'do a',
          channels: ['node:loop-entry'],
        },
      ],
    });
    fix = await makeFixture({ standalone });
    const { runId, node } = await startSkippingPrologue(fix.rt, 'standalone');
    expect(node?.nodeId).toBe('main-a');
    expect(node?.channels).toEqual([]);
    expect(runId).toBeTruthy();
  });

  it('keeps node: channel targets inside the run node set', async () => {
    const g = JSON.stringify({
      name: 'two-node',
      version: 1,
      phases: [
        { id: 'writer', type: 'main', task: 'write' },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'], channels: ['node:writer'] },
      ],
    });
    fix = await makeFixture({ 'two-node': g });
    const started = await startSkippingPrologue(fix.rt, 'two-node');
    expect(started.node?.nodeId).toBe('writer');

    const next = await fix.rt.graphAdvance(started.runId, 'writer', 10);
    expect(next.node?.channels).toEqual(['node:writer']);
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
      version: 1,
      context: ['./CONTEXT.md', 'skill:atom-graph-spec'],
      phases: [
        { id: 'writer', type: 'main', task: 'write', channels: ['./CONTEXT.md'] },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'], channels: ['node:writer'] },
      ],
    });
    fix = await makeFixture({ scoped: g });
    const { runId, node } = await startSkippingPrologue(fix.rt, 'scoped');
    expect(node?.nodeId).toBe('writer');
    // global first, phase own preserved, exact dedup
    expect(node?.channels).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec']);

    const next = await fix.rt.graphAdvance(runId, 'writer', 10);
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'skill:atom-graph-spec', 'node:writer']);
  });

  it('merges project-level context — config default layer first', async () => {
    const g = JSON.stringify({
      name: 'project-scoped',
      version: 1,
      context: ['./CONTEXT.md'],
      phases: [{ id: 'only', type: 'main', task: 'do' }],
    });
    const taskflowDir = join(tmpdir(), `crud-test-${Math.random().toString(36).slice(2)}`);
    mkdirSync(taskflowDir, { recursive: true });
    writeFileSync(join(taskflowDir, 'project-scoped.taskflow.yaml'), g);
    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir,
        context: ['docs/adr/*.md', 'skill:atom-graph-spec'],
      }),
    );
    try {
      const started = await startSkippingPrologue(rt, 'project-scoped');
      expect(started.node?.channels).toEqual(['docs/adr/*.md', 'skill:atom-graph-spec', './CONTEXT.md']);
    } finally {
      rt.dispose();
      rmSync(taskflowDir, { recursive: true, force: true });
    }
  });

  it('approval phase receives inherited graph-level context — uniform channels', async () => {
    const g = JSON.stringify({
      name: 'scoped-approval',
      version: 1,
      context: ['./CONTEXT.md'],
      phases: [
        { id: 'main-a', type: 'main', task: 'do a' },
        { id: 'approve', type: 'approval', task: 'OK?', dependsOn: ['main-a'] },
      ],
    });
    fix = await makeFixture({ 'scoped-approval': g });
    const { runId, node } = await startSkippingPrologue(fix.rt, 'scoped-approval');
    expect(node?.nodeId).toBe('main-a');
    expect(node?.channels).toEqual(['./CONTEXT.md']);

    const next = await fix.rt.graphAdvance(runId, 'main-a', 10);
    expect(next.node?.nodeId).toBe('approve');
    expect(next.node?.channels).toEqual(['./CONTEXT.md']);
  });

  it('promoted stream skipped for its owning node — self-skip', async () => {
    const g = JSON.stringify({
      name: 'self-skip',
      version: 1,
      context: ['node:writer'],
      phases: [
        { id: 'writer', type: 'main', task: 'write' },
        { id: 'reader', type: 'main', task: 'read', dependsOn: ['writer'] },
      ],
    });
    fix = await makeFixture({ 'self-skip': g });
    const { runId, node } = await startSkippingPrologue(fix.rt, 'self-skip');
    // owning node does NOT receive its own promoted stream
    expect(node?.nodeId).toBe('writer');
    expect(node?.channels).toEqual([]);

    const next = await fix.rt.graphAdvance(runId, 'writer', 10);
    // downstream node receives the promoted stream as ambient
    expect(next.node?.channels).toEqual(['node:writer']);
  });

  it('graph-level node: target missing from flattened set fails load', async () => {
    const g = JSON.stringify({
      name: 'ghost-scope',
      version: 1,
      context: ['node:ghost-phase'],
      phases: [{ id: 'only', type: 'main', task: 'do' }],
    });
    fix = await makeFixture({ 'ghost-scope': g });
    // load fails at contract pass — graph-level node: membership error
    await expect(fix.rt.graphStart('ghost-scope')).rejects.toThrow();
  });
});
