/**
 * e2e-minimal rework-edge runtime coverage — the flow condition channel
 * (backward labeled edge) is driven through the REAL runtime (graph_start →
 * graph_advance with the condition channel), asserting the transition table
 * re-enters the round body head with retryCount incremented (never zeroed),
 * then the run drains on accept.
 *
 * This is a runtime test of the flow condition channel — not a static
 * flow-content assertion. Mirrors the openspec-apply rework scenario
 * (scenarios.test.ts) for e2e-minimal's own edge.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  registryPath: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `e2e-minimal-rework-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });
  // Empty project registry — the builtin registry is the low-priority
  // default, so the real builtin e2e-minimal resolves.
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify({ graphs: [] }, null, 2));
  return { taskflowDir, registryPath, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

function createTestRuntime(fixture: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fixture.taskflowDir,
      registryPaths: [fixture.registryPath],
      context: [],
    }),
  );
}

/** Read a node's status + retryCount from the FULL snapshot (graph_status). */
async function nodeState(
  rt: SchedulerRuntime,
  runId: string,
  nodeId: string,
): Promise<{ status: string; retryCount: number }> {
  const snapshot = await rt.graphStatus(runId);
  const n = snapshot.nodes!.find((n) => n.nodeId === nodeId);
  return { status: n?.status ?? 'missing', retryCount: n?.retryCount ?? -1 };
}

describe('e2e-minimal rework edge — runtime coverage (real builtin graph)', () => {
  let fix: Fixture;
  let rt: SchedulerRuntime;

  beforeEach(async () => {
    fix = makeFixture();
    rt = await createTestRuntime(fix);
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('approval-review -->|rework| agent-echo re-enters the round body head with retryCount incremented, then drains on accept', async () => {
    // Start — agent-echo dispatches first (entry node).
    const start = await rt.graphStart('e2e-minimal', { mode: 'auto' });
    expect(start.node?.nodeId).toBe('agent-echo');

    // agent-echo → approval-review (the inlined round chain).
    const r1 = await rt.graphAdvance(start.runId, 'agent-echo');
    expect(r1.node!.nodeId).toBe('approval-review');

    // Review reports 'rework' → the backward labeled flow edge re-enters
    // agent-echo (the round body head) — rework is a condition-matched
    // transition, never a jump reset.
    const reentry = await rt.graphAdvance(start.runId, 'approval-review', undefined, 'rework');
    expect(reentry.node!.nodeId).toBe('agent-echo');
    expect((await nodeState(rt, start.runId, 'agent-echo')).status).toBe('active');
    expect((await nodeState(rt, start.runId, 'agent-echo')).retryCount).toBe(1);

    // Second round — agent-echo → approval-review.
    const r2 = await rt.graphAdvance(start.runId, 'agent-echo');
    expect(r2.node!.nodeId).toBe('approval-review');

    // Review accepts (no condition) → the round completes; the synthesized
    // `__handoff` terminal activates — ONE more advance drains the graph.
    const r3 = await rt.graphAdvance(start.runId, 'approval-review');
    expect(r3.node!.nodeId).toBe('__handoff');
    expect(r3.snapshot.fsmState).toBe('running');

    const r4 = await rt.graphAdvance(start.runId, '__handoff');
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();
  });

  it('a missed condition on approval-review fails loudly (missed-condition guard)', async () => {
    const { runId } = await rt.graphStart('e2e-minimal', { mode: 'auto' });
    await rt.graphAdvance(runId, 'agent-echo');
    await expect(rt.graphAdvance(runId, 'approval-review', undefined, 'nonsense')).rejects.toThrow(
      /missed-condition guard/,
    );
    await rt.graphForceEnd(runId);
  });
});
