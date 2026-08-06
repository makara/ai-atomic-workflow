/**
 * doc-update graph validation tests.
 *
 * Validate doc-update.taskflow.yaml against PhaseSchema, TaskflowSchema,
 * and topology constraints. Graph file exists — tests serve as regression
 * validation for schema compliance and DAG correctness.
 *
 * Trigger-first topology: doc-trigger → doc-maintain → doc-review → doc-accept
 * (4 phases, no gate — rework flows through approval dynamic options).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { PhaseSchema } from '../src/schemas/phase.js';
import { TaskflowSchema } from '../src/schemas/taskflow.js';
import { topoLayers } from '../src/topology.js';
import type { Phase } from '../src/types.js';

const PKG_ROOT = join(__dirname, '..');
const GRAPH_PATH = join(PKG_ROOT, 'graphs', 'doc-update.taskflow.yaml');

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('doc-update.taskflow.yaml — schema validation', () => {
  it('file exists and is valid YAML', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    expect(() => parseYaml(raw)).not.toThrow();
  });

  it('passes TaskflowSchema validation', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    const result = TaskflowSchema.safeParse(graph);
    if (!result.success) {
      console.error('TaskflowSchema error:', JSON.stringify(result.error, null, 2));
    }
    expect(result.success).toBe(true);
  });

  it('has expected top-level fields', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.name).toBe('doc-update');
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBeGreaterThanOrEqual(1);
  });

  it('has exactly 4 phases — trigger-first redesign (no end node, no gate)', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.phases).toHaveLength(4);
  });

  it('every phase passes PhaseSchema validation individually', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    for (const phase of graph.phases) {
      const result = PhaseSchema.safeParse(phase);
      if (!result.success) {
        console.error(`PhaseSchema error for "${phase.id}":`, JSON.stringify(result.error, null, 2));
      }
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase structure
// ---------------------------------------------------------------------------

describe('doc-update.taskflow.yaml — phase structure', () => {
  let phases: Phase[];

  beforeAll(() => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    phases = graph.phases.map((p: Record<string, unknown>) => ({
      ...p,
      dependsOn: p.dependsOn ?? [],
    }));
  });

  it('has correct phase IDs in order', () => {
    const ids = phases.map((p) => p.id);
    expect(ids).toEqual(['doc-trigger', 'doc-maintain', 'doc-review', 'doc-accept']);
  });

  it('has correct phase types', () => {
    const byId: Record<string, Phase['type']> = {};
    for (const p of phases) byId[p.id] = p.type;
    expect(byId['doc-trigger']).toBe('main');
    expect(byId['doc-maintain']).toBe('main');
    expect(byId['doc-review']).toBe('main');
    expect(byId['doc-accept']).toBe('approval');
  });

  it('doc-maintain has skill: atom-doc-maintenance', () => {
    const maintain = phases[1];
    expect(maintain.id).toBe('doc-maintain');
    expect(maintain.skill).toBe('atom-doc-maintenance');
  });

  it('doc-trigger is entry point (empty dependsOn)', () => {
    const trigger = phases[0];
    expect(trigger.id).toBe('doc-trigger');
    expect(trigger.dependsOn).toEqual([]);
  });

  it('doc-review has skill: code-review with reviewer hint', () => {
    const review = phases[2];
    expect(review.id).toBe('doc-review');
    expect(review.skill).toBe('code-review');
    expect(review.agent).toEqual(['reviewer', 'explore', 'task', 'general']);
  });

  it('no phase references retired doc skills', () => {
    for (const p of phases) {
      expect(p.skill).not.toBe('atom-doc-spec');
      expect(p.skill).not.toBe('atom-doc-writer');
    }
  });

  it('ambient context at graph level — doc-maintain carries no per-phase channels; graph top level holds domain index', () => {
    const maintain = phases[1];
    // doc-trigger is a direct dependsOn — declaration surface = effective
    // surface (redundant node: channel removed); ambient context (domain
    // index + vocabulary skills) moved to graph-level channels (scope
    // hierarchy)
    expect(maintain.channels).toBeUndefined();
    const raw = parseYaml(readFileSync(GRAPH_PATH, 'utf-8')) as { context?: string[]; channels?: unknown };
    expect(raw.context).toContain('docs/domains.md');
    expect(raw.context).toContain('skill:codebase-design');
    expect(raw.context).toContain('./CONTEXT.md');
  });

  it('doc-accept is approval with no written routing and no branches/eval', () => {
    const accept = phases[3];
    expect(accept.id).toBe('doc-accept');
    expect(accept.type).toBe('approval');
    expect(accept.dependsOn).toEqual(['doc-review']);
    // route-first: default card = Accept + free input + AI-generated options
    expect(accept.routing).toBeUndefined();
    expect(accept.eval).toBeUndefined();
    expect(accept.branches).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Topology validation
// ---------------------------------------------------------------------------

describe('doc-update.taskflow.yaml — topology', () => {
  let phases: Phase[];

  beforeAll(() => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    phases = graph.phases.map((p: Record<string, unknown>) => ({
      ...p,
      dependsOn: p.dependsOn ?? [],
    }));
  });

  it('acyclic DAG — topoLayers does not throw', () => {
    const layers = topoLayers(phases);
    expect(layers.length).toBeGreaterThan(0);
  });

  it('all 4 phases appear in topoLayers', () => {
    const layers = topoLayers(phases);
    const allIds = layers
      .flat()
      .map((p) => p.id)
      .sort();
    expect(allIds).toEqual(['doc-accept', 'doc-maintain', 'doc-review', 'doc-trigger'].sort());
  });

  it('all dependsOn references point to existing phase IDs', () => {
    const phaseIds = new Set(phases.map((p) => p.id));
    for (const phase of phases) {
      for (const dep of phase.dependsOn ?? []) {
        expect(phaseIds.has(dep)).toBe(true);
      }
    }
  });

  it('linear trigger-first chain — approval depends on review only', () => {
    const deps = new Map(phases.map((p) => [p.id, p.dependsOn ?? []]));
    expect(deps.get('doc-trigger')).toEqual([]);
    expect(deps.get('doc-maintain')).toEqual(['doc-trigger']);
    expect(deps.get('doc-review')).toEqual(['doc-maintain']);
    expect(deps.get('doc-accept')).toEqual(['doc-review']);
  });
});
