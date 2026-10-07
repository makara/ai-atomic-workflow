import { describe, expect, it } from 'vitest';

import {
  createRuntime,
  serialize,
  type GraphSource,
  type Json,
  type RuntimeContext,
  type RuntimeDeps,
} from '../../src/internal.js';
import {
  chainGraph,
  createCheckpoint,
  cycleGraph,
  fanoutGraph,
  fresh,
  multiKeyGraph,
  resetLog,
  sharedLog,
  sourceFor,
} from '../support/runtime-face.js';

describe('the entry face', () => {
  it('refuses a missing required capability by name', async () => {
    const graph = chainGraph();
    const noSaver = createRuntime({ context: { threadId: 't' }, graphs: sourceFor(graph) } as unknown as RuntimeDeps);
    const taken = await noSaver.take({ graph: 'chain' });
    expect('refusal' in taken && taken.refusal.code).toBe('infra');
    expect('refusal' in taken && taken.refusal.note).toContain('checkpointer');

    const noGraphs = createRuntime({
      checkpointer: createCheckpoint(),
      context: { threadId: 't' },
    } as unknown as RuntimeDeps);
    const again = await noGraphs.take({ graph: 'chain' });
    expect('refusal' in again && again.refusal.note).toContain('graphs');
  });

  it('refuses an unreadable graph name with the refusal code', async () => {
    const runtime = createRuntime(fresh());
    const taken = await runtime.take({ graph: 'nope' });
    expect('refusal' in taken ? taken.refusal.code : '').toContain('GRAPH_UNREADABLE');
  });
});

describe('the run over the chain', () => {
  it('runs one graph from the start to the end over the in-memory chain', async () => {
    const runtime = createRuntime(fresh());
    const first = await runtime.take({ graph: 'chain' });
    expect(first.kind).toBe('issued');
    if (first.kind !== 'issued') return;
    expect(first.tasks[0]?.node).toBe('a');

    const settledA = await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    expect(settledA.kind).toBe('settled');
    const second = await runtime.take({ graph: 'chain' });
    expect(second.kind === 'issued' ? second.tasks[0]?.node : '').toBe('b');

    await runtime.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
    const third = await runtime.take({ graph: 'chain' });
    expect(third.kind === 'issued' ? third.tasks[0]?.node : '').toBe('c');

    await runtime.report({ graph: 'chain', taskId: 'c#0', outcome: 'succeeded', result: 'C' });
    const drained = await runtime.take({ graph: 'chain' });
    expect(drained.kind).toBe('unserved');

    const view = await runtime.getState({ graph: 'chain' });
    expect(view.values).toEqual({ executed: ['A', 'B', 'C'], settled: { a: 'A', b: 'B', c: 'C' } });
    expect(view.next).toEqual([]);
  });

  it('continues a part-run cold from the journal alone', async () => {
    const deps = fresh();
    const first = createRuntime(deps);
    await first.take({ graph: 'chain' });
    await first.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await first.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });

    // A fresh instance over the same log: no in-memory state, only the journal.
    const later = createRuntime({ ...deps, context: { threadId: 't' } as RuntimeContext });
    const taken = await later.take({ graph: 'chain' });
    expect(taken.kind === 'issued' ? taken.tasks[0]?.node : '').toBe('c');
    // The occurrence identity is rebuilt from the chain alone: same run, same id.
    expect(taken.kind === 'issued' ? taken.tasks[0]?.id : '').toBe('c#0');
    expect(taken.kind).toBe('issued');
  });
});

describe('the lane and the rewind', () => {
  it('answers a cold drained lane as unserved', async () => {
    const deps = fresh();
    const first = createRuntime(deps);
    await first.take({ graph: 'chain' });
    await first.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await first.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
    await first.report({ graph: 'chain', taskId: 'c#0', outcome: 'succeeded', result: 'C' });

    const later = createRuntime(deps);
    const drained = await later.take({ graph: 'chain' });
    expect(drained.kind).toBe('unserved');
  });

  it('mints the next occurrence for a revisited node and spends the settled one', async () => {
    const graph = cycleGraph();
    resetLog();
    const deps: RuntimeDeps = {
      checkpointer: createCheckpoint(),
      context: { threadId: 't' },
      graphs: {
        load: async (name) =>
          name === 'cycle' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
      },
    };
    const first = createRuntime(deps);
    const head = await first.take({ graph: 'cycle' });
    expect(head.kind === 'issued' ? head.tasks[0]?.id : '').toBe('head#0');
    await first.report({ graph: 'cycle', taskId: 'head#0', outcome: 'succeeded', result: 'H' });
    await first.report({ graph: 'cycle', taskId: 'gate#0', outcome: 'succeeded', key: 'again' });

    // The loop-back is the head's second occurrence — the id counts settlements of the node,
    // never its position on the frontier — and the settled occurrence answers the replay gate.
    const back = await first.take({ graph: 'cycle' });
    expect(back.kind === 'issued' ? back.tasks[0]?.id : '').toBe('head#1');
    expect(await first.report({ graph: 'cycle', taskId: 'head#0', outcome: 'succeeded', result: 'H' })).toEqual({
      kind: 'settled',
      checkpointId: expect.any(String),
      warnings: [{ code: 'ALREADY_SETTLED', note: "'head#0' already settled (writes)" }],
    });
  });
});

