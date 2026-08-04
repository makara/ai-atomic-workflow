/**
 * Tests for topology.ts — Kahn algorithm, cycle detection, dependency resolution,
 * and upstream tracing. All pure functions — direct I/O tests, zero mocks.
 */

import { describe, expect, it } from 'vitest';
import { findUpstream, resolveReady, topoLayers } from '../src/topology.js';
import type { Phase } from '../src/types.js';

// ── Phase factories ────────────────────────────────────────────────────────

function phase(id: string, type: Phase['type'], dependsOn?: string[]): Phase {
  // join absent = default all (explicit 'all' rejected by schema — redundant default)
  return { id, type, dependsOn, mode: 'exclusive' };
}

function main(id: string, dependsOn?: string[]): Phase {
  return phase(id, 'main', dependsOn);
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
    expect(ids(topoLayers([main('a')]))).toEqual([['a']]);
  });

  it('linear DAG: a → b → c', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['b'])];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b'], ['c']]);
  });

  it('diamond DAG: a → b,c → d', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['a']), main('d', ['b', 'c'])];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b', 'c'], ['d']]);
  });

  it('complex DAG with 3 layers of concurrency', () => {
    const phases = [
      main('a'),
      main('b', ['a']),
      main('c', ['a']),
      main('d', ['a']),
      main('e', ['b', 'c']),
      main('f', ['d']),
      approval('g', ['e', 'f']),
    ];
    expect(ids(topoLayers(phases))).toEqual([['a'], ['b', 'c', 'd'], ['e', 'f'], ['g']]);
  });

  it('disconnected subgraphs co-exist in same layers', () => {
    const phases = [main('a'), main('b'), main('c', ['a']), main('d', ['b'])];
    expect(ids(topoLayers(phases))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('cycle detected: a → b → a', () => {
    const phases = [main('a', ['b']), main('b', ['a'])];
    expect(() => topoLayers(phases)).toThrow();
  });

  it('cycle detected: a → b → c → a', () => {
    const phases = [main('a', ['c']), main('b', ['a']), main('c', ['b'])];
    expect(() => topoLayers(phases)).toThrow();
  });

  it('self-loop detected: a → a', () => {
    const phases = [main('a', ['a'])];
    expect(() => topoLayers(phases)).toThrow();
  });
});

// ── resolveReady ───────────────────────────────────────────────────────────

describe('resolveReady', () => {
  it('empty phases returns empty', () => {
    expect(resolveReady([], new Set())).toEqual([]);
  });

  it('all phases ready when none have dependencies', () => {
    const phases = [main('a'), main('b'), main('c')];
    expect(
      resolveReady(phases, new Set())
        .map((p) => p.id)
        .sort(),
    ).toEqual(['a', 'b', 'c']);
  });

  it('only dependency-free phases are ready', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['a']), main('d', ['b', 'c'])];
    expect(resolveReady(phases, new Set()).map((p) => p.id)).toEqual(['a']);
  });

  it('completed dependencies unlock next layer', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['a'])];
    expect(
      resolveReady(phases, new Set(['a']))
        .map((p) => p.id)
        .sort(),
    ).toEqual(['b', 'c']);
  });

  it('partially completed — only some are unlocked', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['a']), main('d', ['b', 'c'])];
    const ready = resolveReady(phases, new Set(['a']));
    expect(ready.length).toBe(2);
    expect(ready.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('multi-dependency node only ready when all deps done', () => {
    const phases = [main('a'), main('b'), main('c', ['a', 'b'])];
    // only a done — c still blocked on b
    expect(resolveReady(phases, new Set(['a'])).map((p) => p.id)).toEqual(['b']);
    // both done — c ready
    const ready = resolveReady(phases, new Set(['a', 'b']));
    expect(ready.map((p) => p.id)).toEqual(['c']);
  });
});

// ── resolveReady — join mode ───────────────────────────────────────────────

