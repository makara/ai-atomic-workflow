/**
 * Integration tests for runtime scenarios.
 *
 * Exercises createRuntime with fixture taskflow graphs through
 * linear cycles, jump, force-end, concurrent runs, and error paths.
 */
import { Effect } from 'effect';
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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

  // Gate+approval pair graph (scenario 6) — machine gate before human card
  const gatePairGraph = {
    name: 'gate-pair-test',
    version: 1,
    phases: [
      { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'write', dependsOn: [] },
      { id: 'review', type: 'main', skill: 'scenario-agent-skill', task: 'review', dependsOn: ['writer'] },
      {
        id: 'auto-gate',
        type: 'gate',
        dependsOn: ['review'],
        eval: [
          {
            when: 'review output shows overall: fail AND retryAttempt < 2',
            action: 'retry',
            target: 'writer',
            note: 'auto: fix and re-review',
          },
        ],
      },
      {
        id: 'accept',
        type: 'approval',
        dependsOn: ['auto-gate'],
        routing: {
          actions: [{ action: 'continue', label: 'Accept', description: 'Approve' }],
        },
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'gate-pair-test.taskflow.yaml'), JSON.stringify(gatePairGraph, null, 2));

  // Built-in openspec-apply graph (scenario 7) — real gate+approval pair, mid-chain rework
  const builtinRoot = join(__dirname, '..', '..', 'graphs');
  copyFileSync(join(builtinRoot, 'openspec-apply.taskflow.yaml'), join(taskflowDir, 'openspec-apply.taskflow.yaml'));

  // Registry
  const registry = {
    graphs: [
      { name: 'linear-agent-test', path: 'linear-agent-test.taskflow.yaml' },
      { name: 'jump-test', path: 'jump-test.taskflow.yaml' },
      { name: 'force-end-test', path: 'force-end-test.taskflow.yaml' },
      { name: 'gate-pair-test', path: 'gate-pair-test.taskflow.yaml' },
      { name: 'openspec-apply', path: 'openspec-apply.taskflow.yaml' },
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

  // ── Scenario 6: Gate+approval pair — gate dispatch, eval payload, jump retry ──

  it('runs gate+approval pair: gate carries eval, jump to gate increments retryCount', async () => {
    const rt = await createTestRuntime(fix);

    // Start — writer first
    const { runId, node: n1 } = await rt.graphStart('gate-pair-test');
    expect(n1!.nodeId).toBe('writer');

    // writer → review
    const r1 = await rt.graphAdvance(runId, 'writer', 50);
    expect(r1.node!.nodeId).toBe('review');

    // review → gate (not approval — machine judge first)
    const r2 = await rt.graphAdvance(runId, 'review', 50);
    const gateNode = r2.node!;
    expect(gateNode.nodeId).toBe('auto-gate');
    expect(gateNode.type).toBe('gate');
    // Gate NodeDetail carries eval — machine decision payload
    expect(gateNode.eval).toBeDefined();
    expect(gateNode.eval!.length).toBe(1);
    expect(gateNode.eval![0].action).toBe('retry');
    expect(gateNode.eval![0].target).toBe('writer');
    expect(gateNode.routingActions).toBeUndefined();
    expect(gateNode.retryAttempt).toBe(0);

    // Gate no-match → advance lands on paired approval (human card)
    const r3 = await rt.graphAdvance(runId, 'auto-gate', 50);
    expect(r3.node!.nodeId).toBe('accept');
    expect(r3.node!.type).toBe('approval');
    expect(r3.node!.routingActions).toBeDefined();

    // Jump back to the gate (rework decision) — resets gate + upstream closure;
    // first ready node is topo-first pending (writer). retryCount increments (bounded rework).
    const j = await rt.graphJump(runId, 'auto-gate');
    expect(j.node!.nodeId).toBe('writer');
    expect(j.snapshot.nodes.find((n) => n.nodeId === 'auto-gate')?.retryCount).toBe(1);

    // Re-run upstream chain → gate re-enters with retryAttempt = 1 (bound context)
    const w2 = await rt.graphAdvance(runId, 'writer', 50);
    expect(w2.node!.nodeId).toBe('review');
    const rv2 = await rt.graphAdvance(runId, 'review', 50);
    expect(rv2.node!.nodeId).toBe('auto-gate');
    expect(rv2.node!.retryAttempt).toBe(1);

    // Gate completes again → paired approval re-armed
    const r5 = await rt.graphAdvance(runId, 'auto-gate', 50);
    expect(r5.node!.nodeId).toBe('accept');
    expect(r5.node!.retryAttempt).toBe(1);

    // Approval continue → graph completes
    const r4 = await rt.graphAdvance(runId, 'accept', 50);
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();
  });

  // ── Scenario 7: openspec-apply — gate auto-rework loop (real built-in graph) ──

  it('openspec-apply: fail → change-gate retry jumps to apply-change → pass → human card', async () => {
    const rt = await createTestRuntime(fix);

    const { runId, node: n1 } = await rt.graphStart('openspec-apply');
    expect(n1!.nodeId).toBe('apply-change');

    // apply-change → change-review
    const r1 = await rt.graphAdvance(runId, 'apply-change', 100);
    expect(r1.node!.nodeId).toBe('change-review');

    // change-review → change-gate (machine judge first — not the human card)
    const r2 = await rt.graphAdvance(runId, 'change-review', 100);
    const gate = r2.node!;
    expect(gate.nodeId).toBe('change-gate');
    expect(gate.type).toBe('gate');
    expect(gate.eval).toHaveLength(1);
    expect(gate.eval![0].target).toBe('apply-change');

    // Gate eval MATCHES (agent-side judgment) → auto retry: jump to apply-change
    // retryAttempt 0→1, upstream closure (apply-change) reset — first node is the writer
    const j = await rt.graphJump(runId, 'apply-change');
    expect(j.node!.nodeId).toBe('apply-change');
    expect(j.node!.retryAttempt).toBe(1);
    expect(j.snapshot.nodes.find((n) => n.nodeId === 'change-gate')?.retryCount).toBe(1);

    // Re-run: apply-change → change-review → change-gate (retryAttempt now 1)
    const w2 = await rt.graphAdvance(runId, 'apply-change', 100);
    expect(w2.node!.nodeId).toBe('change-review');
    const rv2 = await rt.graphAdvance(runId, 'change-review', 100);
    expect(rv2.node!.nodeId).toBe('change-gate');
    expect(rv2.node!.retryAttempt).toBe(1);

    // Gate no-match → falls through to human approval card
    const r3 = await rt.graphAdvance(runId, 'change-gate', 100);
    const accept = r3.node!;
    expect(accept.nodeId).toBe('change-accept');
    expect(accept.type).toBe('approval');
    expect(accept.routingActions).toBeDefined();
    expect(accept.eval).toBeUndefined();

    // Bound trip: second rework jump → gate retryAttempt = 2 — eval condition
    // 'retryAttempt < 2' deterministically false → no-match → human card again
    const j2 = await rt.graphJump(runId, 'apply-change');
    expect(j2.node!.retryAttempt).toBe(2);
    const w3 = await rt.graphAdvance(runId, 'apply-change', 100);
    expect(w3.node!.nodeId).toBe('change-review');
    const rv3 = await rt.graphAdvance(runId, 'change-review', 100);
    expect(rv3.node!.nodeId).toBe('change-gate');
    expect(rv3.node!.retryAttempt).toBe(2);
    const r6 = await rt.graphAdvance(runId, 'change-gate', 100);
    expect(r6.node!.nodeId).toBe('change-accept');

    // Human continue → archive → complete
    const r4 = await rt.graphAdvance(runId, 'change-accept', 100);
    expect(r4.node!.nodeId).toBe('archive');
    const r5 = await rt.graphAdvance(runId, 'archive', 100);
    expect(r5.snapshot.fsmState).toBe('completed');
    expect(r5.node).toBeNull();
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
