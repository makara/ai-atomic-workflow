import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createCheckpointSaver,
  createMemoryLog,
  plan,
  serialize,
  settle,
  start,
  type CompiledGraph,
  type Json,
  type JudgePort,
  type SettlePorts,
  type ThreadConfig,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A two-node line: entry → a → b → exit, each node answering one key. */
function line(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', keys: [{ name: 'done' }], read: ['executed'] })
    .addNode('b', { task: 'B', keys: [{ name: 'done' }] })
    .addEdge(START, 'a')
    .addEdge('a', 'b')
    .addEdge('b', END)
    .compile({ name: 'line' });
}

/** A router node whose two declared keys need a judge when the report omits one. */
function fork(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addEdge('left', END)
    .compile({ name: 'fork' });
}

/** A fan-out: both heads share one super-step and one checkpoint. */
function fanout(): CompiledGraph {
  return new StateGraph(State)
    .addNode('p', { task: 'P', keys: [{ name: 'done' }] })
    .addNode('q', { task: 'Q', keys: [{ name: 'done' }] })
    .addEdge(START, 'p')
    .addEdge(START, 'q')
    .addEdge('p', END)
    .addEdge('q', END)
    .compile({ name: 'fanout' });
}

/** Deterministic host: one id counter and one fixed timestamp behind the saver, plus an optional judge. */
function hostPorts(judge?: JudgePort): SettlePorts {
  let issued = 0;
  return {
    saver: createCheckpointSaver({
      log: createMemoryLog(),
      identity: { nextId: () => String((issued += 1)) },
      clock: { now: () => '2026-09-30T00:00:00Z' },
    }),
    structureHash: 'h',
    ...(judge === undefined ? {} : { judge }),
  };
}

const CONFIG: ThreadConfig = { thread_id: 't' };

describe('the settle face', () => {
  it('settles one report into a checkpoint per super-step', async () => {
    const graph = line();
    const ports = hostPorts();
    const answer = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'a#0', outcome: 'succeeded', key: 'done', result: 'A' },
      ports,
    );
    expect(answer).toEqual({
      result: { kind: 'advance', state: expect.anything() },
      state: expect.anything(),
      checkpointId: '1',
    });
    if (!('checkpointId' in answer)) throw new Error('expected a checkpoint');
    const tuple = await ports.saver.getTuple(CONFIG);
    expect(tuple?.metadata).toEqual({ graph: 'line', structureHash: 'h', source: 'node', step: 0 });
    expect(answer.state.channels.executed).toEqual({ value: ['A'], version: 1 });
    expect(answer.state.channels.settled).toEqual({ value: { a: 'A' }, version: 1 });
  });

  it('folds the single declared key without a judge', async () => {
    const graph = line();
    const ports = hostPorts();
    const answer = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'a#0', outcome: 'succeeded', result: 'A' },
      ports,
    );
    expect('checkpointId' in answer).toBe(true);
  });
});

describe('the key face', () => {
  it('refuses a key outside the declared set with its candidates', async () => {
    const graph = line();
    const answer = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'a#0', outcome: 'succeeded', key: 'nope' },
      hostPorts(),
    );
    expect(answer).toEqual({
      refusal: { code: 'KEY_UNDECLARED', note: `'nope' — candidates: done`, keys: ['done'] },
    });
  });

  it('refuses a missing key on a multi-key node without a judge', async () => {
    const graph = fork();
    const answer = await settle(CONFIG, graph, start(graph), { taskId: 'gate#0', outcome: 'succeeded' }, hostPorts());
    expect(answer).toEqual({
      refusal: { code: 'infra', note: `node 'gate' — candidates: onward, finish` },
    });
  });

  it('routes on the key the judge produced', async () => {
    const graph = fork();
    const ports = hostPorts({ judge: async () => ({ key: 'onward' }) });
    const answer = await settle(CONFIG, graph, start(graph), { taskId: 'gate#0', outcome: 'succeeded' }, ports);
    if ('refusal' in answer) throw new Error('expected an answer');
    expect(plan(graph, answer.state)).toEqual([
      { id: 'left#0', node: 'left', input: {}, task: 'L', resultSpec: '', keys: ['done'] },
    ]);
  });
});

describe('the judged key', () => {
  it('refuses a judged key outside the declared set', async () => {
    const graph = fork();
    const ports = hostPorts({ judge: async () => ({ key: 'x' }) });
    const answer = await settle(CONFIG, graph, start(graph), { taskId: 'gate#0', outcome: 'succeeded' }, ports);
    expect(answer).toEqual({
      refusal: { code: 'KEY_UNDECLARED', note: `'x' — candidates: onward, finish`, keys: ['onward', 'finish'] },
    });
  });
});

