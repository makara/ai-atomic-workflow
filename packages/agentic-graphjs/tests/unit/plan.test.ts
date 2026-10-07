import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  START,
  StateGraph,
  plan,
  run,
  start,
  type ChannelWrite,
  type CompiledGraph,
  type RunEvent,
  type RunState,
} from '../../src/internal.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  terminal: Annotation({ source: 'node', reducer: 'replace' }),
});

/** A two-node line: entry → a → b → exit, both nodes reading `executed`. */
function line(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'A', read: ['executed'] })
    .addNode('b', { task: 'B', read: ['executed'] })
    .addEdge(START, 'a')
    .addEdge('a', 'b')
    .addEdge('b', END)
    .compile({ name: 'line' });
}

/** A router node: the recorded key selects the next hop or the exit. */
function fork(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }] })
    .addNode('left', { task: 'L' })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addEdge('left', END)
    .compile({ name: 'fork' });
}

/** A cycle: the router sends the run back to the head, or lands on the exit. */
function cycle(): CompiledGraph {
  return new StateGraph(State)
    .addNode('head', { task: 'H' })
    .addNode('gate', { task: 'which', keys: [{ name: 'again' }, { name: 'done' }] })
    .addEdge(START, 'head')
    .addEdge('head', 'gate')
    .addConditionalEdges('gate', { again: 'head', done: END })
    .addLoop('back', { budget: 2, onExhausted: END })
    .compile({ name: 'cycle' });
}

/** One settlement delivered to the step. */
function settle(node: string, key: string, writes: ChannelWrite = {}): RunEvent {
  return { kind: 'advance', settlement: { node, key, writes } };
}

/** Advance one step and require it to have advanced. */
function advanced(graph: CompiledGraph, state: RunState, event: RunEvent): RunState {
  const result = run(graph, state, event);
  if (result.kind !== 'advance') throw new Error(`expected an advance, read ${result.kind}`);
  return result.state;
}

/** Run one step and require it to have ended, handing back the final state. */
function ended(graph: CompiledGraph, state: RunState, event: RunEvent): RunState {
  const result = run(graph, state, event);
  if (result.kind !== 'end') throw new Error(`expected an end, read ${result.kind}`);
  return result.state;
}

describe('the plan step', () => {
  it('names the entry frontier as one task reading its channel', () => {
    const graph = line();
    expect(plan(graph, start(graph))).toEqual([
      { id: 'a#0', node: 'a', input: { executed: [] }, task: 'A', resultSpec: '', keys: [] },
    ]);
  });

  it('moves the frontier one hop after the head settles', () => {
    const graph = line();
    const afterA = advanced(graph, start(graph), settle('a', 'done', { executed: 'a' }));
    expect(plan(graph, afterA)).toEqual([
      { id: 'b#0', node: 'b', input: { executed: ['a'] }, task: 'B', resultSpec: '', keys: [] },
    ]);
  });

  it('follows the router key to the branch or the exit', () => {
    const graph = fork();
    const onward = advanced(graph, start(graph), settle('gate', 'onward'));
    expect(plan(graph, onward)).toEqual([
      { id: 'left#0', node: 'left', input: {}, task: 'L', resultSpec: '', keys: [] },
    ]);
    expect(ended(graph, start(graph), settle('gate', 'finish')).active).toEqual([]);
    expect(plan(graph, ended(graph, start(graph), settle('gate', 'finish')))).toEqual([]);
  });

  it('walks the loop back to the head while the router keeps returning', () => {
    const graph = cycle();
    const atGate = advanced(graph, start(graph), settle('head', 'done', { executed: 'H' }));
    const againAtHead = advanced(graph, atGate, settle('gate', 'again'));
    // The loop-back is a fresh occurrence: the id counts settlements of the node, never
    // its position on the frontier, so the revisit cannot collide with the first pass.
    expect(plan(graph, againAtHead)).toEqual([
      { id: 'head#1', node: 'head', input: {}, task: 'H', resultSpec: '', keys: [] },
    ]);
    const spent = advanced(graph, againAtHead, settle('head', 'done'));
    expect(plan(graph, ended(graph, spent, settle('gate', 'done')))).toEqual([]);
  });

  it('lands on no task once the exit is reached', () => {
    const graph = line();
    const afterA = advanced(graph, start(graph), settle('a', 'done', { executed: 'a' }));
    expect(plan(graph, ended(graph, afterA, settle('b', 'done', { executed: 'b' })))).toEqual([]);
  });

  it('answers the same tasks for two reads of one state', () => {
    const graph = line();
    const state = start(graph);
    const first = plan(graph, state);
    const again = plan(graph, state);
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
  });
});

/** A graph whose channel and node names are the ones a plain object resolves through its prototype. */
function hostNamed(): CompiledGraph {
  return {
    version: '1',
    id: 'host-named',
    start: 'constructor',
    end: END,
    channels: [{ name: '__proto__', source: 'node', reducer: 'merge' }],
    nodes: { constructor: { id: 'constructor', task: 'C', keys: [], read: ['__proto__'], capabilities: [] } },
    edges: [],
    loops: [],
  };
}

/**
 * A channel no write reached reads `null`, and the occurrence count starts at zero: both
 * answers come from an own entry. A name the prototype also resolves would otherwise answer
 * an inherited value, and the id would mint an ordinal out of one.
 */
describe('the plan step over prototype-resolved names', () => {
  it('holds a read under an own input key and counts the node occurrence from zero', () => {
    const state: RunState = { channels: {}, active: ['constructor'], settlements: {}, visits: {} };

    const [task] = plan(hostNamed(), state);

    expect(task?.id).toBe('constructor#0');
    expect(Object.getOwnPropertyNames(task?.input)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(task?.input)).toBe(Object.prototype);
    expect(task?.input).toEqual({ ['__proto__']: null });
  });
});
