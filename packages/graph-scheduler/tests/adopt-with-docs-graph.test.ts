/**
 * adopt-with-docs graph validation tests.
 *
 * Validate adopt-with-docs.taskflow.yaml against PhaseSchema, TaskflowSchema,
 * and topology constraints. Graph file exists — tests serve as regression
 * validation for schema compliance and DAG correctness.
 *
 * Adoption topology: adopt-scope → adopting → adopt-accept → spec-propose
 * (4 phases, no gate — rework flows through approval dynamic options).
 * Enhanced I/O: composed runs receive the produced report as input document
 * (upstream channels); the adoption record appends as a dated appendix
 * section to the input document, else writes the record at
 * docs/adopt/<date>-<slug>.md (standalone — grilling-derived, never asked).
 * Spec production: spec-propose materializes the adopted
 * requirements as the OpenSpec change (openspec-propose, headless).
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
const GRAPH_PATH = join(PKG_ROOT, 'graphs', 'adopt-with-docs.taskflow.yaml');

let graph: { name: string; phases: Phase[] };

beforeAll(() => {
  const raw = readFileSync(GRAPH_PATH, 'utf-8');
  graph = parseYaml(raw) as { name: string; phases: Phase[] };
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('adopt-with-docs.taskflow.yaml — schema validation', () => {
  it('file exists and is valid YAML', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    expect(() => parseYaml(raw)).not.toThrow();
  });

  it('passes TaskflowSchema validation', () => {
    expect(() => TaskflowSchema.parse(graph)).not.toThrow();
  });

  it('has expected top-level fields', () => {
    expect(graph.name).toBe('adopt-with-docs');
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBeGreaterThanOrEqual(1);
  });

  it('has exactly 4 phases — scope, adopting, accept, spec-propose', () => {
    expect(graph.phases).toHaveLength(4);
  });

  it('every phase passes PhaseSchema validation individually', () => {
    for (const phase of graph.phases) {
      expect(() => PhaseSchema.parse(phase)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Topology
// ---------------------------------------------------------------------------

describe('adopt-with-docs.taskflow.yaml — topology', () => {
  it('has exactly the 4 adoption phases in order', () => {
    expect(graph.phases.map((p) => p.id)).toEqual(['adopt-scope', 'adopting', 'adopt-accept', 'spec-propose']);
  });

  it('has a single entry and a serial dependency chain', () => {
    const entries = graph.phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['adopt-scope']);
    expect(graph.phases.find((p) => p.id === 'adopting')?.dependsOn).toEqual(['adopt-scope']);
    expect(graph.phases.find((p) => p.id === 'adopt-accept')?.dependsOn).toEqual(['adopting']);
    expect(graph.phases.find((p) => p.id === 'spec-propose')?.dependsOn).toEqual(['adopt-accept']);
  });

  it('adopt-scope carries the scope-interview contract and input document resolution', () => {
    const scope = graph.phases.find((p) => p.id === 'adopt-scope');
    expect(scope?.skill).toBe('atom-scope-interview');
    const task = String(scope?.task);
    expect(task).toMatch(/idea_goal/);
    expect(task).toMatch(/input_document/);
    expect(task).toMatch(/scope_complete/);
    // raw-idea mode: no input document — input_document: none
    expect(task).toMatch(/input_document: none/);
  });

  it('adopting carries the grilling skill and appendix record semantics', () => {
    const adopting = graph.phases.find((p) => p.id === 'adopting');
    expect(adopting?.skill).toBe('grilling');
    expect(adopting?.dependsOn).toEqual(['adopt-scope']);
    const task = String(adopting?.task);
    expect(task).toMatch(/grilling per grilling skill/);
    // encapsulation contract: mandatory rounds, never zero-question, never auto-gated
    expect(task).toMatch(/MANDATORY question rounds/);
    expect(task).toMatch(/never zero-question/);
    expect(task).toMatch(/never auto-gated/);
    // output shape — decisions, never consensus
    expect(task).toMatch(/decisions: \[\{ decision, rationale \}\]/);
    expect(task).toMatch(/never 'consensus'/);
    // composed: record appends to the input document
    expect(task).toMatch(/appends to it/);
    // standalone: record path grilling-derived — never a user question
    expect(task).toMatch(/never asked/);
    expect(task).toMatch(/record_path grilling-derived/);
    // extended output contract
    expect(task).toMatch(/appended_to/);
    expect(task).toMatch(/record_path/);
  });

  it('adopt-accept is the adoption approval — no written routing', () => {
    const accept = graph.phases.find((p) => p.id === 'adopt-accept');
    expect(accept?.type).toBe('approval');
    expect(accept?.routing).toBeUndefined();
    expect(String(accept?.task)).toMatch(/Adoption consensus accepted\?/);
  });

  it('spec-propose carries openspec-propose headless contract — production after adoption', () => {
    const propose = graph.phases.find((p) => p.id === 'spec-propose');
    expect(propose?.type).toBe('main');
    expect(propose?.skill).toBe('openspec-propose');
    expect(propose?.dependsOn).toEqual(['adopt-accept']);
    const task = String(propose?.task);
    expect(task).toMatch(/headless/);
    expect(task).toMatch(/Headless Mode/);
    // re-rounds update the same change — no duplicates
    expect(task).toMatch(/update the existing change/);
    // echoes drive the track gate
    expect(task).toMatch(/adr_created \(echo\)/);
  });

  it('topology layers are serial — one phase per layer', () => {
    const layers = topoLayers(graph.phases);
    expect(layers).toHaveLength(4);
    expect(layers.map((layer) => layer.map((p) => p.id))).toEqual([
      ['adopt-scope'],
      ['adopting'],
      ['adopt-accept'],
      ['spec-propose'],
    ]);
  });
});
