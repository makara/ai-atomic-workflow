import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  createCheckpointSaver,
  createMemoryLog,
  mechanicalKey,
  plan,
  readsOf,
  settle,
  start,
  type CompiledGraph,
  type JudgePort,
  type JudgeRequest,
  type SettlePorts,
  type ThreadConfig,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A router node with two declared keys and a caller-chosen read face. */
function fork(read: readonly string[]): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }], read })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addEdge('left', END)
    .compile({ name: 'fork' });
}

/** Two super-steps, each with a two-key node, so the second judgment sees a populated state. */
function twoStep(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }], read: ['executed'] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }, { name: 'again' }], read: ['executed'] })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addConditionalEdges('left', { done: END, again: 'left' })
    .compile({ name: 'two-step' });
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

describe('the mechanical default', () => {
  it('takes the declared key the report carries', () => {
    expect(mechanicalKey(['onward', 'finish'], 'finish')).toBe('finish');
  });

  it('takes the sole declared key when the report carries none', () => {
    expect(mechanicalKey(['done'])).toBe('done');
  });

  it('stays undecided when several keys are declared and none is carried or matched', () => {
    expect(mechanicalKey(['onward', 'finish'])).toBeUndefined();
    expect(mechanicalKey(['onward', 'finish'], 'other')).toBeUndefined();
  });
});

describe('the read-narrowing rule', () => {
  it('keeps the full state when the node declares no read face', () => {
    expect(readsOf([])).toBeUndefined();
  });

  it('narrows to the declared face', () => {
    expect(readsOf(['executed', 'settled'])).toEqual(['executed', 'settled']);
  });
});

describe('the judgment port through settle', () => {
  it('routes on whichever port is injected', async () => {
    const onward: JudgePort = { judge: async () => ({ key: 'onward' }) };
    const finish: JudgePort = { judge: async () => ({ key: 'finish' }) };
    const graph = fork(['executed']);
    const task = plan(graph, start(graph))[0];

    const first = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: task.id, outcome: 'succeeded', result: 'A' },
      hostPorts(onward),
    );
    const second = await settle(
      CONFIG,
      graph,
      start(graph),
      { taskId: task.id, outcome: 'succeeded', result: 'B' },
      hostPorts(finish),
    );

    if ('refusal' in first || 'refusal' in second) throw new Error('port lane refused');
    expect(first.result.kind).toBe('advance');
    expect(first.state.channels.executed.value).toEqual(['A']);
    expect(second.result.kind).toBe('end');
    expect(second.state.channels.executed.value).toEqual(['B']);
  });

  it('refuses with candidates when no port is injected and the key is not mechanical', async () => {
    const graph = fork(['executed']);
    const task = plan(graph, start(graph))[0];
    const answer = await settle(CONFIG, graph, start(graph), { taskId: task.id, outcome: 'succeeded' }, hostPorts());
    if ('refusal' in answer) {
      expect(answer.refusal.code).toBe('infra');
      expect(answer.refusal.note).toContain('candidates: onward, finish');
    } else {
      throw new Error('expected a refusal');
    }
  });
});

describe('the reads and the state the judge sees', () => {
  it('carries the narrowed reads, and the full-state default when none is declared', async () => {
    const seen: JudgeRequest[] = [];
    const port: JudgePort = {
      judge: async (request) => {
        seen.push(request);
        return { key: 'onward' };
      },
    };
    const narrowed = fork(['executed']);
    const narrowedTask = plan(narrowed, start(narrowed))[0];
    await settle(CONFIG, narrowed, start(narrowed), { taskId: narrowedTask.id, outcome: 'succeeded' }, hostPorts(port));
    expect(seen[0].reads).toEqual(['executed']);

    const wide = fork([]);
    const wideTask = plan(wide, start(wide))[0];
    await settle({ thread_id: 'w' }, wide, start(wide), { taskId: wideTask.id, outcome: 'succeeded' }, hostPorts(port));
    expect(seen[1].reads).toBeUndefined();
  });

  it('hands the judge the current checkpoint state', async () => {
    const seen: JudgeRequest[] = [];
    const port: JudgePort = {
      judge: async (request) => {
        seen.push(request);
        return { key: seen.length === 1 ? 'onward' : 'done' };
      },
    };
    const graph = twoStep();
    const ports = hostPorts(port);
    const firstTask = plan(graph, start(graph))[0];
    const first = await settle(CONFIG, graph, start(graph), { taskId: firstTask.id, outcome: 'succeeded' }, ports);
    if ('refusal' in first) throw new Error(first.refusal.note);

    const secondTask = plan(graph, first.state)[0];
    const second = await settle(CONFIG, graph, first.state, { taskId: secondTask.id, outcome: 'succeeded' }, ports);
    if ('refusal' in second) throw new Error(second.refusal.note);

    // Same source: the second judgment reads exactly the values the first step settled —
    // the live state, never a stale copy of it.
    const live = Object.fromEntries(Object.entries(first.state.channels).map(([name, held]) => [name, held.value]));
    expect(seen[1].state.values).toEqual(live);
    expect(seen[1].state.next).toEqual(['left']);
  });
});
