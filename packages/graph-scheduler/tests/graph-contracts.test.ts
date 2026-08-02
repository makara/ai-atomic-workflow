/**
 * Graph contract tests — dispatch, approval routing, and guard hygiene checks
 * implemented per fix-graph-dispatch-timing-contracts.
 *
 * Covers:
 * - 2.5 skill optional on main; 'agent' type unregistered → load-time GraphDefinitionError
 * - 2.6 topology assertion: approval ready only when review node done
 * - 2.7 skill-author dual-guard mutual exclusivity (static field references)
 * - 2.8 snapshot nodes: advance/jump snapshot enumerates per-node states (M2)
 */
import { Effect } from 'effect';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { toTaskflowGraph } from '../src/api/graph-loader.js';
import { buildSnapshot } from '../src/api/snapshot.js';
import { validateEntrySkillContracts, validateGraphContracts } from '../src/context/contracts.js';
import type { FsmState } from '../src/fsm/transition.js';
import type { Taskflow } from '../src/graph-definition.js';
import { PhaseSchema } from '../src/schemas/phase.js';
import { resolveReady } from '../src/topology.js';
import type { Phase } from '../src/types.js';

const PKG_ROOT = join(__dirname, '..');

/** built-in graphs dispatched to contract checks (fleet scans) */
const BUILTIN_GRAPHS = [
  'arch-review.taskflow.yaml',
  'arch-review-to-spec.taskflow.yaml',
  'doc-update.taskflow.yaml',
  'graph-generate.taskflow.yaml',
  'plan-generate.taskflow.yaml',
  'skill-author.taskflow.yaml',
  'skill-change-workflow.taskflow.yaml',
  'skill-delete.taskflow.yaml',
  'openspec-create.taskflow.yaml',
  'openspec-pipeline.taskflow.yaml',
] as const;

function loadGraph(name: string): Record<string, unknown> {
  const raw = readFileSync(join(PKG_ROOT, 'graphs', name), 'utf-8');
  return parseYaml(raw) as Record<string, unknown>;
}