describe('the frontier face', () => {
  it('refuses a task id outside the frontier', async () => {
    const graph = line();
    const answer = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'zz', outcome: 'succeeded', key: 'done' },
      hostPorts(),
    );
    expect(answer).toEqual({ refusal: { code: 'NO_OUTSTANDING_TASK', note: 'zz' } });
  });

  it('keeps the frontier over one interrupted super-step', async () => {
    const graph = fanout();
    const ports = hostPorts();
    const first = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: 'p#0', outcome: 'succeeded', key: 'done', result: 'P' },
      ports,
    );
    if ('refusal' in first) throw new Error('expected an answer');
    expect(first.result.kind).toBe('interrupt');
    // An interrupt is a checkpointed position: its entry state lands with the step's block after it.
    expect('checkpointId' in first).toBe(true);
    const second = await settle(
      CONFIG,
      graph,
      first.state,
      { taskId: 'q#0', outcome: 'succeeded', key: 'done', result: 'Q' },
      ports,
    );
    if ('refusal' in second) throw new Error('expected an answer');
    expect(second.result.kind).toBe('end');
    expect(second.state.channels.executed).toEqual({ value: ['P', 'Q'], version: 2 });
    const chain = await ports.saver.list(CONFIG);
    // Each position stands at its step's entry with that step's block after it: the interrupt's
    // checkpoint holds the empty entry (the suspended step advanced nothing, so the carried
    // state stays unfolded) and the resumed step's holds the same entry with q's block after it.
    expect(chain).toHaveLength(2);
    expect(chain[1]?.checkpoint.channel_values.executed).toEqual([]);
    expect(chain[1]?.pendingWrites?.map(({ taskId }) => taskId)).toEqual(['p#0']);
    expect(chain[0]?.checkpoint.channel_values.executed).toEqual([]);
    expect(chain[0]?.pendingWrites?.map(({ taskId }) => taskId)).toEqual(['q#0']);
  });
});

describe('the outcome face', () => {
  it('answers failed without a reason as unanchored and leaves the chain alone', async () => {
    const graph = line();
    const ports = hostPorts();
    const answer = await settle(CONFIG, graph, start(graph), { taskId: 'a#0', outcome: 'failed' }, ports);
    expect(answer).toEqual({ refusal: expect.objectContaining({ code: 'SETTLEMENT_UNANCHORED' }) });
    expect(await ports.saver.list(CONFIG)).toHaveLength(0);
  });

  it('holds the state for a retry without storing anything', async () => {
    const graph = line();
    const ports = hostPorts();
    const before = start(graph);
    const answer = await settle(CONFIG, graph, before, { taskId: 'a#0', outcome: 'retry', reason: 'again' }, ports);
    if ('refusal' in answer) throw new Error('expected an answer');
    expect(answer.state).toBe(before);
    expect(await ports.saver.list(CONFIG)).toHaveLength(0);
  });
});

describe('the replayed prefix', () => {
  it('replays the same prefix to the same bytes', async () => {
    const first = await oneStep();
    const again = await oneStep();
    expect(serialize(again)).toEqual(serialize(first));

    async function oneStep(): Promise<Json> {
      const graph = line();
      const ports = hostPorts();
      const answer = await settle(
        CONFIG,
        graph,
        start(graph),
        { taskId: 'a#0', outcome: 'succeeded', key: 'done', result: 'A' },
        ports,
      );
      if ('refusal' in answer) throw new Error('expected an answer');
      const tuple = await ports.saver.getTuple(CONFIG);
      if (tuple === undefined) throw new Error('expected a checkpoint');
      const values: Record<string, Json> = {};
      for (const [name, held] of Object.entries(answer.state.channels)) {
        values[name] = { value: held.value, version: held.version };
      }
      return {
        active: [...answer.state.active],
        values,
        checkpoint: {
          v: tuple.checkpoint.v,
          id: tuple.checkpoint.id,
          ts: tuple.checkpoint.ts,
          channel_values: { ...tuple.checkpoint.channel_values },
          channel_versions: { ...tuple.checkpoint.channel_versions },
          versions_seen: { ...tuple.checkpoint.versions_seen },
        },
        step: tuple.metadata.step,
      };
    }
  });
});
