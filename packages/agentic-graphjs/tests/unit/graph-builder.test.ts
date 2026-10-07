import { describe, expect, it } from 'vitest';

import { Annotation, END, GraphBuildError, IR_VERSION, START, StateGraph } from '../../src/internal.js';

const State = Annotation.Root({
  binding: Annotation({ source: 'input', reducer: 'replace' }),
  executed: Annotation({ source: 'node', reducer: 'append' }),
  settlements: Annotation({ source: 'node', reducer: 'merge' }),
});

/**
 * `compile` is the only behavior the builder owns: it freezes a declaration into
 * the runtime's input shape and hands that shape to `validateGraph`, so a dangling
 * name or a drifting router map fails where it is written.
 */
describe('StateGraph.compile', () => {
  it('carries the state shape into channels and stamps the contract version', () => {
    const graph = new StateGraph(State)
      .addNode('explore')
      .addEdge(START, 'explore')
      .addEdge('explore', END)
      .compile({ name: 'sample' });

    expect(graph.id).toBe('sample');
    expect(graph.version).toBe(IR_VERSION);
    expect(graph.channels).toEqual([
      { name: 'binding', source: 'input', reducer: 'replace' },
      { name: 'executed', source: 'node', reducer: 'append' },
      { name: 'settlements', source: 'node', reducer: 'merge' },
    ]);
  });
});

describe('the permission face', () => {
  it('carries the graph-level permission and input face in and leaves both out when undeclared', () => {
    const plain = new StateGraph(State).addNode('explore').addEdge(START, 'explore').addEdge('explore', END).compile();

    // An undeclared face stays absent: the builder defaults nothing, so the graph keeps its eight-entry shape.
    expect(plain.permissions).toBeUndefined();
    expect(plain.input).toBeUndefined();

    const scoped = new StateGraph(State)
      .addNode('explore')
      .addNode('gate', {
        task: 'approve',
        nodeType: 'checkpoint',
        timeoutMs: 5000,
        heartbeatMs: 1000,
        statusDetail: 'ask first',
        capabilities: ['approval'],
      })
      .addEdge(START, 'explore')
      .addEdge('explore', 'gate')
      .addEdge('gate', END)
      .compile({ name: 'scoped', permissions: { requiredMode: 'approve-reads' }, input: ['binding'] });

    expect(scoped.permissions).toEqual({ requiredMode: 'approve-reads' });
    expect(scoped.input).toEqual(['binding']);
    expect(scoped.nodes.gate).toEqual({
      id: 'gate',
      task: 'approve',
      keys: [],
      read: [],
      capabilities: ['approval'],
      nodeType: 'checkpoint',
      timeoutMs: 5000,
      heartbeatMs: 1000,
      statusDetail: 'ask first',
    });
  });

  it('deep-copies the permission face, so a later edit to the caller object cannot reach the graph', () => {
    const permissions: { requiredMode: 'approve-reads' | 'deny-all' } = { requiredMode: 'approve-reads' };
    const graph = new StateGraph(State)
      .addNode('explore')
      .addEdge(START, 'explore')
      .addEdge('explore', END)
      .compile({ name: 'scoped', permissions });

    permissions.requiredMode = 'deny-all';

    expect(graph.permissions).toEqual({ requiredMode: 'approve-reads' });
  });
});

describe('the IR a compile carries', () => {
  it('compiles node declarations and edges into the IR shape', () => {
    const graph = new StateGraph(State)
      .addNode('explore', { task: 'go', read: ['binding'], capabilities: ['model'] })
      .addNode('handoff')
      .addEdge(START, 'explore')
      .addEdge('explore', 'handoff')
      .addEdge('handoff', END)
      .compile();

    expect(graph.start).toBe('explore');
    expect(graph.end).toBe(END);
    expect(graph.nodes.explore).toEqual({
      id: 'explore',
      task: 'go',
      keys: [],
      read: ['binding'],
      capabilities: ['model'],
    });
    expect(graph.nodes.handoff).toEqual({ id: 'handoff', task: '', keys: [], read: [], capabilities: [] });
    expect(graph.edges).toEqual([
      { from: START, to: 'explore', kind: 'static' },
      { from: 'explore', to: 'handoff', kind: 'static' },
      { from: 'handoff', to: END, kind: 'static' },
    ]);
  });

  it('carries a router map without a key-producing function', () => {
    const graph = new StateGraph(State)
      .addNode('validate', { keys: [{ name: 'complete' }, { name: 'incomplete' }] })
      .addNode('retry')
      .addEdge(START, 'validate')
      .addConditionalEdges('validate', { complete: END, incomplete: 'retry' })
      .addEdge('retry', END)
      .compile();

    expect(graph.id).toBe('graph');
    expect(graph.edges).toEqual([
      { from: START, to: 'validate', kind: 'static' },
      { from: 'validate', to: END, kind: 'router', key: 'complete', map: { complete: END, incomplete: 'retry' } },
      { from: 'validate', to: 'retry', kind: 'router', key: 'incomplete', map: { complete: END, incomplete: 'retry' } },
      { from: 'retry', to: END, kind: 'static' },
    ]);
  });
});

