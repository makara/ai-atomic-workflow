/**
 * The fixture face the runtime cases share: the state annotation every graph here folds into,
 * the graphs themselves, and the deterministic host around one in-memory log. It lives outside
 * `tests/unit/` so the case files read the same face instead of duplicating it.
 */
import {
  Annotation,
  END,
  START,
  StateGraph,
  createMemoryLog,
  createMemorySaver,
  type CompiledGraph,
  type GraphSource,
  type RuntimeDeps,
} from '../../src/internal.js';

export const State = Annotation.Root({
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settled: Annotation({ source: 'node', reducer: 'merge' }),
});

/** A three-node static chain; every node declares one key, so the mechanical face covers it. */
export function chainGraph(): CompiledGraph {
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

/** A gate whose key is the report's own answer: two declared keys, neither derivable. */
export function multiKeyGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('gate', { task: 'which', keys: [{ name: 'onward' }, { name: 'halt' }] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addNode('right', { task: 'R', keys: [{ name: 'done' }] })
    .addEdge(START, 'gate')
    .addConditionalEdges('gate', { onward: 'left', halt: 'right' })
    .addConditionalEdges('left', { done: END })
    .addConditionalEdges('right', { done: END })
    .compile({ name: 'multi' });
}

/** One super-step with two tasks: the head fans out, both halves rejoin at the join. */
export function fanoutGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('head', { task: 'H', keys: [{ name: 'done' }] })
    .addNode('left', { task: 'L', keys: [{ name: 'done' }] })
    .addNode('right', { task: 'R', keys: [{ name: 'done' }] })
    .addNode('join', { task: 'J', keys: [{ name: 'done' }] })
    .addEdge(START, 'head')
    .addEdge('head', 'left')
    .addEdge('head', 'right')
    .addConditionalEdges('left', { done: 'join' })
    .addConditionalEdges('right', { done: 'join' })
    .addConditionalEdges('join', { done: END })
    .compile({ name: 'fanout' });
}

/** A cycle: the router sends the run back to the head, or lands on the exit. */
export function cycleGraph(): CompiledGraph {
  return new StateGraph(State)
    .addNode('head', { task: 'H', keys: [{ name: 'done' }] })
    .addNode('gate', { task: 'which', keys: [{ name: 'again' }, { name: 'done' }] })
    .addEdge(START, 'head')
    .addConditionalEdges('head', { done: 'gate' })
    .addConditionalEdges('gate', { again: 'head', done: END })
    .compile({ name: 'cycle' });
}

export function sourceFor(graph: CompiledGraph, structureHash = 'h'): GraphSource {
  return {
    load: (name) =>
      Promise.resolve(name === 'chain' ? { ok: true, graph, structureHash } : { ok: false, code: 'GRAPH_UNREADABLE' }),
  };
}

/** A fresh deterministic capability set over one shared in-memory log. */
export function host(graph: CompiledGraph, structureHash = 'h'): RuntimeDeps {
  return {
    checkpointer: createCheckpoint(),
    context: { threadId: 't' },
    graphs: sourceFor(graph, structureHash),
  };
}

export function createCheckpoint() {
  let issued = 0;
  return createMemorySaver({
    log: sharedLog,
    identity: { nextId: () => String((issued += 1)) },
    clock: { now: () => '2026-09-30T00:00:00Z' },
  });
}

/** One log per described case, shared by the savers of that case. */
export let sharedLog = createMemoryLog();

/** Start the case over on an empty log: the savers built after this call read the new one. */
export function resetLog(): void {
  sharedLog = createMemoryLog();
}

export function fresh(): RuntimeDeps {
  resetLog();
  return host(chainGraph());
}
