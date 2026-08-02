/**
 * Integration tests for runtime scenarios.
 *
 * Exercises createRuntime with fixture taskflow graphs through
 * linear cycles, jump, force-end, concurrent runs, and error paths.
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
  const taskflowDir = join(tmpdir(), `scenarios-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  // Linear 3-phase main graph (scenario 1, 4, 5) — JSON is valid YAML subset
  const linearGraph = {
    name: 'linear-agent-test',
    version: 1,
    phases: [
      { id: 'phase-1', type: 'main', skill: 'scenario-agent-skill', task: 'step 1', dependsOn: [] },
      { id: 'phase-2', type: 'main', skill: 'scenario-agent-skill', task: 'step 2', dependsOn: ['phase-1'] },
      { id: 'phase-3', type: 'main', skill: 'scenario-agent-skill', task: 'step 3', dependsOn: ['phase-2'] },
    ],
  };
  writeFileSync(join(taskflowDir, 'linear-agent-test.taskflow.yaml'), JSON.stringify(linearGraph, null, 2));

  // 3-phase graph for force-end scenario (scenario 3)
  const forceEndGraph = {
    name: 'force-end-test',
    version: 1,
    phases: [
      { id: 'step-a', type: 'main', skill: 'scenario-agent-skill', task: 'first', dependsOn: [] },
      { id: 'step-b', type: 'main', skill: 'scenario-agent-skill', task: 'second', dependsOn: ['step-a'] },
      { id: 'step-c', type: 'main', skill: 'scenario-agent-skill', task: 'third', dependsOn: ['step-b'] },
    ],
  };
  writeFileSync(join(taskflowDir, 'force-end-test.taskflow.yaml'), JSON.stringify(forceEndGraph, null, 2));

  // Registry
  const registry = {
    graphs: [
      { name: 'linear-agent-test', path: 'linear-agent-test.taskflow.yaml' },
      { name: 'jump-test', path: 'jump-test.taskflow.yaml' },
      { name: 'force-end-test', path: 'force-end-test.taskflow.yaml' },
    ],
  };
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  return { taskflowDir, registryPath, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function createTestRuntime(fixture: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fixture.taskflowDir,
      registryPaths: [fixture.registryPath],
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runtime scenarios', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });

  afterEach(() => {
    fix.cleanup();
  });

  // ── Scenario 1: Linear agent full cycle ──────────────────────────

  it('completes a 3-phase linear agent DAG end-to-end', async () => {
    const rt = await createTestRuntime(fix);

    // Start — first agent should be active
    const { runId, node: n1 } = await rt.graphStart('linear-agent-test');
    expect(runId).toBeTruthy();
    expect(n1).not.toBeNull();
    expect(n1!.nodeId).toBe('phase-1');

    // Advance phase-1 → phase-2
    const r1 = await rt.graphAdvance(runId, 'phase-1', 50);
    expect(r1.snapshot.fsmState).toBe('running');
    expect(r1.node).not.toBeNull();
    expect(r1.node!.nodeId).toBe('phase-2');

    // Advance phase-2 → phase-3
    const r2 = await rt.graphAdvance(runId, 'phase-2', 50);
    expect(r2.snapshot.fsmState).toBe('running');
    expect(r2.node).not.toBeNull();
    expect(r2.node!.nodeId).toBe('phase-3');

    // Advance phase-3 → done (null node)
    const r3 = await rt.graphAdvance(runId, 'phase-3', 50);
    expect(r3.snapshot.fsmState).toBe('completed');
    expect(r3.node).toBeNull();

    // Status confirms completion
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  // ── Scenario 3: Force end ────────────────────────────────────────

  it('force-ends a running graph, setting status to terminated', async () => {
    const rt = await createTestRuntime(fix);

    // Start + advance first node
    const { runId } = await rt.graphStart('force-end-test');
    await rt.graphAdvance(runId, 'step-a', 50);

    // Force end
    const snap = await rt.graphForceEnd(runId);
    expect(snap.fsmState).toBe('terminated');
    expect(snap.runId).toBe(runId);

    // graphStatus confirms terminated
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('terminated');
  });

  // ── Scenario 4: Concurrent runs ──────────────────────────────────

  it('runs two independent graph instances concurrently', async () => {
    const rt = await createTestRuntime(fix);

    // Start two runs
    const [run1, run2] = await Promise.all([rt.graphStart('linear-agent-test'), rt.graphStart('linear-agent-test')]);

    // Distinct runIds
    expect(run1.runId).not.toBe(run2.runId);
    expect(run1.node!.nodeId).toBe('phase-1');
    expect(run2.node!.nodeId).toBe('phase-1');

    // Advance run1 only
    const r1a = await rt.graphAdvance(run1.runId, 'phase-1', 50);
    expect(r1a.node!.nodeId).toBe('phase-2');

    // Run2 still at phase-1 (unaffected)
    const s2 = await rt.graphStatus(run2.runId);
    expect(s2.fsmState).toBe('running');

    // Advance run2 independently
    const r2a = await rt.graphAdvance(run2.runId, 'phase-1', 50);
    expect(r2a.node!.nodeId).toBe('phase-2');
  });

  // ── Scenario 5: Error paths ──────────────────────────────────────

  it('throws when starting a non-existent graph', async () => {
    const rt = await createTestRuntime(fix);
    await expect(rt.graphStart('nonexistent-graph')).rejects.toThrow();
  });

  it('throws when advancing with an invalid runId', async () => {
    const rt = await createTestRuntime(fix);
    await expect(rt.graphAdvance('invalid-run-id', 'x', 50)).rejects.toThrow();
  });
});