describe('the occurrence and the drift', () => {
  it('refuses a drifted structure over the same thread', async () => {
    const deps = fresh();
    const first = createRuntime(deps);
    await first.take({ graph: 'chain' });
    await first.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });

    const drifted = createRuntime({ ...deps, graphs: sourceFor(chainGraph(), 'other') });
    const taken = await drifted.take({ graph: 'chain' });
    expect('refusal' in taken ? taken.refusal.code : '').toContain('STRUCTURE_DRIFT');
  });

  it('rewinds to a recorded checkpoint and reissues the target frontier', async () => {
    const deps = fresh();
    const runtime = createRuntime(deps);
    await runtime.take({ graph: 'chain' });
    await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await runtime.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });

    const log = await runtime.history({ graph: 'chain' });
    const ids = log.map((checkpoint) => checkpoint.id);
    expect(ids).toEqual(['2', '1']);

    // The frontier relocation: the lane reads at '1' (a settled, b not), so the next order is
    // b's — the same occurrence id the same position minted before the rewind (deterministic replay).
    const back = await runtime.rewind({ to: '1' });
    expect(back.kind).toBe('rewound');
    const taken = await runtime.take({ graph: 'chain' });
    expect(taken.kind === 'issued' ? taken.tasks[0]?.node : '').toBe('b');
    expect(taken.kind === 'issued' ? taken.tasks[0]?.id : '').toBe('b#0');

    const missing = await runtime.rewind({ to: '99' });
    expect('refusal' in missing ? missing.refusal.code : '').toContain('CHECKPOINT_UNKNOWN');
  });
});

describe('the rewound read', () => {
  it('reads getState at the rewound position and the same view through the lane', async () => {
    const deps = fresh();
    const runtime = createRuntime(deps);
    await runtime.take({ graph: 'chain' });
    await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await runtime.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });

    const atOne = await runtime.getState({ graph: 'chain', at: '1' });
    expect(atOne.values).toEqual({ executed: ['A'], settled: { a: 'A' } });
    expect(atOne.next).toEqual(['b']);

    await runtime.rewind({ to: '1' });
    const throughLane = await runtime.getState({ graph: 'chain' });
    expect(throughLane).toEqual(atOne);
  });

  it('records the parent config and keeps the work a rewind names retained', async () => {
    const deps = fresh();
    const runtime = createRuntime(deps);
    await runtime.take({ graph: 'chain' });
    await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await runtime.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });

    // The parent chain: each checkpoint names the position its step ran at (history is newest-first).
    const chain = await runtime.history({ graph: 'chain' });
    expect(chain.map((checkpoint) => checkpoint.parent_config?.checkpoint_id)).toEqual(['1', undefined]);

    // A rewind that keeps b settled: the frontier skips b and lands on c.
    const back = await runtime.rewind({ to: '1', retained: ['b#0'] });
    expect(back.kind).toBe('rewound');
    const taken = await runtime.take({ graph: 'chain' });
    expect(taken.kind === 'issued' ? taken.tasks[0]?.node : '').toBe('c');

    // The retained settlement forks the chain from the rewound position.
    await runtime.report({ graph: 'chain', taskId: 'c#0', outcome: 'succeeded', result: 'C' });
    const forked = await runtime.history({ graph: 'chain' });
    expect(forked[0]?.parent_config?.checkpoint_id).toBe('1');
    const view = await runtime.getState({ graph: 'chain' });
    expect(view.values).toEqual({ executed: ['A', 'B', 'C'], settled: { a: 'A', b: 'B', c: 'C' } });
  });
});

