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

/** Minimal two-node linear graph (route-first: run completes by natural drain). */
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

/** Graph with agent-hint arrays on main phases. */
function hintGraph(): string {
  return JSON.stringify({
    name: 'hints',

    phases: [
      {
        id: 'hinted',
        type: 'main',
        skill: 'review-skill',
        agent: ['reviewer', 'task'],
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
 * Start a run (mode auto) — the common test preamble. Runs start directly
 * at their first author node (activation facts live at graph_start).
 */
async function startRun(rt: SchedulerRuntime, graphName: string): Promise<{ runId: string; node: NodeDetail | null }> {
  return rt.graphStart(graphName, { mode: 'auto' });
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
    // No activation prologue nodes — the run starts at its first author node
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.type).toBe('main');
  });

  it('returns run snapshot — first author entry active, no $ nodes', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    expect(result.snapshot.runId).toBe(result.runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.snapshot.nodeCount).toBe(2);
    expect(result.snapshot.completedCount).toBe(0);
    expect(result.snapshot.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ nodeId: 'agent-a', status: 'active', retryCount: 0 }),
        expect.objectContaining({ nodeId: 'agent-b', status: 'pending', retryCount: 0 }),
      ]),
    );
    expect(result.snapshot.nodes.some((n) => n.nodeId.startsWith('$'))).toBe(false);
  });

  it('rejects an invalid mode value — MODE_REQUIRED (activation fact, never silent)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphStart('linear-agent', { mode: 'fast' })).rejects.toMatchObject({
      _tag: 'ModeRequiredError',
    });
    await expect(fix.rt.graphStart('linear-agent', { mode: 1 })).rejects.toMatchObject({
      _tag: 'ModeRequiredError',
    });
  });

  it('rejects a missing mode — MODE_REQUIRED, no run created', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphStart('linear-agent')).rejects.toMatchObject({
      _tag: 'ModeRequiredError',
    });
  });

  it('NodeDetail carries agent-hint array on main phases, absent otherwise', async () => {
    fix = await makeFixture({ hints: hintGraph() });
    const started = await startRun(fix.rt, 'hints');
    expect(started.node?.nodeId).toBe('hinted');
    expect(started.node?.agent).toEqual(['reviewer', 'task']);

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
  });

  it('completes the run by natural drain when the last node completes (route-first)', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a');
    // agent-b is the final node — its completion drains the run (no end node)
    const result = await fix.rt.graphAdvance(runId, 'agent-b');
    expect(result.snapshot.fsmState).toBe('completed');
    expect(result.node).toBeNull();
  });

  it('throws when advancing with invalid nodeId', async () => {
    await expect(fix.rt.graphAdvance(runId, 'nonexistent')).rejects.toThrow();
  });

  it('throws when advancing a completed run', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a');
    await fix.rt.graphAdvance(runId, 'agent-b');
    await expect(fix.rt.graphAdvance(runId, 'agent-a')).rejects.toThrow();
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

      phases: [
        { id: 'seed', type: 'main', task: 'seed', operations: [] },
        {
          id: 'gate',
          type: 'gate',
          dependsOn: ['seed'],
          jumps: [{ when: 'seed output shows source: bad AND seed retryCount < 2', to: 'seed' }],
        },
        { id: 'alpha', type: 'main', task: 'alpha', dependsOn: ['gate'], operations: [] },
      ],
    });
  }

  it('gate pass-through (absent branchTo) activates the downstream node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');
    const gate = await fix.rt.graphAdvance(runId, 'gate');

    expect(gate.node?.nodeId).toBe('alpha');
    expect(gate.snapshot.nodes.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('gate jump branchTo resets the upstream target via JUMP — entry target re-dispatches directly', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');

    // Gate backward jump to the ENTRY node — no prologue re-run, the reset
    // target dispatches directly with its retry visible.
    const jump = await fix.rt.graphAdvance(runId, 'gate', 'seed');
    expect(jump.node?.nodeId).toBe('seed');
    expect(jump.node?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'seed')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'seed')?.status).toBe('active');
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('pending');
  });

  it('run completes by natural drain — no end marker node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await startRun(fix.rt, 'gate-run');
    await fix.rt.graphAdvance(runId, 'seed');
    await fix.rt.graphAdvance(runId, 'gate');
    const done = await fix.rt.graphAdvance(runId, 'alpha');
    expect(done.snapshot.fsmState).toBe('completed');
    expect(done.node).toBeNull();
  });

  it('branchTo to a terminal upstream node resets it via JUMP — entry target re-dispatches directly', async () => {
    const g = JSON.stringify({
      name: 'gate-rework',

      phases: [
        { id: 'w', type: 'main', task: 'write', operations: [] },
        { id: 'r', type: 'main', task: 'review', dependsOn: ['w'], operations: [] },
        {
          id: 'g',
          type: 'gate',
          dependsOn: ['r'],
          jumps: [{ when: 'r output shows overall: fail AND w retryCount < 2', to: 'w' }],
        },
        { id: 'a', type: 'main', task: 'accept', dependsOn: ['g'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'gate-rework': g });

    const { runId } = await startRun(fix.rt, 'gate-rework');
    await fix.rt.graphAdvance(runId, 'w');
    await fix.rt.graphAdvance(runId, 'r');

    const jump = await fix.rt.graphAdvance(runId, 'g', 'w');
    expect(jump.node?.nodeId).toBe('w');
    expect(jump.node?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'g')?.status).toBe('pending');
  });

  it('declared branch-route approval continue WITHOUT branchTo/endRun is rejected — silent drain prevented (route-completeness guard)', async () => {
    const g = JSON.stringify({
      name: 'route-gate',

      phases: [
        { id: 'entry', type: 'main', task: 'entry', operations: [] },
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
              {
                action: 'end',
                value: 'end',
                label: 'End',
                description: 'finish the run',
              },
            ],
          },
        },
        { id: 'w1', type: 'main', task: 'w1', dependsOn: ['decide'], route: 'work', operations: [] },
        { id: 'w2', type: 'main', task: 'w2', dependsOn: ['w1'], route: 'work', operations: [] },
        { id: 'tail', type: 'main', task: 'tail', dependsOn: ['w2'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'route-gate': g });

    const { runId } = await startRun(fix.rt, 'route-gate');
    await fix.rt.graphAdvance(runId, 'entry');

    // continue WITHOUT branchTo — the declared route stays unselected; a
    // silent drain would leave its members (and tail) permanently pending.
    // The route-completeness guard rejects the incomplete dispatch instead.
    await expect(fix.rt.graphAdvance(runId, 'decide')).rejects.toThrow();

    // The run stays running — the rejection did not complete it.
    const still = await fix.rt.graphStatus(runId);
    expect(still.fsmState).toBe('running');

    // Explicit routing decision: branchTo activates the work route and the
    // chain runs to completion.
    await fix.rt.graphAdvance(runId, 'decide', 'work');
    await fix.rt.graphAdvance(runId, 'w1');
    const done = await fix.rt.graphAdvance(runId, 'w2');
    expect(done.node?.nodeId).toBe('tail');
    const tailed = await fix.rt.graphAdvance(runId, 'tail');
    expect(tailed.snapshot.fsmState).toBe('completed');
  });

  it('branchTo a route id activates every route member (content round)', async () => {
    const g = JSON.stringify({
      name: 'route-gate',

      phases: [
        { id: 'entry', type: 'main', task: 'entry', operations: [] },
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
        { id: 'w1', type: 'main', task: 'w1', dependsOn: ['decide'], route: 'work', operations: [] },
        { id: 'w2', type: 'main', task: 'w2', dependsOn: ['w1'], route: 'work', operations: [] },
        { id: 'tail', type: 'main', task: 'tail', dependsOn: ['w2'], operations: [] },
      ],
    });
    fix = await makeFixture({ 'route-gate': g });

    const { runId } = await startRun(fix.rt, 'route-gate');
    await fix.rt.graphAdvance(runId, 'entry');

    // branchTo 'work' — the route activates; members dispatch in order
    const activated = await fix.rt.graphAdvance(runId, 'decide', 'work');
    expect(activated.node?.nodeId).toBe('w1');
    expect(activated.snapshot.nodes.find((n) => n.nodeId === 'w1')?.status).toBe('active');
    expect(activated.snapshot.changed?.find((n) => n.nodeId === 'w1')?.unactivated).toBeUndefined();

    await fix.rt.graphAdvance(runId, 'w1');
    await fix.rt.graphAdvance(runId, 'w2');
    const done = await fix.rt.graphAdvance(runId, 'tail');
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
    const { runId } = await startRun(fix.rt, 'linear-agent');

    // Advance to phase-2
    await fix.rt.graphAdvance(runId, 'agent-a');

    // Jump back to the ENTRY node — the reset target re-dispatches directly
    const result = await fix.rt.graphJump(runId, 'agent-a');
    expect(result.snapshot.runId).toBe(runId);
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.retryCount).toBe(1);
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
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

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
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });

    const status = await fix.rt.graphStatus(runId);
    expect(status.runId).toBe(runId);
    // author nodes only — no activation prefix rows
    expect(status.nodeCount).toBe(2);
    expect(status.graphName).toBe('linear-agent');
  });

  it('reports completed state after full advance (natural drain)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await startRun(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(runId, 'agent-a');
    await fix.rt.graphAdvance(runId, 'agent-b');

    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  it('throws for non-existent runId', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphStatus('nonexistent-run')).rejects.toThrow();
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
    // Phase type 'agent' is no longer registered — load fails at handler
    // resolution (UnknownPhaseTypeError → GraphDefinitionError) naming the type.
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
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    expect(graphLoadCache.has(runId)).toBe(true);
  });

  it('drops graph cache on graphForceEnd', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    expect(graphLoadCache.has(runId)).toBe(true);

    await fix.rt.graphForceEnd(runId);
    expect(graphLoadCache.has(runId)).toBe(false);
  });

  it('keeps graph cache on graphJump — run stays active', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    await fix.rt.graphJump(runId, 'agent-a');
    expect(graphLoadCache.has(runId)).toBe(true);
  });

  it('drops graph cache for completed runs only on graphCleanCompleted', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId: doneRun } = await startRun(fix.rt, 'linear-agent');
    await fix.rt.graphAdvance(doneRun, 'agent-a');
    await fix.rt.graphAdvance(doneRun, 'agent-b');
    const { runId: liveRun } = await fix.rt.graphStart('linear-agent', { mode: 'auto' });
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
    await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    await fix.rt.graphStart('linear-agent', { mode: 'auto' });
    expect(graphLoadCache.size).toBe(before + 2);

    await fix.rt.graphCleanAll();
    expect(graphLoadCache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Activation — mode at graph_start, no prologue nodes
// ---------------------------------------------------------------------------

describe('activation mode', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('graph with approvals starts at its first author node — no $ nodes synthesized', async () => {
    const withApproval = JSON.stringify({
      name: 'with-approval',

      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
        { id: 'accept', type: 'approval', dependsOn: ['a'], task: 'Accept?', topic: 'Accept?' },
      ],
    });
    fix = await makeFixture({ 'with-approval': withApproval });
    const { runId, node } = await fix.rt.graphStart('with-approval', { mode: 'auto' });
    const snapshot = await fix.rt.graphStatus(runId);

    expect(node?.nodeId).toBe('a');
    // No prologue rows — the run contains author nodes only
    expect(snapshot.nodes.filter((n) => n.nodeId.startsWith('$'))).toEqual([]);
    // NodeDetail never carries runMode/constraints (activation facts live at graph_start / pilot)
    expect(node && 'runMode' in node).toBe(false);
    expect(node && 'constraints' in node).toBe(false);
  });

  it('author entry is the first dispatch — no prefix to advance', async () => {
    const withApproval = JSON.stringify({
      name: 'with-approval',

      phases: [
        { id: 'a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] },
        { id: 'accept', type: 'approval', dependsOn: ['a'], task: 'Accept?', topic: 'Accept?' },
      ],
    });
    fix = await makeFixture({ 'with-approval': withApproval });
    const { runId } = await fix.rt.graphStart('with-approval', { mode: 'auto' });

    const n1 = await fix.rt.graphAdvance(runId, 'a');
    expect(n1.node?.nodeId).toBe('accept');
  });

  it('MCP schema: top-level mode rejected (strict), args.mode validated', () => {
    expect(GraphStartSchema.safeParse({ graphName: 'x', mode: 'auto' }).success).toBe(false);
    expect(GraphStartSchema.safeParse({ graphName: 'x', args: { mode: 'auto' } }).success).toBe(true);
    expect(GraphStartSchema.safeParse({ graphName: 'x', args: { mode: 42 } }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// graph_advance input schema — strict, branchTo/endRun only (branch-routing
// redesign, skip + durationMs removed — duration derived from timestamps)
// ---------------------------------------------------------------------------

describe('graph_advance input schema', () => {
  it('accepts runId/nodeId/branchTo/endRun', () => {
    const ok = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', branchTo: 'target' });
    expect(ok.success).toBe(true);
    const withEnd = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', endRun: true });
    expect(withEnd.success).toBe(true);
    const minimal = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n' });
    expect(minimal.success).toBe(true);
  });

  it('rejects unknown params — durationMs/skip are gone, strict schema (branch-routing redesign)', () => {
    const withDuration = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', durationMs: 10 });
    expect(withDuration.success).toBe(false);
    const withSkip = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', skip: true });
    expect(withSkip.success).toBe(false);
    const withUnknown = GraphAdvanceSchema.safeParse({ runId: 'r', nodeId: 'n', garbage: 1 });
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
    // default context (.graph-scheduler/config.json context) survive the merge
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
        { id: 'writer', type: 'main', task: 'write', channels: ['.graph-scheduler/docs/x.md'], operations: [] },
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
      '.graph-scheduler/docs/x.md',
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
    writeFileSync(join(taskflowDir, 'project-scoped.taskflow.yaml'), g);
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

  it('approval phase receives inherited graph-level context — uniform channels', async () => {
    const g = JSON.stringify({
      name: 'scoped-approval',

      phases: [
        { id: 'main-a', type: 'main', task: 'do a', operations: [] },
        { id: 'approve', type: 'approval', task: 'OK?', dependsOn: ['main-a'] },
      ],
    });
    fix = await makeFixture({ 'scoped-approval': g });
    const { runId, node } = await startRun(fix.rt, 'scoped-approval');
    expect(node?.nodeId).toBe('main-a');
    // convention layer default-loaded into every phase — main and approval alike
    expect(node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);

    const next = await fix.rt.graphAdvance(runId, 'main-a');
    expect(next.node?.nodeId).toBe('approve');
    expect(next.node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);
  });

  it('promoted stream skipped for its owning node — self-skip', async () => {
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
    // owning node does NOT receive its own promoted stream; convention layer
    // + project default context layer remain
    expect(node?.nodeId).toBe('writer');
    expect(node?.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);

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
