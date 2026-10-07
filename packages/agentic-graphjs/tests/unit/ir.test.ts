import { describe, expect, it } from 'vitest';

import { END, START, validateGraph, type CompiledGraph } from '../../src/internal.js';

/** A well-formed graph: one channel, three nodes, a static line, and one spent loop. */
function sample(): CompiledGraph {
  return {
    version: '1',
    id: 'sample',
    start: 'gate',
    end: END,
    channels: [{ name: 'executed', source: 'node', reducer: 'append' }],
    nodes: {
      gate: {
        id: 'gate',
        task: 'decide',
        keys: [{ name: 'onward' }, { name: 'finish', criteria: 'the ledger is closed' }],
        read: [],
        capabilities: ['model'],
      },
      left: { id: 'left', task: 'work', keys: [], read: ['executed'], capabilities: [] },
    },
    edges: [
      { from: START, to: 'gate', kind: 'static' },
      { from: 'gate', to: 'left', kind: 'router', key: 'onward', map: { onward: 'left', finish: END } },
      { from: 'gate', to: END, kind: 'router', key: 'finish', map: { onward: 'left', finish: END } },
      { from: 'left', to: END, kind: 'static' },
    ],
    loops: [{ id: 'retry', budget: 3, onExhausted: END }],
  };
}

/** One fault code per refusal class, so each class is asserted on its own. */
function codesOf(graph: CompiledGraph): string[] {
  return validateGraph(graph).map((fault) => fault.code);
}

describe('validateGraph acceptance', () => {
  it('answers no fault for a well-formed graph', () => {
    expect(validateGraph(sample())).toEqual([]);
  });

  it('reads the identity face of the compiled artifact', () => {
    const graph = sample();
    expect(graph.version).toBe('1');
    expect(graph.id).toBe('sample');
    expect(graph.start).toBe('gate');
    expect(graph.end).toBe(END);
    expect(graph.channels[0]).toEqual({ name: 'executed', source: 'node', reducer: 'append' });
    expect(graph.nodes.left?.read).toEqual(['executed']);
  });
});

describe('validateGraph refusals', () => {
  it('refuses a router whose key set drifts from the declared keys', () => {
    const graph = sample();
    const drifted: CompiledGraph = {
      ...graph,
      edges: [
        graph.edges[0]!,
        { from: 'gate', to: 'left', kind: 'router', key: 'onward', map: { onward: 'left' } },
        { from: 'left', to: END, kind: 'static' },
      ],
    };

    expect(codesOf(drifted)).toContain('key-set-mismatch');
    expect(codesOf(sample())).not.toContain('key-set-mismatch');
  });

  it('refuses a router whose keyed entry contradicts its own target', () => {
    const graph = sample();
    const contradicted: CompiledGraph = {
      ...graph,
      edges: [
        graph.edges[0]!,
        { from: 'gate', to: END, kind: 'router', key: 'onward', map: { ...graph.edges[1]!.map } },
      ],
    };

    expect(codesOf(contradicted)).toContain('key-set-mismatch');
  });
});

describe('the router and loop refusals', () => {
  it('refuses a graph that never leaves the entry sentinel', () => {
    const graph = sample();
    expect(codesOf({ ...graph, edges: graph.edges.filter((edge) => edge.from !== START) })).toContain('missing-start');
    expect(codesOf({ ...graph, start: '' })).toContain('missing-start');
  });

  it('refuses a graph no edge brings to the exit sentinel', () => {
    const graph = sample();
    const orphan: CompiledGraph = {
      ...graph,
      edges: [graph.edges[0]!, { from: 'gate', to: 'left', kind: 'static' }],
    };

    expect(codesOf(orphan)).toContain('missing-end');
    expect(codesOf({ ...graph, end: 'left' })).toContain('missing-end');
  });

  it('refuses a loop whose budget is not a positive whole number', () => {
    const graph = sample();
    expect(codesOf({ ...graph, loops: [{ id: 'retry', budget: 0, onExhausted: END }] })).toContain('loop-budget');
    expect(codesOf({ ...graph, loops: [{ id: 'retry', budget: 1.5, onExhausted: END }] })).toContain('loop-budget');
    expect(codesOf({ ...graph, loops: [{ id: 'retry', budget: 3, onExhausted: 'absent' }] })).toContain('loop-budget');
  });

  it('refuses names that resolve to nothing', () => {
    const graph = sample();
    expect(codesOf({ ...graph, edges: [{ from: START, to: 'absent', kind: 'static' }] })).toContain('unknown-node');

    const unread: CompiledGraph = {
      ...graph,
      nodes: { ...graph.nodes, left: { id: 'left', task: 'work', keys: [], read: ['absent'], capabilities: [] } },
    };
    expect(codesOf(unread)).toContain('unknown-channel');
  });

  it('refuses a static edge that carries router fields and a router that lacks them', () => {
    const graph = sample();
    expect(
      codesOf({ ...graph, edges: [{ from: START, to: 'gate', kind: 'static', map: { onward: 'gate' } }] }),
    ).toContain('edge-kind');
    expect(codesOf({ ...graph, edges: [{ from: 'gate', to: 'left', kind: 'router' }] })).toContain('edge-kind');
  });

  it('refuses a channel declared twice and a node whose id contradicts its name', () => {
    const graph = sample();
    expect(
      codesOf({ ...graph, channels: [...graph.channels, { name: 'executed', source: 'input', reducer: 'merge' }] }),
    ).toContain('duplicate-channel');
    expect(codesOf({ ...graph, nodes: { ...graph.nodes, left: { ...graph.nodes.left!, id: 'other' } } })).toContain(
      'node-id-mismatch',
    );
  });
});
