import { describe, expect, it } from 'vitest';
import { buildTransitionTable, parseFlow, parseFlowEdge } from '../../src/flow.js';

describe('flow subset grammar (graph-flow)', () => {
  it('parses an unlabeled edge as the sequence default', () => {
    expect(parseFlowEdge('A --> B')).toEqual({ source: 'A', label: undefined, target: 'B' });
  });

  it('parses a labeled edge as a condition-matched transition', () => {
    expect(parseFlowEdge('A -->|pass| B')).toEqual({ source: 'A', label: 'pass', target: 'B' });
  });

  it('accepts whitespace around the arrow and label', () => {
    expect(parseFlowEdge('  review -->|fail|  execute ')).toEqual({
      source: 'review',
      label: 'fail',
      target: 'execute',
    });
  });

  it('rejects a malformed line loudly', () => {
    expect(() => parseFlowEdge('A -> B')).toThrow(/does not match the mermaid subset grammar/);
    expect(() => parseFlowEdge('A -->')).toThrow(/does not match the mermaid subset grammar/);
    expect(() => parseFlowEdge('')).toThrow(/does not match the mermaid subset grammar/);
  });

  it('names the entry index in a multi-line parse failure', () => {
    expect(() => parseFlow(['A --> B', 'BROKEN'])).toThrow(/flow\[1\]/);
  });
});

describe('transition table build (graph-flow)', () => {
  it('maps labeled edges into the condition→target table', () => {
    const table = buildTransitionTable([
      { source: 'review', label: 'pass', target: 'next' },
      { source: 'review', label: 'fail', target: 'execute' },
    ]);
    expect(table.get('review')?.conditions.get('pass')).toBe('next');
    expect(table.get('review')?.conditions.get('fail')).toBe('execute');
    expect(table.get('review')?.default).toEqual([]);
  });

  it('collects unlabeled edges as the sequence default', () => {
    const table = buildTransitionTable([
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
    ]);
    expect(table.get('a')?.default).toEqual(['b', 'c']);
    expect(table.get('a')?.conditions.size).toBe(0);
  });

  it('has no entry for a node without outgoing edges', () => {
    const table = buildTransitionTable([{ source: 'a', target: 'b' }]);
    expect(table.has('b')).toBe(false);
  });

  it('self-edge builds an inline loop entry', () => {
    const table = buildTransitionTable([{ source: 'execute', label: 'fail', target: 'execute' }]);
    expect(table.get('execute')?.conditions.get('fail')).toBe('execute');
  });
});
