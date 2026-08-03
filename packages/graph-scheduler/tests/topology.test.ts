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
    const phases = [
      { id: 'a', type: 'main', dependsOn: [] },
      { id: 'b', type: 'main', dependsOn: [] },
      { id: 'c', type: 'main', dependsOn: ['a', 'b'] },
    ];
    // only a done — c still blocked on b
    expect(resolveReady(phases, new Set(['a'])).map((p) => p.id)).toEqual(['b']);
  });

  it('join: "any" — one dep completed activates phase', () => {
    const phases = [
      { id: 'a', type: 'main', dependsOn: [] },
      { id: 'b', type: 'main', dependsOn: [] },
      { id: 'c', type: 'main', dependsOn: ['a', 'b'], join: 'any' as const },
    ];
    // only a done — c is ready with join:'any'
    const phaseMap = { a: { status: 'done' as const }, b: { status: 'active' as const } };
    const ready = resolveReady(phases, new Set(['a']), phaseMap);
    expect(ready.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('join: "any" — no deps completed, phase not ready', () => {
    const phases = [
      { id: 'a', type: 'main', dependsOn: [] },
      { id: 'c', type: 'main', dependsOn: ['a'], join: 'any' as const },
    ];
    // nothing completed
    expect(resolveReady(phases, new Set()).map((p) => p.id)).toEqual(['a']);
  });
  it('sibling with different join modes — each resolved correctly', () => {
    const phases = [
      { id: 'root', type: 'main', dependsOn: [] },
      { id: 'child-all', type: 'main', dependsOn: ['root'], join: 'all' as const },
      { id: 'child-any', type: 'main', dependsOn: ['root'], join: 'any' as const },
    ];
    const phaseMap = { root: { status: 'done' as const } };
    const ready = resolveReady(phases, new Set(['root']), phaseMap);
    expect(ready.map((p) => p.id).sort()).toEqual(['child-all', 'child-any']);
  });

  it('join absent — defaults to "all" behavior', () => {
    const phases = [
      { id: 'a', type: 'main', dependsOn: [] },
      { id: 'b', type: 'main', dependsOn: [] },
      { id: 'c', type: 'main', dependsOn: ['a', 'b'] },
    ];
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
    }));
    // topoLayers throws if cycle detected — acyclic assertion
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
    // Verify all 7 phases appear in layers
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
    }));
    // topoLayers throws if cycle detected — acyclic assertion
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
    // Verify all 9 phases appear in layers
    const allIds = layers
      .flat()
      .map((p) => p.id)
      .sort();
    const expectedIds = [
      'archive',
      'change-accept',
      'cross-review',
      'doc-update',
      'plan',
      'plan-parse',
      'skill-author-foo',
      'skill-delete-foo',
      'openspec-create-foo',
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

  it('skill-change-workflow.taskflow.yaml when guards reference observable upstream output', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    for (const phase of graph.phases) {
      if (phase.when && phase.type !== 'approval') {
        const when = phase.when as string;
        // guard hygiene per atom-graph-spec: reference observable upstream output fields,
        // never sibling output existence or hardcoded runtime paths
        expect(when).toMatch(/output shows/);
        expect(when).not.toMatch(/\.taskflow\/outputs\//);
        expect(when).not.toMatch(/output present/);
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

  it('skill-change-workflow.taskflow.yaml approval is human gate with per-writer retry targets', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);

    const approval = graph.phases.find((p: { id: string }) => p.id === 'change-accept');
    expect(approval).toBeDefined();
    // Multi-writer graph — no eval (atom-graph-spec §Auto-Rework Rules: single-writer scope)
    expect(approval.eval).toBeUndefined();
    // Human gate exposes per-writer retry targets + plan jump
    const retryTargets = (approval.routing?.actions ?? [])
      .filter((a: { action: string }) => a.action === 'retry')
      .map((a: { target: string }) => a.target);
    expect(retryTargets).toContain('skill-author-foo');
    expect(retryTargets).toContain('skill-delete-foo');
    expect(retryTargets).toContain('doc-update');
    const jumpTargets = (approval.routing?.actions ?? [])
      .filter((a: { action: string }) => a.action === 'jump')
      .map((a: { target: string }) => a.target);
    expect(jumpTargets).toContain('plan');
  });
});
