/**
 * Unit + integration tests for the activation prologue constraints channel
 * The scheduler carries NO constraints — NodeDetail has no
 * `constraints` field, graph_start reads no file, and the built-in
 * `$load-constraints` node carries the default copy protocol task text.
 * The actual file reading is agent-side execution of the node's task.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { toTaskflowGraph } from '../../src/api/graph-loader.js';
import { DEFAULT_LOAD_TASK, PROLOGUE_CONFIRM_ID, PROLOGUE_LOAD_ID, synthesizePrologue } from '../../src/prologue.js';
import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// synthesizePrologue — pure synthesis
// ---------------------------------------------------------------------------

describe('synthesizePrologue', () => {
  it('always synthesizes $load-constraints; confirm only when an approval exists', () => {
    const mainOnly = synthesizePrologue([{ id: 'a', type: 'main' }]);
    expect(mainOnly.map((p) => p.id)).toEqual(['$load-constraints']);

    const withApproval = synthesizePrologue([
      { id: 'a', type: 'main' },
      { id: 'accept', type: 'approval' },
    ]);
    expect(withApproval.map((p) => p.id)).toEqual(['$run-mode-confirm', '$load-constraints']);
  });

  it('author declaration replaces the built-in (same reserved id, own task)', () => {
    const declared = { id: PROLOGUE_LOAD_ID, type: 'main', dependsOn: [], task: 'custom source' } as const;
    const prologue = synthesizePrologue([declared, { id: 'a', type: 'main' }]);
    expect(prologue.map((p) => p.id)).toEqual(['$load-constraints']);
    expect(prologue[0]?.task).toBe('custom source');
  });

  it('default load task encodes the deterministic copy protocol', () => {
    expect(DEFAULT_LOAD_TASK).toContain('## Rules');
    expect(DEFAULT_LOAD_TASK).toContain('verbatim');
    expect(DEFAULT_LOAD_TASK).toContain('.graph-scheduler/constraints.md');
  });

  it('default confirm task references the args.mode placeholder', () => {
    const prologue = synthesizePrologue([
      { id: 'a', type: 'main' },
      { id: 'accept', type: 'approval' },
    ]);
    const confirm = prologue.find((p) => p.id === PROLOGUE_CONFIRM_ID);
    expect(confirm?.task).toContain('{args.mode}');
  });
});

// ---------------------------------------------------------------------------
// Runtime — constraints live in the prologue node, not the scheduler
// ---------------------------------------------------------------------------

/** Temp project root with .graph-scheduler/ + taskflow dir; chdir isolates CWD reads. */
describe('runtime constraints decoupling', () => {
  let projectRoot: string;
  let cwdBackup: string;
  let rt: SchedulerRuntime | null;

  beforeEach(() => {
    projectRoot = join(tmpdir(), `constraints-test-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(projectRoot, '.graph-scheduler'), { recursive: true });
    cwdBackup = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(async () => {
    process.chdir(cwdBackup);
    if (rt) await rt.dispose();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  /** Write two-node main-phase graph + start runtime in temp project root. */
  async function makeRuntime(): Promise<SchedulerRuntime> {
    const graph = JSON.stringify({
      name: 'constraint-graph',
      version: 1,
      phases: [
        { id: 'a', type: 'main', skill: 'test-skill', task: 'do a' },
        { id: 'b', type: 'main', skill: 'test-skill', task: 'do b', dependsOn: ['a'] },
      ],
    });
    writeFileSync(join(projectRoot, 'constraint-graph.taskflow.yaml'), graph);
    return Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: projectRoot,
      }),
    );
  }

  it('NodeDetail never carries constraints — the field is gone', async () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- content pure english\n');
    rt = await makeRuntime();
    const result = await rt.graphStart('constraint-graph');
    expect(result.node?.nodeId).toBe('$load-constraints');
    expect(result.node?.constraints).toBeUndefined();
    expect(result.node?.runMode).toBeUndefined();
  });

  it('graph_start succeeds without reading the constraints file — no magic path in the scheduler', async () => {
    // No .graph-scheduler/constraints.md at all — run starts cleanly
    rt = await makeRuntime();
    const result = await rt.graphStart('constraint-graph');
    expect(result.node?.nodeId).toBe('$load-constraints');
  });

  it('first dispatch is the load node carrying the default copy protocol task', async () => {
    rt = await makeRuntime();
    const result = await rt.graphStart('constraint-graph');
    expect(result.node?.nodeId).toBe('$load-constraints');
    expect(result.node?.task).toContain('.graph-scheduler/constraints.md');
    expect(result.node?.task).toContain('## Rules');
  });

  it('author-declared $load-constraints replaces the built-in protocol', async () => {
    const graph = JSON.stringify({
      name: 'override-graph',
      version: 1,
      phases: [
        { id: '$load-constraints', type: 'main', task: 'load from custom source' },
        { id: 'a', type: 'main', task: 'do a' },
      ],
    });
    writeFileSync(join(projectRoot, 'override-graph.taskflow.yaml'), graph);
    rt = await Effect.runPromise(createRuntime({ dbPath: ':memory:', taskflowDir: projectRoot }));
    const result = await rt.graphStart('override-graph');
    expect(result.node?.nodeId).toBe('$load-constraints');
    expect(result.node?.task).toBe('load from custom source');
  });
});
