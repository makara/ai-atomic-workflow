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

/** A plain line whose nodes reach nowhere: the artifact refs ride as evidence, never as a gate. */
function plainGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addEdge(START, 'a')
    .addEdge('a', 'b')
    .addEdge('b', END)
    .compile({ name: 'plain' });
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
    graphs: { load: async () => ({ ok: true, graph: plainGraph(), structureHash: 'h' }) },
  });
}

describe('the artifact refs face', () => {
  it('settles a success whose outputs mix the object form and the shorthand, normalizing both', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    const answer = await runtime.report({
      graph: 'plain',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      outputs: [{ ref: 'reports/a.txt', mediaType: 'text/plain', bytes: 12, sha256: 'ab12' }, 'reports/b.txt'],
    });

    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const writes = records.find((record) => record.kind === 'writes');
    if (writes?.kind !== 'writes') throw new Error('expected a writes entry');
    expect(writes.entry.outputs).toEqual([
      { ref: 'reports/a.txt', mediaType: 'text/plain', bytes: 12, sha256: 'ab12' },
      { ref: 'reports/b.txt' },
    ]);
  });

  it('presents the refs in the view, serialized to the same bytes', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    await runtime.report({
      graph: 'plain',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      outputs: [{ ref: 'reports/a.txt', mediaType: 'text/plain', bytes: 12, sha256: 'ab12' }, 'reports/b.txt'],
    });

    const view = await runtime.status({ graph: 'plain' });
    expect(view.settlements[0]).toEqual({
      taskId: 'a#0',
      node: 'a',
      key: 'done',
      outcome: 'succeeded',
      attempt: 1,
      outputs: [{ ref: 'reports/a.txt', mediaType: 'text/plain', bytes: 12, sha256: 'ab12' }, { ref: 'reports/b.txt' }],
    });
    expect(JSON.parse(JSON.stringify(view.settlements[0]))).toEqual(view.settlements[0]);
  });
});

describe('the ref guards', () => {
  it('answers a `succeeded` whose object form names no ref as failed', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    const answer = await runtime.report({
      graph: 'plain',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      outputs: [{ mediaType: 'text/plain' } as never],
    });

    // The failure routes on the report's own key: the step advances on the same router face.
    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.outcome).toBe('failed');
    expect(outcome.entry.reason).toBe('a answered an artifact ref without a ref');
    const view = await runtime.status({ graph: 'plain' });
    expect(view.settlements).toEqual([{ taskId: 'a#0', node: 'a', key: 'done', outcome: 'failed', attempt: 1 }]);
  });

  it('answers an empty shorthand as failed', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    await runtime.report({
      graph: 'plain',
      taskId: 'a#0',
      outcome: 'succeeded',
      key: 'done',
      result: 'A',
      outputs: [''],
    });

    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.outcome).toBe('failed');
    expect(outcome.entry.reason).toBe('a answered an artifact ref without a ref');
  });
});

describe('the refs beside a failure', () => {
  it('journals refs with a keyed failure and shows them in the view', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    const answer = await runtime.report({
      graph: 'plain',
      taskId: 'a#0',
      outcome: 'failed',
      key: 'done',
      reason: 'the build broke',
      outputs: ['logs/build.txt'],
    });

    expect(answer).toEqual({ kind: 'settled', checkpointId: '1' });
    const records = await log.read('t');
    const outcome = records.find((record) => record.kind === 'outcome');
    if (outcome?.kind !== 'outcome') throw new Error('expected an outcome entry');
    expect(outcome.entry.outputs).toEqual([{ ref: 'logs/build.txt' }]);
    const view = await runtime.status({ graph: 'plain' });
    expect(view.settlements[0]).toEqual({
      taskId: 'a#0',
      node: 'a',
      key: 'done',
      outcome: 'failed',
      attempt: 1,
      outputs: [{ ref: 'logs/build.txt' }],
    });
  });

  it('leaves the key absent on a settlement that recorded no artifacts', async () => {
    const log = createMemoryLog();
    const runtime = runtimeOver(log);
    await runtime.take({ graph: 'plain' });
    await runtime.report({ graph: 'plain', taskId: 'a#0', outcome: 'succeeded', key: 'done', result: 'A' });

    const view = await runtime.status({ graph: 'plain' });
    expect(view.settlements).toEqual([{ taskId: 'a#0', node: 'a', key: 'done', outcome: 'succeeded', attempt: 1 }]);
    expect('outputs' in (view.settlements[0] ?? {})).toBe(false);
  });
});