describe('the cold replay', () => {
  it('cold-replays a multi-key settlement onto the same frontier', async () => {
    resetLog();
    const source: GraphSource = {
      load: async (name) =>
        name === 'multi'
          ? { ok: true, graph: multiKeyGraph(), structureHash: 'h' }
          : { ok: false, code: 'GRAPH_UNREADABLE' },
    };
    const deps: RuntimeDeps = { checkpointer: createCheckpoint(), context: { threadId: 't' }, graphs: source };
    const live = createRuntime(deps);
    const taken = await live.take({ graph: 'multi' });
    expect(taken.kind === 'issued' ? taken.tasks[0]?.node : '').toBe('gate');
    // The key is the report's own answer — `keyOf` cannot derive it — so only the block's
    // recorded key lets a cold replay route the way the live instance did.
    await live.report({ graph: 'multi', taskId: 'gate#0', outcome: 'succeeded', key: 'halt', result: 'halt' });
    const liveNext = await live.take({ graph: 'multi' });

    const cold = createRuntime({ ...deps, context: { threadId: 't' } as RuntimeContext });
    const again = await cold.take({ graph: 'multi' });
    expect(again.kind === 'issued' ? again.tasks[0]?.node : '').toBe('right');
    expect(again.kind === 'issued' ? again.tasks[0]?.id : '').toBe(
      liveNext.kind === 'issued' ? liveNext.tasks[0]?.id : '',
    );
    const liveView = await live.getState({ graph: 'multi' });
    const coldView = await cold.getState({ graph: 'multi' });
    expect(coldView).toEqual(liveView);
  });

  it('cold-replays a half-settled super-step to the same frontier', async () => {
    resetLog();
    const source: GraphSource = {
      load: async (name) =>
        name === 'fanout'
          ? { ok: true, graph: fanoutGraph(), structureHash: 'h' }
          : { ok: false, code: 'GRAPH_UNREADABLE' },
    };
    const deps: RuntimeDeps = { checkpointer: createCheckpoint(), context: { threadId: 't' }, graphs: source };
    const live = createRuntime(deps);
    await live.take({ graph: 'fanout' });
    await live.report({ graph: 'fanout', taskId: 'head#0', outcome: 'succeeded', result: 'H' });
    const step = await live.take({ graph: 'fanout' });
    expect(step.kind === 'issued' ? step.tasks.map((task) => task.node) : []).toEqual(['left', 'right']);
    await live.report({ graph: 'fanout', taskId: 'left#0', outcome: 'succeeded', result: 'L' });

    const cold = createRuntime({ ...deps, context: { threadId: 't' } as RuntimeContext });
    const again = await cold.take({ graph: 'fanout' });
    const liveNext = await live.take({ graph: 'fanout' });
    expect(again.kind === 'issued' ? again.tasks.map((task) => task.id) : []).toEqual(
      liveNext.kind === 'issued' ? liveNext.tasks.map((task) => task.id) : [],
    );
    expect(await cold.getState({ graph: 'fanout' })).toEqual(await live.getState({ graph: 'fanout' }));
  });
});

describe('the instance and the bytes', () => {
  it('settles from a fresh instance with no prior take', async () => {
    resetLog();
    const deps = fresh();
    const warm = createRuntime(deps);
    await warm.take({ graph: 'chain' });
    await warm.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });

    // A cold instance holds no binding of its own: the call carries the graph,
    // so the settlement lands without a take on this process.
    const cold = createRuntime({ ...deps, context: { threadId: 't' } as RuntimeContext });
    const settled = await cold.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
    expect(settled.kind).toBe('settled');
    const view = await cold.getState({ graph: 'chain' });
    expect(view.values).toEqual({ executed: ['A', 'B'], settled: { a: 'A', b: 'B' } });
  });

  it('journals failed and retry as distinguishable outcomes', async () => {
    resetLog();
    const runtime = createRuntime(fresh());
    await runtime.take({ graph: 'chain' });
    const failed = await runtime.report({
      graph: 'chain',
      taskId: 'a#0',
      outcome: 'failed',
      reason: 'the node could not settle',
    });
    expect(failed.kind).toBe('settled');
    const retried = await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'retry' });
    expect(retried.kind).toBe('settled');

    const records = await sharedLog.read('t');
    const outcomes = records.flatMap((record) => (record.kind === 'outcome' ? [record.entry] : []));
    expect(outcomes).toEqual([
      { taskId: 'a#0', outcome: 'failed', reason: 'the node could not settle', attempt: 1 },
      { taskId: 'a#0', outcome: 'retry', attempt: 1 },
    ]);
  });
});

describe('the bytes', () => {
  it('replays the same journal to the same bytes', async () => {
    const one = fresh();
    const first = createRuntime(one);
    await first.take({ graph: 'chain' });
    await first.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await first.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
    const chainOne = await first.history({ graph: 'chain' });

    const two = fresh();
    const second = createRuntime(two);
    await second.take({ graph: 'chain' });
    await second.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
    await second.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
    const chainTwo = await second.history({ graph: 'chain' });

    const asJson = (list: typeof chainOne) => JSON.parse(JSON.stringify(list)) as Json;
    expect(serialize(asJson(chainOne))).toBe(serialize(asJson(chainTwo)));
  });

  it('runs one call at a time on a thread, so two concurrent settlements keep the single chain', async () => {
    const deps = fresh();
    const runtime = createRuntime(deps);
    await runtime.take({ graph: 'chain' });

    // Two settlements race on one thread: the lane queues the second behind the first, so the
    // second reads the checkpoint the first wrote instead of the position both started from.
    const raced = await Promise.all([
      runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' }),
      runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' }),
    ]);
    expect(raced.map((answer) => answer.kind)).toEqual(['settled', 'settled']);
    const second = raced[1];
    expect(second?.kind === 'settled' && second.warnings?.[0]?.code).toBe('ALREADY_SETTLED');

    // Assertion: the chain keeps one child of the head — two settlements that read the same
    // position would have written two children of it, forking the single chain.
    const chain = await runtime.history({ graph: 'chain' });
    const parents = chain.map((checkpoint) => checkpoint.parent_config?.checkpoint_id ?? 'HEAD');
    expect(parents.filter((parent) => parent === 'HEAD')).toHaveLength(1);
    expect(new Set(parents).size).toBe(parents.length);
  });
});
