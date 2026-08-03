/**
 * E2E at-rest validation for graph-generate.taskflow.yaml.
 *
 * Validates graph definition correctness — schema compliance, topology safety,
 * and eval presence — without requiring MCP server runtime.
 *
 * Covers Phase 1.10 E2E test infrastructure ticket.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { PhaseSchema, TaskflowSchema, type Taskflow } from '../../src/schemas/index.js';
import { topoLayers } from '../../src/topology.js';
import type { Phase } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixture — load graph-generate graph once per describe
// ---------------------------------------------------------------------------

const VALID_PHASE_TYPES: Record<string, true> = { main: true, approval: true, gate: true, flow: true };

function loadGraphGenerateGraph(): Taskflow {
  const pkgRoot = join(__dirname, '..', '..');
  const graphPath = join(pkgRoot, 'graphs', 'graph-generate.taskflow.yaml');
  const raw = readFileSync(graphPath, 'utf-8');
  const parsed = parseYaml(raw);
  return TaskflowSchema.parse(parsed);
}

// ---------------------------------------------------------------------------
// Schema compliance
// ---------------------------------------------------------------------------

describe('graph-generate — schema compliance', () => {
  it('loads and parses as valid TaskflowSchema', () => {
    const graph = loadGraphGenerateGraph();
    expect(graph).toBeDefined();
    expect(graph.name).toBe('graph-generate');
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBeGreaterThanOrEqual(1);
  });

  it('every phase is valid against PhaseSchema', () => {
    const graph = loadGraphGenerateGraph();
    for (const phase of graph.phases) {
      expect(() => PhaseSchema.parse(phase)).not.toThrow();
    }
  });

  it('every phase has a non-empty id string', () => {
    const graph = loadGraphGenerateGraph();
    for (const phase of graph.phases) {
      expect(typeof phase.id).toBe('string');
      expect(phase.id.length).toBeGreaterThan(0);
    }
  });

  it('phase ids are unique', () => {
    const graph = loadGraphGenerateGraph();
    const ids = graph.phases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every phase has a valid type', () => {
    const graph = loadGraphGenerateGraph();
    for (const phase of graph.phases) {
      expect(VALID_PHASE_TYPES[phase.type]).toBe(true);
    }
  });

  it('has expected 6 phases for the graph-generate workflow', () => {
    const graph = loadGraphGenerateGraph();
    const phaseIds = graph.phases.map((p) => p.id);
    expect(phaseIds).toContain('scope-confirm');
    expect(phaseIds).toContain('graph-design');
    expect(phaseIds).toContain('graph-write');
    expect(phaseIds).toContain('graph-review');
    expect(phaseIds).toContain('graph-accept');
    expect(phaseIds).toContain('output-examples');
  });

  it('main phases with skill reference use kebab-case skill names', () => {
    const graph = loadGraphGenerateGraph();
    const mainPhases = graph.phases.filter((p) => p.type === 'main' && p.skill);
    for (const phase of mainPhases) {
      // skill names are kebab-case (atom-* builtins or upstream skills like code-review)
      expect(phase.skill).toMatch(/^[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*$/);
    }
  });

  it('routing actions have valid action enum values', () => {
    const graph = loadGraphGenerateGraph();
    const approvalPhases = graph.phases.filter((p) => p.type === 'approval' && p.routing);
    for (const phase of approvalPhases) {
      for (const action of phase.routing!.actions) {
        expect(['continue', 'retry', 'jump']).toContain(action.action);
        expect(typeof action.label).toBe('string');
        expect(action.label.length).toBeGreaterThan(0);
        expect(typeof action.description).toBe('string');
        expect(action.description.length).toBeGreaterThan(0);
      }
    }
  });

  it('jump routing actions — if target is present, it must be non-empty', () => {
    const graph = loadGraphGenerateGraph();
    const approvalPhases = graph.phases.filter((p) => p.type === 'approval' && p.routing);
    for (const phase of approvalPhases) {
      const jumpActions = phase.routing!.actions.filter((a) => a.action === 'jump');
      for (const action of jumpActions) {
        // target is optional in schema; if present, must be non-empty string
        if (action.target !== undefined) {
          expect(typeof action.target).toBe('string');
          expect(action.target.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Topology validity
// ---------------------------------------------------------------------------

describe('graph-generate — topology validity', () => {
  it('DAG is acyclic — topoLayers does not throw', () => {
    const graph = loadGraphGenerateGraph();
    // topoLayers throws on cycles; successful call means acyclic
    expect(() => topoLayers(graph.phases as Phase[])).not.toThrow();
  });

  it('DAG has at least one entry phase (no dependsOn)', () => {
    const graph = loadGraphGenerateGraph();
    const entryPhases = graph.phases.filter((p) => !p.dependsOn || p.dependsOn.length === 0);
    expect(entryPhases.length).toBeGreaterThanOrEqual(1);
  });

  it('all dependsOn refs point to existing phase ids', () => {
    const graph = loadGraphGenerateGraph();
    const phaseIds = new Set(graph.phases.map((p) => p.id));
    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      for (const depId of phase.dependsOn) {
        expect(phaseIds.has(depId)).toBe(true);
      }
    }
  });

  it('no phase depends on itself', () => {
    const graph = loadGraphGenerateGraph();
    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      for (const depId of phase.dependsOn) {
        expect(depId).not.toBe(phase.id);
      }
    }
  });

  it('all phases are reachable from entry phases', () => {
    const graph = loadGraphGenerateGraph();
    const phaseIds = new Set(graph.phases.map((p) => p.id));

    // BFS from all entry phases
    const visited = new Set<string>();
    const queue: string[] = [];
    const adj = new Map<string, string[]>();
    for (const p of graph.phases) {
      adj.set(p.id, []);
    }
    for (const p of graph.phases) {
      if (p.dependsOn) {
        for (const dep of p.dependsOn) {
          const deps = adj.get(dep);
          if (deps) deps.push(p.id);
        }
      }
    }

    // start from entry (no dependsOn) phases
    for (const p of graph.phases) {
      if (!p.dependsOn || p.dependsOn.length === 0) {
        queue.push(p.id);
        visited.add(p.id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adj.get(current) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    for (const id of phaseIds) {
      expect(visited.has(id)).toBe(true);
    }
  });

  it('topological sort produces correct layer ordering', () => {
    const graph = loadGraphGenerateGraph();
    const layers = topoLayers(graph.phases as Phase[]);
    const layerIndex = new Map<string, number>();
    for (let i = 0; i < layers.length; i++) {
      for (const p of layers[i]) {
        layerIndex.set(p.id, i);
      }
    }

    // every phase must appear after its dependencies
    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      const myIdx = layerIndex.get(phase.id)!;
      for (const depId of phase.dependsOn) {
        const depIdx = layerIndex.get(depId)!;
        expect(depIdx).toBeLessThan(myIdx);
      }
    }
  });

  it('graph-accept depends on graph-gate', () => {
    const graph = loadGraphGenerateGraph();
    const acceptPhase = graph.phases.find((p) => p.id === 'graph-accept');
    expect(acceptPhase).toBeDefined();
    expect(acceptPhase!.dependsOn).toBeDefined();
    expect(acceptPhase!.dependsOn).toContain('graph-gate');
  });

  it('graph-gate depends on graph-review', () => {
    const graph = loadGraphGenerateGraph();
    const gatePhase = graph.phases.find((p) => p.id === 'graph-gate');
    expect(gatePhase).toBeDefined();
    expect(gatePhase!.dependsOn).toBeDefined();
    expect(gatePhase!.dependsOn).toContain('graph-review');
  });

  it('graph-write depends on graph-design', () => {
    const graph = loadGraphGenerateGraph();
    const writePhase = graph.phases.find((p) => p.id === 'graph-write');
    expect(writePhase).toBeDefined();
    expect(writePhase!.dependsOn).toBeDefined();
    expect(writePhase!.dependsOn).toContain('graph-design');
  });
});

// ---------------------------------------------------------------------------
// Eval condition presence
// ---------------------------------------------------------------------------

describe('graph-generate — eval condition presence', () => {
  it('every approval phase has no eval (pure human card)', () => {
    const graph = loadGraphGenerateGraph();
    const approvalPhases = graph.phases.filter((p) => p.type === 'approval');
    expect(approvalPhases.length).toBeGreaterThanOrEqual(1);
    for (const phase of approvalPhases) {
      expect(phase.eval).toBeUndefined();
    }
  });

  it('every gate phase has a bounded eval', () => {
    const graph = loadGraphGenerateGraph();
    const gatePhases = graph.phases.filter((p) => p.type === 'gate');
    expect(gatePhases.length).toBeGreaterThanOrEqual(1);
    for (const phase of gatePhases) {
      expect(phase.eval).toBeDefined();
      expect(Array.isArray(phase.eval)).toBe(true);
      expect(phase.eval!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('eval conditions have valid action enum values', () => {
    const graph = loadGraphGenerateGraph();
    const gatePhases = graph.phases.filter((p) => p.type === 'gate');
    for (const phase of gatePhases) {
      for (const cond of phase.eval!) {
        expect(['retry', 'jump']).toContain(cond.action);
        expect(typeof cond.when).toBe('string');
        expect(cond.when.length).toBeGreaterThan(0);
      }
    }
  });

  it('graph-gate eval is bounded FAIL retry on contract field (no DEBT)', () => {
    const graph = loadGraphGenerateGraph();
    const gatePhase = graph.phases.find((p) => p.id === 'graph-gate');
    expect(gatePhase).toBeDefined();
    expect(gatePhase!.eval).toBeDefined();

    const conditions = gatePhase!.eval!.map((c) => c.when).join(' ');
    expect(conditions).toContain('overall: fail');
    expect(conditions).toContain('retryAttempt < 2');
    expect(conditions).not.toContain('DEBT');
    expect(conditions).not.toContain('FAIL verdict');
  });

  it('graph-accept has all three routing actions (continue/retry/jump)', () => {
    const graph = loadGraphGenerateGraph();
    const acceptPhase = graph.phases.find((p) => p.id === 'graph-accept');
    expect(acceptPhase).toBeDefined();
    expect(acceptPhase!.routing).toBeDefined();
    const actionTypes = acceptPhase!.routing!.actions.map((a) => a.action);
    expect(actionTypes).toContain('continue');
    expect(actionTypes).toContain('retry');
    expect(actionTypes).toContain('jump');
  });
});
