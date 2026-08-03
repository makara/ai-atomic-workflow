/**
 * Integration tests for the skip transport seam.
 *
 * Exercises graph_advance skip:true through the SchedulerRuntime facade —
 * the layer that previously dropped the parameter. Verifies:
 *  - skip:true marks the node `skipped` (not `done`)
 *  - any-join downstream with no done deps cascade-skips
 *  - all-join downstream activates normally (skipped counts as terminal)
 *  - absent skip keeps legacy `done` behavior
 */
import { Effect } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRuntime, type SchedulerRuntime } from '../../src/scheduler-runtime.js';

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

interface Fixture {
  taskflowDir: string;
  registryPath: string;
  cleanup: () => void;
}

function makeFixture(): Fixture {
  const taskflowDir = join(tmpdir(), `skip-transport-${Math.random().toString(36).slice(2)}`);
  mkdirSync(taskflowDir, { recursive: true });

  // guard-a has a when-guard; any-b joins over guard-a (cascade candidate);
  // all-c joins over guard-a (skipped = terminal, activates normally)
  const graph = {
    name: 'skip-test',
    version: 1,
    phases: [
      { id: 'guard-a', type: 'main', skill: 'scenario-agent-skill', task: 'guarded', dependsOn: [] },
      {
        id: 'any-b',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'or-branch',
        dependsOn: ['guard-a'],
        join: 'any',
      },
      { id: 'all-c', type: 'main', skill: 'scenario-agent-skill', task: 'and-branch', dependsOn: ['guard-a'] },
    ],
  };
  writeFileSync(join(taskflowDir, 'skip-test.taskflow.yaml'), JSON.stringify(graph, null, 2));

  // flow-shape chain — every child carries the same flow-propagated guard text
  const flowGraph = {
    name: 'flow-skip-test',
    version: 1,
    phases: [
      {
        id: 'entry',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'flow-entry',
        when: 'run only when upstream approves',
        dependsOn: [],
      },
      {
        id: 'mid',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'flow-mid',
        when: 'run only when upstream approves',
        dependsOn: ['entry'],
      },
      {
        id: 'tail',
        type: 'main',
        skill: 'scenario-agent-skill',
        task: 'flow-tail',
        when: 'run only when upstream approves',
        dependsOn: ['mid'],
      },
    ],
  };
  writeFileSync(join(taskflowDir, 'flow-skip-test.taskflow.yaml'), JSON.stringify(flowGraph, null, 2));

  const registry = {
    graphs: [
      { name: 'skip-test', path: 'skip-test.taskflow.yaml' },
      { name: 'flow-skip-test', path: 'flow-skip-test.taskflow.yaml' },
    ],
  };
  const registryPath = join(taskflowDir, 'registry.json');
  writeFileSync(registryPath, JSON.stringify(registry, null, 2));

  return { taskflowDir, registryPath, cleanup: () => rmSync(taskflowDir, { recursive: true, force: true }) };
}

function createTestRuntime(fixture: Fixture): Promise<SchedulerRuntime> {
  return Effect.runPromise(
    createRuntime({
      dbPath: ':memory:',
      taskflowDir: fixture.taskflowDir,
      registryPaths: [fixture.registryPath],
    }),
  );
}

function nodeStatus(snapshot: { nodes: Array<{ nodeId: string; status: string }> }, nodeId: string): string {
  const n = snapshot.nodes.find((n) => n.nodeId === nodeId);
  return n?.status ?? 'missing';
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('skip transport seam', () => {
  let fix: Fixture;

  beforeEach(() => {
    fix = makeFixture();
  });

  afterEach(() => {
    fix.cleanup();
  });

  it('skip:true marks node skipped and cascade-skips any-join downstream', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await rt.graphStart('skip-test');
    expect(n1!.nodeId).toBe('guard-a');

    // When guard evaluates false → advance with skip:true
    const r = await rt.graphAdvance(runId, 'guard-a', 0, true);

    // guard-a: skipped (not done)
    expect(nodeStatus(r.snapshot, 'guard-a')).toBe('skipped');
    // any-b: all deps terminal AND none done → cascade skip
    expect(nodeStatus(r.snapshot, 'any-b')).toBe('skipped');
    // all-c: skipped counts as terminal → activates
    expect(nodeStatus(r.snapshot, 'all-c')).toBe('active');
    expect(r.node!.nodeId).toBe('all-c');

    await rt.dispose();
  });

  it('absent skip keeps done behavior and activates any-join branch', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await rt.graphStart('skip-test');
    expect(n1!.nodeId).toBe('guard-a');

    // No skip arg → legacy path
    const r = await rt.graphAdvance(runId, 'guard-a', 10);

    expect(nodeStatus(r.snapshot, 'guard-a')).toBe('done');
    // any-b: one dep done → any-join activates (no cascade)
    expect(nodeStatus(r.snapshot, 'any-b')).toBe('active');
    expect(r.node!.nodeId).toBe('any-b');

    await rt.dispose();
  });

  it('skip:false behaves like absent skip', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await rt.graphStart('skip-test');

    const r = await rt.graphAdvance(runId, 'guard-a', 10, false);

    expect(nodeStatus(r.snapshot, 'guard-a')).toBe('done');
    expect(nodeStatus(r.snapshot, 'any-b')).toBe('active');

    await rt.dispose();
  });

  it('completes run when final node skipped', async () => {
    const rt = await createTestRuntime(fix);
    const { runId } = await rt.graphStart('skip-test');

    // skip guard-a → any-b cascade-skipped, all-c active
    const r1 = await rt.graphAdvance(runId, 'guard-a', 0, true);
    expect(r1.node!.nodeId).toBe('all-c');

    // skip the final node too → graph completes
    const r2 = await rt.graphAdvance(runId, 'all-c', 0, true);
    expect(r2.snapshot.fsmState).toBe('completed');
    expect(nodeStatus(r2.snapshot, 'all-c')).toBe('skipped');
    expect(r2.node).toBeNull();

    await rt.dispose();
  });

  it('same-source when guard cascades the whole all-join chain in one advance', async () => {
    const rt = await createTestRuntime(fix);
    const { runId, node: n1 } = await rt.graphStart('flow-skip-test');
    expect(n1!.nodeId).toBe('entry');

    // Flow guard evaluates false on the entry → advance with skip:true
    const r = await rt.graphAdvance(runId, 'entry', 0, true);

    // entry: skipped by agent judgment
    expect(nodeStatus(r.snapshot, 'entry')).toBe('skipped');
    // mid + tail: identical when text → cascade-skipped in the same event — no dispatch
    expect(nodeStatus(r.snapshot, 'mid')).toBe('skipped');
    expect(nodeStatus(r.snapshot, 'tail')).toBe('skipped');
    // whole flow terminal → run completed, no next node
    expect(r.snapshot.fsmState).toBe('completed');
    expect(r.node).toBeNull();

    await rt.dispose();
  });
});
