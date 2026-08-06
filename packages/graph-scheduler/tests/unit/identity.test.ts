/**
 * Tests for the graph identity layer:
 * - graph_start returns resolvedFrom + resolvedPath + description
 * - description parses as a graph top-level field
 * - project-first registry precedence (project shadows builtin)
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

interface Fixture {
  taskflowDir: string;
  rt: SchedulerRuntime;
  cleanup: () => void;
}

async function makeFixture(graphs: Record<string, string>, registry?: string): Promise<Fixture> {
  const taskflowDir = join(tmpdir(), `identity-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  for (const [name, json] of Object.entries(graphs)) {
    writeFileSync(join(taskflowDir, `${name}.taskflow.yaml`), json);
  }

  const rt = await Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      registryPaths: registry ? [join(taskflowDir, 'registry.json')] : undefined,
    }),
  );

  if (registry) {
    writeFileSync(join(taskflowDir, 'registry.json'), registry);
  }

  return {
    taskflowDir,
    rt,
    cleanup: () => {
      rmSync(taskflowDir, { recursive: true, force: true });
    },
  };
}

function describedGraph(): string {
  return JSON.stringify({
    name: 'described',
    description: 'Test graph — produces artifacts for end users',
    version: 1,
    phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a' }],
  });
}

const PLAIN_GRAPH = JSON.stringify({
  name: 'plain',
  version: 1,
  phases: [{ id: 'step-a', type: 'main', skill: 'test-agent-skill', task: 'do a' }],
});

describe('graph_start identity fields', () => {
  let fix: Fixture;

  beforeEach(async () => {
    fix = await makeFixture({ described: describedGraph(), plain: PLAIN_GRAPH });
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('graph_start returns resolvedFrom + resolvedPath for a fallback-resolved graph', async () => {
    const result = await fix.rt.graphStart('described');
    expect(result.resolvedFrom).toBe('fallback');
    expect(result.resolvedPath).toMatch(/described\.taskflow\.yaml$/);
  });

  it('graph_start carries the graph description when declared', async () => {
    const result = await fix.rt.graphStart('described');
    expect(result.description).toBe('Test graph — produces artifacts for end users');
  });

  it('graph_start omits description when the graph declares none', async () => {
    const result = await fix.rt.graphStart('plain');
    expect(result.description).toBeUndefined();
  });
});

describe('registry project-first precedence', () => {
  let fix: Fixture;

  beforeEach(async () => {
    // Project registry shadows a same-named builtin entry.
    const registry = JSON.stringify({
      graphs: [{ name: 'e2e-minimal', path: 'e2e-minimal.taskflow.yaml', description: 'project shadow' }],
    });
    fix = await makeFixture(
      {
        'e2e-minimal': PLAIN_GRAPH,
      },
      registry,
    );
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('project registry entry shadows the builtin same-named entry', async () => {
    const result = await fix.rt.graphStart('e2e-minimal');
    expect(result.resolvedFrom).toBe('project');
    expect(result.resolvedPath).toMatch(/identity-test-/);
  });
});
