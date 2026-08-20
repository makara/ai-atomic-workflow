/**
 * Routing exclusivity integration tests — the compile-time routing refactor:
 * with no static inter-node edges, a resumed node's `Command({goto})` is the
 * EXCLUSIVE next-activation set. Unselected branch nodes stay pending and
 * rework jumps never leak static successors (LangGraph resume adds goto
 * targets to static edges — branch selection for `alpha` previously
 * interrupted `[alpha, beta]`).
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
  const taskflowDir = join(tmpdir(), `routing-excl-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });
  for (const { name, graph } of graphs) {
    writeFileSync(join(taskflowDir, `${name}.yaml`), JSON.stringify(graph, null, 2));
  }
  return {
    taskflowDir,
    cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }),
  };
}

describe('routing exclusivity (no static inter-node edges)', () => {
  let fix: Fixture;
  let rt: SchedulerRuntime;

  // decide → alpha + beta (dependency-derived successors) — a NON-composing
  // branch target pair, the general case the R4-F7 fix covers.
  const branchGraph = {
    name: 'branch-exclusive',

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

  // entry → mid → after (linear) — rework jump to entry must NOT leak `after`.
  const jumpGraph = {
    name: 'jump-exclusive',

    phases: [
      { id: 'entry', type: 'main', dependsOn: [], task: 'entry', operations: [] },
      { id: 'mid', type: 'main', dependsOn: ['entry'], task: 'mid', operations: [] },
      { id: 'after', type: 'main', dependsOn: ['mid'], task: 'after', operations: [] },
    ],
  };

  beforeEach(async () => {
    fix = makeFixture([
      { name: 'branch-exclusive', graph: branchGraph },
      { name: 'jump-exclusive', graph: jumpGraph },
    ]);
    rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
      }),
    );
  });

  afterEach(async () => {
    await rt.dispose();
    fix.cleanup();
  });

  it('continue activates dependency-derived successors — no in-run branch activation exists (branch = router subgraph selection)', async () => {
    const { runId, node: n0 } = await rt.graphStart('branch-exclusive');
    expect(n0!.nodeId).toBe('decide');

    // branchTo is removed — no in-run branch activation. The decide node
    // completes with plain continue and dependency activation routes the
    // full successor set (AND convergence — both depend on decide, both
    // execute). Branches between alternatives are router subgraph selection
    // (template: router), not in-run node exclusivity.
    const r = await rt.graphAdvance(runId, 'decide');
    expect(r.node!.nodeId).toBe('alpha');

    const status = await rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'beta')?.retryCount).toBe(0);

    // Both successors complete → the synthesized `__handoff` terminal
    // activates; ONE more advance drains the run.
    const r2 = await rt.graphAdvance(runId, 'alpha');
    expect(r2.node!.nodeId).toBe('__handoff');
    const r3 = await rt.graphAdvance(runId, '__handoff');
    expect(r3.snapshot.fsmState).toBe('completed');
    expect(r3.node).toBeNull();
    // Both successors executed — no branch exclusivity exists.
    const status2 = await rt.graphStatus(runId);
    expect(status2.nodes!.find((n) => n.nodeId === 'alpha')?.status).toBe('done');
    expect(status2.nodes!.find((n) => n.nodeId === 'beta')?.status).toBe('done');
  });

  it('advancing without any branch parameter always succeeds — the missed-branch guard is removed', async () => {
    const { runId, node: n0 } = await rt.graphStart('branch-exclusive');
    expect(n0!.nodeId).toBe('decide');

    // branchTo and assertBranchSelected are removed — no branch parameter
    // exists, so no missed-selection error can fire. The advance succeeds and
    // dependency activation routes the successor set.
    const r = await rt.graphAdvance(runId, 'decide');
    expect(r.node!.nodeId).toBe('alpha');

    const status = await rt.graphStatus(runId);
    expect(status.fsmState).toBe('running');
    expect(status.nodes!.find((n) => n.nodeId === 'alpha')?.status).toBe('active');
  });

  it('rework jump activates exactly the target — static successors stay pending', async () => {
    const { runId, node: n0 } = await rt.graphStart('jump-exclusive');
    expect(n0!.nodeId).toBe('entry');

    const r1 = await rt.graphAdvance(runId, 'entry');
    expect(r1.node!.nodeId).toBe('mid');

    // Jump back to entry — mid's successor `after` must NOT activate.
    const j = await rt.graphJump(runId, 'entry');
    expect(j.node!.nodeId).toBe('entry');
    expect(j.node!.retryCount).toBe(1);

    const status = await rt.graphStatus(runId);
    expect(status.nodes!.find((n) => n.nodeId === 'entry')?.status).toBe('active');
    expect(status.nodes!.find((n) => n.nodeId === 'after')?.status).toBe('pending');
    expect(status.nodes!.find((n) => n.nodeId === 'after')?.retryCount).toBe(0);
  });
});
