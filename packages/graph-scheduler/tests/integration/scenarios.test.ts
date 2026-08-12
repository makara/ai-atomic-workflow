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

  // Linear 3-phase main graph (scenario 1, 4, 5) — JSON is valid YAML subset; no end node (drain)
  const linearGraph = {
    name: 'linear-agent-test',

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
      {
        id: 'phase-3',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'step 3',
        dependsOn: ['phase-2'],
        operations: [],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'linear-agent-test.taskflow.yaml'), JSON.stringify(linearGraph, null, 2));

  // 3-phase graph for force-end scenario (scenario 3)
  const forceEndGraph = {
    name: 'force-end-test',

    phases: [
      { id: 'step-a', type: 'main', skill: 'scenario-agent-skill', task: 'first', dependsOn: [], operations: [] },
      {
        id: 'step-b',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'second',
        dependsOn: ['step-a'],
        operations: [],
      },
      {
        id: 'step-c',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'third',
        dependsOn: ['step-b'],
        operations: [],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'force-end-test.taskflow.yaml'), JSON.stringify(forceEndGraph, null, 2));

  // Gate+approval pair graph (scenario 6) — machine gate before human card; no end node
  const gatePairGraph = {
    name: 'gate-pair-test',

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
        id: 'auto-gate',
        type: 'gate',
        dependsOn: ['review'],
        jumps: [{ when: 'review output shows overall: fail AND writer retryCount < 2', to: 'writer' }],
      },
      { id: 'accept', type: 'approval', dependsOn: ['auto-gate'] },
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

/** Return the active node (no prefix exists — runs start at author nodes). */
async function advanceThroughPrologue(
  rt: SchedulerRuntime,
  runId: string,
): Promise<{ nodeId: string; retryCount: number } | null> {
  const status = await rt.graphStatus(runId);
  const active = status.nodes.find((n) => n.status === 'active');
  return active ? { nodeId: active.nodeId, retryCount: active.retryCount } : null;
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

    // Start — first author node dispatches directly (no activation prefix)
    const { runId, node: n0 } = await rt.graphStart('linear-agent-test', { mode: 'auto' });
    expect(runId).toBeTruthy();
    expect(n0).not.toBeNull();
    expect(n0!.nodeId).toBe('phase-1');

    // Advance phase-1 → phase-2
    const r1 = await rt.graphAdvance(runId, 'phase-1');
    expect(r1.snapshot.fsmState).toBe('running');
    expect(r1.node).not.toBeNull();
    expect(r1.node!.nodeId).toBe('phase-2');

    // Advance phase-2 → phase-3
    const r2 = await rt.graphAdvance(runId, 'phase-2');
    expect(r2.snapshot.fsmState).toBe('running');
    expect(r2.node).not.toBeNull();
    expect(r2.node!.nodeId).toBe('phase-3');

    // Advance phase-3 → run drains (final node) — completed, no end marker
    const r3 = await rt.graphAdvance(runId, 'phase-3');
    expect(r3.snapshot.fsmState).toBe('completed');
    expect(r3.node).toBeNull();

    // Status confirms completion
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  // ── Scenario 6: Gate+approval pair — gate dispatch, jump payload, JUMP retry ──

  it('runs gate+approval pair: gate carries jumps, branchTo resets retryCount', async () => {
    const rt = await createTestRuntime(fix);

    // Start — first author node dispatches directly (no activation prefix)
    const { runId, node: n0 } = await rt.graphStart('gate-pair-test', { mode: 'auto' });
    expect(n0!.nodeId).toBe('writer');
    const n1 = n0;

    // writer → review
    const r1 = await rt.graphAdvance(runId, 'writer');
    expect(r1.node!.nodeId).toBe('review');

    // review → gate (not approval — machine judge first)
    const r2 = await rt.graphAdvance(runId, 'review');
    const gateNode = r2.node!;
    expect(gateNode.nodeId).toBe('auto-gate');
    expect(gateNode.type).toBe('gate');
    // Gate NodeDetail carries jumps (route-first redesign — eval/branches/default removed)
    expect(gateNode.jumps).toBeDefined();
    expect(gateNode.jumps!.length).toBe(1);
    expect(gateNode.jumps![0].to).toBe('writer');
    expect(gateNode.routingActions).toBeUndefined();
    expect(gateNode.retryCount).toBe(0);

    // Gate no-match (absent branchTo) → passes through to paired approval (human card)
    const r3 = await rt.graphAdvance(runId, 'auto-gate');
    expect(r3.node!.nodeId).toBe('accept');
    expect(r3.node!.type).toBe('approval');
    // Route-first: no written actions — card = Accept + free input + AI options
    expect(r3.node!.routingActions).toBeUndefined();

    // Jump back to the gate (rework decision, mid-graph target — NOT the entry)
    // — JUMP resets target + downstream terminals; upstream is untouched.
    const j = await rt.graphJump(runId, 'auto-gate');
    expect(j.node!.nodeId).toBe('auto-gate');
    expect(j.node!.retryCount).toBe(1);
    expect(j.snapshot.nodes.find((n) => n.nodeId === 'auto-gate')?.retryCount).toBe(1);
    expect(j.snapshot.nodes.find((n) => n.nodeId === 'accept')?.retryCount).toBe(1);

    // Gate re-enters (retryCount 1) → branchTo=writer (terminal upstream, ENTRY)
    // → JUMP reset — the entry re-dispatches directly with its retry visible.
    const retry = await rt.graphAdvance(runId, 'auto-gate', 'writer');
    expect(retry.node!.nodeId).toBe('writer');
    expect(retry.node!.retryCount).toBe(1);
    expect(retry.snapshot.nodes.find((n) => n.nodeId === 'auto-gate')?.retryCount).toBe(2);
    expect(retry.snapshot.nodes.find((n) => n.nodeId === 'writer')?.status).toBe('active');
    const w1 = retry;

    // Re-run upstream chain → gate → pass-through → paired approval re-armed
    const w3 = await rt.graphAdvance(runId, 'writer');
    expect(w3.node!.nodeId).toBe('review');
    const rv3 = await rt.graphAdvance(runId, 'review');
    expect(rv3.node!.nodeId).toBe('auto-gate');
    expect(rv3.node!.retryCount).toBe(2);
    const r5 = await rt.graphAdvance(runId, 'auto-gate');
    expect(r5.node!.nodeId).toBe('accept');
    // accept was reset once (first JUMP closure); the second reset skipped it
    // (already pending) — its own counter stays 1
    expect(r5.node!.retryCount).toBe(1);

    // Approval continue (no branchTo) → drain: accept is the final node
    const r4 = await rt.graphAdvance(runId, 'accept');
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();
  });

  // ── Scenario 7: openspec-apply — gate auto-rework loop (real built-in graph) ──

  it('openspec-apply: fail → change-gate branchTo retries apply-change → pass → human card', async () => {
    const rt = await createTestRuntime(fix);

    // Start — first author node dispatches directly (no activation prefix)
    const { runId, node: n0 } = await rt.graphStart('openspec-apply', { mode: 'auto' });
    expect(n0!.nodeId).toBe('apply-change');
    const n1 = n0;

    // apply-change → change-review
    const r1 = await rt.graphAdvance(runId, 'apply-change');
    expect(r1.node!.nodeId).toBe('change-review');

    // change-review → change-gate (machine judge first — not the human card)
    const r2 = await rt.graphAdvance(runId, 'change-review');
    const gate = r2.node!;
    expect(gate.nodeId).toBe('change-gate');
    expect(gate.type).toBe('gate');
    expect(gate.jumps).toHaveLength(1);
    expect(gate.jumps![0].to).toBe('apply-change');

    // Gate retry decision → branchTo apply-change (terminal upstream, ENTRY) →
    // JUMP reset — the entry re-dispatches directly with retry visible.
    const j = await rt.graphAdvance(runId, 'change-gate', 'apply-change');
    expect(j.node!.nodeId).toBe('apply-change');
    expect(j.node!.retryCount).toBe(1);
    expect(j.snapshot.nodes.find((n) => n.nodeId === 'change-gate')?.retryCount).toBe(1);
    const w1 = j;

    // Re-run: apply-change → change-review → change-gate (retryCount now 1)
    const w2 = await rt.graphAdvance(runId, 'apply-change');
    expect(w2.node!.nodeId).toBe('change-review');
    const rv2 = await rt.graphAdvance(runId, 'change-review');
    expect(rv2.node!.nodeId).toBe('change-gate');
    expect(rv2.node!.retryCount).toBe(1);

    // Bound trip: second rework branchTo → gate retryCount = 2 — branch condition
    // 'apply-change retryCount < 2' deterministically false → agent picks default → human card again
    const j2 = await rt.graphAdvance(runId, 'change-gate', 'apply-change');
    expect(j2.node!.nodeId).toBe('apply-change');
    expect(j2.node!.retryCount).toBe(2);
    const w3 = j2;
    const rv3 = await rt.graphAdvance(runId, 'apply-change');
    expect(rv3.node!.nodeId).toBe('change-review');
    const rv3b = await rt.graphAdvance(runId, 'change-review');
    expect(rv3b.node!.nodeId).toBe('change-gate');
    expect(rv3b.node!.retryCount).toBe(2);
    // Gate no-match (absent branchTo) → falls through default to human approval card
    const r3 = await rt.graphAdvance(runId, 'change-gate');
    const accept = r3.node!;
    expect(accept.nodeId).toBe('change-accept');
    expect(accept.type).toBe('approval');
    // Route-first: no written actions — card = Accept + free input + AI options
    expect(accept.routingActions).toBeUndefined();

    // Human continue → archive (plain, openspec-archive-change) → graph drains
    // (no post-archive doc-maintenance flow — doc-update deleted)
    const r4 = await rt.graphAdvance(runId, 'change-accept');
    expect(r4.node!.nodeId).toBe('archive');
    const r5 = await rt.graphAdvance(runId, 'archive');
    expect(r5.snapshot.fsmState).toBe('completed');
    expect(r5.node).toBeNull();
  });

  // ── Scenario 3: Force end ────────────────────────────────────────

  it('force-ends a running graph, setting status to terminated', async () => {
    const rt = await createTestRuntime(fix);

    // Start + advance to the first author node
    const { runId } = await rt.graphStart('force-end-test', { mode: 'auto' });
    await rt.graphAdvance(runId, 'step-a');

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

    // Start two runs — both dispatch their first author node directly
    const [run1, run2] = await Promise.all([
      rt.graphStart('linear-agent-test', { mode: 'auto' }),
      rt.graphStart('linear-agent-test', { mode: 'auto' }),
    ]);

    // Distinct runIds
    expect(run1.runId).not.toBe(run2.runId);
    expect(run1.node!.nodeId).toBe('phase-1');
    expect(run2.node!.nodeId).toBe('phase-1');

    // Advance run1 only
    const r1a = await rt.graphAdvance(run1.runId, 'phase-1');
    expect(r1a.node!.nodeId).toBe('phase-2');

    // Run2 still at phase-1 (unaffected)
    const s2 = await rt.graphStatus(run2.runId);
    expect(s2.fsmState).toBe('running');

    // Advance run2 independently
    const r2a = await rt.graphAdvance(run2.runId, 'phase-1');
    expect(r2a.node!.nodeId).toBe('phase-2');
  });

  // ── Scenario 5: Error paths ──────────────────────────────────────

  it('throws when starting a non-existent graph', async () => {
    const rt = await createTestRuntime(fix);
    await expect(rt.graphStart('nonexistent-graph', { mode: 'auto' })).rejects.toThrow();
  });

  it('throws when advancing with an invalid runId', async () => {
    const rt = await createTestRuntime(fix);
    await expect(rt.graphAdvance('invalid-run-id', 'x')).rejects.toThrow();
  });
});
