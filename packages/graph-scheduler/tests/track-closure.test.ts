/**
 * Track closure wiring tests (doc maintenance split).
 *
 * doc-update graph deleted; each implementation track owns its post-approval
 * closure: minimal track (openspec-apply) archives plain via
 * openspec-archive-change; detailed track (openspec-engineer) closes through
 * atom-doc-lifecycle (reverse-validated archive + ADR fold + index). Neither
 * graph declares a doc-maintenance flow. Registry lists 12 graphs — the
 * seven loop-body subgraphs are deleted (their rounds inlined + flow
 * self-edges, graph-flow capability).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const PKG_ROOT = join(__dirname, '..');

function loadGraph(name: string) {
  const raw = readFileSync(join(PKG_ROOT, 'graphs', `${name}.yaml`), 'utf-8');
  return parseYaml(raw) as {
    name: string;
    phases: Array<{
      id: string;
      type: string;
      skill?: string;
      use?: string;
      dependsOn?: string[];
    }>;
  };
}

function phasesOf(graph: ReturnType<typeof loadGraph>) {
  return graph.phases.map((p) => ({ ...p, dependsOn: p.dependsOn ?? [] }));
}

describe('openspec-apply — minimal track closure', () => {
  const graph = loadGraph('openspec-apply');
  const phases = phasesOf(graph);

  it('archive node dispatches plain openspec-archive-change', () => {
    const archive = phases.find((p) => p.id === 'archive');
    expect(archive).toBeDefined();
    expect(archive!.skill).toBe('openspec-archive-change');
  });

  it('no doc-maintenance flow exists', () => {
    expect(phases.some((p) => p.use === 'doc-update' || p.id === 'doc-maintenance')).toBe(false);
  });

  it('archive depends on change-review only (the apply+review round is inlined; rework is the flow self-edge)', () => {
    const archive = phases.find((p) => p.id === 'archive')!;
    expect(archive.dependsOn).toEqual(['change-review']);
  });
});

describe('openspec-engineer — detailed track closure', () => {
  const graph = loadGraph('openspec-engineer');
  const phases = phasesOf(graph);

  it('openspec-archive node dispatches atom-doc-lifecycle', () => {
    const closure = phases.find((p) => p.id === 'openspec-archive');
    expect(closure).toBeDefined();
    expect(closure!.skill).toBe('atom-doc-lifecycle');
  });

  it('no doc-maintenance flow exists', () => {
    expect(phases.some((p) => p.use === 'doc-update' || p.id === 'doc-maintenance')).toBe(false);
  });

  it('closure depends on the inlined review round — the loop template is gone (flow self-edge)', () => {
    const closure = phases.find((p) => p.id === 'openspec-archive')!;
    expect(closure.dependsOn).toEqual(['implement-review']);
  });

  it('implement task carries the spec-standards mapping rule pointer (inlined in openspec-engineer)', () => {
    const graph = loadGraph('openspec-engineer');
    const implement = graph.phases.find((p) => p.id === 'implement')!;
    const text = (implement as { task?: string }).task ?? '';
    expect(text).toMatch(/per atom-skill-spec §Domain Spec\s*Standards Mapping/);
  });
});

describe('doc-update graph removed', () => {
  it('doc-update.yaml no longer exists', () => {
    expect(() => readFileSync(join(PKG_ROOT, 'graphs', 'doc-update.yaml'))).toThrow();
  });

  it('registry lists 12 graphs with estate-maintain + release-prep + graph-maintain + first-principles-dev, without doc-update or any loop-body', () => {
    const registry = JSON.parse(readFileSync(join(PKG_ROOT, 'graphs', 'registry.json'), 'utf-8')) as {
      graphs: Array<{ name: string }>;
    };
    const names = registry.graphs.map((g) => g.name);
    expect(names).toHaveLength(12);
    expect(names).toContain('release-prep');
    expect(names).toContain('estate-maintain');
    expect(names).toContain('graph-maintain');
    expect(names).toContain('first-principles-dev');
    expect(names).not.toContain('doc-update');
    expect(names).toContain('openspec-apply');
    expect(names).toContain('openspec-engineer');
    // all seven loop-body subgraphs are deleted — their rounds are inlined
    // + flow self-edges (graph-flow capability)
    expect(names).not.toContain('fp-loop-body');
    expect(names).not.toContain('engineer-review-body');
    expect(names).not.toContain('arch-loop-body');
    expect(names).not.toContain('apply-review-body');
    expect(names).not.toContain('generate-review-body');
    expect(names).not.toContain('maintain-review-body');
    expect(names).not.toContain('release-prep-body');
  });
});
