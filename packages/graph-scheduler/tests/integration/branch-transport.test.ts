/**
 * Integration tests for the rework backward-reset transport (graph_jump —
 * the ONLY backward reset; branchTo is removed — branch semantics are
 * subgraph selection (template: router sibling runs); loop/rework semantics
 * are flow self-edges (top-level `flow` field — condition-matched
 * transitions, graph-flow)).
 *
 * Exercises graph_advance(runId, nodeId) + graph_jump(runId, target) through
 * the SchedulerRuntime facade. Verifies:
 *  - plain continue (no branch parameter) → downstream dispatched next
 *  - graph_jump targeting a terminal upstream node → JUMP reset (retryCount increment)
 *  - run completes by natural drain when the final node completes (no end node)
 *  - rework-decision NodeDetail exposes the condition task text; no
 *    reads/branches/default/routing (reads removed — decision context
 *    auto-injects from direct dependsOn outputs)
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

  // Rework pass-through graph — seed → gate (backward rework target seed) →
  // alpha; no end node
  const passGraph = {
    name: 'pass-test',

    phases: [
      { id: 'seed', type: 'main', skill: 'scenario-agent-skill', task: 'decide source', dependsOn: [], operations: [] },
      {
        id: 'gate',
        type: 'main',
        dependsOn: ['seed'],
        task: 'Rework decision — IF seed output shows source: bad AND seed retryCount < 2 the decision output carries the rework target seed; ELSE no target.',
        operations: [],
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
  writeFileSync(join(taskflowDir, 'pass-test.yaml'), JSON.stringify(passGraph, null, 2));

  // Rework graph — the decision node's rework target is the terminal upstream
  // writer (JUMP reset path): writer → review → gate (rework target writer) →
  // accept; no end node
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
        type: 'main',
        dependsOn: ['review'],
        task: 'Rework decision — IF review output shows overall: fail AND writer retryCount < 2 the decision output carries the rework target writer; ELSE no target.',
        operations: [],
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
  writeFileSync(join(taskflowDir, 'rework-test.yaml'), JSON.stringify(reworkGraph, null, 2));

  const registry = {
    graphs: [
      { name: 'pass-test', path: 'pass-test.yaml' },
      { name: 'rework-test', path: 'rework-test.yaml' },
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

/** Read a node's status from the FULL snapshot (graph_status serves the complete nodes array). */
async function nodeStatus(rt: SchedulerRuntime, runId: string, nodeId: string): Promise<string> {
  const snapshot = await rt.graphStatus(runId);
  const n = snapshot.nodes!.find((n) => n.nodeId === nodeId);
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

describe('rework backward-reset transport (graph_jump)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('rework-decision NodeDetail carries the condition task text — no reads/branches/default/routing', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await startSkippingPrologue(rt, 'pass-test');
    expect(n1!.nodeId).toBe('seed');

    // seed → gate
    const r1 = await rt.graphAdvance(runId, 'seed');
    expect(r1.node!.nodeId).toBe('gate');
    expect(r1.node!.type).toBe('main');
    // Rework-decision task text carries the condition + target (loop/rework
    // semantics are flow self-edges — condition-matched transitions; the task text is informational);
    // reads removed (schema field convergence) — decision context
    // auto-injects from the direct dependsOn output (seed); gate NodeDetail
    // carries the effective channels (convention layer default-loaded; no
    // phase-level channels declared in the fixture)
    expect(r1.node!.task).toContain('seed output shows source: bad');
    expect(r1.node!.task).toContain('rework target seed');
    expect(r1.node!.channels).toEqual(['./CONTEXT.md', 'docs/domains.md']);
    // retired routingActions never delivered; the new contract ships a
    // machine-declared completion block instead (plain continue here)
    expect('routingActions' in r1.node!).toBe(false);
    expect(r1.node!.completion).toEqual({ default: 'continue' });

    await rt.dispose();
  });

  it('plain continue (no branch parameter) passes through the rework-decision node — downstream dispatched next', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'pass-test');
    await rt.graphAdvance(runId, 'seed');

    // No branch parameter — no rework target, the decision node passes through downstream
    const r = await rt.graphAdvance(runId, 'gate');
    expect(r.node!.nodeId).toBe('alpha');
    expect(await nodeStatus(rt, runId, 'alpha')).toBe('active');

    await rt.dispose();
  });

  it('graph_jump to a terminal upstream node triggers JUMP reset with retryCount increment', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await startSkippingPrologue(rt, 'rework-test');
    expect(n1!.nodeId).toBe('writer');

    // writer → review → gate
    const r1 = await rt.graphAdvance(runId, 'writer');
    expect(r1.node!.nodeId).toBe('review');
    const r2 = await rt.graphAdvance(runId, 'review');
    expect(r2.node!.nodeId).toBe('gate');

    // Operator jump → 'writer' (done, ENTRY node) → JUMP reset:
    // writer re-activated with retryCount 1; review (done downstream) reset to
    // pending. The decision node itself closes as done — it was active at
    // reset time (outside the reset scope), so its counter is untouched.
    const r3 = await rt.graphJump(runId, 'writer');
    expect(r3.node!.nodeId).toBe('writer');
    expect(r3.node!.retryCount).toBe(1);
    const status3 = await rt.graphStatus(runId);
    expect(status3.nodes!.find((n) => n.nodeId === 'writer')?.status).toBe('active');
    expect(status3.nodes!.find((n) => n.nodeId === 'writer')?.retryCount).toBe(1);
    expect(status3.nodes!.find((n) => n.nodeId === 'review')?.status).toBe('pending');
    expect(status3.nodes!.find((n) => n.nodeId === 'review')?.retryCount).toBe(1);
    expect(status3.nodes!.find((n) => n.nodeId === 'gate')?.status).toBe('done');
    expect(status3.nodes!.find((n) => n.nodeId === 'gate')?.retryCount).toBe(0);

    await rt.dispose();
  });

  it('run completes by natural drain — final node completion, node null', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'pass-test');

    // seed → gate → alpha — alpha is the last SOURCE node; its completion
    // hands off to the synthesized `__handoff` main terminal (active), and
    // ONE more advance drains the run
    await rt.graphAdvance(runId, 'seed');
    await rt.graphAdvance(runId, 'gate');
    const r1 = await rt.graphAdvance(runId, 'alpha');
    expect(r1.snapshot.fsmState).toBe('running');
    expect(r1.node!.nodeId).toBe('__handoff');
    const r2 = await rt.graphAdvance(runId, '__handoff');
    expect(r2.snapshot.fsmState).toBe('completed');
    expect(r2.node).toBeNull();
    // no skip state exists — statuses are only pending/done/active
    const status = await rt.graphStatus(runId);
    for (const n of status.nodes!) {
      expect(['pending', 'active', 'done']).toContain(n.status);
    }

    await rt.dispose();
  });

  it('rework graph completes via pass-through after bounded retry', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await startSkippingPrologue(rt, 'rework-test');

    // Round 1 with one rework loop — the operator jump to the ENTRY re-runs it
    await rt.graphAdvance(runId, 'writer');
    await rt.graphAdvance(runId, 'review');
    const jump = await rt.graphJump(runId, 'writer'); // JUMP reset — retryCount 1
    expect(jump.node!.nodeId).toBe('writer');
    expect(await nodeStatus(rt, runId, 'writer')).toBe('active');

    // Round 2 — decision no-match (pass-through) → accept → accept completes
    // and the run hands off to the synthesized `__handoff` terminal; ONE more
    // advance drains it
    await rt.graphAdvance(runId, 'writer');
    await rt.graphAdvance(runId, 'review');
    const r2 = await rt.graphAdvance(runId, 'gate'); // no branch → pass-through
    expect(r2.node!.nodeId).toBe('accept');

    const r3 = await rt.graphAdvance(runId, 'accept');
    expect(r3.node!.nodeId).toBe('__handoff');
    expect(r3.snapshot.fsmState).toBe('running');

    const r4 = await rt.graphAdvance(runId, '__handoff');
    expect(r4.snapshot.fsmState).toBe('completed');
    expect(r4.node).toBeNull();

    await rt.dispose();
  });
});
