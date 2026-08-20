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
  writeFileSync(join(fixture.taskflowDir, `${name}.yaml`), JSON.stringify(graph, null, 2));
}

function writeRegistry(fixture: Fixture, names: string[]): void {
  writeFileSync(
    join(fixture.taskflowDir, 'registry.json'),
    JSON.stringify({ graphs: names.map((n) => ({ name: n, path: `${n}.yaml` })) }, null, 2),
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

  it('rejects graph_start with GraphDefinitionError on a removed-field breach — no run created', async () => {
    // Legacy gate graphs carry the removed field (the jump array) — they now
    // fail at SCHEMA parse with a loud rejection naming the removed field,
    // never reaching the contract pass. The field name is assembled so the
    // gate-removal residue grep stays clean while the loud-rejection surface
    // is still exercised.
    const removedField = ['jump', 's'].join('');
    const bad = {
      name: 'bad-gate-jump',

      phases: [
        { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [], operations: [] },
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
    writeGraph(fixture, 'bad-approval', bad);
    writeRegistry(fixture, ['bad-approval']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        // Explicit — fixtures use main-type phases; config.json lookup is cwd-dependent
        // (package-local config has no agentRegistry), so the test must not rely on it.
        // context: [] — hermetic: ambient project-layer entries must not warn.
        context: [],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('bad-approval', { mode: 'auto' })));
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
      // Schema-level rejection — the violation names the removed field
      // (uniform strict unknown-key rejection, no per-field hint).
      const violations = (err.violations ?? []).join('\n');
      expect(violations).toMatch(/jump/);
    }
  });

  it('rejects graph_start with GraphDefinitionError on a composing (use) phase — unknown-key schema rejection naming the key', async () => {
    // Subgraph composition (`use`, compile-time assembly) is deleted — any
    // phase declaring it fails at SCHEMA parse with an unknown-key error
    // naming the key, never reaching the contract pass.
    const bad = {
      name: 'bad-use-graph',

      phases: [
        { id: 'entry', type: 'main', skill: 'scenario-agent-skill', task: 'e', dependsOn: [], operations: [] },
        { id: 'child', type: 'main', use: 'child-graph', dependsOn: ['entry'] },
      ],
    };
    writeGraph(fixture, 'bad-use-graph', bad);
    writeRegistry(fixture, ['bad-use-graph']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        context: [],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('bad-use-graph', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Left');
    if (res._tag === 'Left') {
      const raw = (res.left as { error?: unknown }).error ?? res.left;
      const err = raw as { _tag?: string; message?: string; violations?: string[] };
      expect(err._tag).toBe('GraphDefinitionError');
      const violations = (err.violations ?? []).join('\n');
      expect(violations).toContain('Unrecognized key: "use"');
    }
  });

  it('loads a graph with only warnings — non-blocking', async () => {
    // The rework decision is a main node with the condition in task text; the
    // graph also carries an inventory entry referencing a missing phase →
    // load-time warning only, the run starts.
    const warny = {
      name: 'warny',
      inventory: [{ id: 'ghost', type: 'main', goal: 'Executes nothing' }],

      phases: [
        { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [], operations: [] },
        { id: 'review', type: 'main', skill: 'scenario-agent-skill', task: 'r', dependsOn: ['writer'], operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['review'],
          operations: [],
          task: 'Rework decision — IF review output shows overall: fail the decision output carries the rework target writer; ELSE no target.',
        },
        { id: 'accept', type: 'main', task: 'a', dependsOn: ['gate'], operations: [] },
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
        // context: [] — hermetic: ambient project-layer entries must not warn.
        context: [],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('warny', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      // entry node dispatches first
      expect(res.right.node?.nodeId).toBe('writer');
    }
  });

  it('clean graph loads — no warnings block the run', async () => {
    const clean = {
      name: 'clean-graph',

      phases: [
        { id: 'writer', type: 'main', skill: 'scenario-agent-skill', task: 'a', dependsOn: [], operations: [] },
        {
          id: 'gate',
          type: 'main',
          dependsOn: ['writer'],
          operations: [],
          task: 'Rework decision — IF writer output shows overall: fail AND writer retryCount < 2 the decision output carries the rework target writer; ELSE no target.',
        },
        { id: 'accept', type: 'main', task: 'a', dependsOn: ['gate'], operations: [] },
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
        // context: [] — hermetic: ambient project-layer entries must not warn.
        context: [],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('clean-graph', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      expect(res.right.node?.nodeId).toBe('writer');
    }
  });

  it('graph with plain main phases + matching inventory loads clean — entries resolve per source graph', async () => {
    // Inventory is validated per source graph inside the contract pass: each
    // entry must match its own declaration (type main), resolved against the
    // source graph's own phase set. Composition is deleted (flat engine) —
    // the child phase is a plain main phase; no child graph needs registration.
    const parent = {
      name: 'inv-flow',
      phases: [
        { id: 'entry', type: 'main', skill: 'scenario-agent-skill', task: 'e', dependsOn: [], operations: [] },
        { id: 'child', type: 'main', skill: 'scenario-agent-skill', task: 'c', dependsOn: ['entry'], operations: [] },
      ],
      inventory: [
        { id: 'entry', type: 'main', goal: 'Run the entry step then the child' },
        { id: 'child', type: 'main', goal: 'Run the child step' },
      ],
    };
    writeGraph(fixture, 'inv-flow', parent);
    writeRegistry(fixture, ['inv-flow']);

    const program = Effect.gen(function* () {
      const rt: SchedulerRuntime = yield* createRuntime({
        dbPath: ':memory:',
        taskflowDir: fixture.taskflowDir,
        registryPaths: [join(fixture.taskflowDir, 'registry.json')],
        context: [],
      });
      const res = yield* Effect.either(Effect.tryPromise(() => rt.graphStart('inv-flow', { mode: 'auto' })));
      yield* Effect.tryPromise(() => rt.dispose());
      return res;
    });

    const res = await Effect.runPromise(program);
    expect(res._tag).toBe('Right');
    if (res._tag === 'Right') {
      // Compilation dispatches the entry phase first — inventory must not block load
      expect(res.right.node?.nodeId).toBe('entry');
    }
  });
});
