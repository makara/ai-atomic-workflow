/**
 * Tests for topology.ts — route-aware readiness, join resolution, and the
 * built-in graph dependency-edge regression guard (inline DFS; load enforces
 * acyclicity via the contract pass). All pure functions — direct I/O tests, zero mocks.
 */

import { describe, expect, it } from 'vitest';
import { resolveReady } from '../src/topology.js';
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
      {
        id: 'c',
        type: 'main',
        dependsOn: ['a', 'b'],
        join: 'any' as const,
        mode: 'exclusive' as const,
        operations: [],
      },
    ];
    // only a done — c is ready with join:'any'
    const phaseMap = { a: { status: 'done' as const }, b: { status: 'active' as const } };
    const ready = resolveReady(phases, new Set(['a']), phaseMap);
    expect(ready.map((p) => p.id).sort()).toEqual(['b', 'c']);
  });

  it('join: "any" — no deps completed, phase not ready', () => {
    const phases: Phase[] = [
      main('a', []),
      { id: 'c', type: 'main', dependsOn: ['a'], join: 'any' as const, mode: 'exclusive' as const, operations: [] },
    ];
    // nothing completed
    expect(resolveReady(phases, new Set()).map((p) => p.id)).toEqual(['a']);
  });
  it('sibling with different join modes — each resolved correctly', () => {
    const phases: Phase[] = [
      main('root', []),
      // child-all: join absent = default all (explicit 'all' rejected by schema)
      { id: 'child-all', type: 'main', dependsOn: ['root'], mode: 'exclusive' as const, operations: [] },
      {
        id: 'child-any',
        type: 'main',
        dependsOn: ['root'],
        join: 'any' as const,
        mode: 'exclusive' as const,
        operations: [],
      },
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

// ── Built-in graph topology validation ─────────────────────────────────────

describe('built-in graph dependency-edge validation', () => {
  it('graph-generate.yaml has acyclic dependency edges and no flow refs — concrete maker graph', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphPath = join(pkgRoot, 'graphs', 'graph-generate.yaml');
    const raw = readFileSync(graphPath, 'utf-8');
    const graph = parseYaml(raw);
    const phases: Phase[] = graph.phases.map((p: Record<string, unknown>) => ({
      id: p.id as string,
      type: p.type as Phase['type'],
      dependsOn: (p.dependsOn as string[]) ?? [],
      mode: 'exclusive' as const,
    }));
    // Acyclic check — DFS with recursion stack. Load enforces acyclicity via
    // the contract pass (dependency cycle → load error, graph-schema-w6-close);
    // this DFS additionally guards the fixture structure.
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error(`cycle detected at ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dep of phases.find((p) => p.id === id)?.dependsOn ?? []) visit(dep);
      visiting.delete(id);
      visited.add(id);
    };
    for (const p of phases) visit(p.id);
    expect(visited.size).toBe(phases.length);
    const useRefs = graph.phases
      .map((p: Record<string, unknown>) => p.use as string | undefined)
      .filter((u: string | undefined): u is string => u !== undefined);
    expect(useRefs).toHaveLength(0);
  });

  it('all built-in graph dependsOn refs are valid phase ids', () => {
    const { readFileSync, readdirSync } = require('node:fs');
    const { join } = require('node:path');
    const { parse: parseYaml } = require('yaml');
    const pkgRoot = join(__dirname, '..');
    const graphFiles = readdirSync(join(pkgRoot, 'graphs')).filter((f: string) => f.endsWith('.yaml'));
    for (const f of graphFiles) {
      const graph = parseYaml(readFileSync(join(pkgRoot, 'graphs', f), 'utf-8'));
      const phaseIds = new Set(graph.phases.map((p: { id: string }) => p.id));
      for (const phase of graph.phases) {
        for (const dep of phase.dependsOn ?? []) {
          expect(phaseIds.has(dep), `${f}: ${phase.id} depends on missing ${dep}`).toBe(true);
        }
      }
    }
  });
});
