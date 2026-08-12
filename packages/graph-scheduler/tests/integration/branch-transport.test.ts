/**
 * Integration tests for the gate jump transport seam (route-first redesign).
 *
 * Exercises graph_advance(runId, nodeId, branchTo, endRun) through the
 * SchedulerRuntime facade. Verifies:
 *  - gate pass-through (absent branchTo) → downstream dispatched next
 *  - gate branchTo targeting a terminal upstream node → JUMP reset (retryCount increment)
 *  - run completes by natural drain when the final node completes (no end node)
 *  - gate NodeDetail carries jumps; no reads/branches/default/routing (reads
 *    removed — judgment context auto-injects from direct dependsOn outputs)
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface Fixture {
  taskflowDir: string;
  registryPath: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `branch-transport-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  // Gate pass-through graph — seed → gate (backward jump to seed) → alpha; no end node
  const passGraph = {
    name: 'pass-test',

    phases: [
      { id: 'seed', type: 'main', skill: 'scenario-agent-skill', task: 'decide source', dependsOn: [], operations: [] },
      {
        id: 'gate',
        type: 'gate',
        dependsOn: ['seed'],
        jumps: [{ when: 'seed output shows source: bad AND seed retryCount < 2', to: 'seed' }],
      },
      {
        id: 'alpha',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'alpha track',
        dependsOn: ['gate'],
        operations: [],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'pass-test.taskflow.yaml'), JSON.stringify(passGraph, null, 2));

  // Rework graph — gate retry jump targets the terminal upstream writer
  // (JUMP reset path): writer → review → gate (jump to writer) → accept; no end node
  const reworkGraph = {
    name: 'rework-test',

    phases: [
      { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'write', dependsOn: [], operations: [] },
      {
        id: 'review',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'review',
        dependsOn: ['writer'],
        operations: [],
      },
      {
        id: 'gate',
        type: 'gate',
        dependsOn: ['review'],
        jumps: [{ when: 'review output shows overall: fail AND writer retryCount < 2', to: 'writer' }],
      },
      {
        id: 'accept',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'accept',
        dependsOn: ['gate'],
        operations: [],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'rework-test.taskflow.yaml'), JSON.stringify(reworkGraph, null, 2));

  const registry = {
    graphs: [
      { name: 'pass-test', path: 'pass-test.taskflow.yaml' },
      { name: 'rework-test', path: 'rework-test.taskflow.yaml' },
    ],
  };
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  return { taskflowDir, registryPath, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

function createTestRuntime(fixture: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fixture.taskflowDir,
      registryPaths: [fixture.registryPath],
      // context: [] — hermetic: ambient .graph-scheduler/config.json
      // (gitignored, cwd-dependent) must not leak into channel assertions.
      context: [],
    }),
  );
}

function nodeStatus(snapshot: { nodes: ReadonlyArray<{ nodeId: string; status: string }> }, nodeId: string): string {
  const n = snapshot.nodes.find((n) => n.nodeId === nodeId);
  return n?.status ?? 'missing';
}

/** Start a run (mode auto) — runs start directly at author nodes. */
async function startSkippingPrologue(
  rt: SchedulerRuntime,
  graphName: string,
): Promise<{ runId: string; node: { nodeId: string; retryCount: number } | null }> {
  const start = await rt.graphStart(graphName, { mode: 'auto' });
  return { runId: start.runId, node: start.node };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

describe('gate jump transport seam', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('gate NodeDetail carries jumps — no reads/branches/default/routing', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await startSkippingPrologue(rt, 'pass-test');
    expect(n1!.nodeId).toBe('seed');

    // seed → gate
    const r1 = await rt.graphAdvance(runId, 'seed');
    expect(r1.node!.nodeId).toBe('gate');
    expect(r1.node!.type).toBe('gate');
    expect(r1.node!.jumps).toHaveLength(1);
    expect(r1.node!.jumps![0].to).toBe('seed');
    // reads removed (schema field convergence) — judgment context auto-injects
    // from the direct dependsOn output (seed); gate NodeDetail carries the
    // effective channels (convention layer default-loaded; no phase-level
    // channels declared in the fixture)
    expect(r1.node!.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);
    // no branches/default/routing on gate NodeDetail
    expect(r1.node!.routingActions).toBeUndefined();

    await rt.dispose();
  });

  it('absent branchTo passes through the gate — downstream dispatched next', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'pass-test');
    await rt.graphAdvance(runId, 'seed');

    // No branchTo — no jump hit, gate passes through to downstream
    const r = await rt.graphAdvance(runId, 'gate');
    expect(r.node!.nodeId).toBe('alpha');
    expect(nodeStatus(r.snapshot, 'alpha')).toBe('active');

    await rt.dispose();
  });

  it('branchTo to a terminal upstream node triggers JUMP reset with retryCount increment', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await startSkippingPrologue(rt, 'rework-test');
    expect(n1!.nodeId).toBe('writer');

    // writer → review → gate
    const r1 = await rt.graphAdvance(runId, 'writer');
    expect(r1.node!.nodeId).toBe('review');
    const r2 = await rt.graphAdvance(runId, 'review');
    expect(r2.node!.nodeId).toBe('gate');

    // Gate rework decision → branchTo 'writer' (done, ENTRY node) → JUMP reset:
    // writer re-activated with retryCount 1, review + gate reset — the entry
    // re-dispatches directly (no prologue prefix).
    const r3 = await rt.graphAdvance(runId, 'gate', 'writer');
    expect(r3.node!.nodeId).toBe('writer');
    expect(r3.node!.retryCount).toBe(1);
    expect(nodeStatus(r3.snapshot, 'writer')).toBe('active');
    expect(r3.snapshot.nodes.find((n) => n.nodeId === 'writer')?.retryCount).toBe(1);
    expect(nodeStatus(r3.snapshot, 'review')).toBe('pending');
    expect(nodeStatus(r3.snapshot, 'gate')).toBe('pending');

    await rt.dispose();
  });

  it('run completes by natural drain — final node completion, node null', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'pass-test');

    // seed → gate → alpha — alpha is the last node; its completion drains the run
    await rt.graphAdvance(runId, 'seed');
    await rt.graphAdvance(runId, 'gate');
    const r1 = await rt.graphAdvance(runId, 'alpha');
    expect(r1.snapshot.fsmState).toBe('completed');
    expect(r1.node).toBeNull();
    // no skip state exists — statuses are only pending/done/active/aborted
    for (const n of r1.snapshot.nodes) {
      expect(['pending', 'active', 'done', 'aborted']).toContain(n.status);
    }

    await rt.dispose();
  });

  it('rework graph completes via pass-through after bounded retry', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'rework-test');

    // Round 1 with one rework loop — the gate jump to the ENTRY re-runs it
    await rt.graphAdvance(runId, 'writer');
    await rt.graphAdvance(runId, 'review');
    const jump = await rt.graphAdvance(runId, 'gate', 'writer'); // JUMP reset — retryCount 1
    expect(jump.node!.nodeId).toBe('writer');
    expect(nodeStatus(jump.snapshot, 'writer')).toBe('active');

    // Round 2 — gate no-match (pass-through) → accept → drain complete
    await rt.graphAdvance(runId, 'writer');
    await rt.graphAdvance(runId, 'review');
    const r2 = await rt.graphAdvance(runId, 'gate'); // no branchTo → pass-through
    expect(r2.node!.nodeId).toBe('accept');

    const r3 = await rt.graphAdvance(runId, 'accept');
    expect(r3.snapshot.fsmState).toBe('completed');
    expect(r3.node).toBeNull();

    await rt.dispose();
  });
});
