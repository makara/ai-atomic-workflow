/**
 * Subgraph load error propagation — flow child graphs fail fast:
 * schema/load errors surface as the original error, missing children as
 * GRAPH_NOT_FOUND with the corrected copy.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  cleanup: () => void;
}

function writeGraph(fixture: Fixture, name: string, graph: Record<string, unknown>): void {
  writeFileSync(join(fixture.taskflowDir, `${name}.yaml`), JSON.stringify(graph, null, 2));
}

function writeRegistry(fixture: Fixture, names: string[]): void {
  writeFileSync(
    join(fixture.taskflowDir, 'registry.json'),
    JSON.stringify({ graphs: names.map((n) => ({ name: n, path: `${n}.yaml` })) }, null, 2),
  );
}

describe('subgraph load error propagation', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = {
      taskflowDir: join(tmpdir(), `subgraph-errors-${Math.random().toString(36).slice(2)}`),
      cleanup: () => {},
    };
    mkdirSync(fixture.taskflowDir, { recursive: true });
    fixture.cleanup = () => rmSync(fixture.taskflowDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  function startRuntime() {
    return Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('parent', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });
  }

  it('propagates the original schema error for a broken child graph — not GRAPH_NOT_FOUND', async () => {
    const parent = {
      name: 'parent',

      phases: [{ id: 'child-flow', type: 'flow', use: 'broken-child' }],
    };
    // child with a schema violation: phase missing required `type`
    const brokenChild = {
      name: 'broken-child',

      phases: [{ id: 'only-id' }],
    };
    writeGraph(fixture, 'parent', parent);
    writeGraph(fixture, 'broken-child', brokenChild);
    writeRegistry(fixture, ['parent', 'broken-child']);

    const res = await Effect.runPromise(startRuntime());
    expect(res._tag).toBe('Left');
    if (res._tag === 'Left') {
      const raw = (res.left as { error?: unknown }).error ?? res.left;
      const err = raw as { _tag?: string; message?: string; violations?: string[] };
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.message).toContain('Schema validation failed for broken-child');
      expect(err.message).not.toContain('not found in registry');
    }
  });

  it('yields GRAPH_NOT_FOUND with corrected copy for a missing child graph', async () => {
    const parent = {
      name: 'parent',

      phases: [{ id: 'child-flow', type: 'flow', use: 'ghost-child' }],
    };
    writeGraph(fixture, 'parent', parent);
    writeRegistry(fixture, ['parent']);

    const res = await Effect.runPromise(startRuntime());
    expect(res._tag).toBe('Left');
    if (res._tag === 'Left') {
      const raw = (res.left as { error?: unknown }).error ?? res.left;
      const err = raw as { _tag?: string; message?: string };
      expect(err._tag).toBe('FlowPhaseError');
      expect(err.message).toContain("child graph 'ghost-child' not found in registry or workflow dirs");
    }
  });

  it('honors a registry override for child resolution — explicit path wins', async () => {
    const parent = {
      name: 'parent',

      phases: [{ id: 'child-flow', type: 'flow', use: 'aliased-child' }],
    };
    const child = {
      name: 'real-child',

      phases: [{ id: 'leaf', type: 'main', skill: 'scenario-agent-skill', task: 't', dependsOn: [], operations: [] }],
    };
    writeGraph(fixture, 'parent', parent);
    writeGraph(fixture, 'real-child', child);
    // registry maps aliased-child → real-child.yaml — override must win
    writeFileSync(
      join(fixture.taskflowDir, 'registry.json'),
      JSON.stringify({
        graphs: [
          { name: 'parent', path: 'parent.yaml' },
          { name: 'aliased-child', path: 'real-child.yaml' },
        ],
      }),
    );

    const res = await Effect.runPromise(startRuntime());
    expect(res._tag).toBe('Right');
  });
});
