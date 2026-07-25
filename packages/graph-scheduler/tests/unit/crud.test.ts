/**
 * Unit tests for api/crud.ts — write operations through SchedulerRuntime.
 *
 * Uses temp dirs + createRuntime (in-memory SQLite) to exercise
 * graphStart, graphAdvance, graphJump, graphForceEnd, and graphStatus.
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type { SchedulerRuntime } from '../../src/scheduler-runtime.js';
import { createRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

/**
 * ManagedRuntime.runPromise serializes Effect.fail errors as JSON
 * in the Error.message. Parse to recover domain fields like _tag.
 */
function unwrapDomainError(err: unknown): Record<string, unknown> | null {
  if (!(err instanceof Error)) return null;
  try {
    const parsed = JSON.parse(err.message);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {
    // not JSON — raw message
  }
  return null;
}

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

interface Fixture {
  taskflowDir: string;
  rt: SchedulerRuntime;
  cleanup: () => void;
}

/** Write graph YAML (as JSON string — valid YAML subset) to temp dir and create runtime. */
async function makeFixture(graphs: Record<string, string>): Promise<Fixture> {
  const taskflowDir = join(tmpdir(), `crud-test-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  for (const [name, json] of Object.entries(graphs)) {
    writeFileSync(join(taskflowDir, `${name}.taskflow.yaml`), json);
  }

  const rt = await Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir,
      agentRegistry: [{ type: 'agent', skill: 'atom-phase-agent', agent: 'task' }],
    }),
  );

  return {
    taskflowDir,
    rt,
    cleanup: () => {
      rmSync(taskflowDir, { recursive: true, force: true });
    },
  };
}

/** Minimal two-agent linear graph. */
function linearAgentGraph(): string {
  return JSON.stringify({
    name: 'linear-agent',
    version: 1,
    phases: [
      { id: 'agent-a', type: 'agent', task: 'do a' },
      { id: 'agent-b', type: 'agent', task: 'do b', dependsOn: ['agent-a'] },
    ],
  });
}

/** Agent graph with per-node skill override on second phase. */
function skillOverrideGraph(): string {
  return JSON.stringify({
    name: 'skill-override',
    version: 1,
    phases: [
      { id: 'agent-a', type: 'agent', task: 'do a' },
      { id: 'agent-b', type: 'agent', task: 'do b', dependsOn: ['agent-a'], skill: 'custom-agent-skill' },
    ],
  });
}

/** Invalid YAML for error testing. */
const BAD_YAML = 'not valid yaml {{{';

// ---------------------------------------------------------------------------
// graphStart
// ---------------------------------------------------------------------------

describe('graphStart', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('starts a new run and returns runId + first node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent');

    expect(result.runId).toBeTruthy();
    // runId is UUID v4 — no longer run-* prefix
    expect(result.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-a');
    expect(result.node?.type).toBe('agent');
  });

  it('starts with invocation args available on node', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const result = await fix.rt.graphStart('linear-agent', { mode: 'fast' });

    expect(result.node).not.toBeNull();
  });

  it('throws when graph file is missing', async () => {
    fix = await makeFixture({});
    await expect(fix.rt.graphStart('missing')).rejects.toThrow();
  });

  it('throws on invalid YAML graph file', async () => {
    fix = await makeFixture({ 'bad-graph': BAD_YAML });
    await expect(fix.rt.graphStart('bad-graph')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphAdvance
// ---------------------------------------------------------------------------

describe('graphAdvance', () => {
  let fix: Fixture;
  let runId: string;

  beforeEach(async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId: rid } = await fix.rt.graphStart('linear-agent');
    runId = rid;
  });

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('advances to next node after reporting completion', async () => {
    const result = await fix.rt.graphAdvance(runId, 'agent-a', 50);

    expect(result.snapshot.runId).toBe(runId);
    expect(result.snapshot.fsmState).toBe('running');
    expect(result.node).not.toBeNull();
    expect(result.node?.nodeId).toBe('agent-b');
  });

  it('completes the run when advancing the last node', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    const result = await fix.rt.graphAdvance(runId, 'agent-b', 50);

    expect(result.snapshot.fsmState).toBe('completed');
    expect(result.node).toBeNull();
  });

  it('throws when advancing with invalid nodeId', async () => {
    await expect(fix.rt.graphAdvance(runId, 'nonexistent', 50)).rejects.toThrow();
  });

  it('throws when advancing a completed run', async () => {
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    await fix.rt.graphAdvance(runId, 'agent-b', 50);
    await expect(fix.rt.graphAdvance(runId, 'agent-a', 50)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphJump
// ---------------------------------------------------------------------------

describe('graphJump', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('jumps to target phase in a running DAG', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');

    // Advance to phase-2
    await fix.rt.graphAdvance(runId, 'agent-a', 50);

    // Jump back to agent-a
    const result = await fix.rt.graphJump(runId, 'agent-a');
    expect(result.snapshot.runId).toBe(runId);
    expect(result.node?.nodeId).toBe('agent-a');
  });
});

// ---------------------------------------------------------------------------
// graphForceEnd
// ---------------------------------------------------------------------------

describe('graphForceEnd', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('force-ends a running run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');

    const result = await fix.rt.graphForceEnd(runId);
    expect(result.fsmState).toBe('terminated');
    expect(result.runId).toBe(runId);
  });

  it('throws when force-ending a non-existent run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphForceEnd('nonexistent-run')).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// graphStatus
// ---------------------------------------------------------------------------

describe('graphStatus', () => {
  let fix: Fixture;

  afterEach(() => {
    if (fix?.cleanup) fix.cleanup();
  });

  it('reports running state for an active run', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');

    const status = await fix.rt.graphStatus(runId);
    expect(status.runId).toBe(runId);
    expect(status.nodeCount).toBe(2);
    expect(status.graphName).toBe('linear-agent');
  });

  it('reports completed state after full advance', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    const { runId } = await fix.rt.graphStart('linear-agent');
    await fix.rt.graphAdvance(runId, 'agent-a', 50);
    await fix.rt.graphAdvance(runId, 'agent-b', 50);

    const status = await fix.rt.graphStatus(runId);
    expect(status.fsmState).toBe('completed');
  });

  it('throws for non-existent runId', async () => {
    fix = await makeFixture({ 'linear-agent': linearAgentGraph() });
    await expect(fix.rt.graphStatus('nonexistent-run')).rejects.toThrow();
  });

  it('per-node skill override is visible in node detail', async () => {
    fix = await makeFixture({ 'skill-override': skillOverrideGraph() });
    const startResult = await fix.rt.graphStart('skill-override');

    // First node uses builtin skill mapping (entrySkill from agentRegistry)
    expect(startResult.node?.entrySkill).toBe('atom-phase-agent');

    // Advance to node-b which has per-node skill override
    const advResult = await fix.rt.graphAdvance(startResult.runId, 'agent-a', 50);
    expect(advResult.node?.entrySkill).toBe('custom-agent-skill');
  });
});
