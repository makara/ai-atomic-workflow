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

import { resolvePhaseHandler } from '../src/phase-handler/index.js';
import { PhaseSchema } from '../src/schemas/phase.js';

const PKG_ROOT = join(__dirname, '..');
const GRAPHS_DIR = join(PKG_ROOT, 'graphs');
const REGISTRY_PATH = join(GRAPHS_DIR, 'registry.json');

interface RegistryEntry {
  name: string;
  path: string;
  description?: string;
}

function loadRegistry(): RegistryEntry[] {
  const raw = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8')) as { graphs: RegistryEntry[] };
  return raw.graphs;
}

function graphFilesOnDisk(): string[] {
  return readdirSync(GRAPHS_DIR)
    .filter((file) => file.endsWith('.taskflow.yaml'))
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
      const expectedName = file.replace(/\.taskflow\.yaml$/, '');
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

  it('registry entry shape is name + path + description', () => {
    const registry = loadRegistry();
    for (const entry of registry) {
      expect(typeof entry.name).toBe('string');
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.path).toBe('string');
      expect(typeof entry.description).toBe('string');
    }
  });

  it('openspec-create is registered', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'openspec-create');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('openspec-create.taskflow.yaml');
  });

  it('openspec-pipeline is registered', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'openspec-pipeline');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('openspec-pipeline.taskflow.yaml');
  });

  it('openspec-engineer is registered', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'openspec-engineer');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('openspec-engineer.taskflow.yaml');
  });

  it('arch-review-loop is registered — closed-loop review pipeline', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'arch-review-loop');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('arch-review-loop.taskflow.yaml');
    expect(entry?.description).toMatch(/closed loop|Top Rec/i);
  });

  it('arch-review-to-spec is NOT registered — deprecated and removed', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'arch-review-to-spec');
    expect(entry).toBeUndefined();
  });

  it('grill-with-docs is registered — two-track shared idea entry', () => {
    const registry = loadRegistry();
    const entry = registry.find((item) => item.name === 'grill-with-docs');
    expect(entry).toBeDefined();
    expect(entry?.path).toBe('grill-with-docs.taskflow.yaml');
    expect(entry?.description).toMatch(/raw idea/i);
  });
});

describe('base phase types statically dispatched', () => {
  it('main and approval resolve to handlers — no registry', () => {
    expect(resolvePhaseHandler('main').phaseType).toBe('main');
    expect(resolvePhaseHandler('approval').phaseType).toBe('approval');
  });

  it('flow is a composition type — never a dispatch type', () => {
    expect(() => resolvePhaseHandler('flow')).toThrow(/Unknown phase type 'flow'/);
  });

  it('PhaseSchema accepts main/approval/flow/gate (flow needs use; gate needs jumps)', () => {
    expect(PhaseSchema.safeParse({ id: 'p', type: 'main' }).success).toBe(true);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'approval' }).success).toBe(true);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'flow', use: 'child' }).success).toBe(true);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'gate', jumps: [{ when: 'x', to: 'w' }] }).success).toBe(true);
    // route-first redesign — 'end' node type is removed (run completes by natural drain / endRun)
    expect(PhaseSchema.safeParse({ id: 'p', type: 'end', dependsOn: ['final'] }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'agent' }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'flow' }).success).toBe(false);
    expect(PhaseSchema.safeParse({ id: 'p', type: 'gate' }).success).toBe(false);
  });
});
