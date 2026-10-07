import { describe, expect, it } from 'vitest';

import {
  Annotation,
  END,
  RuntimeError,
  START,
  StateGraph,
  initialState,
  run,
  start,
  type ChannelWrite,
  type CompiledGraph,
  type RunEvent,
  type RunState,
} from '../../src/internal.js';
// The internal face retires `resume` (the replay reads it from its own module), so this test
// reads it the way the replay does.
import { resume } from '../../src/step/run.js';

const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  terminal: Annotation({ source: 'node', reducer: 'replace' }),
  artifacts: Annotation({ source: 'node', reducer: 'append' }),
});

/** A three-node line: entry → a → b → c → exit. */
function line(): CompiledGraph {
  return new StateGraph(State)
    .addNode('a', { task: 'a' })
    .addNode('b', { task: 'b' })
    .addNode('c', { task: 'c' })
    .addEdge(START, 'a')
    .addEdge('a', 'b')
    .addEdge('b', 'c')
    .addEdge('c', END)
    .compile({ name: 'line' });
}

/** A router node: the recorded key selects the target. */
function fork(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'finish' }] })
    .addNode('left')
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', finish: END })
    .addEdge('left', END)
    .compile({ name: 'fork' });
}

/** A fan-out that routes onward: one super-step steps over `left` and `right`, and each routes
 *  to its own successor, so the order the frontier routes in shows in the next active set. */
function split(): CompiledGraph {
  return new StateGraph(State)
    .addNode('head', { task: 'h' })
    .addNode('left')
    .addNode('right')
    .addNode('x')
    .addNode('y')
    .addEdge(START, 'head')
    .addEdge('head', 'left')
    .addEdge('head', 'right')
    .addEdge('left', 'x')
    .addEdge('right', 'y')
    .addEdge('x', END)
    .addEdge('y', END)
    .compile({ name: 'split' });
}

/** A probe: no settlement, so the first unsettled node suspends. */
function advance(): RunEvent {
  return { kind: 'advance' };
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

describe('super-step scheduling', () => {
  it('starts at the entry sentinel and suspends the first node with its payload', () => {
    const graph = line();
    expect(run(graph, start(graph), advance())).toEqual({ kind: 'interrupt', node: 'a', payload: 'a' });
  });

  it('applies the fan-out writes, advances the versions, and routes on', () => {
    const graph = line();
    const afterA = advanced(graph, start(graph), settle('a', 'done', { executed: 'a', artifacts: 'a1' }));

    expect(afterA.active).toEqual(['b']);
    expect(afterA.channels.executed).toEqual({ value: ['a'], version: 1 });
    expect(afterA.channels.artifacts).toEqual({ value: ['a1'], version: 1 });
    expect(afterA.channels.terminal.version).toBe(0);
  });

  it('walks a three-node line from the first suspension to the terminal state', () => {
    const graph = line();
    let state = start(graph);
    const seen: string[] = [];
    let result = run(graph, state, advance());

    while (result.kind === 'interrupt') {
      seen.push(result.node);
      const stepped = run(graph, state, settle(result.node, 'done', { executed: result.node }));
      if (stepped.kind === 'end') {
        result = stepped;
        break;
      }
      if (stepped.kind !== 'advance') throw new Error(`expected an advance, read ${stepped.kind}`);
      state = stepped.state;
      result = run(graph, state, advance());
    }

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result.kind).toBe('end');
    if (result.kind !== 'end') return;
    expect(result.state.channels.executed.value).toEqual(['a', 'b', 'c']);
    expect(result.state.active).toEqual([]);
  });
});

describe('terminal routing', () => {
  it('ends when the settled nodes route nowhere', () => {
    const graph = line();
    const state = advanced(graph, start(graph), settle('a', 'done'));
    const last = run(graph, state, settle('b', 'done'));

    expect(last.kind).toBe('advance');
    if (last.kind !== 'advance') return;
    expect(last.state.active).toEqual(['c']);
    expect(last.state.channels.terminal.version).toBe(0);
  });
});

