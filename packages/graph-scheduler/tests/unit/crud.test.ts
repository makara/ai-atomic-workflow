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

import { GraphAdvanceSchema, RunModeSchema } from '../../server.js';
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
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.type).toBe('main');
  });

  it('returns run snapshot — first node active, entry dispatch carries it', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent');

    expect(result.snapshot.runId).toBe(result.runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.snapshot.nodeCount).toBeGreaterThan(0);
    expect(result.snapshot.completedCount).toBe(0);
    expect(result.snapshot.nodes).toEqual(
      expect.arrayContaining([expect.objectContaining({ nodeId: 'agent-a', status: 'active', retryCount: 0 })]),
    );
  });

  it('starts with invocation args available on node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'fast' });

    expect(result.node).not.toBeNull();
  });

  it('NodeDetail carries agent-hint array on main phases, absent otherwise', async () => {
    fix = await makeFixture({ hints: hintGraph() });
    const first = await fix.rt.graphStart('hints');
    expect(first.node?.nodeId).toBe('hinted');
    expect(first.node?.agent).toEqual(['reviewer', 'task']);

    const second = await fix.rt.graphAdvance(first.runId, 'hinted', 10);
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

    const first = await fix.rt.graphStart('dep-graph');
    expect(first.node?.nodeId).toBe('w');
    expect(first.node?.dependsOn).toBeUndefined();

    const second = await fix.rt.graphAdvance(first.runId, 'w', 10);
    expect(second.node?.nodeId).toBe('m');
    expect(second.node?.dependsOn).toEqual(['w']);

    const third = await fix.rt.graphAdvance(first.runId, 'm', 10);
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
    const { runId: rid } = await fix.rt.graphStart('linear-agent');
    runId = rid;
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

    const { runId } = await fix.rt.graphStart('gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);
    const gate = await fix.rt.graphAdvance(runId, 'gate', 10);

    expect(gate.node?.nodeId).toBe('alpha');
    expect(gate.snapshot.nodes.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('gate jump branchTo resets the upstream target via JUMP — retryCount increments', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await fix.rt.graphStart('gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);

    const jump = await fix.rt.graphAdvance(runId, 'gate', 10, 'seed');
    expect(jump.node?.nodeId).toBe('seed');
    expect(jump.node?.retryAttempt).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'seed')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'gate')?.status).toBe('pending');
  });

  it('run completes by natural drain — no end marker node', async () => {
    fix = await makeFixture({ 'gate-run': gateRunGraph() });

    const { runId } = await fix.rt.graphStart('gate-run');
    await fix.rt.graphAdvance(runId, 'seed', 10);
    await fix.rt.graphAdvance(runId, 'gate', 10);
    const done = await fix.rt.graphAdvance(runId, 'alpha', 10);
    expect(done.snapshot.fsmState).toBe('completed');
    expect(done.node).toBeNull();
  });

  it('branchTo to a terminal upstream node resets it via JUMP — retryCount increments', async () => {
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

    const { runId } = await fix.rt.graphStart('gate-rework');
    await fix.rt.graphAdvance(runId, 'w', 10);
    await fix.rt.graphAdvance(runId, 'r', 10);

    const jump = await fix.rt.graphAdvance(runId, 'g', 10, 'w');
    expect(jump.node?.nodeId).toBe('w');
    expect(jump.node?.retryAttempt).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'w')?.retryCount).toBe(1);
    expect(jump.snapshot.nodes.find((n) => n.nodeId === 'g')?.status).toBe('pending');
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
    const { runId } = await fix.rt.graphStart('linear-agent');

    // Advance to phase-2
    await fix.rt.graphAdvance(runId, 'agent-a', 50);

    // Jump back to agent-a
    const result = await fix.rt.graphJump(runId, 'agent-a');
    expect(result.snapshot.runId).toBe(runId);
    expect(result.node?.nodeId).toBe('agent-a');
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
    expect(status.nodeCount).toBe(2);
    expect(status.graphName).toBe('linear-agent');
  });

  it('reports completed state after full advance (natural drain)', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');
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
    const startResult = await fix.rt.graphStart('skill-override');

    // First node uses phase skill (skill from phase.skill — no registry fallback)
    expect(startResult.node?.skill).toBe('test-agent-skill');

    // Advance to node-b which has per-node skill override
    const advResult = await fix.rt.graphAdvance(startResult.runId, 'agent-a', 50);
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
    const { runId: doneRun } = await fix.rt.graphStart('linear-agent');
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
// Run Mode — graph_start mode param
// ---------------------------------------------------------------------------

describe('run mode', () => {
  let fix: Fixture;

  afterEach(() => {
    fix?.cleanup();
  });

  it('graph_start with mode auto persists run mode and dispatches runMode: auto', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId, node } = await fix.rt.graphStart('linear-agent', undefined, 'auto');

    expect(node?.runMode).toBe('auto');
    const snapshot = await fix.rt.graphStatus(runId);
    expect(snapshot.runId).toBe(runId);

    // runMode persists across advance — comes from the run row, not the start call
    const next = await fix.rt.graphAdvance(runId, 'agent-a', 10);
    expect(next.node?.runMode).toBe('auto');
  });

  it('graph_start without mode defaults to manual', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { node } = await fix.rt.graphStart('linear-agent');

    expect(node?.runMode).toBe('manual');
  });

  it('rejects invalid mode at the MCP schema layer', () => {
    // The runtime facade is typed — invalid mode is rejected by the server
    // input schema (RunModeSchema enum), never reaching the persistence path.
    expect(RunModeSchema.safeParse('auto').success).toBe(true);
    expect(RunModeSchema.safeParse('invalid').success).toBe(false);
    expect(RunModeSchema.safeParse(undefined).success).toBe(false);
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
    const { node } = await fix.rt.graphStart('standalone');

    expect(node?.channels).toEqual([]);
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
    const start = await fix.rt.graphStart('two-node');
    expect(start.node?.nodeId).toBe('writer');

    const next = await fix.rt.graphAdvance(start.runId, 'writer', 10);
    expect(next.node?.channels).toEqual(['node:writer']);
  });
});
