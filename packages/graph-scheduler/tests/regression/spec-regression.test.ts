/**
 * Regression tests anchored to docs/requirements.md.
 *
 * Covers three core contracts:
 *   1. Graph loading chain (name → registry → .taskflow.yaml)
 *   2. Schema validation (valid/invalid taskflow YAML)
 *   3. Skill mapping merge (builtin + project override)
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface Fixture {
  taskflowDir: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `spec-regression-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });
  return { taskflowDir, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

/** Write a JSON file in the fixture directory. (JSON is valid YAML subset.) */
function writeFixtureFile(fix: Fixture, filename: string, data: unknown): string {
  const filePath = join(fix.taskflowDir, filename);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/** Minimal valid taskflow graph — no end node (route-first: drain completion). */
function validGraph(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'test-graph',
    version: 1,
    phases: [{ id: 'agent-step', type: 'main', skill: 'entry-agent-skill', task: 'do work' }],
    ...overrides,
  };
}

/** Create a minimal runtime connected to the fixture directory. */
async function createTestRuntime(
  fix: Fixture,
  opts?: {
    registryPaths?: string[];
  },
): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fix.taskflowDir,
      registryPaths: opts?.registryPaths,
    }),
  );
}

// ---------------------------------------------------------------------------
// 1. Graph loading chain
// ---------------------------------------------------------------------------

describe('Graph loading chain (name → registry → .taskflow.yaml)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('resolves via registry entry when name is registered', async () => {
    // Write graph under a non-standard filename
    writeFixtureFile(fix, 'custom-path.taskflow.yaml', validGraph({ name: 'registered-graph' }));
    // Write registry pointing to that file
    const registryPath = writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'registered-graph', path: 'custom-path.taskflow.yaml' }],
    });

    const rt = await createTestRuntime(fix, { registryPaths: [registryPath] });
    const result = await rt.graphStart('registered-graph');

    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe('agent-step');
    expect(result.node?.type).toBe('main');
  });

  it('falls back to {name}.taskflow.yaml when name not in registry', async () => {
    // Write graph at standard filename but NOT in registry
    writeFixtureFile(fix, 'fallback-graph.taskflow.yaml', validGraph({ name: 'fallback-graph' }));
    // Write a registry that does NOT contain fallback-graph
    writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'other-graph', path: 'other.taskflow.yaml' }],
    });

    const rt = await createTestRuntime(fix, { registryPaths: [join(fix.taskflowDir, 'reg.json')] });
    const result = await rt.graphStart('fallback-graph');

    expect(result.runId).toBeTruthy();
    expect(result.node?.nodeId).toBe('agent-step');
  });

  it('throws when graph is not found anywhere', async () => {
    const rt = await createTestRuntime(fix); // empty dir — no graph files
    await expect(rt.graphStart('missing-graph')).rejects.toThrow();
  });

  it('throws when graph is not found — with registry but no matching entry', async () => {
    writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'other-graph', path: 'other.taskflow.yaml' }],
    });
    const rt = await createTestRuntime(fix, { registryPaths: [join(fix.taskflowDir, 'reg.json')] });
    await expect(rt.graphStart('unknown-name')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation (valid / invalid taskflow YAML)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('accepts valid graph with version:1 and correct phase types', async () => {
    writeFixtureFile(fix, 'valid.taskflow.yaml', {
      name: 'valid',
      version: 1,
      phases: [
        { id: 'a1', type: 'main', skill: 'entry-agent-skill', task: 'step 1' },
        // approval — decision confirmation after the main step
        { id: 'ap1', type: 'approval', task: 'decide', dependsOn: ['a1'] },
      ],
    });

    const rt = await createTestRuntime(fix);
    const result = await rt.graphStart('valid');
    expect(result.runId).toBeTruthy();
    expect(result.node?.nodeId).toBe('a1');
    expect(result.node?.skill).toBe('entry-agent-skill');
  });

  it('accepts version as string (lenient validation)', async () => {
    writeFixtureFile(fix, 'bad-version.taskflow.yaml', validGraph({ version: '1.0' }));

    const rt = await createTestRuntime(fix);
    // Own validator does not enforce version type — graph starts
    const result = await rt.graphStart('bad-version');
    expect(result.runId).toBeTruthy();
  });

  it('accepts unknown phase field (lenient — allows skill)', async () => {
    writeFixtureFile(fix, 'bad-field.taskflow.yaml', {
      name: 'bad-field',
      version: 1,
      phases: [{ id: 'p1', type: 'main', skill: 'entry-agent-skill', task: 'x', garbageField: 42 }],
    });

    const rt = await createTestRuntime(fix);
    // Own validator allows unknown fields — graph starts
    const result = await rt.graphStart('bad-field');
    expect(result.runId).toBeTruthy();
  });

  it('rejects missing phases array', async () => {
    writeFixtureFile(fix, 'no-phases.taskflow.yaml', {
      name: 'no-phases',
      version: 1,
    });

    const rt = await createTestRuntime(fix);
    await expect(rt.graphStart('no-phases')).rejects.toThrow();
  });

  it('rejects non-YAML graph file', async () => {
    const filePath = join(fix.taskflowDir, 'bad-yaml.taskflow.yaml');
    writeFileSync(filePath, 'this is not yaml {{{');

    const rt = await createTestRuntime(fix);
    const err = await rt.graphStart('bad-yaml').catch((e: unknown) => e);
    expect(err).toBeDefined();

    let msg = '';
    if (typeof err === 'object' && err !== null && 'message' in err) {
      msg = String(err.message);
    }
    expect(msg).toMatch(/Invalid YAML|YAML/i);
  });
});

// ---------------------------------------------------------------------------
// 3. Skill mapping merge
// ---------------------------------------------------------------------------

describe('Agent registry merge (builtin + project override)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('rejects removed agent type at load (GraphDefinitionError — schema enum gate)', async () => {
    writeFixtureFile(fix, 'skills-default.taskflow.yaml', {
      name: 'skills-default',
      version: 1,
      phases: [{ id: 'a1', type: 'agent', task: 'run' }],
    });

    const rt = await createTestRuntime(fix);
    // Phase type 'agent' is not in the closed enum — schema parse fails first
    // (GraphDefinitionError with the enum violation).
    const err = (await rt.graphStart('skills-default').catch((e: unknown) => e)) as {
      _tag?: string;
      message?: string;
    };
    expect(err).toBeDefined();
    expect(err?._tag).toBe('GraphDefinitionError');
    expect(String(err?.message)).toContain('Schema validation failed');
  });

  it('applies phase skill — handlerSkill is the constant', async () => {
    writeFixtureFile(fix, 'skills-override.taskflow.yaml', {
      name: 'skills-override',
      version: 1,
      phases: [{ id: 'a1', type: 'main', skill: 'my-custom-agent-skill', task: 'custom agent' }],
    });

    const rt = await createTestRuntime(fix);

    const result = await rt.graphStart('skills-override');
    // skill comes from phase.skill; handlerSkill is the constant
    expect(result.node?.skill).toBe('my-custom-agent-skill');
    expect(result.node?.handlerSkill).toBe('atom-phase-handler');
  });
});
