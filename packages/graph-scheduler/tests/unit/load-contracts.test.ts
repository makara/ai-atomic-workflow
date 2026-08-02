/**
 * Load-time contract validation  — the contracts pass mounted in
 * loadGraphWithRegistry: contract breaches fail graph_start with
 * GraphDefinitionError (no run created); warnings never block loading.
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
  writeFileSync(join(fixture.taskflowDir, `${name}.taskflow.yaml`), JSON.stringify(graph, null, 2));
}

function writeRegistry(fixture: Fixture, names: string[]): void {
  writeFileSync(
    join(fixture.taskflowDir, 'registry.json'),
    JSON.stringify({ graphs: names.map((n) => ({ name: n, path: `${n}.taskflow.yaml` })) }, null, 2),
  );
}

describe('load-time contract validation', () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = {
      taskflowDir: join(tmpdir(), `load-contracts-${Math.random().toString(36).slice(2)}`),
      cleanup: () => {},
    };
    mkdirSync(fixture.taskflowDir, { recursive: true });
    fixture.cleanup = () => rmSync(fixture.taskflowDir, { recursive: true, force: true });
  });

  afterEach(() => {
    fixture.cleanup();
  });

  it('rejects graph_start with GraphDefinitionError on a contract breach — no run created', async () => {
    // approval with two dependsOn — violates single review-convergence rule
    const bad = {
      name: 'bad-approval',
      version: 1,
      phases: [
        { id: 'writer-a', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [] },
        { id: 'writer-b', type: 'main', skill: 'scenario-agent-skill', task: 'b', dependsOn: [] },
        { id: 'gate', type: 'approval', dependsOn: ['writer-a', 'writer-b'] },
      ],
    };
    writeGraph(fixture, 'bad-approval', bad);
    writeRegistry(fixture, ['bad-approval']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        // Explicit — fixtures use main-type phases; config.json lookup is cwd-dependent
        // (package-local config has no agentRegistry), so the test must not rely on it.
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('bad-approval')));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Left');
    if (res._tag === 'Left') {
      // tryPromise wraps rejections in UnknownException — the facade now rejects
      // with the RAW tagged failure, so `.error` IS the GraphDefinitionError.
      const raw = (res.left as { error?: unknown }).error ?? res.left;
      const err = raw as { _tag?: string; message?: string; violations?: string[] };
      expect(err._tag).toBe('GraphDefinitionError');
      expect(err.violations?.some((v: string) => v.includes('approval dependsOn must contain exactly'))).toBe(true);
    }
  });

  it('loads a graph with only warnings — non-blocking', async () => {
    // eval retry without retryAttempt bound → warning, load succeeds
    const warny = {
      name: 'warny',
      version: 1,
      phases: [
        { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [] },
        { id: 'review', type: 'main', skill: 'scenario-agent-skill', task: 'r', dependsOn: ['writer'] },
        {
          id: 'gate',
          type: 'approval',
          dependsOn: ['review'],
          eval: [{ when: 'output shows fail', action: 'retry', target: 'writer' }],
        },
      ],
    };
    writeGraph(fixture, 'warny', warny);
    writeRegistry(fixture, ['warny']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        // Explicit — fixtures use main-type phases; config.json lookup is cwd-dependent
        // (package-local config has no agentRegistry), so the test must not rely on it.
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('warny')));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      expect(res.right.node?.nodeId).toBe('writer');
      // warning graph carries the summary — unbounded eval surfaced at start
      expect(res.right.contractWarnings?.some((w: string) => w.includes('unbounded'))).toBe(true);
    }
  });

  it('clean graph yields empty contractWarnings — backward compatible', async () => {
    const clean = {
      name: 'clean-graph',
      version: 1,
      phases: [
        { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [] },
        {
          id: 'gate',
          type: 'approval',
          dependsOn: ['writer'],
          eval: [{ when: 'output shows fail AND retryAttempt < 2', action: 'retry', target: 'writer' }],
        },
      ],
    };
    writeGraph(fixture, 'clean-graph', clean);
    writeRegistry(fixture, ['clean-graph']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        // Explicit — fixtures use main-type phases; config.json lookup is cwd-dependent
        // (package-local config has no agentRegistry), so the test must not rely on it.
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('clean-graph')));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      expect(res.right.contractWarnings ?? []).toHaveLength(0);
    }
  });
});
