/**
 * Unit tests for toTaskflowGraph() — phase validation, normalization, error handling.
 *
 * Tests direct conversion from Taskflow (schema-validated JSON) to TaskflowGraph
 * (FSM-ready phase list). Covers:
 * - valid agent phase → normalized with default retry
 * - empty task agent phase → PhaseHandlerError
 * - unknown phase type → phase passes through unchanged
 * - multiple phases → all normalized
 * - empty phases array → valid output
 * - dependsOn preserved in output
 * - unnamed graph → defaults to "unnamed"
 *
 * @since F3 — toTaskflowGraph is now an Effect requiring PhaseHandlerRegistry.
 */

import { Effect, ManagedRuntime } from 'effect';
import { beforeAll, describe, expect, it } from 'vitest';
import { toTaskflowGraph } from '../../src/api/crud.js';
import type { Taskflow } from '../../src/graph-definition.js';
import { registerDefaultPhaseHandlersLayer } from '../../src/phase-handler/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal valid agent phase. */
function agentPhase(id: string, task: string, overrides?: Record<string, unknown>) {
  return { id, type: 'agent', task, ...overrides };
}

/** Build a Taskflow object from phases. */
function mkTaskflow(name: string, phases: Array<ReturnType<typeof agentPhase>>): Taskflow {
  return { name, version: 1, phases } as Taskflow;
}

// ---------------------------------------------------------------------------
// Setup — shared runtime with default handlers
// ---------------------------------------------------------------------------

let rt: ManagedRuntime.ManagedRuntime<never, never>;

beforeAll(() => {
  rt = ManagedRuntime.make(registerDefaultPhaseHandlersLayer());
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('toTaskflowGraph', () => {
  // ── 1. Valid agent phase ──────────────────────────────────────────

  it('normalizes a valid agent phase with default retry', async () => {
    const tf = mkTaskflow('simple', [agentPhase('a1', 'do something')]);

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.name).toBe('simple');
    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].id).toBe('a1');
    expect(result.phases[0].type).toBe('agent');
    expect(result.phases[0].task).toBe('do something');
    // Agent handler normalizes retry to { max: 0 } if undefined
    expect(result.phases[0].retry).toEqual({ max: 0 });
  });

  // ── 2. Empty task agent phase → PhaseHandlerError ─────────────────

  it('throws PhaseHandlerError for agent phase with empty task', async () => {
    const tf = mkTaskflow('bad', [agentPhase('a1', '')]);

    // Effect wraps thrown errors in FiberFailure; check message pattern
    await expect(rt.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/task is required/);
  });

  it('throws PhaseHandlerError for agent phase with undefined task', async () => {
    const tf = mkTaskflow('bad', [agentPhase('a1', undefined as unknown as string)]);

    await expect(rt.runPromise(toTaskflowGraph(tf))).rejects.toThrow(/task is required/);
  });

  // ── 3. Unknown phase type → passes through unchanged ──────────────

  it('passes through phase with unregistered type unchanged', async () => {
    const phase = { id: 'custom-1', type: 'custom-nosuch', task: 'whatever' };
    // Force an unregistered type into the phases — cast needed since
    // Taskflow phases have typed Phase entries
    const tf = mkTaskflow('unknown-type', [phase as ReturnType<typeof agentPhase>]);

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.phases).toHaveLength(1);
    expect(result.phases[0].id).toBe('custom-1');
    expect(result.phases[0].type).toBe('custom-nosuch');
    // Passes through without normalization — retry stays undefined
    expect((result.phases[0] as Record<string, unknown>).retry).toBeUndefined();
  });

  // ── 4. Multiple phases — all normalized ───────────────────────────

  it('normalizes all phases in a multi-phase graph', async () => {
    const tf = mkTaskflow('multi', [
      agentPhase('a1', 'step one'),
      agentPhase('a2', 'step two', { dependsOn: ['a1'] }),
      agentPhase('a3', 'step three', { dependsOn: ['a2'] }),
    ]);

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.phases).toHaveLength(3);
    // All three normalized with retry default
    for (const p of result.phases) {
      expect(p.retry).toEqual({ max: 0 });
    }
    expect(result.phases[1].dependsOn).toEqual(['a1']);
    expect(result.phases[2].dependsOn).toEqual(['a2']);
  });

  // ── 5. Empty phases array → valid output ──────────────────────────

  it('returns valid output for empty phases array', async () => {
    const tf = mkTaskflow('empty', []);

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.name).toBe('empty');
    expect(result.phases).toHaveLength(0);
  });

  // ── 6. dependsOn preserved in normalized output ───────────────────

  it('preserves dependsOn field after normalization', async () => {
    const tf = mkTaskflow('deps', [agentPhase('a1', 'first'), agentPhase('a2', 'second', { dependsOn: ['a1'] })]);

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.phases[0].dependsOn).toBeUndefined();
    expect(result.phases[1].dependsOn).toEqual(['a1']);
  });

  // ── 7. Unnamed graph defaults to "unnamed" ────────────────────────

  it('defaults graph name to "unnamed" when name is missing', async () => {
    // name: undefined simulates a graph with no name field
    const tf = { version: 1, phases: [agentPhase('a1', 'task')] } as unknown as Taskflow;

    const result = await rt.runPromise(toTaskflowGraph(tf));

    expect(result.name).toBe('unnamed');
  });
});
