/**
 * Regression tests for P1 fix: FileSystem layer absolute path handling.
 *
 * Verifies that makeWorkflowFileSystemLayer does NOT prepend taskflowDir
 * to absolute paths, which previously broke registry loading.
 */
import { Effect } from 'effect';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime } from '../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Fixture: temp dir with a valid graph + a registry referencing it
// ---------------------------------------------------------------------------

interface Fixture {
  /** Temp directory acting as taskflowDir */
  taskflowDir: string;
  /** Absolute path to the registry file */
  registryPath: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `scheduler-runtime-fs-fix-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  // Write a valid graph file (JSON is valid YAML subset)
  const graphJson = JSON.stringify(
    {
      name: 'test-graph',

      phases: [{ id: 'a1', type: 'main', skill: 'entry-agent-skill', task: 'do thing', operations: [] }],
    },
    null,
    2,
  );
  writeFileSync(join(taskflowDir, 'test-graph.yaml'), graphJson);

  // Write a registry file (absolute path is the key test)
  const registryJson = JSON.stringify(
    {
      graphs: [{ name: 'test-graph', path: 'test-graph.yaml' }],
    },
    null,
    2,
  );
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, registryJson);

  return {
    taskflowDir,
    registryPath: resolve(registryPath), // ABSOLUTE path
    cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('FileSystem absolute path handling (P1 fix)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('graphStart succeeds with absolute registryPath (no double-prepend)', async () => {
    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
        registryPaths: [fix.registryPath], // ABSOLUTE path
      }),
    );

    const result = await rt.graphStart('test-graph', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    // Runs start directly at the first author node (no activation prefix)
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe('a1');
  });

  it('accepts a graph declaring the current format version (semver)', async () => {
    const goodJson = JSON.stringify({
      name: 'good-graph',
      version: '1.0.0',
      phases: [{ id: 'g1', type: 'main', skill: 'entry-agent-skill', task: 'good', operations: [] }],
    });
    writeFileSync(join(fix.taskflowDir, 'good-graph.yaml'), goodJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
      }),
    );

    // version is the format version (semver) — supported major loads
    const result = await rt.graphStart('good-graph', { mode: 'auto' });
    expect(result.runId).toBeTruthy();
  });

  it('rejects a non-semver version field loudly (format version policy)', async () => {
    const badJson = JSON.stringify({
      name: 'bad-graph',
      version: '1.0',
      phases: [{ id: 'b1', type: 'main', skill: 'entry-agent-skill', task: 'bad', operations: [] }],
    });
    writeFileSync(join(fix.taskflowDir, 'bad-graph.yaml'), badJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
      }),
    );

    // '1.0' is not semver — schema validation rejects it (not a dead-field
    // rejection: version is an accepted field with a semver pattern)
    await expect(rt.graphStart('bad-graph', { mode: 'auto' })).rejects.toThrow(/Schema validation failed/);
  });

  it('rejects a cyclic dependency graph at load with the cycle path (contract pass)', async () => {
    const cycleJson = JSON.stringify({
      name: 'cycle-graph',
      phases: [
        { id: 'a', type: 'main', dependsOn: ['b'], task: 'A', operations: [] },
        { id: 'b', type: 'main', dependsOn: ['a'], task: 'B', operations: [] },
      ],
    });
    writeFileSync(join(fix.taskflowDir, 'cycle-graph.yaml'), cycleJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
      }),
    );

    // Dependency-edge acyclicity is enforced at load (graph-schema-w6-close) — a cycle
    // fails loudly with the cycle path (violations[]), never a silent run.
    await expect(rt.graphStart('cycle-graph', { mode: 'auto' })).rejects.toMatchObject({
      _tag: 'GraphDefinitionError',
      violations: [expect.stringMatching(/dependency cycle detected — a → b → a/)],
    });
  });

  it('resolves built-in registry entry paths relative to registry dir, not taskflowDir (P2 fix)', async () => {
    // Simulate: taskflowDir is project's .graph-scheduler/graphs/
    const projectWorkflowDir = join(tmpdir(), `project-graphs-${Math.random().toString(36).slice(2)}`);
    mkdirSync(projectWorkflowDir, { recursive: true });

    // Simulate: built-in registry at a different location (like packages/graph-scheduler/graphs/)
    const builtinGraphsDir = join(tmpdir(), `builtin-graphs-${Math.random().toString(36).slice(2)}`);
    mkdirSync(builtinGraphsDir, { recursive: true });

    // Write graph file in built-in dir
    const graphJson = JSON.stringify({
      name: 'builtin-graph',
      phases: [{ id: 'b1', type: 'main', skill: 'entry-agent-skill', task: 'echo builtin', operations: [] }],
    });
    writeFileSync(join(builtinGraphsDir, 'builtin-graph.yaml'), graphJson);

    // Write built-in registry with relative path entries
    const registryJson = JSON.stringify({
      graphs: [{ name: 'builtin-graph', path: 'builtin-graph.yaml' }],
    });
    const builtinRegistryPath = join(builtinGraphsDir, 'registry.json');
    writeFileSync(builtinRegistryPath, registryJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: projectWorkflowDir,
        registryPaths: [builtinRegistryPath],
      }),
    );

    // Should resolve 'builtin-graph' from built-in registry
    // Graph file path must resolve relative to builtinGraphsDir, NOT projectWorkflowDir
    const result = await rt.graphStart('builtin-graph', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();
  });
});
