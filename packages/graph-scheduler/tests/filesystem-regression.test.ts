/**
 * Regression tests for P1 fix: FileSystem layer absolute path handling.
 *
 * Verifies that makeTaskflowFileSystemLayer does NOT prepend taskflowDir
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
  writeFileSync(join(taskflowDir, 'test-graph.taskflow.yaml'), graphJson);

  // Write a registry file (absolute path is the key test)
  const registryJson = JSON.stringify(
    {
      graphs: [{ name: 'test-graph', path: 'test-graph.taskflow.yaml' }],
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

  it('rejects a graph declaring the version field — dead field, loud rejection', async () => {
    const badJson = JSON.stringify({
      name: 'bad-graph',
      version: '1.0',
      phases: [{ id: 'b1', type: 'main', skill: 'entry-agent-skill', task: 'bad', operations: [] }],
    });
    writeFileSync(join(fix.taskflowDir, 'bad-graph.taskflow.yaml'), badJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.taskflowDir,
      }),
    );

    // version is a removed dead field — the graph fails to load
    await expect(rt.graphStart('bad-graph', { mode: 'auto' })).rejects.toThrow();
  });

  it('resolves built-in registry entry paths relative to registry dir, not taskflowDir (P2 fix)', async () => {
    // Simulate: taskflowDir is project's .graph-scheduler/graphs/
    const projectTaskflowDir = join(tmpdir(), `project-graphs-${Math.random().toString(36).slice(2)}`);
    mkdirSync(projectTaskflowDir, { recursive: true });

    // Simulate: built-in registry at a different location (like packages/graph-scheduler/graphs/)
    const builtinGraphsDir = join(tmpdir(), `builtin-graphs-${Math.random().toString(36).slice(2)}`);
    mkdirSync(builtinGraphsDir, { recursive: true });

    // Write graph file in built-in dir
    const graphJson = JSON.stringify({
      name: 'builtin-graph',
      phases: [{ id: 'b1', type: 'main', skill: 'entry-agent-skill', task: 'echo builtin', operations: [] }],
    });
    writeFileSync(join(builtinGraphsDir, 'builtin-graph.taskflow.yaml'), graphJson);

    // Write built-in registry with relative path entries
    const registryJson = JSON.stringify({
      graphs: [{ name: 'builtin-graph', path: 'builtin-graph.taskflow.yaml' }],
    });
    const builtinRegistryPath = join(builtinGraphsDir, 'registry.json');
    writeFileSync(builtinRegistryPath, registryJson);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: projectTaskflowDir,
        registryPaths: [builtinRegistryPath],
      }),
    );

    // Should resolve 'builtin-graph' from built-in registry
    // Graph file path must resolve relative to builtinGraphsDir, NOT projectTaskflowDir
    const result = await rt.graphStart('builtin-graph', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();
  });
});
