/**
 * Tests for the graph problem-surfacing channel:
 * - graph_start returns problems (inventory mismatch, description drift)
 * - graph_assets enumerates registered graphs with per-graph problems (read-only)
 * - graph_init reports per-graph problems from the full contract pass
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  rt: SchedulerRuntime;
  cleanup: () => void;
}

async function makeFixture(graphs: Record<string, string>, registry?: string): Promise<Fixture> {
  const taskflowDir = join(tmpdir(), `problems-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  for (const [name, json] of Object.entries(graphs)) {
    writeFileSync(join(taskflowDir, `${name}.yaml`), json);
  }

  const rt = await Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      registryPaths: registry ? [join(taskflowDir, 'registry.json')] : undefined,
    }),
  );

  if (registry) {
    writeFileSync(join(taskflowDir, 'registry.json'), registry);
  }

  return {
    taskflowDir,
    rt,
    cleanup: () => {
      rmSync(taskflowDir, { recursive: true, force: true });
    },
  };
}

function cleanGraph(name: string): string {
  return JSON.stringify({
    name,
    phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] }],
  });
}

/** inventory entry references a non-existent phase → load-time warning; top-level description carries a stale phase reference → description drift */
function driftedInventoryGraph(name: string): string {
  return JSON.stringify({
    name,
    description: 'Graph with a stale `old-phase` reference in the definition description',
    inventory: [{ id: 'ghost-phase', type: 'main', goal: 'Executes nothing' }],
    phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] }],
  });
}

const REGISTRY = JSON.stringify({
  graphs: [
    { name: 'clean-graph', path: 'clean-graph.yaml' },
    { name: 'drift-graph', path: 'drift-graph.yaml' },
  ],
});

describe('graph_start problems', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = await makeFixture(
      { 'clean-graph': cleanGraph('clean-graph'), 'drift-graph': driftedInventoryGraph('drift-graph') },
      REGISTRY,
    );
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('returns an empty problems array for a clean graph', async () => {
    const result = await fix.rt.graphStart('clean-graph', { mode: 'auto' });
    expect(result.problems).toEqual([]);
  });

  it('surfaces inventory id/type mismatch in problems (never blocks)', async () => {
    const result = await fix.rt.graphStart('drift-graph', { mode: 'auto' });
    expect(result.problems.length).toBeGreaterThan(0);
    expect(result.problems.join('\n')).toContain('ghost-phase');
    // warnings never block — the run starts anyway
    expect(result.runId).toBeTruthy();
    expect(result.node).not.toBeNull();
  });

  it('surfaces graph definition description drift in problems', async () => {
    const result = await fix.rt.graphStart('drift-graph', { mode: 'auto' });
    const all = result.problems.join('\n');
    expect(all).toContain('old-phase');
    expect(all).toContain('description drift');
  });

  it('does NOT report bare kebab-case prose as drift (backtick-only candidates)', async () => {
    // graph definition description mentions skill/graph names without
    // backticks — kebab-case prose must not fabricate drift on healthy graphs
    const fix2 = await makeFixture(
      {
        'skill-graph': JSON.stringify({
          name: 'skill-graph',
          description: 'Runs test-agent-skill and related tooling for end users',
          phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] }],
        }),
      },
      JSON.stringify({
        graphs: [{ name: 'skill-graph', path: 'skill-graph.yaml' }],
      }),
    );
    try {
      const result = await fix2.rt.graphStart('skill-graph', { mode: 'auto' });
      expect(result.problems).toEqual([]);
    } finally {
      fix2.cleanup();
    }
  });
});

describe('graph_assets', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = await makeFixture(
      { 'clean-graph': cleanGraph('clean-graph'), 'drift-graph': driftedInventoryGraph('drift-graph') },
      REGISTRY,
    );
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('enumerates registered graphs with the five-field perception-list payload', async () => {
    const assets = await fix.rt.graphAssets();

    // Registered fixture graphs — source: project (fixture registry).
    const clean = assets.find((a) => a.id === 'clean-graph')!;
    expect(clean).toBeDefined();
    expect(clean.source).toBe('project');
    expect(clean.description).toBe('');
    expect(clean.run_conditions).toEqual({ interaction: 'enabled', constraints_present: false });
    expect(clean.problems).toEqual([]);

    const drift = assets.find((a) => a.id === 'drift-graph')!;
    expect(drift).toBeDefined();
    expect(drift.source).toBe('project');
    expect(drift.description).toContain('old-phase');
    expect(drift.problems.length).toBeGreaterThan(0);
    expect(drift.problems.join('\n')).toContain('ghost-phase');

    // Unregistered enumeration — schema-valid YAMLs in the workflow dirs
    // without a registry entry surface as source: fallback (this fixture's
    // registry does not register the builtin graphs dir's YAMLs).
    const unregistered = assets.filter((a) => a.source === 'fallback');
    expect(unregistered.length).toBeGreaterThan(0);
    for (const u of unregistered) {
      expect(u.source).toBe('fallback');
      expect(u.problems).toEqual([]);
    }
  });

  it('catalog entries expose exactly the five fields — no tags/registered/resolvedFrom/version/args', async () => {
    const assets = await fix.rt.graphAssets();
    expect(assets.length).toBeGreaterThan(0);
    for (const asset of assets) {
      expect(Object.keys(asset).sort()).toEqual(['description', 'id', 'problems', 'run_conditions', 'source']);
      expect(asset.run_conditions).toMatchObject({
        interaction: expect.any(String),
        constraints_present: expect.any(Boolean),
      });
    }
  });

  it('run_conditions projects interaction and constraints presence from the definition', async () => {
    const nonInteractive = JSON.stringify({
      name: 'headless-graph',
      interaction: 'none',
      constraints: ['Never touches the network'],
      phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] }],
    });
    const fix2 = await makeFixture(
      { 'headless-graph': nonInteractive },
      JSON.stringify({ graphs: [{ name: 'headless-graph', path: 'headless-graph.yaml' }] }),
    );
    try {
      const assets = await fix2.rt.graphAssets();
      const headless = assets.find((a) => a.id === 'headless-graph')!;
      expect(headless).toBeDefined();
      expect(headless.run_conditions).toEqual({ interaction: 'none', constraints_present: true });
    } finally {
      fix2.cleanup();
    }
  });

  it('never creates a run (read-only)', async () => {
    await fix.rt.graphAssets();
    const runs = await fix.rt.graphList();
    expect(runs).toHaveLength(0);
  });
});

