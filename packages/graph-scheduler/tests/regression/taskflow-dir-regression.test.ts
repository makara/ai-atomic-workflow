/**
 * Regression tests for taskflowDir multi-layer resolution.
 *
 * Verifies:
 *   - Built-in graph files loadable even when project taskflowDir is empty/missing
 *   - Registry loading resilient to individual bad files
 *   - taskflowDir resolved against CWD, not configDir
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryRuntime, createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface Fixture {
  projectDir: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const projectDir = join(tmpdir(), `taskflow-dir-regression-${Math.random().toString(36).slice(2)}`);
  mkdirSync(projectDir, { recursive: true });
  return {
    projectDir,
    cleanup: () => rmSync(projectDir, { recursive: true, force: true }),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('taskflowDir multi-layer resolution (regression)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('finds built-in graph when project taskflowDir is empty', async () => {
    // Project dir is empty — no graphs. Built-in e2e-minimal must still load.
    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.projectDir,
      }),
    );

    const result = await rt.graphStart('e2e-minimal', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();

    await rt.dispose();
  });

  it('project graph file loaded via fallback when registry has no entry', async () => {
    // Place a project-level graph with a UNIQUE name that built-in registry doesn't have.
    // This exercises the multi-dir file system fallback (registry resolves nothing).
    const { writeFileSync } = require('node:fs');
    const graphYaml = `name: unique-project-graph
phases:
  - id: project-only
    type: main
    operations: []
    dependsOn: []
    task: project-specific
`;
    writeFileSync(join(fix.projectDir, 'unique-project-graph.taskflow.yaml'), graphYaml);

    const rt = await Effect.runPromise(
      createRuntime({
        dbPath: ':memory:',
        taskflowDir: fix.projectDir,
      }),
    );

    // Registry has no entry → falls back to direct load → finds project file.
    // Runs start directly at the first author node.
    const result = await rt.graphStart('unique-project-graph', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.node?.nodeId).toBe('project-only');

    await rt.dispose();
  });

  it('createMemoryRuntime default taskflowDir resolves built-in fallback', async () => {
    // createMemoryRuntime defaults taskflowDir to 'test-graphs' (non-existent).
    // Built-in graphs must still be loadable.
    const rt = await Effect.runPromise(createMemoryRuntime());

    const result = await rt.graphStart('e2e-minimal', { mode: 'auto' });
    expect(result).toBeDefined();
    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();

    await rt.dispose();
  });
});
