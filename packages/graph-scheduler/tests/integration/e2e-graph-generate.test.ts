/**
 * E2E at-rest validation for the concrete maker graph (identity redesign):
 * graph-generate is a self-contained 7-phase production graph —
 * no skeleton, no flow composition, no kind switch, no skill co-production.
 * Name states the operation; description declares the purpose; spec/implement
 * phases carry skill declarations (contract-driven spec injection).
 *
 * Validates graph definition correctness — schema compliance, topology safety,
 * channel contracts, gate hygiene — without requiring MCP server runtime.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import type { Taskflow } from '../../src/graph-definition.js';
import { TaskflowSchema } from '../../src/schemas/taskflow.js';
import { topoLayers } from '../../src/topology.js';
import type { Phase } from '../../src/types.js';

const VALID_PHASE_TYPES: Record<string, true> = { main: true, approval: true, gate: true, flow: true };

function loadGraph(name: string): Taskflow {
  const pkgRoot = join(__dirname, '..', '..');
  const graphPath = join(pkgRoot, 'graphs', `${name}.taskflow.yaml`);
  const raw = readFileSync(graphPath, 'utf-8');
  const parsed = parseYaml(raw);
  return TaskflowSchema.parse(parsed);
}

// ── graph-generate — concrete maker graph ─────────────────────────────────

describe('graph-generate — schema compliance', () => {
  it('loads and parses as valid TaskflowSchema', () => {
    const graph = loadGraph('graph-generate');
    expect(graph).toBeDefined();
    expect(graph.name).toBe('graph-generate');
    expect(graph.description).toMatch(/maker journey/i);
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBe(7);
  });

  it('has expected 7 phases for the concrete maker journey (spec-first pipeline)', () => {
    const graph = loadGraph('graph-generate');
    const phaseIds = graph.phases.map((p) => p.id);
    expect(phaseIds).toEqual(['entry', 'spec', 'spec-accept', 'implement', 'review', 'gate', 'accept']);
  });

  it('every phase type is valid and phases are acyclic', () => {
    const graph = loadGraph('graph-generate');
    const phases = graph.phases as Phase[];
    for (const p of phases) {
      expect(VALID_PHASE_TYPES[String(p.type)], `${p.id} type`).toBe(true);
    }
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('entry is an entry node with the shared scope-interview skill', () => {
    const graph = loadGraph('graph-generate');
    const entry = graph.phases.find((p) => p.id === 'entry');
    expect(entry!.type).toBe('main');
    expect(entry!.skill).toBe('atom-scope-interview');
    expect(entry!.dependsOn).toEqual([]);
  });

  it('spec phase declares atom-graph-design — contract-driven spec injection', () => {
    const graph = loadGraph('graph-generate');
    const spec = graph.phases.find((p) => p.id === 'spec');
    expect(spec!.skill).toBe('atom-graph-design');
  });

  it('implement phase declares atom-graph-writer — contract-driven spec injection', () => {
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
  it('single entry and no end marker', () => {
    const graph = loadGraph('graph-generate');
    const entries = graph.phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['entry']);
    expect(graph.phases.some((p) => p.type === ('end' as never))).toBe(false);
  });

  it('gate is bounded rework to the implement writer, no default', () => {
    const graph = loadGraph('graph-generate');
    const gate = graph.phases.find((p) => p.id === 'gate');
    expect(gate!.type).toBe('gate');
    expect(gate!.dependsOn).toEqual(['review']);
    const jumps = gate!.jumps ?? [];
    expect(jumps).toHaveLength(1);
    expect(String(jumps[0].when)).toMatch(/overall: fail AND implement retryCount < 2/);
    expect(jumps[0].to).toBe('implement');
  });

  it('two approvals only — spec-accept and final accept', () => {
    const graph = loadGraph('graph-generate');
    const approvals = graph.phases.filter((p) => p.type === 'approval');
    expect(approvals.map((p) => p.id)).toEqual(['spec-accept', 'accept']);
    for (const a of approvals) {
      expect(a.routing).toBeUndefined();
    }
  });

  it('implement declares the three-path output contract + load-probe validation', () => {
    const graph = loadGraph('graph-generate');
    const implement = graph.phases.find((p) => p.id === 'implement');
    const task = String(implement!.task ?? '');
    expect(task).toMatch(/artifact_path/);
    expect(task).toMatch(/registry_path/);
    expect(task).toMatch(/doc_path/);
    expect(task).toMatch(/\.graph-scheduler\/docs\//);
    // load-probe validation replaces graph_init misuse
    expect(task).toMatch(/graph_start/);
    expect(task).toMatch(/graph_force_end/);
    expect(task).not.toMatch(/run graph_init/);
  });

  it('review declares code-review with node inputs; atom-graph-spec inherited at graph level', () => {
    const graph = loadGraph('graph-generate');
    const review = graph.phases.find((p) => p.id === 'review');
    expect(review!.skill).toBe('code-review');
    expect(review!.channels).toEqual(expect.arrayContaining(['node:entry', 'node:spec']));
    // atom-graph-spec moved to graph-level ambient scope (global channel)
    expect(review!.channels).not.toContain('skill:atom-graph-spec');
    expect(graph.context).toEqual(expect.arrayContaining(['skill:atom-graph-spec']));
  });
});
