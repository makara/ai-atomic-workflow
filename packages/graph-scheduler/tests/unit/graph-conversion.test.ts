/**
 * Unit tests for toWorkflowGraph() — phase validation, error handling.
 *
 * Tests direct conversion from Workflow (schema-validated JSON) to WorkflowGraph
 * (FSM-ready phase list). Covers:
 * - valid main phase → validated
 * - empty task main phase → PhaseHandlerError
 * - unknown phase type → graph load fails with registered-type list
 * - multiple phases → all validated
 * - empty phases array → valid output
 * - dependsOn preserved in output
 * - unnamed graph → defaults to "unnamed"
 *
 * @since registry collapse — toWorkflowGraph is runtime-free (static type dispatch).
 * Agent type removed — fixtures use main; normalize() removed (no retry default).
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { toWorkflowGraph } from '../../src/api/graph-loader.js';
import type { Workflow } from '../../src/graph-definition.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid main phase. */
function mainPhase(id: string, task: string, overrides?: Record<string, unknown>) {
  return { id, type: 'main', task, ...overrides, operations: [] };
}

/** Build a Workflow object from phases. */
function mkWorkflow(name: string, phases: Array<ReturnType<typeof mainPhase>>): Workflow {
  return { name, phases } as Workflow;
}

const run = (tf: Workflow) => Effect.runPromise(toWorkflowGraph(tf));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toWorkflowGraph', () => {
  // ── 1. Valid main phase ──────────────────────────────────────────

  it('validates a valid main phase', async () => {
    const tf = mkWorkflow('simple', [mainPhase('a1', 'do something', { skill: 'atom-scope-interview' })]);

    const result = await run(tf);

    expect(result.name).toBe('simple');
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].id).toBe('a1');
    expect(result.phases[0].type).toBe('main');
    expect(result.phases[0].task).toBe('do something');
  });

  it('rejects removed agent type at load — no silent fallback', async () => {
    const agentTf = {
      name: 'agent-graph',

      phases: [{ id: 'a1', type: 'agent', task: 'do something' }],
    } as unknown as Workflow;

    await expect(run(agentTf)).rejects.toThrow(/Unknown phase type 'agent'/);
    await expect(run(agentTf)).rejects.toThrow(/Registered types:/);
    await expect(run(agentTf)).rejects.toThrow(/main/);
  });

  // ── 2. Empty task main phase → PhaseHandlerError ─────────────────

  it('throws PhaseHandlerError for main phase with empty task', async () => {
    const tf = mkWorkflow('bad', [mainPhase('a1', '')]);
    await expect(run(tf)).rejects.toThrow(/task is required/);
  });

  it('throws PhaseHandlerError for main phase with undefined task', async () => {
    const tf = mkWorkflow('bad', [mainPhase('a1', undefined as unknown as string)]);
    await expect(run(tf)).rejects.toThrow(/task is required/);
  });

  // ── 3. Unknown phase type → fails graph load with registered-type list ──

  it('rejects phase with unregistered type — no silent pass-through', async () => {
    const phase = { id: 'custom-1', type: 'custom-nosuch', task: 'whatever' };
    const tf = mkWorkflow('unknown-type', [phase as ReturnType<typeof mainPhase>]);

    await expect(run(tf)).rejects.toThrow(/Unknown phase type 'custom-nosuch'/);
    await expect(run(tf)).rejects.toThrow(/Registered types:/);
    await expect(run(tf)).rejects.toThrow(/main/);
  });

  // ── 4. Multiple phases — all validated ───────────────────────────

  it('validates all phases in a multi-phase graph', async () => {
    const tf = mkWorkflow('multi', [
      mainPhase('a1', 'step one', { skill: 'atom-scope-interview' }),
      mainPhase('a2', 'step two', { dependsOn: ['a1'], skill: 'atom-scope-interview' }),
      mainPhase('a3', 'step three', { dependsOn: ['a2'], skill: 'atom-scope-interview' }),
    ]);

    const result = await run(tf);

    expect(result.phases).toHaveLength(3);
    expect(result.phases[1].dependsOn).toEqual(['a1']);
    expect(result.phases[2].dependsOn).toEqual(['a2']);
  });

  // ── 5. Empty phases array → valid output ──────────────────────────

  it('returns valid output for empty phases array', async () => {
    const tf = mkWorkflow('empty', []);
    const result = await run(tf);
    expect(result.name).toBe('empty');
    expect(result.phases).toHaveLength(0);
  });

  // ── 6. dependsOn preserved in output ─────────────────────────────

  it('preserves dependsOn field', async () => {
    const tf = mkWorkflow('deps', [
      mainPhase('a1', 'first', { skill: 'atom-scope-interview' }),
      mainPhase('a2', 'second', { dependsOn: ['a1'], skill: 'atom-scope-interview' }),
    ]);

    const result = await run(tf);

    expect(result.phases[0].dependsOn).toBeUndefined();
    expect(result.phases[1].dependsOn).toEqual(['a1']);
  });

  // ── 7. Declared name is the identity — passes through to the graph ──

  it('passes the declared name through to the FSM graph shape', async () => {
    const tf = {
      name: 'declared-name',
      phases: [mainPhase('a1', 'task', { skill: 'atom-scope-interview' })],
    } as unknown as Workflow;

    const result = await run(tf);
    expect(result.name).toBe('declared-name');
  });
});
