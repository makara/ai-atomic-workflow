/**
 * Unit tests for toTaskflowGraph() — phase validation, error handling.
 *
 * Tests direct conversion from Taskflow (schema-validated JSON) to TaskflowGraph
 * (FSM-ready phase list). Covers:
 * - valid main phase → validated
 * - empty task main phase → PhaseHandlerError
 * - unknown phase type → graph load fails with registered-type list
 * - multiple phases → all validated
 * - empty phases array → valid output
 * - dependsOn preserved in output
 * - unnamed graph → defaults to "unnamed"
 *
 * @since registry collapse — toTaskflowGraph is runtime-free (static type dispatch).
 * Agent type removed — fixtures use main; normalize() removed (no retry default).
 */

import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { toTaskflowGraph } from '../../src/api/graph-loader.js';
import type { Taskflow } from '../../src/graph-definition.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid main phase. */
function mainPhase(id: string, task: string, overrides?: Record<string, unknown>) {
  return { id, type: 'main', task, ...overrides, operations: [] };
}

/** Build a Taskflow object from phases. */
function mkTaskflow(name: string, phases: Array<ReturnType<typeof mainPhase>>): Taskflow {
  return { name, phases } as Taskflow;
}

const run = (tf: Taskflow) => Effect.runPromise(toTaskflowGraph(tf));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toTaskflowGraph', () => {
  // ── 1. Valid main phase ──────────────────────────────────────────

  it('validates a valid main phase', async () => {
    const tf = mkTaskflow('simple', [mainPhase('a1', 'do something', { skill: 'atom-scope-interview' })]);

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
    } as unknown as Taskflow;

    await expect(run(agentTf)).rejects.toThrow(/Unknown phase type 'agent'/);
    await expect(run(agentTf)).rejects.toThrow(/Registered types:/);
    await expect(run(agentTf)).rejects.toThrow(/main/);
  });

  // ── 2. Empty task main phase → PhaseHandlerError ─────────────────

  it('throws PhaseHandlerError for main phase with empty task', async () => {
    const tf = mkTaskflow('bad', [mainPhase('a1', '')]);
    await expect(run(tf)).rejects.toThrow(/task is required/);
  });

  it('throws PhaseHandlerError for main phase with undefined task', async () => {
    const tf = mkTaskflow('bad', [mainPhase('a1', undefined as unknown as string)]);
    await expect(run(tf)).rejects.toThrow(/task is required/);
  });

  // ── 3. Unknown phase type → fails graph load with registered-type list ──

  it('rejects phase with unregistered type — no silent pass-through', async () => {
    const phase = { id: 'custom-1', type: 'custom-nosuch', task: 'whatever' };
    const tf = mkTaskflow('unknown-type', [phase as ReturnType<typeof mainPhase>]);

    await expect(run(tf)).rejects.toThrow(/Unknown phase type 'custom-nosuch'/);
    await expect(run(tf)).rejects.toThrow(/Registered types:/);
    await expect(run(tf)).rejects.toThrow(/main/);
  });

  // ── 4. Multiple phases — all validated ───────────────────────────

  it('validates all phases in a multi-phase graph', async () => {
    const tf = mkTaskflow('multi', [
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
    const tf = mkTaskflow('empty', []);
    const result = await run(tf);
    expect(result.name).toBe('empty');
    expect(result.phases).toHaveLength(0);
  });

  // ── 6. dependsOn preserved in output ─────────────────────────────

  it('preserves dependsOn field', async () => {
    const tf = mkTaskflow('deps', [
      mainPhase('a1', 'first', { skill: 'atom-scope-interview' }),
      mainPhase('a2', 'second', { dependsOn: ['a1'], skill: 'atom-scope-interview' }),
    ]);

    const result = await run(tf);

    expect(result.phases[0].dependsOn).toBeUndefined();
    expect(result.phases[1].dependsOn).toEqual(['a1']);
  });

  // ── 7. Unnamed graph defaults to "unnamed" ────────────────────────

  it('defaults graph name to "unnamed" when name is missing', async () => {
    const tf = {
      phases: [mainPhase('a1', 'task', { skill: 'atom-scope-interview' })],
    } as unknown as Taskflow;

    const result = await run(tf);
    expect(result.name).toBe('unnamed');
  });
});