describe('routing, re-entry, and faults', () => {
  it('routes on the recorded key and refuses a key its router does not carry', () => {
    const graph = fork();
    expect(run(graph, start(graph), advance())).toEqual({ kind: 'interrupt', node: 'gate', payload: 'which' });

    expect(advanced(graph, start(graph), settle('gate', 'onward')).active).toEqual(['left']);
    expect(run(graph, start(graph), settle('gate', 'finish')).kind).toBe('end');
    expect(() => run(graph, start(graph), settle('gate', 'sideways'))).toThrowError(/carries no such entry/);
  });

  it('never asks again for a settlement it already recorded', () => {
    const graph = line();
    const once = run(graph, start(graph), settle('a', 'done'));
    const twice = run(graph, start(graph), settle('a', 'done'));

    expect(once).toEqual(twice);
    expect(once.kind).toBe('advance');
    expect(run(graph, start(graph), advance())).toEqual({ kind: 'interrupt', node: 'a', payload: 'a' });
  });

  it('refuses a settlement for a node that is not active', () => {
    const graph = line();
    expect(() => run(graph, start(graph), settle('c', 'done'))).toThrowError(RuntimeError);
    expect(() => run(graph, start(graph), settle('c', 'done'))).toThrowError(/not active in this step/);
  });

  it('refuses a graph whose entry leads nowhere or routes before a key exists', () => {
    const stranded: CompiledGraph = {
      version: '1',
      id: 'stranded',
      start: 'a',
      end: END,
      channels: [],
      nodes: { a: { id: 'a', task: 'a', keys: [], read: [], capabilities: [] } },
      edges: [],
      loops: [],
    };
    expect(() => start(stranded)).toThrowError(/no edge leaves the entry sentinel/);

    const routedEntry: CompiledGraph = {
      ...stranded,
      id: 'routed-entry',
      edges: [{ from: START, to: 'a', kind: 'router', key: 'onward', map: { onward: 'a' } }],
    };
    expect(() => start(routedEntry)).toThrowError(/router edge leaves the entry sentinel/);
  });
});

/**
 * The entry sentinel's edges are the whole entry face: every static target stands active, the
 * first one rides as the compiled graph's `start` summary, and a sentinel that leaves nothing is
 * refused — at `start` and at a cold rebuild alike. A router edge cannot leave the sentinel: no
 * key has been recorded when the first step runs.
 */
describe('the entry the sentinel leaves', () => {
  it('stands on every static entry target, refusing none, with the first as the start summary', () => {
    const graph = new StateGraph(State)
      .addNode('a')
      .addNode('b')
      .addEdge(START, 'a')
      .addEdge(START, 'b')
      .addEdge('a', END)
      .addEdge('b', END)
      .compile({ name: 'multi-entry' });

    // The kept status quo: several entry edges are all followed — nothing is refused for
    // carrying more than one — and `start` stays the first edge's convenience summary.
    expect(start(graph).active).toEqual(['a', 'b']);
    expect(graph.start).toBe('a');
  });

  it('refuses a graph whose entry leads nowhere instead of answering an ended chain', () => {
    const stranded: CompiledGraph = {
      version: '1',
      id: 'stranded',
      start: 'a',
      end: END,
      channels: [],
      nodes: { a: { id: 'a', task: 'a', keys: [], read: [], capabilities: [] } },
      edges: [],
      loops: [],
    };

    // The cold rebuild refuses the entryless graph exactly as `start` does — never an ended chain.
    expect(() => resume(stranded, initialState(stranded.channels), {})).toThrowError(
      /declares no entry the start sentinel leaves/,
    );
    // The refusal is the entryless graph's alone: a sentinel with an edge resumes at its target.
    const graph = line();
    expect(resume(graph, initialState(graph.channels), {}).active).toEqual(['a']);
  });
});

/**
 * A cold rebuild folds the chain block by block, and a block's settlement record is keyed by the
 * order the host reported in. The frontier the step stepped in is the only order a rebuild may
 * route: reading the record instead lets the report order reach the frontier, and the replay
 * then drifts from the run it replays.
 */