describe('resolveReady — join mode', () => {
  it('join: "all" (default) — all deps must complete', () => {
    const phases = [main('a', []), main('b', []), main('c', ['a', 'b'])];
    // only a done — c still blocked on b
    expect(resolveReady(phases, new Set(['a'])).map((p) => p.id)).toEqual(['b']);
  });

  it('join: "any" — one dep completed activates phase', () => {
    const phases: Phase[] = [
      main('a', []),
      main('b', []),
      { id: 'c', type: 'main', dependsOn: ['a', 'b'], join: 'any' as const, mode: 'exclusive' as const },
    ];
    // only a done — c is ready with join:'any'
    const phaseMap = { a: { status: 'done' as const }, b: { status: 'active' as const } };
    const ready = resolveReady(phases, new Set(['a']), phaseMap);
    expect(ready.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('join: "any" — no deps completed, phase not ready', () => {
    const phases: Phase[] = [
      main('a', []),
      { id: 'c', type: 'main', dependsOn: ['a'], join: 'any' as const, mode: 'exclusive' as const },
    ];
    // nothing completed
    expect(resolveReady(phases, new Set()).map((p) => p.id)).toEqual(['a']);
  });
  it('sibling with different join modes — each resolved correctly', () => {
    const phases: Phase[] = [
      main('root', []),
      // child-all: join absent = default all (explicit 'all' rejected by schema)
      { id: 'child-all', type: 'main', dependsOn: ['root'], mode: 'exclusive' as const },
      { id: 'child-any', type: 'main', dependsOn: ['root'], join: 'any' as const, mode: 'exclusive' as const },
    ];
    const phaseMap = { root: { status: 'done' as const } };
    const ready = resolveReady(phases, new Set(['root']), phaseMap);
    expect(ready.map((p) => p.id).sort()).toEqual(['child-all', 'child-any']);
  });

  it('join absent — defaults to "all" behavior', () => {
    const phases = [main('a', []), main('b', []), main('c', ['a', 'b'])];
    // only a done — c still blocked (all behavior)
    expect(resolveReady(phases, new Set(['a'])).map((p) => p.id)).toEqual(['b']);
  });
});

// ── findUpstream ───────────────────────────────────────────────────────────

describe('findUpstream', () => {
  it('no dependencies — returns empty', () => {
    const phases = [main('a')];
    expect(findUpstream('a', phases)).toEqual([]);
  });

  it('direct upstream found', () => {
    const phases = [main('a'), main('b', ['a'])];
    expect(findUpstream('b', phases)).toEqual(['a']);
  });

  it('transitive upstream via BFS', () => {
    const phases = [main('a'), main('b', ['a']), main('c', ['b'])];
    const upstream = findUpstream('c', phases);
    expect(upstream.sort()).toEqual(['a', 'b']);
  });

  it('diamond — finds all ancestors', () => {
    const phases = [main('root'), main('left', ['root']), main('right', ['root']), main('merge', ['left', 'right'])];
    const upstream = findUpstream('merge', phases);
    expect(upstream.sort()).toEqual(['left', 'right', 'root']);
  });

  it('orphan node not in graph — returns empty', () => {
    const phases = [main('a')];
    expect(findUpstream('nonexistent', phases)).toEqual([]);
  });
});

// ── Built-in graph topology validation ─────────────────────────────────────

describe('built-in graph DAG validation', () => {
  it('skill-delete.taskflow.yaml has acyclic DAG', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-delete.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const phases: Phase[] = graph.phases.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      type: p.type as Phase['type'],
      dependsOn: (p.dependsOn as string[]) ?? [],
      mode: 'exclusive' as const,
    }));
    // topoLayers throws if cycle detected — acyclic assertion
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
    // Verify all 7 phases appear in layers (route-first: gates/end removed)
    const allIds = layers
      .flat()
      .map((p) => p.id)
      .sort();
    const expectedIds = [
      'delete-accept',
      'delete-confirm',
      'delete-gate',
      'delete-review',
      'impact-analysis',
      'skill-delete-execute',
      'skill-select',
    ].sort();
    expect(allIds).toEqual(expectedIds);
  });

  it('skill-delete.taskflow.yaml all dependsOn refs are valid phase ids', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-delete.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const phaseIds = new Set(graph.phases.map((p: { id: string }) => p.id));
    for (const phase of graph.phases) {
      for (const dep of phase.dependsOn ?? []) {
        expect(phaseIds.has(dep)).toBe(true);
      }
    }
  });
});