describe('the loop declaration', () => {
  it('carries a declared loop with its budget and exhaustion target', () => {
    const graph = new StateGraph(State)
      .addNode('explore')
      .addEdge(START, 'explore')
      .addEdge('explore', END)
      .addLoop('revisit', { budget: 2, onExhausted: END })
      .compile();

    expect(graph.loops).toEqual([{ id: 'revisit', budget: 2, onExhausted: END }]);
  });
});

describe('the frozen declaration', () => {
  it('freezes the declaration so later edits cannot reach the compiled graph', () => {
    const build = new StateGraph(State)
      .addNode('explore', { read: [], capabilities: [] })
      .addEdge(START, 'explore')
      .addEdge('explore', END);
    const graph = build.compile();
    build.addNode('late').addEdge('explore', 'late');

    expect(graph.nodes).toEqual({ explore: { id: 'explore', task: '', keys: [], read: [], capabilities: [] } });
    expect(graph.edges).toEqual([
      { from: START, to: 'explore', kind: 'static' },
      { from: 'explore', to: END, kind: 'static' },
    ]);
  });
});

describe('StateGraph.compile faults', () => {
  it('rejects a node that names an undeclared channel', () => {
    const build = new StateGraph(State).addNode('explore', { read: ['absent'] }).addEdge(START, 'explore');
    expect(() => build.compile()).toThrowError(/unknown-channel: node 'explore' reads undeclared channel 'absent'/);
    expect(() => build.compile()).toThrowError(GraphBuildError);
  });

  it('rejects an edge that names an unknown node', () => {
    const build = new StateGraph(State).addNode('explore').addEdge(START, 'explore').addEdge('explore', 'absent');
    expect(() => build.compile()).toThrowError(/edge target names unknown node 'absent'/);
  });

  it('rejects a sentinel used on the wrong side of an edge', () => {
    const build = new StateGraph(State).addNode('explore').addEdge(START, 'explore').addEdge('explore', START);
    expect(() => build.compile()).toThrowError(/edge target names unknown node '__start__'/);
  });

  it('rejects a router map that drifts from the declared keys, and accepts it back', () => {
    const drifted = new StateGraph(State)
      .addNode('gate', { keys: [{ name: 'onward' }] })
      .addNode('left')
      .addEdge(START, 'gate')
      .addConditionalEdges('gate', { onward: 'left', extra: 'left' })
      .addEdge('left', END);
    expect(() => drifted.compile()).toThrowError(/key-set-mismatch/);

    const declared = new StateGraph(State)
      .addNode('gate', { keys: [{ name: 'onward' }, { name: 'extra' }] })
      .addNode('left')
      .addEdge(START, 'gate')
      .addConditionalEdges('gate', { onward: 'left', extra: 'left' })
      .addEdge('left', END);
    expect(() => declared.compile()).not.toThrow();
  });

  it('rejects a graph with no entry and no exit', () => {
    const build = new StateGraph(State).addNode('explore').addEdge('explore', 'explore');
    expect(() => build.compile()).toThrowError(/missing-start/);
  });

  it('rejects an illegal loop budget', () => {
    const build = new StateGraph(State)
      .addNode('explore')
      .addEdge(START, 'explore')
      .addEdge('explore', END)
      .addLoop('revisit', { budget: 0, onExhausted: END });
    expect(() => build.compile()).toThrowError(/loop-budget/);
  });

  it('rejects a reserved node name and a duplicate declaration', () => {
    expect(() => new StateGraph(State).addNode(END)).toThrowError(/reserved/);
    expect(() => new StateGraph(State).addNode('explore').addNode('explore')).toThrowError(/declared twice/);
  });
});
