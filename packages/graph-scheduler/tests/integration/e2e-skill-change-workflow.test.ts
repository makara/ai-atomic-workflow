/**
 * E2E at-rest validation for skill-change-workflow.taskflow.yaml.
 *
 * Validates orchestration graph definition correctness — schema compliance,
 * topology safety, flow-flatten structure, cross-review structure, approval
 * evals, and plan-phase chain — without requiring MCP server runtime.
 *
 * Covers Phase 2.5 E2E test — ticket 06.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { PhaseSchema, TaskflowSchema, type Taskflow } from '../../src/schemas/index.js';
import { topoLayers } from '../../src/topology.js';
import type { Phase } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixture — load skill-change-workflow graph once per describe
// ---------------------------------------------------------------------------

const VALID_PHASE_TYPES: Record<string, true> = { main: true, approval: true, gate: true, flow: true };

function loadSkillChangeWorkflowGraph(): Taskflow {
  const pkgRoot = join(__dirname, '..', '..');
  const graphPath = join(pkgRoot, 'graphs', 'skill-change-workflow.taskflow.yaml');
  const raw = readFileSync(graphPath, 'utf-8');
  const parsed = parseYaml(raw);
  return TaskflowSchema.parse(parsed);
}

function subGraphPath(useName: string): string {
  const pkgRoot = join(__dirname, '..', '..');
  return join(pkgRoot, 'graphs', `${useName}.taskflow.yaml`);
}

// ---------------------------------------------------------------------------
// Schema compliance
// ---------------------------------------------------------------------------

describe('skill-change-workflow — schema compliance', () => {
  it('loads and parses as valid TaskflowSchema', () => {
    const graph = loadSkillChangeWorkflowGraph();
    expect(graph).toBeDefined();
    expect(graph.name).toBe('skill-change-workflow');
    expect(graph.phases).toBeDefined();
    expect(graph.phases.length).toBeGreaterThanOrEqual(1);
  });

  it('every phase is valid against PhaseSchema', () => {
    const graph = loadSkillChangeWorkflowGraph();
    for (const phase of graph.phases) {
      expect(() => PhaseSchema.parse(phase)).not.toThrow();
    }
  });

  it('every phase has a non-empty id string', () => {
    const graph = loadSkillChangeWorkflowGraph();
    for (const phase of graph.phases) {
      expect(typeof phase.id).toBe('string');
      expect(phase.id.length).toBeGreaterThan(0);
    }
  });

  it('phase ids are unique', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const ids = graph.phases.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every phase has a valid type', () => {
    const graph = loadSkillChangeWorkflowGraph();
    for (const phase of graph.phases) {
      expect(VALID_PHASE_TYPES[phase.type]).toBe(true);
    }
  });

  it('has expected 9 phases for the skill-change-workflow orchestration (route-first redesign: no branch-gate, no end)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phaseIds = graph.phases.map((p) => p.id);
    expect(phaseIds).toContain('plan');
    expect(phaseIds).toContain('plan-parse');
    expect(phaseIds).toContain('skill-author-foo');
    expect(phaseIds).toContain('skill-delete-foo');
    expect(phaseIds).toContain('doc-update');
    expect(phaseIds).toContain('openspec-create-foo');
    expect(phaseIds).toContain('cross-review');
    expect(phaseIds).toContain('change-accept');
    expect(phaseIds).toContain('archive');
    expect(phaseIds).not.toContain('branch-gate');
    expect(phaseIds).not.toContain('skill-change-done');
  });

  it('archive phase wires atom-openspec-archive with change-accept (NEVER ask resolution)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const archive = graph.phases.find((p) => p.id === 'archive');
    expect(archive).toBeDefined();
    expect(archive!.type).toBe('main');
    expect(archive!.skill).toBe('atom-openspec-archive');
    expect(archive!.dependsOn).toEqual(['change-accept']);
    expect(archive!.channels).toBeUndefined();
    expect(archive!.task).toContain('openspec archive');
    expect(archive!.task).toContain('blocked');
  });

  it('flow phases declare use — def removed', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow');
    for (const phase of flowPhases) {
      expect(phase.use).toBeTruthy();
      expect(phase.def).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Topology validity
// ---------------------------------------------------------------------------

describe('skill-change-workflow — topology validity', () => {
  it('DAG is acyclic — topoLayers does not throw', () => {
    const graph = loadSkillChangeWorkflowGraph();
    expect(() => topoLayers(graph.phases as Phase[])).not.toThrow();
  });

  it('DAG has at least one entry phase (no dependsOn)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const entryPhases = graph.phases.filter((p) => !p.dependsOn || p.dependsOn.length === 0);
    expect(entryPhases.length).toBeGreaterThanOrEqual(1);
  });

  it('all dependsOn refs point to existing phase ids', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phaseIds = new Set(graph.phases.map((p) => p.id));
    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      for (const depId of phase.dependsOn) {
        expect(phaseIds.has(depId)).toBe(true);
      }
    }
  });

  it('no phase depends on itself', () => {
    const graph = loadSkillChangeWorkflowGraph();
    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      for (const depId of phase.dependsOn) {
        expect(depId).not.toBe(phase.id);
      }
    }
  });

  it('all phases are reachable from entry phases', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phaseIds = new Set(graph.phases.map((p) => p.id));

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
    const graph = loadSkillChangeWorkflowGraph();
    const layers = topoLayers(graph.phases as Phase[]);
    const layerIndex = new Map<string, number>();
    for (let i = 0; i < layers.length; i++) {
      for (const p of layers[i]) {
        layerIndex.set(p.id, i);
      }
    }

    for (const phase of graph.phases) {
      if (!phase.dependsOn) continue;
      const myIdx = layerIndex.get(phase.id)!;
      for (const depId of phase.dependsOn) {
        const depIdx = layerIndex.get(depId)!;
        expect(depIdx).toBeLessThan(myIdx);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Plan-phase DAG chain
// ---------------------------------------------------------------------------

describe('skill-change-workflow — plan phase chain', () => {
  it('plan is an entry flow phase with no dependencies', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'plan');
    expect(phase).toBeDefined();
    expect(phase!.dependsOn ? phase!.dependsOn.length : 0).toBe(0);
    expect(phase!.type).toBe('flow');
    expect(phase!.use).toBe('plan-generate');
  });

  it('plan-parse depends on plan and is type main', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'plan-parse');
    expect(phase).toBeDefined();
    expect(phase!.dependsOn).toEqual(['plan']);
    expect(phase!.type).toBe('main');
  });

  it('plan-parse task text references plan output for PRD and metadata extraction', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'plan-parse');
    expect(phase).toBeDefined();
    expect(phase!.task).toBeDefined();
    expect(phase!.task).toContain('plan output');
    expect(phase!.task).toContain('skill_create_needed');
  });

  it('plan → plan-parse forms linear DAG chain', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const layers = topoLayers(graph.phases as Phase[]);
    const layerIndex = new Map<string, number>();
    for (let i = 0; i < layers.length; i++) {
      for (const p of layers[i]) {
        layerIndex.set(p.id, i);
      }
    }
    const planLayer = layerIndex.get('plan')!;
    const parseLayer = layerIndex.get('plan-parse')!;
    expect(planLayer).toBeLessThan(parseLayer);
  });
});

// ---------------------------------------------------------------------------
// Flow-flatten correctness
// ---------------------------------------------------------------------------

describe('skill-change-workflow — flow-flatten correctness', () => {
  it('skill-delete-foo is a flow type phase', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'skill-delete-foo');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('flow');
  });

  it('doc-update is a flow type phase', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'doc-update');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('flow');
  });
  it('flow phases use registered graph names with existing sub-graph files', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow');
    expect(flowPhases.length).toBe(5);

    for (const phase of flowPhases) {
      expect(phase.use).toBeDefined();
      expect(typeof phase.use).toBe('string');
      expect(phase.use!.length).toBeGreaterThan(0);

      const subPath = subGraphPath(phase.use!);
      expect(existsSync(subPath)).toBe(true);
    }
  });

  it('sub-graph files have name fields matching use references', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow');

    for (const phase of flowPhases) {
      const subPath = subGraphPath(phase.use!);
      const raw = readFileSync(subPath, 'utf-8');
      const subGraph = parseYaml(raw);
      expect(subGraph.name).toBe(phase.use);
    }
  });

  it('skill-delete-foo uses skill-delete graph', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'skill-delete-foo');
    expect(phase!.use).toBe('skill-delete');
  });

  it('doc-update uses doc-update graph', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'doc-update');
    expect(phase!.use).toBe('doc-update');
  });

  it('flow phases carry no with: field — with removed', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow');

    for (const phase of flowPhases) {
      expect(phase.with).toBeUndefined();
    }
  });

  it('sub-graph entry phases read plan-parse output (sole source)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    // writer flows activated through plan-parse (branch-gate removed — route-first)
    const skillDelete = graph.phases.find((p) => p.id === 'skill-delete-foo');
    expect(skillDelete!.dependsOn).toContain('plan-parse');
    const docUpdate = graph.phases.find((p) => p.id === 'doc-update');
    expect(docUpdate!.dependsOn).toContain('plan-parse');
  });

  it('writer flows carry case-5 self-judgment task text referencing plan-parse flags (no branch-gate)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    expect(graph.phases.find((p) => p.id === 'branch-gate')).toBeUndefined();
    const flowTasks: Record<string, string> = {};
    for (const phase of graph.phases.filter((p) => p.type === 'flow' && p.id !== 'plan')) {
      flowTasks[phase.id] = String(phase.task ?? '');
    }
    expect(flowTasks['skill-delete-foo']).toContain('skill_delete_needed');
    expect(flowTasks['skill-author-foo']).toContain('skill_create_needed');
    expect(flowTasks['doc-update']).toContain('doc_update_needed');
    expect(flowTasks['openspec-create-foo']).toContain('spec_needed');
    // no flow phase carries a when guard anymore
    for (const phase of graph.phases) {
      expect(phase.when).toBeUndefined();
    }
  });

  it('flow phases (excl plan) depend on plan-parse', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow' && p.id !== 'plan');

    for (const phase of flowPhases) {
      expect(phase.dependsOn).toBeDefined();
      expect(phase.dependsOn).toContain('plan-parse');
    }
  });
  it('skill-delete-foo flow self-judges on skill_delete_needed (no branch-gate)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flow = graph.phases.find((p) => p.id === 'skill-delete-foo');
    expect(flow!.type).toBe('flow');
    expect(String(flow!.task)).toContain('skill_delete_needed');
  });

  it('doc-update flow self-judges on doc_update_needed (no branch-gate)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flow = graph.phases.find((p) => p.id === 'doc-update');
    expect(flow!.type).toBe('flow');
    expect(String(flow!.task)).toContain('doc_update_needed');
  });

  it('flow phases carry no maxDepth field — constant depth', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const flowPhases = graph.phases.filter((p) => p.type === 'flow');

    for (const phase of flowPhases) {
      expect(phase.maxDepth).toBeUndefined();
    }
  });

  it('sub-graph entry phases declare plan-parse priority (no with fallback)', () => {
    // plan-parse output is the primary target source; with: removed.
    const graph = loadSkillChangeWorkflowGraph();
    const pkgRoot = join(__dirname, '..', '..');

    const cases = [
      { use: 'skill-delete', entry: 'skill-select', field: 'skill_delete_name' },
      { use: 'skill-author', entry: 'scope-confirm', field: 'skill_create_name' },
      { use: 'doc-update', entry: 'doc-trigger', field: 'doc_update_files' },
    ];

    for (const { use, entry, field } of cases) {
      const flowPhase = graph.phases.find((p) => p.type === 'flow' && p.use === use);
      expect(flowPhase, `${use} flow phase`).toBeDefined();
      expect(flowPhase!.dependsOn, `${use} flow depends on plan-parse`).toContain('plan-parse');

      const subRaw = readFileSync(subGraphPath(use), 'utf-8');
      const subGraph = parseYaml(subRaw);
      const entryPhase = (subGraph.phases as Array<Record<string, unknown>>).find((p) => p.id === entry);
      expect(entryPhase, `${use} entry phase`).toBeDefined();
      const task = String(entryPhase!.task ?? '');
      expect(task, `${use} entry prefers plan-parse ${field}`).toContain(field);
      // No {with.X} fallback — with mechanism removed
      expect(task, `${use} entry has no with fallback`).not.toMatch(/\{with\./);
    }
  });
});

// ---------------------------------------------------------------------------
// Cross-review structure
// ---------------------------------------------------------------------------

describe('skill-change-workflow — cross-review structure', () => {
  it('cross-review is an agent phase', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'cross-review');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('main');
  });

  it('cross-review has skill: code-review with reviewer hint', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'cross-review');
    expect(phase!.skill).toBeDefined();
    expect(phase!.skill).toBe('code-review');
    expect(phase!.agent).toEqual(['reviewer', 'explore', 'task', 'general']);
  });

  it('cross-review depends on all flow phases (skill-author-foo, skill-delete-foo, doc-update, openspec-create-foo)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'cross-review');
    expect(phase!.dependsOn).toBeDefined();
    expect(phase!.dependsOn).toContain('skill-author-foo');
    expect(phase!.dependsOn).toContain('skill-delete-foo');
    expect(phase!.dependsOn).toContain('doc-update');
    expect(phase!.dependsOn).toContain('openspec-create-foo');
    expect(phase!.dependsOn!.length).toBe(4);
  });

  it('cross-review has channel entries for standards skills (atom-skill-spec, atom-graph-spec)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'cross-review');
    expect(phase!.channels).toBeDefined();
    expect(phase!.channels!.length).toBeGreaterThanOrEqual(1);
    expect(phase!.channels).toContain('skill:atom-skill-spec');
    expect(phase!.channels).toContain('skill:atom-graph-spec');
  });

  it('cross-review has task instructions', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'cross-review');
    expect(phase!.task).toBeDefined();
    expect(phase!.task!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Approval eval conditions
// ---------------------------------------------------------------------------

describe('skill-change-workflow — approval eval conditions', () => {
  it('change-accept is an approval phase', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'change-accept');
    expect(phase).toBeDefined();
    expect(phase!.type).toBe('approval');
  });

  it('change-accept depends on cross-review', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'change-accept');
    expect(phase!.dependsOn).toBeDefined();
    expect(phase!.dependsOn).toContain('cross-review');
  });

  it('change-accept is human card — no branches/eval, no written routing (multi-writer dynamic retry)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'change-accept');
    expect(phase!.eval).toBeUndefined();
    expect(phase!.branches).toBeUndefined();
    // route-first: per-writer retry targets are AI-generated dynamic options, not written actions
    expect(phase!.routing).toBeUndefined();
  });

  it('change-accept declares no written routing — plan rework is a dynamic option', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'change-accept');
    expect(phase!.routing).toBeUndefined();
    // preText merged into task (schema field convergence) — first line = header
    expect(String(phase!.task ?? '')).toContain('plan');
  });

  it('change-accept has no written routing — default card only (route-first)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const phase = graph.phases.find((p) => p.id === 'change-accept');
    expect(phase!.routing).toBeUndefined();
  });

  it('no approval declares written routing actions (route-first)', () => {
    const graph = loadSkillChangeWorkflowGraph();
    const approvalPhases = graph.phases.filter((p) => p.type === 'approval');
    expect(approvalPhases.length).toBeGreaterThanOrEqual(1);
    for (const phase of approvalPhases) {
      expect(phase.routing).toBeUndefined();
    }
  });
});
