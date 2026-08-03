/**
 * doc-update graph validation tests.
 *
 * Validate doc-update.taskflow.yaml against PhaseSchema, TaskflowSchema,
 * and topology constraints. Graph file exists — tests serve as regression
 * validation for schema compliance and DAG correctness.
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

  it('has exactly 5 phases', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    const graph = parseYaml(raw);
    expect(graph.phases).toHaveLength(5);
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
    expect(ids).toEqual(['doc-scope', 'doc-write', 'doc-review', 'doc-gate', 'doc-accept']);
  });

  it('has correct phase types', () => {
    const byId: Record<string, Phase['type']> = {};
    for (const p of phases) byId[p.id] = p.type;
    expect(byId['doc-scope']).toBe('main');
    expect(byId['doc-write']).toBe('main');
    expect(byId['doc-review']).toBe('main');
    expect(byId['doc-gate']).toBe('gate');
    expect(byId['doc-accept']).toBe('approval');
  });

  it('doc-write has skill: atom-doc-writer', () => {
    const write = phases[1];
    expect(write.id).toBe('doc-write');
    expect(write.skill).toBe('atom-doc-writer');
  });

  it('doc-scope is entry point (empty dependsOn)', () => {
    const scope = phases[0];
    expect(scope.id).toBe('doc-scope');
    expect(scope.dependsOn).toEqual([]);
  });

  it('doc-review has skill: code-review with reviewer hint', () => {
    const review = phases[2];
    expect(review.id).toBe('doc-review');
    expect(review.skill).toBe('code-review');
    expect(review.agent).toEqual(['reviewer', 'task']);
  });

  it('doc-gate is gate with bounded eval', () => {
    const gate = phases[3];
    expect(gate.id).toBe('doc-gate');
    expect(gate.type).toBe('gate');
    expect(gate.eval).toBeDefined();
    expect(gate.eval!.length).toBeGreaterThanOrEqual(1);
  });

  it('doc-gate eval is bounded FAIL → retry rule (contract field, no DEBT)', () => {
    const gate = phases[3];
    const evalText = gate.eval!.map((r) => r.when).join(' ');
    expect(evalText).toContain('overall: fail');
    expect(evalText).toContain('retryAttempt < 2');
    expect(evalText).not.toContain('DEBT');
    const retryRules = gate.eval!.filter((r) => r.action === 'retry');
    expect(retryRules.length).toBe(1);
    expect(retryRules[0]!.target).toBe('doc-write');
  });

  it('doc-accept is approval with 3-route routing and no eval', () => {
    const accept = phases[4];
    expect(accept.id).toBe('doc-accept');
    expect(accept.type).toBe('approval');
    expect(accept.dependsOn).toEqual(['doc-gate']);
    expect(accept.routing).toBeDefined();
    expect(accept.routing!.actions).toHaveLength(3);
    expect(accept.eval).toBeUndefined();
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

  it('all 5 phases appear in topoLayers', () => {
    const layers = topoLayers(phases);
    const allIds = layers
      .flat()
      .map((p) => p.id)
      .sort();
    expect(allIds).toEqual(['doc-accept', 'doc-gate', 'doc-review', 'doc-scope', 'doc-write'].sort());
  });

  it('all dependsOn references point to existing phase IDs', () => {
    const phaseIds = new Set(phases.map((p) => p.id));
    for (const phase of phases) {
      for (const dep of phase.dependsOn ?? []) {
        expect(phaseIds.has(dep)).toBe(true);
      }
    }
  });

  it('approval depends on single gate node — writer not listed', () => {
    const deps = new Map(phases.map((p) => [p.id, p.dependsOn ?? []]));
    expect(deps.get('doc-scope')).toEqual([]);
    expect(deps.get('doc-write')).toEqual(['doc-scope']);
    expect(deps.get('doc-review')).toEqual(['doc-write']);
    expect(deps.get('doc-gate')).toEqual(['doc-review']);
    expect(deps.get('doc-accept')).toEqual(['doc-gate']);
  });

  it('doc-accept jump action has explicit target', () => {
    const accept = phases[4];
    const jump = accept.routing!.actions.find((a) => a.action === 'jump');
    expect(jump).toBeDefined();
    expect(jump!.target).toBe('doc-scope');
  });
});
