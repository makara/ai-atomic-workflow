/**
 * Tests for topology.ts — Kahn algorithm, cycle detection, dependency resolution,
 * and upstream tracing. All pure functions — direct I/O tests, zero mocks.
 */

import { describe, expect, it } from 'vitest';
import { findUpstream, resolveReady, topoLayers } from '../src/topology.js';
import type { Phase } from '../src/types.js';

// ── Phase factories ────────────────────────────────────────────────────────

function phase(id: string, type: Phase['type'], dependsOn?: string[]): Phase {
  return { id, type, dependsOn };
}

function agent(id: string, dependsOn?: string[]): Phase {
  return phase(id, 'agent', dependsOn);
}

function approval(id: string, dependsOn?: string[]): Phase {
  return phase(id, 'approval', dependsOn);
}

// Helper: extract phase ids from layers
function ids(layers: Phase[][]): string[][] {
  return layers.map((layer) => layer.map((p) => p.id));
}

// ── topoLayers ─────────────────────────────────────────────────────────────

describe('topoLayers', () => {
  it('empty array returns empty layers', () => {
    expect(topoLayers([])).toEqual([]);
  });

  it('single phase returns one layer', () => {
    expect(ids(topoLayers([agent('a')]))).toEqual([['a']]);
  });

  it('linear DAG: a → b → c', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['b'])];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b'], ['c']]);
  });

  it('diamond DAG: a → b,c → d', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['a']), agent('d', ['b', 'c'])];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('complex DAG with 3 layers of concurrency', () => {
    const phases = [
      agent('a'),
      agent('b', ['a']),
      agent('c', ['a']),
      agent('d', ['a']),
      agent('e', ['b', 'c']),
      agent('f', ['d']),
      approval('g', ['e', 'f']),
    ];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b', 'c', 'd'], ['e', 'f'], ['g']]);
  });

  it('disconnected subgraphs co-exist in same layers', () => {
    const phases = [agent('a'), agent('b'), agent('c', ['a']), agent('d', ['b'])];
    expect(ids(topoLayers(phases))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('cycle detected: a → b → a', () => {
    const phases = [agent('a', ['b']), agent('b', ['a'])];
    expect(() => topoLayers(phases)).toThrow();
  });

  it('cycle detected: a → b → c → a', () => {
    const phases = [agent('a', ['c']), agent('b', ['a']), agent('c', ['b'])];
    expect(() => topoLayers(phases)).toThrow();
  });

  it('self-loop detected: a → a', () => {
    const phases = [agent('a', ['a'])];
    expect(() => topoLayers(phases)).toThrow();
  });
});

// ── resolveReady ───────────────────────────────────────────────────────────

describe('resolveReady', () => {
  it('empty phases returns empty', () => {
    expect(resolveReady([], new Set())).toEqual([]);
  });

  it('all phases ready when none have dependencies', () => {
    const phases = [agent('a'), agent('b'), agent('c')];
    expect(
      resolveReady(phases, new Set())
        .map((p) => p.id)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
  });

  it('only dependency-free phases are ready', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['a']), agent('d', ['b', 'c'])];
    expect(resolveReady(phases, new Set()).map((p) => p.id)).toEqual(['a']);
  });

  it('completed dependencies unlock next layer', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['a'])];
    expect(
      resolveReady(phases, new Set(['a']))
        .map((p) => p.id)
        .sort(),
    ).toEqual(['b', 'c']);
  });

  it('partially completed — only some are unlocked', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['a']), agent('d', ['b', 'c'])];
    const ready = resolveReady(phases, new Set(['a']));
    expect(ready.length).toBe(2);
    expect(ready.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('multi-dependency node only ready when all deps done', () => {
    const phases = [agent('a'), agent('b'), agent('c', ['a', 'b'])];
    // only a done — c still blocked on b
    expect(resolveReady(phases, new Set(['a'])).map((p) => p.id)).toEqual(['b']);
    // both done — c ready
    const ready = resolveReady(phases, new Set(['a', 'b']));
    expect(ready.map((p) => p.id)).toEqual(['c']);
  });
});

// ── findUpstream ───────────────────────────────────────────────────────────

describe('findUpstream', () => {
  it('no dependencies — returns empty', () => {
    const phases = [agent('a')];
    expect(findUpstream('a', phases)).toEqual([]);
  });

  it('direct upstream found', () => {
    const phases = [agent('a'), agent('b', ['a'])];
    expect(findUpstream('b', phases)).toEqual(['a']);
  });

  it('transitive upstream via BFS', () => {
    const phases = [agent('a'), agent('b', ['a']), agent('c', ['b'])];
    const upstream = findUpstream('c', phases);
    expect(upstream.sort()).toEqual(['a', 'b']);
  });

  it('diamond — finds all ancestors', () => {
    const phases = [
      agent('root'),
      agent('left', ['root']),
      agent('right', ['root']),
      agent('merge', ['left', 'right']),
    ];
    const upstream = findUpstream('merge', phases);
    expect(upstream.sort()).toEqual(['left', 'right', 'root']);
  });

  it('orphan node not in graph — returns empty', () => {
    const phases = [agent('a')];
    expect(findUpstream('nonexistent', phases)).toEqual([]);
  });
});
