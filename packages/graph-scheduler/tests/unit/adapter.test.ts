/**
 * Focused adapter state-transition unit tests — the subtle guard branches of
 * graphAdvance exercised through the runtime seam (real adapter + real repo,
 * fixture graphs): run-state guards, idempotent re-report, wrong-node loud
 * fail, missed-selection guard, direct-end completion, natural drain.
 * Integration suites cover the full journeys; this file pins the transition
 * matrix in one table-driven pass.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  cleanup: () => void;
}

function makeFixture(graphs: Array<{ name: string; graph: Record<string, unknown> }>): Fixture {
  const taskflowDir = join(tmpdir(), `adapter-unit-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });
  for (const { name, graph } of graphs) {
    writeFileSync(join(taskflowDir, `${name}.yaml`), JSON.stringify(graph, null, 2));
  }
  return {
    taskflowDir,
    cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }),
  };
}

async function createTestRuntime(fix: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fix.taskflowDir,
    }),
  );
}

describe('graphAdvance — state-transition matrix', () => {
  let fix: Fixture;
  let rt: SchedulerRuntime;

  // Linear — entry → next → done (guard / idempotency / drain).
  const linearGraph = {
    name: 'linear-unit',
    phases: [
      { id: 'entry', type: 'main', dependsOn: [], task: 'entry', operations: [] },
      { id: 'next', type: 'main', dependsOn: ['entry'], task: 'next', operations: [] },
      { id: 'done', type: 'main', dependsOn: ['next'], task: 'done', operations: [] },
    ],
  };

  // Branch — pure branch-route main (choices, no rework) → missed-selection guard.
  const branchGraph = {
    name: 'branch-unit',
    phases: [
      {
        id: 'decide',
        type: 'main',
        dependsOn: [],
        task: 'choose one track: `alpha` or `beta`',
        operations: [],
      },
      { id: 'alpha', type: 'main', dependsOn: ['decide'], task: 'alpha work', operations: [] },
      { id: 'beta', type: 'main', dependsOn: ['decide'], task: 'beta work', operations: [] },
    ],
  };

  beforeEach(async () => {
    fix = makeFixture([
      { name: 'linear-unit', graph: linearGraph },
      { name: 'branch-unit', graph: branchGraph },
    ]);
    rt = await createTestRuntime(fix);
  });

  afterEach(async () => {
    await rt.dispose();
    fix.cleanup();
  });

  it('advance on a terminated run fails loudly', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    expect(n0!.nodeId).toBe('entry');
    await rt.graphForceEnd(runId);

    await expect(rt.graphAdvance(runId, 'entry')).rejects.toThrow(/terminated/);
  });

  it('NodeDetail carries peer-level agent hints — pass-through (graph-phase-agent-restore)', async () => {
    const agentGraph = {
      name: 'agent-unit',
      phases: [
        {
          id: 'entry',
          type: 'main',
          dependsOn: [],
          task: 'walk',
          operations: ['locate', 'read'],
          agent: ['explore', 'scout'],
        },
      ],
    };
    fix = makeFixture([{ name: 'agent-unit', graph: agentGraph }]);
    rt = await createTestRuntime(fix);

    const { runId, node: n0 } = await rt.graphStart('agent-unit');
    expect(n0!.nodeId).toBe('entry');
    expect(n0!.agent).toEqual(['explore', 'scout']);
    await rt.graphAdvance(runId, 'entry');
  });

  it('advance on a completed run fails loudly', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    // Drain the linear graph to completion.
    let node = n0;
    for (let i = 0; node !== null; i += 1) {
      const r = await rt.graphAdvance(runId, node.nodeId);
      node = r.node;
    }
    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');

    await expect(rt.graphAdvance(runId, 'entry')).rejects.toThrow(/completed/);
  });

  it('re-reporting a completed node without a branch is an idempotent no-op success', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    expect(n0!.nodeId).toBe('entry');
    const r1 = await rt.graphAdvance(runId, 'entry');
    expect(r1.node!.nodeId).toBe('next');

    // Re-report 'entry' (persisted done, not the active interrupt) — no-op.
    const r2 = await rt.graphAdvance(runId, 'entry');
    expect(r2.node!.nodeId).toBe('next');
    expect(r2.snapshot.fsmState).toBe('running');
  });

  it('advancing a non-active node fails loudly — wrong-node report never resumes', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    expect(n0!.nodeId).toBe('entry');

    await expect(rt.graphAdvance(runId, 'done')).rejects.toThrow(/not the active node/);
  });

  it('plain continue on a branch-declaring node succeeds — no branch parameter exists (branch = router subgraph selection)', async () => {
    const { runId, node: n0 } = await rt.graphStart('branch-unit');
    expect(n0!.nodeId).toBe('decide');

    // branchTo and its missed-selection guard are removed — the advance
    // succeeds with plain continue and dependency activation routes the
    // successor set.
    const r = await rt.graphAdvance(runId, 'decide');
    expect(r.node?.nodeId).toBe('alpha');
  });

  it('direct-end completes the run without resuming the graph', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    expect(n0!.nodeId).toBe('entry');

    const r = await rt.graphAdvance(runId, 'entry', true);
    expect(r.snapshot.fsmState).toBe('completed');
    expect(r.node).toBeNull();

    // Unfinished nodes stay pending — never activated, never aborted.
    const status = await rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'entry')?.status).toBe('done');
    expect(status.nodes!.find((n) => n.nodeId === 'next')?.status).toBe('pending');
    expect(status.nodes!.find((n) => n.nodeId === 'done')?.status).toBe('pending');
  });

  it('natural drain completes the run with node null', async () => {
    const { runId, node: n0 } = await rt.graphStart('linear-unit');
    let node = n0;
    let last: Awaited<ReturnType<SchedulerRuntime['graphAdvance']>> | null = null;
    for (let i = 0; node !== null && i < 10; i += 1) {
      last = await rt.graphAdvance(runId, node.nodeId);
      node = last.node;
    }
    expect(node).toBeNull();
    expect(last!.snapshot.fsmState).toBe('completed');
    expect((await rt.graphStatus(runId)).completedCount).toBe(4);
  });
});

describe('graphAdvance — flow condition/jump channels (graph-flow)', () => {
  let fix: Fixture;
  let rt: SchedulerRuntime;

  // Loop graph — flow self-edge: terminal -->|remaining| body; pass → next.
  const flowGraph = {
    name: 'flow-unit',
    phases: [
      { id: 'entry', type: 'main', dependsOn: [], task: 'entry', operations: [] },
      { id: 'body', type: 'main', dependsOn: ['entry'], task: 'body', operations: [] },
      { id: 'next', type: 'main', dependsOn: ['body'], task: 'next', operations: [] },
    ],
    flow: ['next -->|remaining| body', 'next -->|pass| entry'],
  };

  beforeEach(async () => {
    fix = makeFixture([{ name: 'flow-unit', graph: flowGraph }]);
    rt = await createTestRuntime(fix);
  });

  afterEach(async () => {
    await rt.dispose();
    fix.cleanup();
  });

  it('advances a node with a condition and activates the matched flow target', async () => {
    const started = await rt.graphStart('flow-unit');
    // entry → body → next (dependency chain), then advance 'next' with 'remaining'.
    const advanceBody = await rt.graphAdvance(started.runId, started.node!.nodeId);
    const atNext = await rt.graphAdvance(started.runId, advanceBody.node!.nodeId);
    const routed = await rt.graphAdvance(started.runId, atNext.node!.nodeId, undefined, 'remaining');
    expect(routed.node?.nodeId).toBe('body');
  });

  it('fails loudly when the condition matches no outgoing flow edge', async () => {
    const started = await rt.graphStart('flow-unit');
    const advanceBody = await rt.graphAdvance(started.runId, started.node!.nodeId);
    const atNext = await rt.graphAdvance(started.runId, advanceBody.node!.nodeId);
    await expect(rt.graphAdvance(started.runId, atNext.node!.nodeId, undefined, 'nonsense')).rejects.toThrow(
      /missed-condition guard/,
    );
  });

  it('advances without a condition to the sequence default', async () => {
    const started = await rt.graphStart('flow-unit');
    const advanceBody = await rt.graphAdvance(started.runId, started.node!.nodeId);
    const atNext = await rt.graphAdvance(started.runId, advanceBody.node!.nodeId);
    // No condition — 'next' has labeled flow edges but no unlabeled default;
    // the empty flow default falls back to the dependsOn successors →
    // __handoff (the terminal-successor rewiring), then natural drain.
    const toHandoff = await rt.graphAdvance(started.runId, atNext.node!.nodeId);
    expect(toHandoff.node?.nodeId).toBe('__handoff');
    const drained = await rt.graphAdvance(started.runId, '__handoff');
    expect(drained.node).toBeNull();
  });

  it('increments retryCount on a flow self-edge re-entry', async () => {
    // Self-edge fixture — retry -->|again| retry: each pass through the
    // self-edge increments the re-entered node's retryCount (never zeroed).
    const selfFix = makeFixture([
      {
        name: 'self-loop-unit',
        graph: {
          name: 'self-loop-unit',
          phases: [
            { id: 'retry', type: 'main', dependsOn: [], task: 'retry work', operations: [] },
            { id: 'next', type: 'main', dependsOn: ['retry'], task: 'next', operations: [] },
          ],
          flow: ['retry -->|again| retry', 'retry -->|done| next'],
        },
      },
    ]);
    const selfRt = await createTestRuntime(selfFix);
    try {
      const started = await selfRt.graphStart('self-loop-unit');
      expect(started.node?.nodeId).toBe('retry');
      const reentry = await selfRt.graphAdvance(started.runId, 'retry', undefined, 'again');
      expect(reentry.node?.nodeId).toBe('retry');
      expect(reentry.snapshot.changed.find((n) => n.nodeId === 'retry')?.retryCount).toBe(1);
      const reentry2 = await selfRt.graphAdvance(started.runId, 'retry', undefined, 'again');
      expect(reentry2.node?.nodeId).toBe('retry');
      expect(reentry2.snapshot.changed.find((n) => n.nodeId === 'retry')?.retryCount).toBe(2);
    } finally {
      await selfRt.dispose();
      selfFix.cleanup();
    }
  });

  it('jump resets a backward ancestor and re-dispatches it', async () => {
    const started = await rt.graphStart('flow-unit');
    const advanceBody = await rt.graphAdvance(started.runId, started.node!.nodeId);
    const atNext = await rt.graphAdvance(started.runId, advanceBody.node!.nodeId);
    // Jump back to 'entry' (an ancestor of 'next') — backward reset.
    const jumped = await rt.graphAdvance(started.runId, atNext.node!.nodeId, undefined, undefined, 'entry');
    expect(jumped.node?.nodeId).toBe('entry');
  });

  it('rejects a forward jump target loudly', async () => {
    const started = await rt.graphStart('flow-unit');
    const atEntry = started.node!;
    // From 'entry', 'body' is NOT an ancestor (it is downstream) → forward → reject.
    await expect(rt.graphAdvance(started.runId, atEntry.nodeId, undefined, undefined, 'body')).rejects.toThrow(
      /not a backward target/,
    );
  });
});