/** typed FsmState builder — no silent field loss via double casts */
function runningState(): FsmState {
  return {
    status: 'running',
    runId: 'run-1',
    graphName: 'g',
    startedAt: '2026-08-01T00:00:00.000Z',
    phases: {
      a: { status: 'done', retryCount: 0, startedAt: 't0', completedAt: 't1', durationMs: 1 },
      b: { status: 'active', retryCount: 0, startedAt: 't1' },
      c: { status: 'skipped', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
    },
  };
}

// ---------------------------------------------------------------------------
// 2.5 — skill optional on main phases; 'agent' phase type unregistered
// skill-less main passes contract
// validation, and the removed 'agent' type fails at load (toTaskflowGraph →
// GraphDefinitionError).
// ---------------------------------------------------------------------------

// Load-time rejection — toTaskflowGraph is runtime-free (static type dispatch).

describe('2.5 main phase skill optional; agent type unregistered', () => {
  it('skill-less main phase passes validation', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [{ id: 'a', type: 'main', dependsOn: [], task: 'x' }],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('main phase with explicit skill passes validation', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [{ id: 'a', type: 'main', dependsOn: [], skill: 'code-review', task: 'x' }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('main and approval phases are exempt', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'x' },
        { id: 'ap', type: 'approval', dependsOn: ['m'] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('rejects agent phase type at load — GraphDefinitionError (unregistered)', async () => {
    const tf = {
      name: 'test',
      version: 1,
      phases: [{ id: 'a', type: 'agent', dependsOn: [], skill: 'code-review', task: 'x' }],
    } as unknown as Taskflow;
    await expect(Effect.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/Unknown phase type 'agent'/);
    await expect(Effect.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/Registered types:/);
  });

  it('built-in fleet declares zero agent phases (unregistered)', () => {
    for (const name of BUILTIN_GRAPHS) {
      const tf = loadGraph(name);
      const phases = (tf.phases ?? []) as Array<Record<string, unknown>>;
      const agentPhases = phases.filter((p) => p.type === 'agent');
      expect(agentPhases, `${name} agent phases`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2.2 — approval dependsOn convergence + explicit targets
// ---------------------------------------------------------------------------

describe('2.2 approval routing contract', () => {
  it('rejects approval with multi-node dependsOn', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
        { id: 'ap', type: 'approval', dependsOn: ['r', 'w'] },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('approval dependsOn must contain exactly'))).toBe(true);
  });

  it('rejects approval with empty dependsOn (no upstream — vacuous gate)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [{ id: 'ap', type: 'approval', dependsOn: [] }],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('approval dependsOn must contain exactly'))).toBe(true);
  });

  it('rejects redundant transitive dependencies on any phase', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x' },
        { id: 'c', type: 'main', dependsOn: ['a', 'b'], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('redundant transitive dependency'))).toBe(true);
  });

  it('accepts minimal direct dependencies', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'x' },
        { id: 'c', type: 'main', dependsOn: ['b'], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('warns on retry/jump without explicit target', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: {
            actions: [
              { action: 'retry', label: 'Fix' },
              { action: 'jump', label: 'Back' },
            ],
          },
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.length).toBe(2);
    for (const w of warnings) expect(w).toContain('lacks explicit target');
  });

  it('errors on routing target referencing missing phase', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: {
            actions: [{ action: 'retry', target: 'ghost', label: 'Fix', description: 'x' }],
          },
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('targets missing phase'))).toBe(true);
  });

  it('errors on eval target referencing missing phase', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          eval: [{ when: 'r output shows fail', action: 'retry', target: 'ghost' }],
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('targets missing phase'))).toBe(true);
  });

  it('accepts flow-id target pre-flatten and flattened-style prefixed target', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'create', type: 'flow', use: 'openspec-create', dependsOn: [] },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['create'],
          routing: {
            actions: [
              { action: 'retry', target: 'create', label: 'Re-run flow', description: 'x' },
              { action: 'jump', target: 'create/spec-generate', label: 'Regen', description: 'x' },
            ],
          },
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
  });

  it('jump warning references M2 snapshot expansion (not dependsOn fallback)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'r', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          routing: { actions: [{ action: 'jump', label: 'Back' }] },
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(warnings[0]).toContain('snapshot.nodes');
  });

  it('warns on unbounded auto-rework eval condition (no retryAttempt bound)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          eval: [{ when: 'r output shows overall: fail', action: 'retry', target: 'w' }],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('unbounded'))).toBe(true);
  });

  it('warns on auto-rework eval retry targeting the reviewer node', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], skill: 'code-review', task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          eval: [
            {
              when: 'r output shows overall: fail AND retryAttempt < 2',
              action: 'retry',
              target: 'r',
            },
          ],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.some((w) => w.includes('reviewer'))).toBe(true);
  });

  it('accepts bounded auto-rework eval with writer target (no warnings)', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'w', type: 'main', dependsOn: [], task: 'x' },
        { id: 'r', type: 'main', dependsOn: ['w'], task: 'x' },
        {
          id: 'ap',
          type: 'approval',
          dependsOn: ['r'],
          eval: [
            {
              when: 'r output shows overall: fail AND retryAttempt < 2',
              action: 'retry',
              target: 'w',
            },
          ],
        },
      ],
    };
    const { errors, warnings } = validateGraphContracts(graph, 'test.yaml');
    expect(errors).toHaveLength(0);
    expect(warnings.filter((w) => w.includes('unbounded') || w.includes('reviewer'))).toHaveLength(0);
  });

  it('built-in approvals converge on single review dependency with explicit targets', () => {
    for (const name of BUILTIN_GRAPHS) {
      const { errors, warnings } = validateGraphContracts(loadGraph(name), name);
      expect(errors, `${name} errors`).toHaveLength(0);
      expect(warnings, `${name} warnings`).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2.3 — when guard hygiene
// ---------------------------------------------------------------------------

describe('2.3 when guard hygiene', () => {
  it('rejects hardcoded .taskflow/outputs path in guard', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        { id: 'b', type: 'main', dependsOn: ['a'], when: '.taskflow/outputs/a.output.txt shows x', task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('hardcodes runtime output path'))).toBe(true);
  });

  it('rejects sibling-output-existence guard', () => {
    const graph = {
      name: 'test',
      version: 1,
      phases: [
        { id: 'a', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'b',
          type: 'main',
          dependsOn: ['a'],
          when: 'a output has save_location and no sibling output present',
          task: 'x',
        },
      ],
    };
    const { errors } = validateGraphContracts(graph, 'test.yaml');
    expect(errors.some((e) => e.includes('sibling output existence'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2.6 — approval readiness follows review conclusion (topology)
// ---------------------------------------------------------------------------

describe('2.6 approval readiness depends on review node only', () => {
  const phases: Phase[] = [
    { id: 'write-a', type: 'main', dependsOn: [], task: 'x' },
    { id: 'write-b', type: 'main', dependsOn: [], task: 'x' },
    {
      id: 'review',
      type: 'main',
      dependsOn: ['write-a', 'write-b'],
      join: 'any',
      skill: 'code-review',
      task: 'x',
    },
    { id: 'accept', type: 'approval', dependsOn: ['review'] },
  ];

  it('writer done + review active → approval NOT ready', () => {
    const terminal = new Set(['write-a']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'pending' },
      review: { status: 'active' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).not.toContain('accept');
  });

  it('review done → approval ready', () => {
    const terminal = new Set(['write-a', 'write-b', 'review']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'done' },
      review: { status: 'done' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).toContain('accept');
  });

  it('review join:any ready when first writer done', () => {
    const terminal = new Set(['write-a']);
    const ready = resolveReady(phases, terminal, {
      'write-a': { status: 'done' },
      'write-b': { status: 'pending' },
      review: { status: 'pending' },
      accept: { status: 'pending' },
    });
    expect(ready.map((p) => p.id)).toContain('review');
    expect(ready.map((p) => p.id)).not.toContain('accept');
  });
});

// ---------------------------------------------------------------------------
// 2.7 — skill-author dual-guard mutual exclusivity (static field references)
// ---------------------------------------------------------------------------

describe('2.7 skill-author mode guards reference scope-confirm fields only', () => {
  const graph = loadGraph('skill-author.taskflow.yaml');
  const phases = graph.phases as Array<Record<string, unknown>>;
  const guardOf = (id: string): string => String(phases.find((p) => p.id === id)?.when ?? '');

  it('skill-write guard requires save_location and no skill_path', () => {
    const g = guardOf('skill-write');
    expect(g).toMatch(/save_location/);
    expect(g).toMatch(/no skill_path/);
    expect(g).not.toMatch(/output present/);
  });

  it('skill-select guard requires skill_path', () => {
    const g = guardOf('skill-select');
    expect(g).toMatch(/skill_path/);
  });

  it('both guards reference scope-confirm output (direct upstream)', () => {
    expect(guardOf('skill-write')).toMatch(/scope-confirm output/);
    expect(guardOf('skill-select')).toMatch(/scope-confirm output/);
  });

  it('guards are mutually exclusive by field presence', () => {
    // create: save_location AND NOT skill_path; edit: skill_path — no overlap
    const create = guardOf('skill-write');
    const edit = guardOf('skill-select');
    expect(create).toMatch(/save_location/);
    expect(create).toMatch(/no skill_path/);
    expect(edit).toMatch(/skill_path/);
    expect(edit.includes('save_location')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2.8 — M2 snapshot enumerates per-node states
// ---------------------------------------------------------------------------

describe('2.8 snapshot nodes enumeration (M2)', () => {
  it('snapshot includes nodes with full state fields', () => {
    const snap = buildSnapshot(runningState());
    expect(snap.nodes).toHaveLength(3);
    expect(snap.nodes).toEqual(
      expect.arrayContaining([
        { nodeId: 'a', status: 'done', retryCount: 0, startedAt: 't0', completedAt: 't1', durationMs: 1 },
        { nodeId: 'b', status: 'active', retryCount: 0, startedAt: 't1', completedAt: null, durationMs: null },
        { nodeId: 'c', status: 'skipped', retryCount: 1, startedAt: 't0', completedAt: 't1', durationMs: 2 },
      ]),
    );
    expect(snap.status).toBe('running');
    expect(snap.createdAt).toBe('2026-08-01T00:00:00.000Z');
  });

  it('completed and skipped nodes enumerable for jump targeting', () => {
    const snap = buildSnapshot(runningState());
    const eligible = snap.nodes.filter((n) => n.status === 'done' || n.status === 'skipped');
    expect(eligible.map((n) => n.nodeId).sort()).toEqual(['a', 'c']);
  });

  it('idle snapshot has empty nodes', () => {
    const snap = buildSnapshot({ status: 'idle' });
    expect(snap.nodes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// D6 — entry skill contract alignment (upstream coverage + orphan detection)
// ---------------------------------------------------------------------------

describe('D6 entry skill contract alignment', () => {
  function makeSkillsDir(): { dir: string; cleanup: () => void } {
    const dir = mkdtempSync(join(tmpdir(), 'skills-'));
    return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
  }

  it('flags orphan entry skill (declares upstream, zero dispatch)', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ghost-skill'));
      writeFileSync(
        join(dir, 'ghost-skill', 'SKILL.md'),
        `---\nname: ghost-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- some-phase\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: { name: 'g', version: 1, phases: [{ id: 'p', type: 'main', dependsOn: [], task: 'x' }] },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes("orphan entry skill 'ghost-skill'"))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('reports upstream coverage mismatch', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'picker'));
      writeFileSync(
        join(dir, 'picker', 'SKILL.md'),
        `---\nname: picker\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- scope-confirm\n- missing-node\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                // missing-node exists in the graph but is NOT injected into the picker phase
                { id: 'missing-node', type: 'main', dependsOn: [], task: 'x' },
                { id: 'p', type: 'main', skill: 'picker', dependsOn: ['scope-confirm'], task: 'x' },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('missing-node'))).toBe(true);
      expect(errors.some((e) => e.includes('scope-confirm'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('reports placeholder contract error for dispatched skill', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ref-skill'));
      writeFileSync(
        join(dir, 'ref-skill', 'SKILL.md'),
        `---\nname: ref-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- <nodeId>\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [{ id: 'p', type: 'main', skill: 'ref-skill', dependsOn: [], task: 'x' }],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('placeholder'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('ignores fenced placeholder examples — inert, never errors nor orphan', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'ref-skill'));
      writeFileSync(
        join(dir, 'ref-skill', 'SKILL.md'),
        `---\nname: ref-skill\ndescription: x\n---\n\n## Body\n\nExample only — real contract lives in the graph:\n\n\`\`\`markdown\n## Context Requirements\n\n### From upstream\n\n- <nodeId>\n\n### Reference skills\n\n- <skill-name>\n\n### Files\n\n- <glob>\n\`\`\`\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [{ filePath: 'g.yaml', graph: { name: 'g', version: 1, phases: [] } }],
        dir,
      );
      expect(errors).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('rejects bare-name channels on contract-less review-type skill', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'review-skill'));
      writeFileSync(
        join(dir, 'review-skill', 'SKILL.md'),
        `---\nname: review-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n<!-- contract graph-decided — dispatching graphs declare explicit channels -->\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'direct-up', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'r',
                  type: 'main',
                  skill: 'review-skill',
                  dependsOn: ['direct-up'],
                  channels: ['direct-up', 'node:other', 'skill:atom-graph-spec', 'docs/adr/*.md'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // bare 'direct-up' fails; explicit node:/skill: prefixes and file globs pass
      expect(errors.some((e) => e.includes('bare name') && e.includes('direct-up'))).toBe(true);
      expect(errors.some((e) => e.includes('node:other'))).toBe(false);
      expect(errors.some((e) => e.includes('skill:atom-graph-spec'))).toBe(false);
      expect(errors.some((e) => e.includes('docs/adr/*.md'))).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('reports missing reference channel (forward coverage)', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'writer-skill'));
      writeFileSync(
        join(dir, 'writer-skill', 'SKILL.md'),
        `---\nname: writer-skill\ndescription: x\n---\n\n## Context Requirements\n\n### Reference skills\n\n- atom-skill-spec\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [{ id: 'w', type: 'main', skill: 'writer-skill', dependsOn: [], task: 'x' }],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('atom-skill-spec') && e.includes('channels'))).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('warns on phantom bare node channel and cross-level suggestion', async () => {
    const { dir, cleanup } = makeSkillsDir();
    try {
      mkdirSync(join(dir, 'review-skill'));
      writeFileSync(
        join(dir, 'review-skill', 'SKILL.md'),
        `---\nname: review-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- direct-up\n`,
      );
      const { errors, warnings } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'direct-up', type: 'main', dependsOn: [], task: 'x' },
                { id: 'other-node', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'r',
                  type: 'main',
                  skill: 'review-skill',
                  dependsOn: ['direct-up'],
                  channels: ['other-node'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // other-node is a real graph node outside dependsOn → warning suggesting node: prefix
      expect(warnings.some((w) => w.includes('other-node') && w.includes('node:other-node'))).toBe(true);
      expect(errors.some((e) => e.includes('other-node'))).toBe(false);
    } finally {
      cleanup();
    }
  });
});

// ---------------------------------------------------------------------------
// 4.6 — main channels validation scenarios
// ---------------------------------------------------------------------------

describe('4.6 main channels validation', () => {
  it('accepts main phase with channels — ban lifted', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'm', type: 'main', skill: 'atom-graph-spec', channels: ['node:up'], dependsOn: ['up'], task: 'x' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('channels'))).toBe(false);
  });

  it('main preText rejected at schema level — contract layer has no duplicate mirror', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [{ id: 'm', type: 'main', preText: 'x', task: 't' }],
    };
    // Schema superRefine is the single enforcement point — contract layer passes.
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('preText'))).toBe(false);
    // Schema itself rejects.
    const parsed = PhaseSchema.safeParse({ id: 'm', type: 'main', preText: 'x', task: 't' });
    expect(parsed.success).toBe(false);
  });

  it('rejects contract-less main bare-name channel', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 't.yaml',
            graph: { name: 't', version: 1, phases: [{ id: 'm', type: 'main', channels: ['upstream'], task: 'x' }] },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('bare name'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts contract-less main with explicit prefixes only', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 't.yaml',
            graph: {
              name: 't',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  channels: ['node:up', 'skill:atom-graph-spec', 'docs/*.md'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('bare name'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports contract Reference gap for main phase — forward coverage applies to main', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n\n### Reference skills\n\n- ref-one\n\n### Files\n\n- docs/*.md\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'docs/*.md'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes("declares reference 'ref-one' not declared"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('warns on phantom graph-node channel for main phase (node: prefix suggestion)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n`,
      );
      const { warnings, errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                { id: 'up', type: 'main', dependsOn: [], task: 'x' },
                { id: 'other', type: 'main', dependsOn: [], task: 'x' },
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'other'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      // 'other' is a real graph node outside dependsOn → warning suggesting node: prefix
      expect(warnings.some((w) => w.includes('other') && w.includes('node:other'))).toBe(true);
      expect(errors.some((e) => e.includes('other'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('errors on unresolvable ghost channel for main phase — same strength as agent', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'skills-main-'));
    try {
      mkdirSync(join(dir, 'main-skill'));
      writeFileSync(
        join(dir, 'main-skill', 'SKILL.md'),
        `---\nname: main-skill\ndescription: x\n---\n\n## Context Requirements\n\n### From upstream\n\n- up\n`,
      );
      const { errors } = await validateEntrySkillContracts(
        [
          {
            filePath: 'g.yaml',
            graph: {
              name: 'g',
              version: 1,
              phases: [
                {
                  id: 'm',
                  type: 'main',
                  skill: 'main-skill',
                  channels: ['node:up', 'ghost-entry'],
                  dependsOn: ['up'],
                  task: 'x',
                },
              ],
            },
          },
        ],
        dir,
      );
      expect(errors.some((e) => e.includes('unresolvable channel "ghost-entry"'))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// 4.7 — task text declared-inputs contract
// ---------------------------------------------------------------------------

describe('4.7 task text contract', () => {
  it('rejects task text hardcoding .taskflow/outputs/ — error', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'm', type: 'main', dependsOn: [], task: 'Read upstream manually from .taskflow/outputs/up.output.txt' },
      ],
    };
    const { errors } = validateGraphContracts(graph, 't.yaml');
    expect(errors.some((e) => e.includes('hardcodes runtime output path'))).toBe(true);
  });

  it('warns on injection claim of undeclared node', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        {
          id: 'm',
          type: 'main',
          dependsOn: [],
          task: 'Read ghost-node output (injected via node:ghost-node channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes("claims injection of 'ghost-node'"))).toBe(true);
  });

  it('accepts injection claims covered by dependsOn', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        { id: 'down', type: 'main', dependsOn: ['up'], task: 'Read up output (injected).' },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('accepts injection claims covered by node: channel', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'down',
          type: 'main',
          dependsOn: [],
          channels: ['node:up'],
          task: 'Read up output (injected via node:up channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('accepts injection claims suffix-matched to prefixed node ids (composed graphs)', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'ops/up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'ops/down',
          type: 'main',
          dependsOn: [],
          channels: ['node:ops/up'],
          task: 'Read up output (injected via node:up channel).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });

  it('ignores implicit-mechanism wording — injected via dependsOn', () => {
    const graph = {
      name: 't',
      version: 1,
      phases: [
        { id: 'up', type: 'main', dependsOn: [], task: 'x' },
        {
          id: 'down',
          type: 'main',
          dependsOn: ['up'],
          task: 'Read up output (injected via dependsOn implicit context).',
        },
      ],
    };
    const { warnings } = validateGraphContracts(graph, 't.yaml');
    expect(warnings.some((w) => w.includes('claims injection'))).toBe(false);
  });
});
