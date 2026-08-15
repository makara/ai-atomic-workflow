/**
 * Regression tests anchored to docs/requirements.md.
 *
 * Covers three core contracts:
 *   1. Graph loading chain (name → registry → .yaml)
 *   2. Schema validation (valid/invalid workflow YAML)
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

/** Minimal valid workflow graph — no end node (route-first: drain completion). */
function validGraph(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'test-graph',

    phases: [{ id: 'agent-step', type: 'main', skill: 'entry-agent-skill', task: 'do work', operations: [] }],
    ...overrides,
  };
}

/** Create a minimal runtime connected to the fixture directory. */
/** First author node — runs start directly at author nodes (no prefix). */
async function afterPrologue(
  rt: SchedulerRuntime,
  start: { runId: string; node: { nodeId: string } | null },
): Promise<{ nodeId: string; skill?: string; type?: string } | null> {
  return start.node;
}

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

describe('Graph loading chain (name → registry → .yaml)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('resolves via registry entry when name is registered', async () => {
    // Write graph under a non-standard filename
    writeFixtureFile(fix, 'custom-path.yaml', validGraph({ name: 'registered-graph' }));
    // Write registry pointing to that file
    const registryPath = writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'registered-graph', path: 'custom-path.yaml' }],
    });

    const rt = await createTestRuntime(fix, { registryPaths: [registryPath] });
    const result = await rt.graphStart('registered-graph', { mode: 'auto' });

    expect(result.runId).toBeTruthy();
    expect(result.node).toBeDefined();
    expect(result.node?.nodeId).toBe('agent-step');
    expect(result.node?.type).toBe('main');
  });

  it('falls back to {name}.yaml when name not in registry', async () => {
    // Write graph at standard filename but NOT in registry
    writeFixtureFile(fix, 'fallback-graph.yaml', validGraph({ name: 'fallback-graph' }));
    // Write a registry that does NOT contain fallback-graph
    writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'other-graph', path: 'other.yaml' }],
    });

    const rt = await createTestRuntime(fix, { registryPaths: [join(fix.taskflowDir, 'reg.json')] });
    const result = await rt.graphStart('fallback-graph', { mode: 'auto' });

    expect(result.runId).toBeTruthy();
    expect(result.node?.nodeId).toBe('agent-step');
  });

  it('throws when graph is not found anywhere', async () => {
    const rt = await createTestRuntime(fix); // empty dir — no graph files
    await expect(rt.graphStart('missing-graph', { mode: 'auto' })).rejects.toThrow();
  });

  it('throws when graph is not found — with registry but no matching entry', async () => {
    writeFixtureFile(fix, 'reg.json', {
      graphs: [{ name: 'other-graph', path: 'other.yaml' }],
    });
    const rt = await createTestRuntime(fix, { registryPaths: [join(fix.taskflowDir, 'reg.json')] });
    await expect(rt.graphStart('unknown-name', { mode: 'auto' })).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Schema validation
// ---------------------------------------------------------------------------

describe('Schema validation (valid / invalid workflow YAML)', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });
  afterEach(() => {
    fix.cleanup();
  });

  it('accepts valid graph with semver version and correct phase types', async () => {
    writeFixtureFile(fix, 'valid.yaml', {
      name: 'valid',
      version: '1.0.0',

      phases: [
        { id: 'a1', type: 'main', skill: 'entry-agent-skill', task: 'step 1', operations: [] },
        // approval — decision confirmation after the main step
        { id: 'ap1', type: 'approval', task: 'decide', dependsOn: ['a1'] },
      ],
    });

    const rt = await createTestRuntime(fix);
    const result = await rt.graphStart('valid', { mode: 'auto' });
    expect(result.runId).toBeTruthy();
    expect(result.node?.nodeId).toBe('a1');
    expect(result.node?.skill).toBe('entry-agent-skill');
  });

  it('accepts a graph declaring a matching semver version — format self-description', async () => {
    writeFixtureFile(fix, 'self-described.yaml', validGraph({ name: 'self-described', version: '1.2.3' }));

    const rt = await createTestRuntime(fix);
    const result = await rt.graphStart('self-described', { mode: 'auto' });
    expect(result.runId).toBeTruthy();
  });

  it('rejects a graph declaring an unsupported major version — loud rejection', async () => {
    writeFixtureFile(fix, 'future-version.yaml', validGraph({ version: '9.0.0' }));

    const rt = await createTestRuntime(fix);
    await expect(rt.graphStart('future-version', { mode: 'auto' })).rejects.toThrow(/major/);
  });

  it('accepts unknown phase field (lenient — allows skill)', async () => {
    writeFixtureFile(fix, 'bad-field.yaml', {
      name: 'bad-field',

      phases: [{ id: 'p1', type: 'main', skill: 'entry-agent-skill', task: 'x', garbageField: 42, operations: [] }],
    });

    const rt = await createTestRuntime(fix);
    // Own validator allows unknown fields — graph starts
    const result = await rt.graphStart('bad-field', { mode: 'auto' });
    expect(result.runId).toBeTruthy();
  });

  it('rejects missing phases array', async () => {
    writeFixtureFile(fix, 'no-phases.yaml', {
      name: 'no-phases',
    });

    const rt = await createTestRuntime(fix);
    await expect(rt.graphStart('no-phases', { mode: 'auto' })).rejects.toThrow();
  });

  it('rejects non-YAML graph file', async () => {
    const filePath = join(fix.taskflowDir, 'bad-yaml.yaml');
    writeFileSync(filePath, 'this is not yaml {{{');

    const rt = await createTestRuntime(fix);
    const err = await rt.graphStart('bad-yaml', { mode: 'auto' }).catch((e: unknown) => e);
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
    writeFixtureFile(fix, 'skills-default.yaml', {
      name: 'skills-default',

      phases: [{ id: 'a1', type: 'agent', task: 'run' }],
    });

    const rt = await createTestRuntime(fix);
    // Phase type 'agent' is not in the closed enum — schema parse fails first
    // (GraphDefinitionError with the enum violation).
    const err = (await rt.graphStart('skills-default', { mode: 'auto' }).catch((e: unknown) => e)) as {
      _tag?: string;
      message?: string;
    };
    expect(err).toBeDefined();
    expect(err?._tag).toBe('GraphDefinitionError');
    expect(String(err?.message)).toContain('Schema validation failed');
  });

  it('applies phase skill — skill comes from phase.skill', async () => {
    writeFixtureFile(fix, 'skills-override.yaml', {
      name: 'skills-override',

      phases: [{ id: 'a1', type: 'main', skill: 'my-custom-agent-skill', task: 'custom agent', operations: [] }],
    });

    const rt = await createTestRuntime(fix);

    const result = await rt.graphStart('skills-override', { mode: 'auto' });
    // skill comes from phase.skill — no handlerSkill field on NodeDetail
    // (dispatch handler is the constant atom-phase-handler, agent-side knowledge)
    const author = await afterPrologue(rt, result);
    expect(author?.skill).toBe('my-custom-agent-skill');
  });
});
