import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  runtimeContainer,
  type CompiledGraph,
  type GraphSource,
  type RecordLogPort,
  type Runtime,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** The same three-node chain the runtime suite drives — the view reads what the steps wrote. */
function chainGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addNode('c', { task: 'C', keys: [{ name: 'done' }] })
    .addEdge(START, 'a')
    .addConditionalEdges('a', { done: 'b' })
    .addConditionalEdges('b', { done: 'c' })
    .addConditionalEdges('c', { done: END })
    .compile({ name: 'chain' });
}

function sourceFor(graph: CompiledGraph): GraphSource {
  return {
    load: async (name) =>
      name === 'chain' ? { ok: true, graph, structureHash: 'h' } : { ok: false, code: 'GRAPH_UNREADABLE' },
  };
}

/** A fresh deterministic saver over one shared in-memory log — the bytes the view must never move. */
function saverOver(log: RecordLogPort) {
  let issued = 0;
  return createMemorySaver({
    log,
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-09-30T00:00:00Z' },
  });
}

/** The settled chain run end to end through one runtime: the three reports the window must show. */
async function settleChainTo(runtime: Runtime, through: 'a' | 'b' | 'c') {
  await runtime.take({ graph: 'chain' });
  await runtime.report({ graph: 'chain', taskId: 'a#0', outcome: 'succeeded', result: 'A' });
  if (through === 'a') return;
  await runtime.report({ graph: 'chain', taskId: 'b#0', outcome: 'succeeded', result: 'B' });
  if (through === 'b') return;
  await runtime.report({ graph: 'chain', taskId: 'c#0', outcome: 'succeeded', result: 'C' });
}

describe('the status view', () => {
  it('answers a fresh chain with the head task at its first attempt, not a window', async () => {
    const runtime = createRuntime({
      checkpointer: saverOver(createMemoryLog()),
      context: { threadId: 't' },
      graphs: sourceFor(chainGraph()),
    });
    expect(await runtime.status({ graph: 'chain' })).toEqual({
      graph: 'chain',
      cursor: { checkpointId: '', step: 0 },
      outstanding: [{ id: 'a#0', node: 'a', attempt: 1 }],
      settlements: [],
      liveness: { progress: [], attempts: {} },
    });
  });

  it('rebuilds the settled chain as one window — snapshot-exact, idempotent, ledger-unchanged, cold-equal', async () => {
    const log = createMemoryLog();
    const runtime = createRuntime({
      checkpointer: saverOver(log),
      context: { threadId: 't' },
      graphs: sourceFor(chainGraph()),
    });
    await settleChainTo(runtime, 'c');

    const before = JSON.stringify(await log.read('t'));
    const first = await runtime.status({ graph: 'chain' });
    const second = await runtime.status({ graph: 'chain' });
    const after = JSON.stringify(await log.read('t'));

    expect(JSON.stringify(first)).toBe(
      '{"graph":"chain","cursor":{"checkpointId":"3","step":3},"outstanding":[],' +
        '"settlements":[{"taskId":"a#0","node":"a","key":"done","outcome":"succeeded","attempt":1},' +
        '{"taskId":"b#0","node":"b","key":"done","outcome":"succeeded","attempt":1},' +
        '{"taskId":"c#0","node":"c","key":"done","outcome":"succeeded","attempt":1}],' +
        '"liveness":{"progress":[{"step":0,"tasks":["a#0"]},{"step":1,"tasks":["b#0"]},{"step":2,"tasks":["c#0"]}],' +
        '"attempts":{"a":1,"b":1,"c":1}}}',
    );
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(after).toBe(before);

    // A cold instance over the same ledger rebuilds the same window: the chain is the one authority.
    const cold = createRuntime({
      checkpointer: saverOver(log),
      context: { threadId: 't' },
      graphs: sourceFor(chainGraph()),
    });
    expect(JSON.stringify(await cold.status({ graph: 'chain' }))).toBe(JSON.stringify(first));
  });
});

describe('the window cuts', () => {
  it('cuts the window at a named position and keeps the attempt aligned with the visits', async () => {
    const log = createMemoryLog();
    const runtime = createRuntime({
      checkpointer: saverOver(log),
      context: { threadId: 't' },
      graphs: sourceFor(chainGraph()),
    });
    await settleChainTo(runtime, 'a');

    const at = await runtime.status({ graph: 'chain', at: '1' });
    expect(at.cursor).toEqual({ checkpointId: '1', step: 1 });
    expect(at.outstanding).toEqual([{ id: 'b#0', node: 'b', attempt: 1 }]);
    expect(at.settlements).toEqual([{ taskId: 'a#0', node: 'a', key: 'done', outcome: 'succeeded', attempt: 1 }]);
    expect(at.liveness.attempts).toEqual({ a: 1 });

    // A position the chain does not carry raises rather than answering the empty shape: an empty
    // window is the honest view of an unreadable chain, never of an `at` that names no position.
    await expect(runtime.status({ graph: 'chain', at: 'nope' })).rejects.toThrow(/CHECKPOINT_UNKNOWN/);
  });

  it('answers the same window through the container cradle as through the plain deps (dual-variant)', async () => {
    const plain = createRuntime({
      checkpointer: saverOver(createMemoryLog()),
      context: { threadId: 't' },
      graphs: sourceFor(chainGraph()),
    });
    const container = runtimeContainer({
      checkpointer: () => saverOver(createMemoryLog()),
      context: () => ({ threadId: 't' }),
      graphs: () => sourceFor(chainGraph()),
    });
    const scoped = createRuntime(container.createScope().cradle);

    await settleChainTo(plain, 'c');
    await settleChainTo(scoped, 'c');

    expect(await scoped.status({ graph: 'chain' })).toEqual(await plain.status({ graph: 'chain' }));
  });
});