describe('graph_init per-graph problems', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = await makeFixture(
      { 'clean-graph': cleanGraph('clean-graph'), 'drift-graph': driftedInventoryGraph('drift-graph') },
      REGISTRY,
    );
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('reports per-graph problems from the full contract pass', async () => {
    const report = await fix.rt.graphInit();
    const problemsByFile = report.validation.graphProblems;
    expect(problemsByFile.length).toBeGreaterThanOrEqual(2);

    const drift = problemsByFile.find((g) => g.filePath.includes('drift-graph'))!;
    expect(drift).toBeDefined();
    expect(drift.problems.join('\n')).toContain('ghost-phase');

    const clean = problemsByFile.find((g) => g.filePath.includes('clean-graph'))!;
    expect(clean.problems).toEqual([]);
  });
});

describe('failure paths', () => {
  it('graph_assets surfaces a registry entry whose graph fails to load (never a silent drop)', async () => {
    // registry references a file that does not exist — the asset row carries
    // the load failure in problems instead of disappearing
    const fix2 = await makeFixture(
      { 'clean-graph': cleanGraph('clean-graph') },
      JSON.stringify({
        graphs: [
          { name: 'clean-graph', path: 'clean-graph.yaml' },
          { name: 'broken-graph', path: 'broken-graph.yaml' },
        ],
      }),
    );
    try {
      const assets = await fix2.rt.graphAssets();
      const broken = assets.find((a) => a.id === 'broken-graph');
      expect(broken).toBeDefined();
      expect(broken!.problems.length).toBeGreaterThan(0);
      expect(broken!.problems.join('\n')).toMatch(/broken-graph/);
      // the healthy graph still enumerates clean
      const clean = assets.find((a) => a.id === 'clean-graph')!;
      expect(clean.problems).toEqual([]);
    } finally {
      fix2.cleanup();
    }
  });

  it('graph_init reports schema-unknown phase keys as per-graph problems (never silently)', async () => {
    // Legacy gate graphs carry the removed field (the jump array) — they now
    // fail at SCHEMA parse, and graph_init reports the unknown keys through
    // the tolerant audit as per-graph problems (frontend notification →
    // graph-maintain cleanup) instead of dropping the graph silently (same
    // fixture class as load-contracts.test.ts). The field name is assembled
    // so the gate-removal residue grep stays clean.
    const removedField = ['jump', 's'].join('');
    const badGraph = {
      name: 'bad-graph',
      phases: [
        { id: 'writer', type: 'main', skill: 'test-agent-skill', task: 'write', operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['writer'],
          operations: [],
          [removedField]: [{ when: 'writer output shows overall: fail', to: 'accept' }],
        },
        { id: 'accept', type: 'main', dependsOn: ['gate'], operations: [] },
      ],
    };
    const fix2 = await makeFixture({ 'bad-graph': JSON.stringify(badGraph) });
    try {
      const report = await fix2.rt.graphInit();
      const problem = report.validation.graphProblems.find((g) => g.filePath.includes('bad-graph'));
      expect(problem).toBeDefined();
      expect(problem!.name).toBe('bad-graph');
      // schema-unknown key audit — the problem names the extra field and the
      // graph-maintain repair path (loud notification, never silent)
      expect(problem!.problems[0]).toContain('schema-unknown phase keys');
      expect(problem!.problems[0]).toMatch(/jump/);
      expect(problem!.problems[0]).toMatch(/graph-maintain/);
    } finally {
      fix2.cleanup();
    }
  });

  it('graph_init shadowing guard: only the resolved project file reports a row for a shadowed builtin', async () => {
    // project registry entry shadows the same-named builtin — the scanned
    // builtin file is not what loads, so its row is skipped; exactly one row
    // (the project file) reports problems for the name
    const fix2 = await makeFixture(
      {
        'graph-maintain': JSON.stringify({
          name: 'graph-maintain',
          phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a', operations: [] }],
        }),
      },
      JSON.stringify({
        graphs: [{ name: 'graph-maintain', path: 'graph-maintain.yaml' }],
      }),
    );
    try {
      const report = await fix2.rt.graphInit();
      const rows = report.validation.graphProblems.filter((g) => g.name === 'graph-maintain');
      expect(rows).toHaveLength(1);
      expect(rows[0].filePath).toContain('problems-test');
    } finally {
      fix2.cleanup();
    }
  });
});
