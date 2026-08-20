/**
 * Integration tests for runtime scenarios.
 *
 * Exercises createRuntime with fixture workflow graphs through
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
  writeFileSync(join(taskflowDir, 'linear-agent-test.yaml'), JSON.stringify(linearGraph, null, 2));

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
  writeFileSync(join(taskflowDir, 'force-end-test.yaml'), JSON.stringify(forceEndGraph, null, 2));

  // Rework+decision pair graph (scenario 6) — machine rework decision before
  // human card; no end node
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
        type: 'main',
        dependsOn: ['review'],
        operations: [],
        task: 'Rework decision — IF review output shows overall: fail AND writer retryCount < 2 the decision output carries the rework target writer; ELSE no target.',
      },
      { id: 'accept', type: 'main', task: 'OK?', dependsOn: ['auto-gate'], operations: [] },
    ],
  };
  writeFileSync(join(taskflowDir, 'gate-pair-test.yaml'), JSON.stringify(gatePairGraph, null, 2));

  // Built-in openspec-apply graph (scenario 7) — apply + review round inlined
  // (flow self-edge change-review -->|fail| apply-change)
  const builtinRoot = join(__dirname, '..', '..', 'graphs');
  copyFileSync(join(builtinRoot, 'openspec-apply.yaml'), join(taskflowDir, 'openspec-apply.yaml'));

  // Registry
  const registry = {
    graphs: [
      { name: 'linear-agent-test', path: 'linear-agent-test.yaml' },
      { name: 'jump-test', path: 'jump-test.yaml' },
      { name: 'force-end-test', path: 'force-end-test.yaml' },
      { name: 'gate-pair-test', path: 'gate-pair-test.yaml' },
      { name: 'openspec-apply', path: 'openspec-apply.yaml' },
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

  it('completes a 3-phase linear agent graph end-to-end', async () => {
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

    // Advance phase-3 → the synthesized `__handoff` terminal activates
    // (phase-3 is the last SOURCE node); ONE more advance drains the run —
    // completed, no end marker
    const r3 = await rt.graphAdvance(runId, 'phase-3');
    expect(r3.snapshot.fsmState).toBe('running');
    expect(r3.node!.nodeId).toBe('__handoff');
    const r4 = await rt.graphAdvance(runId, '__handoff');
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();

    // Status confirms completion
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  // ── Scenario 6: rework+approval pair — rework dispatch, task-text condition, JUMP retry ──

  it('runs rework+approval pair: task-text condition, graph_jump resets retryCount', async () => {
    const rt = await createTestRuntime(fix);

    // Start — first author node dispatches directly (no activation prefix)
    const { runId, node: n0 } = await rt.graphStart('gate-pair-test', { mode: 'auto' });
    expect(n0!.nodeId).toBe('writer');
    const n1 = n0;

    // writer → review
    const r1 = await rt.graphAdvance(runId, 'writer');
    expect(r1.node!.nodeId).toBe('review');

    // review → rework decision (not approval — machine decision first)
    const r2 = await rt.graphAdvance(runId, 'review');
    const gateNode = r2.node!;
    expect(gateNode.nodeId).toBe('auto-gate');
    expect(gateNode.type).toBe('main');
    // The rework condition lives in task text (route-first redesign —
    // eval/branches/default removed)
    expect(String(gateNode.task)).toMatch(/overall: fail AND writer retryCount < 2/);
    expect(String(gateNode.task)).toMatch(/writer/);
    expect('routingActions' in gateNode).toBe(false);
    expect(gateNode.retryCount).toBe(0);

    // Gate no-match (no branch parameter — plain continue) → passes through to paired decision (human card)
    const r3 = await rt.graphAdvance(runId, 'auto-gate');
    expect(r3.node!.nodeId).toBe('accept');
    expect(r3.node!.type).toBe('main');
    // No written actions — card = Accept + free input + AI options
    expect('routingActions' in r3.node!).toBe(false);

    // Jump back to the gate (rework decision, mid-graph target — NOT the entry)
    // — JUMP resets target + done downstream; the interrupted node
    // executing the jump (accept) closes as done without a retry bump.
    const j = await rt.graphJump(runId, 'auto-gate');
    expect(j.node!.nodeId).toBe('auto-gate');
    expect(j.node!.retryCount).toBe(1);
    const statusJ = await rt.graphStatus(runId);
    expect(statusJ.nodes!.find((n) => n.nodeId === 'auto-gate')?.retryCount).toBe(1);
    expect(statusJ.nodes!.find((n) => n.nodeId === 'accept')?.status).toBe('done');
    expect(statusJ.nodes!.find((n) => n.nodeId === 'accept')?.retryCount).toBe(0);

    // Gate re-enters (retryCount 1) → operator jump to writer (terminal
    // upstream, ENTRY) → JUMP reset — the entry re-dispatches directly with
    // its retry visible. The decision node (auto-gate) closes as done — active
    // at reset time, so its counter is untouched; accept (done downstream of
    // writer) resets to 1.
    const retry = await rt.graphJump(runId, 'writer');
    expect(retry.node!.nodeId).toBe('writer');
    expect(retry.node!.retryCount).toBe(1);
    const statusRetry = await rt.graphStatus(runId);
    expect(statusRetry.nodes!.find((n) => n.nodeId === 'auto-gate')?.retryCount).toBe(1);
    expect(statusRetry.nodes!.find((n) => n.nodeId === 'writer')?.status).toBe('active');
    expect(statusRetry.nodes!.find((n) => n.nodeId === 'review')?.retryCount).toBe(1);
    expect(statusRetry.nodes!.find((n) => n.nodeId === 'accept')?.retryCount).toBe(1);
    const w1 = retry;

    // Re-run upstream chain → gate → pass-through → paired approval re-armed
    const w3 = await rt.graphAdvance(runId, 'writer');
    expect(w3.node!.nodeId).toBe('review');
    const rv3 = await rt.graphAdvance(runId, 'review');
    expect(rv3.node!.nodeId).toBe('auto-gate');
    expect(rv3.node!.retryCount).toBe(1);
    const r5 = await rt.graphAdvance(runId, 'auto-gate');
    expect(r5.node!.nodeId).toBe('accept');
    // accept was reset once (jump closure) — its own counter stays 1
    expect(r5.node!.retryCount).toBe(1);

    // Approval continue (no branchTo) → accept completes; the run hands off
    // to the synthesized `__handoff` terminal — ONE more advance drains it
    const r4 = await rt.graphAdvance(runId, 'accept');
    expect(r4.node!.nodeId).toBe('__handoff');
    expect(r4.snapshot.fsmState).toBe('running');
    const r6 = await rt.graphAdvance(runId, '__handoff');
    expect(r6.snapshot.fsmState).toBe('completed');
    expect(r6.node).toBeNull();
  });

  // ── Scenario 7: openspec-apply — apply+review round with flow self-edge rework (real built-in graph) ──

  it('openspec-apply: change-review -->|fail| apply-change re-enters the round; pass drains to archive (flow self-edge)', async () => {
    const rt = await createTestRuntime(fix);

    // Start — apply-change dispatches first (the round body is inlined; no
    // loop node launches a sibling body)
    const { runId, node: n0 } = await rt.graphStart('openspec-apply', { mode: 'auto' });
    expect(n0!.nodeId).toBe('apply-change');

    // apply-change → change-review (the inlined round chain)
    const r1 = await rt.graphAdvance(runId, 'apply-change');
    expect(r1.node!.nodeId).toBe('change-review');

    // Review reports 'fail' → the flow self-edge re-enters apply-change
    // (the round body head) — rework is a condition-matched transition,
    // never a sibling body run
    const reentry = await rt.graphAdvance(runId, 'change-review', undefined, 'fail');
    expect(reentry.node!.nodeId).toBe('apply-change');

    // apply-change again → change-review (second round)
    const r2 = await rt.graphAdvance(runId, 'apply-change');
    expect(r2.node!.nodeId).toBe('change-review');

    // Review passes (no condition) → the unlabeled flow edge routes to
    // archive; the synthesized `__handoff` terminal activates — ONE more
    // advance drains the graph
    const r3 = await rt.graphAdvance(runId, 'change-review');
    expect(r3.node!.nodeId).toBe('archive');
    const r4 = await rt.graphAdvance(runId, 'archive');
    expect(r4.node!.nodeId).toBe('__handoff');
    expect(r4.snapshot.fsmState).toBe('running');
    const r5 = await rt.graphAdvance(runId, '__handoff');
    expect(r5.snapshot.fsmState).toBe('completed');
    expect(r5.node).toBeNull();
  });

  // ── Scenario 3: Force end ────────────────────────────────────────

  it('force-ends a running graph, setting status to terminated', async () => {
    const rt = await createTestRuntime(fix);

    // Start + advance to the first author node
    const { runId } = await rt.graphStart('force-end-test', { mode: 'auto' });
    await rt.graphAdvance(runId, 'step-a');

    // Force end — unified envelope { snapshot, node: null }
    const res = await rt.graphForceEnd(runId);
    expect(res.snapshot.fsmState).toBe('terminated');
    expect(res.snapshot.runId).toBe(runId);
    expect(res.node).toBeNull();

    // graphStatus confirms terminated
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('terminated');
  });

  // ── Scenario 4: Concurrent runs ──────────────────────────────────

  it('runs two independent graph instances concurrently', async () => {
    const rt = await createTestRuntime(fix);

    // Start two runs — graphStart serializes per graph name (single-flight
    // keyed on the graph while the run id does not exist yet), so start
    // sequentially; the runs themselves are fully independent.
    const run1 = await rt.graphStart('linear-agent-test', { mode: 'auto' });
    const run2 = await rt.graphStart('linear-agent-test', { mode: 'auto' });

    // Distinct runIds
    expect(run1.runId).not.toBe(run2.runId);
    expect(run1.node!.nodeId).toBe('phase-1');
    expect(run2.node!.nodeId).toBe('phase-1');

    // Advance both runs concurrently — per-run dispatch locks are independent
    const [r1a, r2a] = await Promise.all([
      rt.graphAdvance(run1.runId, 'phase-1'),
      rt.graphAdvance(run2.runId, 'phase-1'),
    ]);
    expect(r1a.node!.nodeId).toBe('phase-2');
    expect(r2a.node!.nodeId).toBe('phase-2');

    // Run1 untouched by run2's dispatch; both still running
    const s1 = await rt.graphStatus(run1.runId);
    const s2 = await rt.graphStatus(run2.runId);
    expect(s1.fsmState).toBe('running');
    expect(s2.fsmState).toBe('running');
    expect(s1.nodes!.find((n) => n.nodeId === 'phase-2')?.status).toBe('active');
    expect(s2.nodes!.find((n) => n.nodeId === 'phase-2')?.status).toBe('active');

    // Advance run2 independently of run1
    const r2b = await rt.graphAdvance(run2.runId, 'phase-2');
    expect(r2b.node!.nodeId).toBe('phase-3');
    const s1b = await rt.graphStatus(run1.runId);
    expect(s1b.nodes!.find((n) => n.nodeId === 'phase-2')?.status).toBe('active');
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