describe('the frontier a rebuilt block stands on', () => {
  it('routes in the frontier order the step stepped in, never the order the report listed', () => {
    const graph = split();
    const channels = initialState(graph.channels);
    // The same block reported forward and backward: the record's key order flips, the frontier
    // does not, so both rebuilds stand on the same next set in the same order.
    const forward = { left: { node: 'left', key: 'done' }, right: { node: 'right', key: 'done' } };
    const backward = { right: { node: 'right', key: 'done' }, left: { node: 'left', key: 'done' } };

    const fromForward = resume(graph, channels, forward, {}, ['left', 'right']);
    const fromBackward = resume(graph, channels, backward, {}, ['left', 'right']);

    expect(fromBackward).toEqual(fromForward);
    expect(fromForward.active).toEqual(['x', 'y']);
  });

  it('routes only the block it stepped over, so a settled node never re-enters the frontier', () => {
    const graph = line();
    // The record carries an earlier block's settlement too; this block stepped over b alone,
    // and routing a again would re-issue a node the chain has already settled.
    const settled = { a: { node: 'a', key: 'done' }, b: { node: 'b', key: 'done' } };

    expect(resume(graph, initialState(graph.channels), settled, {}, ['b']).active).toEqual(['c']);
  });
});

describe('the stub invariant', () => {
  it('reaches the same result for the same graph, state, and event', () => {
    const graph = line();
    const event = settle('a', 'done');
    expect(run(graph, start(graph), event)).toEqual(run(graph, start(graph), event));
  });

  it('reads no clock and draws no random value while stepping', () => {
    const graph = line();
    const realNow = Date.now;
    const realRandom = Math.random;
    let clockReads = 0;
    let draws = 0;
    Date.now = () => {
      clockReads += 1;
      return realNow();
    };
    Math.random = () => {
      draws += 1;
      return realRandom();
    };

    try {
      run(graph, start(graph), advance());
      run(graph, start(graph), settle('a', 'done', { executed: 'a' }));
    } finally {
      Date.now = realNow;
      Math.random = realRandom;
    }

    expect({ clockReads, draws }).toEqual({ clockReads: 0, draws: 0 });
  });
});

/**
 * A router map is keyed by the settled key, and the occurrence counts by the node name: both
 * are ordinary objects, so a name the prototype also resolves must answer as a missing entry
 * — never as the inherited value, which would route to a node no declaration names.
 */
describe('the step over prototype-resolved names', () => {
  it('refuses a router key the map does not carry instead of routing to an inherited value', () => {
    const graph: CompiledGraph = {
      version: '1',
      id: 'host-keyed',
      start: 'gate',
      end: END,
      channels: [],
      nodes: { gate: { id: 'gate', task: 'G', keys: [{ name: 'constructor' }], read: [], capabilities: [] } },
      edges: [{ from: 'gate', to: END, kind: 'router', key: 'constructor', map: {} }],
      loops: [],
    };
    const state: RunState = { channels: {}, active: ['gate'], settlements: {}, visits: {} };

    expect(() => run(graph, state, settle('gate', 'constructor'))).toThrowError(/carries no such entry/);
  });

  it('holds a prototype-resolved node occurrence as an own key', () => {
    const graph: CompiledGraph = {
      version: '1',
      id: 'host-named',
      start: '__proto__',
      end: END,
      channels: [],
      nodes: { ['__proto__']: { id: '__proto__', task: 'P', keys: [], read: [], capabilities: [] } },
      edges: [{ from: '__proto__', to: END, kind: 'static' }],
      loops: [],
    };
    const state: RunState = { channels: {}, active: ['__proto__'], settlements: {}, visits: {} };

    const result = run(graph, state, settle('__proto__', 'done'));

    expect(result.kind).toBe('end');
    if (result.kind !== 'end') return;
    expect(Object.getOwnPropertyNames(result.state.visits)).toEqual(['__proto__']);
    expect(Object.getPrototypeOf(result.state.visits)).toBe(Object.prototype);
    expect(result.state.visits['__proto__']).toBe(1);
  });
});
