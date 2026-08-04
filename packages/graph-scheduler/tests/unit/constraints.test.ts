/**
 * Unit + integration tests for project constraint channel:
 * extractRules pure parser + .graph-scheduler/constraints.md loading
 * into NodeDetail.constraints.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extractRules, loadConstraintsFile } from '../../src/lib/constraints.js';
import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// extractRules — pure parser
// ---------------------------------------------------------------------------

describe('extractRules', () => {
  it('returns empty array when no ## Rules section', () => {
    expect(extractRules('# Title\n\nplain text without rules')).toEqual([]);
  });

  it('returns empty array on empty or malformed input', () => {
    expect(extractRules('')).toEqual([]);
    expect(extractRules('## Other\n- x')).toEqual([]);
    expect(extractRules('### Rules\n- x')).toEqual([]);
  });

  it('extracts one entry per bullet line', () => {
    const md = '## Rules\n- content pure english\n- natural language meets caveman full level\n';
    expect(extractRules(md)).toEqual(['content pure english', 'natural language meets caveman full level']);
  });

  it('strips list markers and blank lines', () => {
    const md = '## Rules\n\n* first\n\n- second\n';
    expect(extractRules(md)).toEqual(['first', 'second']);
  });

  it('stops at next markdown heading', () => {
    const md = '## Rules\n- keep me\n## Other\n- drop me\n';
    expect(extractRules(md)).toEqual(['keep me']);
  });

  it('skips html comments', () => {
    const md = '## Rules\n<!-- example: english only -->\n- real rule\n';
    expect(extractRules(md)).toEqual(['real rule']);
  });

  it('preserves document order', () => {
    const md = '## Rules\n- b\n- a\n- c\n';
    expect(extractRules(md)).toEqual(['b', 'a', 'c']);
  });
});

// ---------------------------------------------------------------------------
// Runtime — constraints file → NodeDetail.constraints
// ---------------------------------------------------------------------------

/** Temp project root with .graph-scheduler/ + taskflow dir; chdir isolates CWD reads. */
describe('runtime constraints loading', () => {
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

  /** Start a run on the current runtime. */
  async function startRun(
    rt: SchedulerRuntime,
  ): Promise<{ readonly runId: string; readonly constraints: readonly string[] | undefined }> {
    const result = await rt.graphStart('constraint-graph');
    return { runId: result.runId, constraints: result.node?.constraints };
  }

  it('carries project constraints on first node', async () => {
    writeFileSync(
      join(projectRoot, '.graph-scheduler', 'constraints.md'),
      '## Rules\n- content pure english\n- natural language meets caveman full level\n',
    );
    rt = await makeRuntime();
    const { constraints } = await startRun(rt);
    expect(constraints).toEqual(['content pure english', 'natural language meets caveman full level']);
  });

  it('yields empty constraints when constraints file missing', async () => {
    rt = await makeRuntime();
    const { constraints } = await startRun(rt);
    expect(constraints).toEqual([]);
  });

  it('yields empty constraints when file has no ## Rules section', async () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '# Nothing here\n');
    rt = await makeRuntime();
    const { constraints } = await startRun(rt);
    expect(constraints).toEqual([]);
  });

  it('snapshots constraints per run — new run re-reads file, old run keeps snapshot', async () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- first rule\n');
    rt = await makeRuntime();
    const first = await startRun(rt);
    expect(first.constraints).toEqual(['first rule']);

    // Edit constraints file — second run on same runtime sees new set
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- first rule\n- second rule\n');
    const second = await startRun(rt);
    expect(second.constraints).toEqual(['first rule', 'second rule']);

    // Old run unchanged — advance keeps its snapshot
    const adv = await rt.graphAdvance(first.runId, 'a', 10);
    expect(adv.node?.constraints).toEqual(['first rule']);
  });

  it('keeps the run-record snapshot across a server restart — file edits never leak mid-run', async () => {
    const dbPath = join(projectRoot, 'restart.db');
    const graph = JSON.stringify({
      name: 'constraint-graph',
      version: 1,
      phases: [
        { id: 'a', type: 'main', skill: 'test-skill', task: 'do a' },
        { id: 'b', type: 'main', skill: 'test-skill', task: 'do b', dependsOn: ['a'] },
      ],
    });
    writeFileSync(join(projectRoot, 'constraint-graph.taskflow.yaml'), graph);
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- snapshot rule\n');

    // "Server" 1 — creates the run and snapshots constraints
    const rt1 = await Effect.runPromise(createRuntime({ dbPath, taskflowDir: projectRoot }));
    const started = await rt1.graphStart('constraint-graph');
    expect(started.node?.constraints).toEqual(['snapshot rule']);
    const runId = started.runId;
    await rt1.dispose();

    // Mid-run file edit + server restart — new process, same DB, no process cache
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- changed rule\n');
    const rt2 = await Effect.runPromise(createRuntime({ dbPath, taskflowDir: projectRoot }));
    const adv = await rt2.graphAdvance(runId, 'a', 10);
    expect(adv.node?.constraints).toEqual(['snapshot rule']);
    await rt2.dispose();
  });
});

// ---------------------------------------------------------------------------
// loadConstraintsFile — load-time diagnostics (Defect 2)
// ---------------------------------------------------------------------------

describe('loadConstraintsFile diagnostics', () => {
  let projectRoot: string;
  let cwdBackup: string;

  beforeEach(() => {
    projectRoot = join(tmpdir(), `constraints-diag-test-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(projectRoot, '.graph-scheduler'), { recursive: true });
    cwdBackup = process.cwd();
    process.chdir(projectRoot);
  });

  afterEach(() => {
    process.chdir(cwdBackup);
    vi.restoreAllMocks();
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it('stays silent when file missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConstraintsFile()).toEqual([]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns when file present but no rules extracted', () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '# Nothing here\n');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConstraintsFile()).toEqual([]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('no rules extracted');
  });

  it('includes near-miss heading hint on case-mismatched heading', () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## rules\n- no git\n');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConstraintsFile()).toEqual([]);
    expect(warnSpy.mock.calls[0][0]).toContain('near-miss heading');
    expect(warnSpy.mock.calls[0][0]).toContain('## rules');
  });

  it('stays silent when rules extracted successfully', () => {
    writeFileSync(join(projectRoot, '.graph-scheduler', 'constraints.md'), '## Rules\n- rule one\n');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(loadConstraintsFile()).toEqual(['rule one']);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
