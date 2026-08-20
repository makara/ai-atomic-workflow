/**
 * adopt-with-docs graph validation tests.
 *
 * Validate adopt-with-docs.yaml against PhaseSchema, WorkflowSchema,
 * and topology constraints. Graph file exists — tests serve as regression
 * validation for schema compliance and dependency-edge correctness.
 *
 * Adoption topology: single-phase self-deciding spec production
 * (interaction: none). The interactive adoption phase (adopting —
 * grilling consensus IS the acceptance) is hosted
 * by the composing framework graph; the
 * adoption consensus arrives via the node:adopting channel — never from a
 * clarifying question round.
 * Spec production: spec-propose materializes the adopted
 * requirements as the OpenSpec change (upstream openspec-propose).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { PhaseSchema } from '../src/schemas/phase.js';
import { WorkflowSchema } from '../src/schemas/workflow.js';

import type { Phase } from '../src/types.js';

const PKG_ROOT = join(__dirname, '..');
const GRAPH_PATH = join(PKG_ROOT, 'graphs', 'adopt-with-docs.yaml');

let graph: { name: string; interaction?: string; phases: Phase[] };

beforeAll(() => {
  const raw = readFileSync(GRAPH_PATH, 'utf-8');
  graph = parseYaml(raw) as { name: string; interaction?: string; phases: Phase[] };
});

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('adopt-with-docs.yaml — schema validation', () => {
  it('file exists and is valid YAML', () => {
    const raw = readFileSync(GRAPH_PATH, 'utf-8');
    expect(() => parseYaml(raw)).not.toThrow();
  });

  it('passes WorkflowSchema validation', () => {
    expect(() => WorkflowSchema.parse(graph)).not.toThrow();
  });

  it('has expected top-level fields', () => {
    expect(graph.name).toBe('adopt-with-docs');
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBeGreaterThanOrEqual(1);
  });

  it('has exactly 1 phase — spec production only', () => {
    expect(graph.phases).toHaveLength(1);
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

describe('adopt-with-docs.yaml — topology', () => {
  it('has exactly the single spec-propose phase', () => {
    expect(graph.phases.map((p) => p.id)).toEqual(['spec-propose']);
  });

  it('has a single entry phase', () => {
    const entries = graph.phases.filter((p) => (p.dependsOn ?? []).length === 0);
    expect(entries.map((p) => p.id)).toEqual(['spec-propose']);
    expect(graph.phases.find((p) => p.id === 'spec-propose')?.dependsOn).toEqual([]);
  });

  it('spec-propose carries the upstream openspec-propose contract — self-deciding', () => {
    const propose = graph.phases.find((p) => p.id === 'spec-propose');
    expect(propose?.type).toBe('main');
    expect(propose?.skill).toBe('openspec-propose');
    expect(propose?.dependsOn).toEqual([]);
    // standalone sibling run — adoption consensus arrives via graph_start args (no composed channel)
    expect(propose?.channels).toBeUndefined();
    const task = String(propose?.task);
    expect(task).toMatch(/upstream openspec-propose/);
    // change-name resolution is single-sourced (canonical rule in
    // task-templates/contracts.ts); the graph task text
    // references the pointer, never re-encodes the rule body
    expect(task).toMatch(/per the single source/);
    expect(task).toMatch(/CHANGE_NAME_RESOLUTION_RULE/);
    // delta-authoring discipline is graph-owned — MODIFIED references as-read names
    expect(task).toMatch(/references an existing requirement name/);
    // re-rounds update the same change — no duplicates
    expect(task).toMatch(/no duplicates/);
    // echoes drive the track gate
    expect(task).toMatch(/adr_created \(echo\)/);
  });

  it('graph is non-interactive — adoption hosted by the framework', () => {
    expect(graph.interaction).toBe('none');
  });

  it('topology is serial — linear dependsOn chain', () => {
    // Structural replacement for the deleted topoLayers export: the
    // spec-propose stage is a single-node chain — entry phase with no deps.
    const phases = graph.phases;
    const chain = ['spec-propose'];
    expect(phases.map((p) => p.id)).toEqual(chain);
    const byId = new Map(phases.map((p) => [p.id, p]));
    for (const [i, id] of chain.entries()) {
      const deps = byId.get(id)?.dependsOn ?? [];
      if (i === 0) expect(deps).toHaveLength(0);
      else expect(deps).toEqual([chain[i - 1]]);
    }
  });
});
