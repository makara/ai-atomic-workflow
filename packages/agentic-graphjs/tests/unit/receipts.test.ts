import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  createRuntime,
  type CompiledGraph,
  type RecordLogPort,
  type Runtime,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A line whose head reaches outside itself (`tool`): its success is done only when the host's
 *  receipts say it is — and its neighbour stays a node whose capabilities reach nowhere. */
function outsideGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }], capabilities: ['tool'] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addEdge(START, 'a')
    .addEdge('a', 'b')
    .addEdge('b', END)
    .compile({ name: 'outside' });
}

/** A fresh deterministic saver over one log — the ids and stamps a replay would mint. */
function saverOver(log: RecordLogPort) {
  let issued = 0;
  return createMemorySaver({
    log,
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-09-30T00:00:00Z' },
  });
}

/** The one runtime every case drives: one log, one graph, one deterministic host. */
function runtimeOver(log: RecordLogPort): Runtime {
  return createRuntime({
    checkpointer: saverOver(log),
    context: { threadId: 't' },
    graphs: { load: async () => ({ ok: true, graph: outsideGraph(), structureHash: 'h' }) },
  });
}

describe('the receipts face', () => {
  it('settles an external success that brings its receipts and journals them beside the fact', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    const answer = await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      receipts: [
        { ref: 'cmd:deploy', state: 'settled' },
        { ref: 'cmd:notify', state: 'reserved' },
      ],
    });

    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const writes = records.find((record) => record.kind === 'writes');
    if (writes?.kind !== 'writes') throw new Error('expected a writes entry');
    expect(writes.entry.receipts).toEqual([
      { ref: 'cmd:deploy', state: 'settled' },
      { ref: 'cmd:notify', state: 'reserved' },
    ]);
  });
});

describe('the view of a state short of settled', () => {
  it('shows a state that has not reached `settled` as `unsettled` in the view', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      receipts: [
        { ref: 'cmd:deploy', state: 'settled' },
        { ref: 'cmd:notify', state: 'reserved' },
        { ref: 'cmd:ship', state: 'ambiguous' },
      ],
    });

    const view = await runtime.status({ graph: 'outside' });
    expect(view.settlements).toEqual([
      {
        taskId: 'a#0',
        node: 'a',
        key: 'done',
        outcome: 'succeeded',
        attempt: 1,
        receipts: [
          { ref: 'cmd:deploy', state: 'settled' },
          { ref: 'cmd:notify', state: 'unsettled' },
          { ref: 'cmd:ship', state: 'unsettled' },
        ],
      },
    ]);
  });
});

describe('the receipt guards', () => {
  it('answers an external success without receipts as failed, and the chain carries the failure', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    const answer = await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
    });

    // The failure routes on the report's own key: the step advances on the same router face.
    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.outcome).toBe('failed');
    expect(outcome.entry.reason).toBe('a answered an external action without receipts');

    const view = await runtime.status({ graph: 'outside' });
    expect(view.settlements).toEqual([{ taskId: 'a#0', node: 'a', key: 'done', outcome: 'failed', attempt: 1 }]);
    expect(view.outstanding).toEqual([{ id: 'b#0', node: 'b', attempt: 1 }]);
  });

  it('answers a receipt state outside the closed vocabulary as failed', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      receipts: [{ ref: 'cmd:deploy', state: 'maybe' }],
    });

    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.outcome).toBe('failed');
    expect(outcome.entry.reason).toBe('a answered with a receipt state outside the closed vocabulary');
  });
});

describe('the inert and keyed faces', () => {
  it('keeps receipts inert on a node whose capabilities reach nowhere', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      receipts: [{ ref: 'cmd:deploy', state: 'settled' }],
    });
    const answer = await runtime.report({
      graph: 'outside',
      taskId: 'b#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'B',
      receipts: [{ ref: 'note:1', state: 'ambiguous' }],
    });

    // The ambiguous receipt does not gate a node whose capabilities reach nowhere: the work settles.
    expect(answer).toEqual({ kind: 'settled', checkpointId: '2' });
    const view = await runtime.status({ graph: 'outside' });
    expect(view.settlements).toHaveLength(2);
    expect(view.settlements[1]).toEqual({
      taskId: 'b#0',
      node: 'b',
      key: 'done',
      outcome: 'succeeded',
      attempt: 1,
      receipts: [{ ref: 'note:1', state: 'unsettled' }],
    });
  });
});

describe('the keyed failure and its receipts', () => {
  it('journals receipts with a keyed failure and shows them in the view', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'outside' });
    const answer = await runtime.report({
      graph: 'outside',
      taskId: 'a#0',
      outcome: 'failed',
      key: 'done',
      reason: 'the deploy refused',
      receipts: [{ ref: 'cmd:deploy', state: 'ambiguous' }],
    });

    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.receipts).toEqual([{ ref: 'cmd:deploy', state: 'ambiguous' }]);

    const view = await runtime.status({ graph: 'outside' });
    expect(view.settlements).toEqual([
      {
        taskId: 'a#0',
        node: 'a',
        key: 'done',
        outcome: 'failed',
        attempt: 1,
        receipts: [{ ref: 'cmd:deploy', state: 'unsettled' }],
      },
    ]);
  });
});