// ── skill-change-workflow built-in graph validation ────────────────────────

describe('built-in graph DAG validation — skill-change-workflow', () => {
  it('skill-change-workflow.taskflow.yaml has acyclic DAG', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const phases: Phase[] = graph.phases.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      type: p.type as Phase['type'],
      dependsOn: (p.dependsOn as string[]) ?? [],
      mode: 'exclusive' as const,
    }));
    // topoLayers throws if cycle detected — acyclic assertion
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
    // Verify all 9 phases appear in layers (route-first: branch-gate/end removed)
    const allIds = layers
      .flat()
      .map((p) => p.id)
      .sort();
    const expectedIds = [
      'archive',
      'change-accept',
      'cross-review',
      'doc-update',
      'openspec-create-foo',
      'plan',
      'plan-parse',
      'skill-author-foo',
      'skill-delete-foo',
    ].sort();
    expect(allIds).toEqual(expectedIds);
  });

  it('skill-change-workflow.taskflow.yaml all dependsOn refs are valid phase ids', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const phaseIds = new Set(graph.phases.map((p: { id: string }) => p.id));
    for (const phase of graph.phases) {
      for (const dep of phase.dependsOn ?? []) {
        expect(phaseIds.has(dep)).toBe(true);
      }
    }
  });

  it('skill-change-workflow.taskflow.yaml flow use refs are registered graph names', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    // Load registry to get valid graph names
    const registryPath = join(pkgRoot, 'graphs', 'registry.json');
    const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
    const registeredNames = new Set(registry.graphs.map((g: { name: string }) => g.name));

    for (const phase of graph.phases) {
      if (phase.type === 'flow' && phase.use) {
        expect(registeredNames.has(phase.use)).toBe(true);
      }
    }
  });

  it('skill-change-workflow.taskflow.yaml flow phases inject static key-value only', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    for (const phase of graph.phases) {
      if (phase.type === 'flow' && phase.with) {
        for (const [key, value] of Object.entries(phase.with)) {
          // with values must be static — no {args.key} dynamic expressions
          if (typeof value === 'string') {
            expect(value).not.toMatch(/^\{.+\}$/);
          }
          // key names are kebab-case or camelCase — generic string check
          expect(typeof key).toBe('string');
        }
      }
    }
  });

  it('skill-change-workflow.taskflow.yaml gate branch conditions reference observable upstream output', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    for (const phase of graph.phases) {
      if (phase.type !== 'gate') continue;
      for (const branch of phase.branches ?? []) {
        const when = branch.when as string;
        // branch hygiene per atom-graph-spec: reference observable upstream output fields,
        // never sibling output existence or hardcoded runtime paths
        expect(when).toMatch(/output shows/);
        expect(when).not.toMatch(/\.taskflow\/outputs\//);
        expect(when).not.toMatch(/output present/);
        // branch targets resolve in-graph
        const phaseIds = new Set(graph.phases.map((p: { id: string }) => p.id));
        expect(phaseIds.has(branch.to)).toBe(true);
      }
      // parallel gate — no default required (all-match semantics)
      if (phase.mode !== 'parallel') {
        expect(phase.default).toBeDefined();
      }
    }
  });

  it('skill-change-workflow.taskflow.yaml cross-review uses code-review skill', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    const crossReview = graph.phases.find((p: { id: string }) => p.id === 'cross-review');
    expect(crossReview).toBeDefined();
    expect(crossReview.skill).toBe('code-review');
  });

  it('skill-change-workflow.taskflow.yaml change-accept is a decision confirmation (no written actions)', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    const approval = graph.phases.find((p: { id: string }) => p.id === 'change-accept');
    expect(approval).toBeDefined();
    // Route-first: approvals carry NO written routing actions (except the
    // branch-route scenario) — Accept + free input + AI-generated options
    expect(approval.routing).toBeUndefined();
  });
});
