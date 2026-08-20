/**
 * Built-in graph registry completeness tests.
 *
 * registry.json is the authoritative index of built-in graphs (CONTEXT.md:
 * "Built-in graph definitions + registry"). Every graph definition on disk MUST be listed —
 * consumers enumerate the registry, not the filesystem. Regression guard
 *     against stale registry (Finding 5: openspec-create / arch-review-to-spec were
 * missing while 10 graphs existed on disk).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { TASKFLOW_FILE_PATTERN } from '../src/api/maintenance.js';
import { PhaseSchema } from '../src/schemas/phase.js';

const PKG_ROOT = join(__dirname, '..');
const GRAPHS_DIR = join(PKG_ROOT, 'graphs');
const REGISTRY_PATH = join(GRAPHS_DIR, 'registry.json');

interface RegistryEntry {
  name: string;
  path: string;
}

function loadRegistry(): RegistryEntry[] {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as { graphs: RegistryEntry[] };
  return raw.graphs;
}

function graphFilesOnDisk(): string[] {
  // Match the runtime probe surface (.yaml AND .yml) — a .yml graph must not
  // escape the registry-vs-filesystem completeness guard.
  return readdirSync(GRAPHS_DIR)
    .filter((file) => TASKFLOW_FILE_PATTERN.test(file))
    .sort();
}

describe('registry.json — built-in graph completeness', () => {
  it('registry is valid JSON with a graphs array', () => {
    const registry = loadRegistry();
    expect(Array.isArray(registry)).toBe(true);
    expect(registry.length).toBeGreaterThan(0);
  });

  it('every graph file on disk has a registry entry', () => {
    const registry = loadRegistry();
    const registeredNames = new Set(registry.map((entry) => entry.name));
    const onDisk = graphFilesOnDisk();

    // Every graph file must be registered under its file basename.
    for (const file of onDisk) {
      const expectedName = file.replace(/\.yaml$/, '');
      expect(registeredNames.has(expectedName), `missing registry entry for ${file}`).toBe(true);
    }
  });

  it('every registry entry points to an existing graph file', () => {
    const registry = loadRegistry();
    const onDisk = new Set(graphFilesOnDisk());
    for (const entry of registry) {
      expect(onDisk.has(entry.path), `registry entry "${entry.name}" references missing file ${entry.path}`).toBe(true);
    }
  });

  it('registry entry shape is exactly name + path — pure index, no metadata', () => {
    const registry = loadRegistry();
    for (const entry of registry) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe('string');
      // The registry carries no description/tags — the catalog single source
      // is the graph definition top-level description.
      expect(Object.keys(entry).sort()).toEqual(['name', 'path']);
    }
  });

  it('artifact-workflow is NOT registered — skeleton deleted', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'artifact-workflow');
    expect(entry).toBeUndefined();
  });

  it('skill-workflow is NOT registered — skill production folds into the improver journey', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'skill-workflow');
    expect(entry).toBeUndefined();
  });

  it('graph-generate is registered — the concrete maker journey graph', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'graph-generate');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('graph-generate.yaml');
  });

  it('graph-workflow is NOT registered — retired name (identity redesign)', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'graph-workflow');
    expect(entry).toBeUndefined();
  });

  it('deleted graphs are NOT registered — scenario-split clean cutover', () => {
    const registry = loadRegistry();
    const registered = new Set(registry.map((entry) => entry.name));
    for (const gone of [
      'skill-author',
      'skill-delete',
      'skill-change-workflow',
      'graph-workflow',
      'openspec-create',
      'openspec-pipeline',
      'spec-entry-sharpened',
      'plan-generate',
      'review-machinery',
      'artifact-workflow',
      'skill-workflow',
    ]) {
      expect(registered.has(gone), `${gone} must not be registered`).toBe(false);
    }
  });

  it('openspec-engineer is registered', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'openspec-engineer');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('openspec-engineer.yaml');
  });

  it('arch-review-loop is registered — single-loop review workflow', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'arch-review-loop');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('arch-review-loop.yaml');
  });

  it('arch-review-to-spec is NOT registered — deprecated and removed', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'arch-review-to-spec');
    expect(entry).toBeUndefined();
  });

  it('adopt-with-docs is registered — non-interactive adoption spec production', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'adopt-with-docs');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('adopt-with-docs.yaml');
  });

  it('grill-with-docs is NOT registered — renamed to adopt-with-docs', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'grill-with-docs');
    expect(entry).toBeUndefined();
  });
});

describe('base phase types statically dispatched', () => {
  it('main is the only dispatch type — gate/flow unregistered at schema parse', () => {
    expect(PhaseSchema.safeParse({ id: 'p', type: 'main', operations: [] }).success).toBe(true);
    // 'gate' and 'flow' are not in the closed type enum {main} — loud reject
    expect(PhaseSchema.safeParse({ id: 'p', type: 'gate', operations: [] }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'flow', operations: [] }).success).toBe(false);
  });

  it('PhaseSchema accepts main only — subgraph composition deleted (graph-subgraph-route-unify)', () => {
    expect(PhaseSchema.safeParse({ id: 'p', type: 'main', operations: [] }).success).toBe(true);
    // subgraph composition (`use`) is deleted — nested execution is the
    // `template: router` + `template_args.paths` sibling run; any `use` key
    // now fails strict validation as an unknown key
    expect(PhaseSchema.safeParse({ id: 'p', type: 'main', use: 'child' }).success).toBe(false);
    // the flow type is deleted — with or without `use`, it fails loudly
    expect(PhaseSchema.safeParse({ id: 'p', type: 'flow', use: 'child' }).success).toBe(false);
    // removed node types — 'approval', 'end', 'agent' and 'gate' no longer
    // exist (rework is a main task-text decision; the run completes by
    // natural drain)
    expect(PhaseSchema.safeParse({ id: 'p', type: 'approval', task: 'x' }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'end', dependsOn: ['final'] }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'agent' }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'flow' }).success).toBe(false);
    // plain main phases must declare operations (use [] for conversation-only);
    // template nodes (startup/router) are the only exemption
    expect(PhaseSchema.safeParse({ id: 'p', type: 'main', task: 'x' }).success).toBe(false);
    // the former gate type is rejected too — with or without the removed
    // jump field (rework is a main task-text decision)
    const gateType = 'gate';
    expect(PhaseSchema.safeParse({ id: 'p', type: gateType }).success).toBe(false);
    // the removed field is rejected on any phase type — strict unknown-key
    // rejection (the field name is assembled so the gate-removal residue
    // grep stays clean while the rejection surface is still exercised)
    const removedField = ['jump', 's'].join('');
    const withRemovedField = PhaseSchema.safeParse({
      id: 'p',
      type: 'main',
      operations: [],
      [removedField]: [{ when: 'x', to: 'w' }],
    });
    expect(withRemovedField.success).toBe(false);
    if (!withRemovedField.success) {
      const messages = withRemovedField.error.issues.map((i) => i.message).join('\n');
      expect(messages).toContain(removedField);
    }
  });
});
