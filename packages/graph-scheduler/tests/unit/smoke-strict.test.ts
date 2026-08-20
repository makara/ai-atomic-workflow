/**
 * Smoke — real-runtime verification of the round-7 real task:
 * 1. a yaml with extra phase keys fails schema-valid load (strict rejection)
 * 2. graph_init reports the unknown keys as per-graph problems (notification)
 * 3. graph_assets surfaces the load failure with violation detail (frontend
 *    notification → graph-maintain cleanup)
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

describe('smoke — schema strict + unknown-key notification', () => {
  let dir: string;
  let rt: SchedulerRuntime;

  beforeEach(async () => {
    dir = join(tmpdir(), `smoke-strict-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(dir, 'graphs'), { recursive: true });
    writeFileSync(
      join(dir, 'graphs', 'dirty-graph.yaml'),
      JSON.stringify(
        {
          name: 'dirty-graph',
          phases: [{ id: 'p1', type: 'main', task: 'run', operations: [], routing: { actions: [] }, mode: 'auto' }],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(dir, 'graphs', 'registry.json'),
      JSON.stringify({ graphs: [{ name: 'dirty-graph', path: 'dirty-graph.yaml' }] }),
    );
    rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: join(dir, 'graphs'),
        registryPaths: [join(dir, 'graphs', 'registry.json')],
      }),
    );
  });

  afterEach(async () => {
    await rt.dispose();
    rmSync(dir, { recursive: true, force: true });
  });

  it('graph_start rejects the dirty graph — strict unknown-key rejection', async () => {
    await expect(rt.graphStart('dirty-graph')).rejects.toThrow(/Schema validation failed/);
  });

  it('graph_init reports the unknown keys as per-graph problems (notification)', async () => {
    const report = await rt.graphInit();
    const problem = report.validation.graphProblems.find((g) => g.name === 'dirty-graph');
    expect(problem).toBeDefined();
    expect(problem!.problems[0]).toContain('schema-unknown phase keys');
    expect(problem!.problems[0]).toContain('routing');
    expect(problem!.problems[0]).toContain('mode');
    expect(problem!.problems[0]).toContain('graph-maintain');
  });

  it('graph_assets surfaces the load failure with violation detail', async () => {
    const assets = await rt.graphAssets();
    const asset = assets.find((a) => a.id === 'dirty-graph');
    expect(asset).toBeDefined();
    expect(asset!.source).toBe('project');
    expect(asset!.problems.join('\n')).toContain('routing');
    expect(asset!.problems.join('\n')).toContain('mode');
  });
});
