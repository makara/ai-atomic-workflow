/**
 * Load-time mermaid compliance check for project graphs — the graph-flow
 * compliance axis, track 2: project graphs are validated in real time at
 * load.
 *
 * An engine-subset-valid but mermaid-invalid flow block (e.g. a brace label
 * `A -->|{x}| B` — the engine label grammar accepts it, the real mermaid
 * parser rejects it) must NOT block the run: the graph loads, and the
 * compliance problem surfaces through graph_assets `problems` so the
 * frontend can notify repair. Builtin graphs skip the runtime check (the
 * suite regression test covers them).
 */
import { Effect } from 'effect';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  registryPath: string;
  cleanup: () => void;
}

/** Project graph — engine-subset-valid flow (`{x}` label), mermaid-invalid. */
function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `mermaid-load-check-${process.pid}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  const graph = {
    name: 'mermaid-bad',
    flow: ['node-a -->|{x}| node-b'],
    phases: [
      { id: 'node-a', type: 'main', task: 'first', dependsOn: [], operations: [] },
      { id: 'node-b', type: 'main', task: 'second', dependsOn: ['node-a'], operations: [] },
    ],
  };
  writeFileSync(join(taskflowDir, 'mermaid-bad.yaml'), JSON.stringify(graph, null, 2));

  const registry = { graphs: [{ name: 'mermaid-bad', path: 'mermaid-bad.yaml' }] };
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  return { taskflowDir, registryPath, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

function createTestRuntime(fixture: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fixture.taskflowDir,
      registryPaths: [fixture.registryPath],
      context: [],
    }),
  );
}

describe('load-time mermaid compliance — project graphs', () => {
  let fix: Fixture;
  let rt: SchedulerRuntime;

  beforeEach(async () => {
    fix = makeFixture();
    rt = await createTestRuntime(fix);
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('non-mermaid flow block loads (run not blocked) and surfaces a graph_assets problem', async () => {
    const assets = await rt.graphAssets();
    const asset = assets.find((a) => a.id === 'mermaid-bad');
    expect(asset).toBeDefined();
    expect(asset!.problems.some((p) => p.includes('not mermaid-format valid'))).toBe(true);

    // The run is NOT blocked — graph_start dispatches normally.
    const start = await rt.graphStart('mermaid-bad');
    expect(start.node?.nodeId).toBe('node-a');
    await rt.graphForceEnd(start.runId);
  });

  it('a mermaid-conformant project flow block surfaces zero compliance problems', async () => {
    // Conformant project graph — the same edge without the brace label.
    writeFileSync(
      join(fix.taskflowDir, 'mermaid-good.yaml'),
      JSON.stringify(
        {
          name: 'mermaid-good',
          flow: ['node-a -->|rework| node-b'],
          phases: [
            { id: 'node-a', type: 'main', task: 'first', dependsOn: [], operations: [] },
            { id: 'node-b', type: 'main', task: 'second', dependsOn: ['node-a'], operations: [] },
          ],
        },
        null,
        2,
      ),
    );
    const registry = JSON.parse(readFileSync(fix.registryPath, 'utf8')) as {
      graphs: Array<{ name: string; path: string }>;
    };
    registry.graphs.push({ name: 'mermaid-good', path: 'mermaid-good.yaml' });
    writeFileSync(fix.registryPath, JSON.stringify(registry, null, 2));

    const assets = await rt.graphAssets();
    const asset = assets.find((a) => a.id === 'mermaid-good');
    expect(asset).toBeDefined();
    expect(asset!.problems.some((p) => p.includes('not mermaid-format valid'))).toBe(false);
  });
});
