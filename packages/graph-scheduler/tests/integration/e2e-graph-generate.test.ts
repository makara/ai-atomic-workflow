/**
 * E2E at-rest validation for the concrete maker graph (identity redesign):
 * graph-generate is a self-contained 6-phase production graph —
 * no skeleton, no flow composition, no kind switch, no skill co-production.
 * Name states the operation; description declares the purpose; spec/implement
 * phases carry skill declarations (contract-driven spec injection).
 * The implement+review round is inlined (former generate-review-body loop
 * body) and the loop is the flow self-edge review -->|fail| implement
 * (graph-flow — loop/rework = flow self-edge, never a subgraph sibling run).
 *
 * Validates graph definition correctness — schema compliance, topology safety,
 * channel contracts, rework-decision shape — without requiring MCP server runtime.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import type { Workflow } from '../../src/graph-definition.js';
import { WorkflowSchema } from '../../src/schemas/workflow.js';
import type { Phase } from '../../src/types.js';

const VALID_PHASE_TYPES: Record<string, true> = { main: true };

function loadGraph(name: string): Workflow {
  const pkgRoot = join(__dirname, '..', '..');
  const graphPath = join(pkgRoot, 'graphs', `${name}.yaml`);
  const raw = readFileSync(graphPath, 'utf-8');
  const parsed = parseYaml(raw);
  return WorkflowSchema.parse(parsed);
}

// ── graph-generate — concrete maker graph ─────────────────────────────────

describe('graph-generate — schema compliance', () => {
  it('loads and parses as valid WorkflowSchema', () => {
    const graph = loadGraph('graph-generate');
    expect(graph).toBeDefined();
    expect(graph.name).toBe('graph-generate');
    expect(graph.description).toMatch(/maker journey/i);
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBe(6);
  });

  it('has expected 6 phases for the concrete maker journey (startup template + spec-first + inlined round)', () => {
    const graph = loadGraph('graph-generate');
    const phaseIds = graph.phases.map((p) => p.id);
    expect(phaseIds).toEqual(['startup', 'entry', 'spec', 'spec-accept', 'implement', 'review']);
  });

  it('every phase type is valid and phases are acyclic', () => {
    const graph = loadGraph('graph-generate');
    const phases = graph.phases as Phase[];
    for (const p of phases) {
      expect(VALID_PHASE_TYPES[String(p.type)], `${p.id} type`).toBe(true);
    }
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
  });

  it('startup template node is the entry; entry carries the shared scope-interview skill', () => {
    const graph = loadGraph('graph-generate');
    const startup = graph.phases.find((p) => p.id === 'startup');
    expect(startup!.type).toBe('main');
    expect(startup!.template).toBe('startup');
    expect(startup!.dependsOn).toEqual([]);
    const entry = graph.phases.find((p) => p.id === 'entry');
    expect(entry!.skill).toBe('atom-scope-interview');
    expect(entry!.dependsOn).toEqual(['startup']);
  });

  it('spec phase declares atom-graph-design — contract-driven spec injection', () => {
    const graph = loadGraph('graph-generate');
    const spec = graph.phases.find((p) => p.id === 'spec');
    expect(spec!.skill).toBe('atom-graph-design');
  });

  it('implement phase declares atom-graph-writer — contract-driven spec injection (inlined round)', () => {
    const graph = loadGraph('graph-generate');
    const implement = graph.phases.find((p) => p.id === 'implement');
    expect(implement!.skill).toBe('atom-graph-writer');
  });

  it('no skeleton language, no case-5 self-judgment text anywhere', () => {
    const graph = loadGraph('graph-generate');
    for (const p of graph.phases) {
      const task = String(p.task ?? '');
      expect(task).not.toMatch(/spec_skill|kind-agnostic|injected kind|universal skeleton/i);
      expect(task).not.toMatch(/NO WORK|no work|self-judg|empty declaration|Case-5|case-5/i);
    }
  });

  it('no skill co-production — atom-skill-spec never referenced', () => {
    const graph = loadGraph('graph-generate');
    for (const p of graph.phases) {
      const task = String(p.task ?? '');
      expect(task).not.toMatch(/atom-skill-spec/);
    }
  });
});

describe('graph-generate — topology validity', () => {
  it('single entry (startup template node) and no end marker', () => {
    const graph = loadGraph('graph-generate');
    const entries = graph.phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['startup']);
    expect(graph.phases.some((p) => p.type === ('end' as never))).toBe(false);
  });

  it('the loop is the flow self-edge review -->|fail| implement — round terminal, no loop node, no gate', () => {
    const graph = loadGraph('graph-generate');
    // Loop/rework semantics are flow self-edges (graph-flow): the review
    // round terminal reports the flow-defined condition; 'fail' re-enters
    // implement via the transition table.
    expect(graph.flow).toEqual([
      'startup --> entry',
      'entry --> spec',
      'spec --> spec-accept',
      'spec-accept --> implement',
      'implement --> review',
      'review -->|fail| implement',
      'review -->|pass| __handoff',
    ]);
    const review = graph.phases.find((p) => p.id === 'review');
    expect(review!.type).toBe('main');
    expect(review!.dependsOn).toEqual(['implement']);
    expect(review!.template).toBeUndefined();
    expect(String(review!.task)).toMatch(/flow-defined\s+round condition/);
    expect(String(review!.task)).toMatch(/flow self-edge re-enters implement/);
    // no loop template node and no gate — the flow self-edge owns iteration
    expect(graph.phases.some((p) => p.id === 'loop')).toBe(false);
    expect(graph.phases.some((p) => p.template === 'loop')).toBe(false);
    expect(graph.phases.find((p) => p.id === 'gate')).toBeUndefined();
  });

  it('single decision phase only — spec-accept (main, empty operations)', () => {
    const graph = loadGraph('graph-generate');
    const decisions = graph.phases.filter((p) => p.id === 'spec-accept');
    expect(decisions.map((p) => p.id)).toEqual(['spec-accept']);
    for (const a of decisions) {
      expect(a.type).toBe('main');
      expect(a.operations).toEqual([]);
      // routing field no longer exists in the schema (branchTo removed —
      // decisions express in task text; strict rejection covers legacy keys)
      expect('routing' in a).toBe(false);
    }
  });

  it('implement declares the two-path output contract + load-probe validation (inlined)', () => {
    const graph = loadGraph('graph-generate');
    const implement = graph.phases.find((p) => p.id === 'implement');
    const task = String(implement!.task ?? '');
    expect(task).toMatch(/artifact_path/);
    expect(task).toMatch(/registry_path/);
    // attached doc deleted — two-path bundle (two-path single-sourcing)
    expect(task).not.toMatch(/doc_path/);
    expect(task).not.toMatch(/\.graph-scheduler\/docs\//);
    expect(task).toMatch(/two-path bundle/i);
    // load-probe validation replaces graph_init misuse
    expect(task).toMatch(/graph_start/);
    expect(task).toMatch(/graph_force_end/);
    expect(task).not.toMatch(/run graph_init/);
  });

  it('review declares code-review with node inputs; atom-graph-spec inherited at graph level', () => {
    const graph = loadGraph('graph-generate');
    const review = graph.phases.find((p) => p.id === 'review');
    expect(review!.skill).toBe('code-review');
    expect(review!.channels).toEqual(expect.arrayContaining(['node:implement']));
    // atom-graph-spec moved to graph-level ambient scope (global channel)
    expect(review!.channels).not.toContain('skill:atom-graph-spec');
    expect(graph.context).toEqual(expect.arrayContaining(['skill:atom-graph-spec']));
  });
});
