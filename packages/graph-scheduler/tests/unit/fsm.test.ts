/**
 * Unit tests for fsm/ modules — state-machine, transition, events, effects.
 *
 * All modules are pure functions — zero DB, zero filesystem, zero Effect-TS.
 * Tested via vitest with direct imports.
 *
 * branch-routing redesign semantics: skip/cascade removed. Node states are
 * pending | active | done | aborted. COMPLETE carries an optional branchTo —
 * pending target → activate, terminal target → JUMP reset. The run completes
 * by natural drain when the final node reaches terminal; unchosen branch
 * nodes stay pending and never block completion (no end node type).
 */

import { describe, expect, it } from 'vitest';
import type { FsmEffect, FsmNodeState, FsmRunStatus } from '../../src/fsm/effects.js';
import type { FsmEvent } from '../../src/fsm/events.js';
import { assertLegalTransition, isLegalTransition } from '../../src/fsm/state-machine.js';
import {
  InvalidStateTransitionError,
  transition,
  type FsmState,
  type TaskflowGraph,
  type TransitionResult,
} from '../../src/fsm/transition.js';
import type { Phase } from '../../src/schemas/index.js';

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

/** Phase factory — fills zod-defaulted mode so literals stay terse (join default = all). */
function ph(id: string, overrides: Partial<Phase> = {}): Phase {
  return { id, type: 'main', mode: 'exclusive', ...overrides };
}

function graph(name: string, phases: readonly Phase[]): TaskflowGraph {
  return { name, phases };
}

/** Main-only entry graph — START/FORCE_END tests (drains after n1 completes). */
function entryOnlyGraph(name?: string): TaskflowGraph {
  return graph(name ?? 'test-graph', [ph('n1')]);
}

/** Linear chain — n1 → n2 (drains to completed after n2). */
function linearEndGraph(): TaskflowGraph {
  return graph('linear-end', [ph('n1'), ph('n2', { dependsOn: ['n1'] })]);
}

/**
 * Approval branch-route graph — branchTo activates route `t1`; `b` (route t1,
 * dep accept) activates via the route; `x` sits on an unselected route and
 * stays pending forever.
 *   a → accept (approval, branchTo t1|t2) ; b (route t1) ; x (route other)
 */
function branchForwardGraph(): TaskflowGraph {
  return graph('branch-forward', [
    ph('a'),
    ph('accept', {
      type: 'approval',
      dependsOn: ['a'],
    }),
    ph('b', { route: 't1', dependsOn: ['accept'] }),
    ph('x', { route: 'other' }),
  ]);
}

/**
 * Gate rework graph — gate jumps target the terminal upstream writer:
 * writer → review → gate. branchTo=writer triggers JUMP reset
 * (writer + review + gate → pending, retryCount + 1; upstream kept).
 */
function branchJumpGraph(): TaskflowGraph {
  return graph('branch-jump', [
    ph('writer'),
    ph('review', { dependsOn: ['writer'] }),
    ph('gate', {
      type: 'gate',
      dependsOn: ['review'],
      jumps: [{ when: 'review output shows overall: fail AND writer retryCount < 2', to: 'writer' }],
    }),
  ]);
}

/**
 * Route-clear graph — approval activates route t1; a downstream gate jumps
 * back to the activator (accept). The jump closure resets the activator, so
 * its route activation must clear — and the cleared map must reach the
 * persisted state (stateless server rebuilds from the DB every dispatch).
 *   a → accept (approval, branchTo t1|t2) ; b (route t1) ; c (route t2) ;
 *   gate (dep b, jumps to accept)
 */
function routeClearGraph(): TaskflowGraph {
  return graph('route-clear', [
    ph('a'),
    ph('accept', { type: 'approval', dependsOn: ['a'] }),
    ph('b', { route: 't1', dependsOn: ['accept'] }),
    ph('c', { route: 't2', dependsOn: ['accept'] }),
    ph('gate', { type: 'gate', dependsOn: ['b'], jumps: [{ when: 'x', to: 'accept' }] }),
  ]);
}

/**
 * Branch-route graph — approval branchTo activates route `t1`; the run drains
 * while the unselected route `t2` stays pending forever.
 *   a → accept (approval, branchTo t1|t2 routes) ; t1, t2 (routes, depend on accept)
 */
function endCompletionGraph(): TaskflowGraph {
  return graph('end-completion', [
    ph('a'),
    ph('accept', {
      type: 'approval',
      dependsOn: ['a'],
    }),
    ph('t1', { route: 't1', dependsOn: ['accept'] }),
    ph('t2', { route: 't2', dependsOn: ['accept'] }),
  ]);
}

function startEvent(graphName?: string): FsmEvent {
  return { type: 'START', graphName: graphName ?? 'test-graph' };
}

function completeEvent(phaseId: string, durationMs?: number, branchTo?: string): FsmEvent {
  return { type: 'COMPLETE', phaseId, durationMs: durationMs ?? 42, ...(branchTo !== undefined ? { branchTo } : {}) };
}

const forceEndEvent: FsmEvent = { type: 'FORCE_END' };

function jumpEvent(targetPhaseId: string): FsmEvent {
  return { type: 'JUMP', targetPhaseId };
}

// Type guards for FsmState discriminated union branches
function narrowRunning(state: FsmState) {
  if (state.status !== 'running') throw new Error('Expected running state');
  return state;
}

function narrowCompleted(state: FsmState) {
  if (state.status !== 'completed') throw new Error('Expected completed state');
  return state;
}

function narrowTerminated(state: FsmState) {
  if (state.status !== 'terminated') throw new Error('Expected terminated state');
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// state-machine.ts
// ══════════════════════════════════════════════════════════════════════════

// Test-local pure dispatch — legality check + transition, no stateful handle.
function dispatchState(state: FsmState, event: FsmEvent, g: TaskflowGraph): TransitionResult {
  assertLegalTransition(state.status, event.type);
  return transition(state, event, g);
}

const idleState = (): FsmState => ({ status: 'idle' });

describe('isLegalTransition / dispatch', () => {
  it('legality matrix — idle only accepts START', () => {
    expect(isLegalTransition('idle', 'START')).toBe(true);
    expect(isLegalTransition('idle', 'COMPLETE')).toBe(false);
    expect(isLegalTransition('idle', 'JUMP')).toBe(false);
    expect(isLegalTransition('idle', 'FORCE_END')).toBe(false);
  });

  it('legality matrix — running accepts COMPLETE/JUMP/FORCE_END', () => {
    expect(isLegalTransition('running', 'START')).toBe(false);
    expect(isLegalTransition('running', 'COMPLETE')).toBe(true);
    expect(isLegalTransition('running', 'JUMP')).toBe(true);
    expect(isLegalTransition('running', 'FORCE_END')).toBe(true);
  });

  it('legality matrix — completed/terminated are terminal', () => {
    for (const terminal of ['completed', 'terminated']) {
      for (const ev of ['START', 'COMPLETE', 'JUMP', 'FORCE_END']) {
        expect(isLegalTransition(terminal, ev)).toBe(false);
      }
    }
  });

  it('assertLegalTransition throws on illegal pair', () => {
    expect(() => assertLegalTransition('idle', 'COMPLETE')).toThrow(InvalidStateTransitionError);
    expect(() => assertLegalTransition('completed', 'START')).toThrow(InvalidStateTransitionError);
  });

  describe('START event', () => {
    it('idle → running, first node active', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());

      expect(result.nextState.status).toBe('running');
      const rs = narrowRunning(result.nextState);
      expect(typeof rs.runId).toBe('string');
      expect(rs.graphName).toBe('test-graph');
      expect(rs.phases['n1'].status).toBe('active');
      expect(result.effects.length).toBeGreaterThan(0);
    });

    it('START generates a valid UUID v4 runId', () => {
      const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());
      const rs = narrowRunning(result.nextState);

      expect(rs.runId).toMatch(UUID_V4_RE);
    });

    it('START records startedAt timestamp', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());
      const rs = narrowRunning(result.nextState);

      expect(rs.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rs.phases['n1'].startedAt).toBe(rs.startedAt);
    });

    it('START produces persist_run_state effect with running status', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: FsmRunStatus } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('running');
    });

    it('START produces persist_node_state effects for all phases', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());

      const nodeEffects = result.effects.filter(
        (e): e is { type: 'persist_node_state'; runId: string; nodeId: string; state: FsmNodeState } =>
          e.type === 'persist_node_state',
      );
      expect(nodeEffects.length).toBe(1);
      expect(nodeEffects[0].nodeId).toBe('n1');
    });

    it('START on non-idle throws InvalidStateTransitionError', () => {
      const running = dispatchState(idleState(), startEvent(), entryOnlyGraph()).nextState;

      expect(() => dispatchState(running, startEvent(), entryOnlyGraph())).toThrow(InvalidStateTransitionError);
    });
  });

  describe('COMPLETE event', () => {
    it('COMPLETE marks node done and advances to next pending', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      const result = dispatchState(started, completeEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;

      expect(phases['n1'].status).toBe('done');
      expect(phases['n1'].durationMs).toBe(42);
      expect(phases['n2'].status).toBe('active');
    });

    it('COMPLETE on idle throws InvalidStateTransitionError', () => {
      expect(() => dispatchState(idleState(), completeEvent('n1'), entryOnlyGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('COMPLETE for non-existent phaseId throws', () => {
      const started = dispatchState(idleState(), startEvent(), entryOnlyGraph()).nextState;

      expect(() => dispatchState(started, completeEvent('nonexistent'), entryOnlyGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('COMPLETE for non-active phaseId throws', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      // n2 is pending, not active
      expect(() => dispatchState(started, completeEvent('n2'), g)).toThrow(InvalidStateTransitionError);
    });

    it('COMPLETE last node → completed with persist_run_state (natural drain)', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const afterN1 = dispatchState(started, completeEvent('n1'), g).nextState;

      const result = dispatchState(afterN1, completeEvent('n2'), g);
      expect(result.nextState.status).toBe('completed');

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: FsmRunStatus } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('completed');
    });
  });

  describe('FORCE_END event', () => {
    it('FORCE_END from running → terminated, unfinished nodes aborted', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      const result = dispatchState(started, forceEndEvent, g);
      expect(result.nextState.status).toBe('terminated');

      const phases = narrowTerminated(result.nextState).phases;
      // route-first redesign — termination produces 'aborted'
      expect(phases['n1'].status).toBe('aborted');
      expect(phases['n2'].status).toBe('aborted');

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: FsmRunStatus } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('terminated');
    });

    it('FORCE_END keeps already-done nodes done', () => {
      const g = linearEndGraph();
      let state: FsmState = { status: 'idle' };
      state = dispatchState(state, startEvent(), g).nextState;
      state = dispatchState(state, completeEvent('n1'), g).nextState;

      const result = dispatchState(state, forceEndEvent, g);
      const phases = narrowTerminated(result.nextState).phases;
      expect(phases['n1'].status).toBe('done');
      expect(phases['n2'].status).toBe('aborted');
    });

    it('FORCE_END from idle throws', () => {
      expect(() => dispatchState(idleState(), forceEndEvent, entryOnlyGraph())).toThrow(InvalidStateTransitionError);
    });

    it('FORCE_END from completed throws', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const completed = dispatchState(started, completeEvent('n1'), g).nextState;
      const completed2 = dispatchState(completed, completeEvent('n2'), g).nextState;

      expect(() => dispatchState(completed2, forceEndEvent, g)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('Full cycle', () => {
    it('START → COMPLETE×N → completed (linear 2-node, natural drain)', () => {
      const g = linearEndGraph();

      const r1 = dispatchState(idleState(), startEvent(), g);
      expect(r1.nextState.status).toBe('running');
      expect(narrowRunning(r1.nextState).phases['n1'].status).toBe('active');

      const r2 = dispatchState(r1.nextState, completeEvent('n1'), g);
      expect(r2.nextState.status).toBe('running');
      expect(narrowRunning(r2.nextState).phases['n2'].status).toBe('active');

      const r3 = dispatchState(r2.nextState, completeEvent('n2'), g);
      expect(r3.nextState.status).toBe('completed');
      const phases = narrowCompleted(r3.nextState).phases;
      expect(phases['n1'].status).toBe('done');
      expect(phases['n2'].status).toBe('done');
    });

    it('completed state is terminal', () => {
      const g = linearEndGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const completed = dispatchState(started, completeEvent('n1'), g).nextState;
      const completed2 = dispatchState(completed, completeEvent('n2'), g).nextState;

      expect(() => dispatchState(completed2, completeEvent('n1'), g)).toThrow(InvalidStateTransitionError);
    });

    it('terminated state is terminal', () => {
      const g = entryOnlyGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const terminated = dispatchState(started, forceEndEvent, g).nextState;

      expect(() => dispatchState(terminated, startEvent(), g)).toThrow(InvalidStateTransitionError);
    });

    it('state threading tracks the full lifecycle', () => {
      const g = linearEndGraph();
      let state: FsmState = idleState();
      expect(state.status).toBe('idle');

      state = dispatchState(state, startEvent(), g).nextState;
      expect(state.status).toBe('running');

      state = dispatchState(state, completeEvent('n1'), g).nextState;
      expect(state.status).toBe('running');

      state = dispatchState(state, completeEvent('n2'), g).nextState;
      expect(state.status).toBe('completed');
    });
  });

  describe('JUMP event', () => {
    it('JUMP from running succeeds', () => {
      const g = entryOnlyGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      expect(() => dispatchState(started, jumpEvent('n1'), g)).not.toThrow();
    });
  });

  describe('JUMP retryCount semantics', () => {
    function runToPartialDone(g: TaskflowGraph): FsmState {
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      // Complete first node only — keep run in running state (later nodes active/pending)
      state = transition(state, completeEvent(g.phases[0].id), g).nextState;
      return state;
    }

    it('JUMP increments target retryCount from 0 to 1', () => {
      const g = linearEndGraph();
      const running = runToPartialDone(g);

      const result = transition(running, jumpEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;
      expect(phases['n1'].status).toBe('active');
      expect(phases['n1'].retryCount).toBe(1);
    });

    it('JUMP keeps upstream closure (route-first — inputs already produced)', () => {
      const g = linearEndGraph();
      const running = runToPartialDone(g);

      // Jump to n2 — n1 is upstream closure and stays terminal (upstream kept);
      // n2 (target) resets with incremented retryCount
      const result = transition(running, jumpEvent('n2'), g);
      const phases = narrowRunning(result.nextState).phases;
      expect(phases['n1'].status).toBe('done');
      expect(phases['n1'].retryCount).toBe(0);
      expect(phases['n2'].status).toBe('active');
      expect(phases['n2'].retryCount).toBe(1);
    });

    it('JUMP accumulates retryCount across repeated jumps', () => {
      const g = linearEndGraph();
      let state = runToPartialDone(g);

      state = transition(state, jumpEvent('n1'), g).nextState;
      state = transition(state, completeEvent('n1'), g).nextState;
      state = transition(state, jumpEvent('n1'), g).nextState;

      const phases = narrowRunning(state).phases;
      expect(phases['n1'].retryCount).toBe(2);
    });

    it('JUMP resets downstream closure with incremented retryCount', () => {
      const g = linearEndGraph();
      const running = runToPartialDone(g);

      const result = transition(running, jumpEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;
      // n2 is downstream of n1 — reset with incremented count
      expect(phases['n2'].status).toBe('pending');
      expect(phases['n2'].retryCount).toBe(1);
    });
  });

  describe('effects', () => {
    it('START effects: persist_run_state + persist_node_state for each phase', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());

      const types = result.effects.map((e) => e.type);
      expect(types).toContain('persist_run_state');
      expect(types.filter((t) => t === 'persist_node_state').length).toBe(1);
    });

    it('effects are readonly (array runtime check)', () => {
      const result = dispatchState(idleState(), startEvent(), entryOnlyGraph());
      expect(Array.isArray(result.effects)).toBe(true);
      expect(result.effects.length).toBeGreaterThan(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// transition.ts — direct transition() calls
// ══════════════════════════════════════════════════════════════════════════

describe('transition()', () => {
  const entryGraph = entryOnlyGraph();

  describe('START transition', () => {
    it('idle → running, produces runId and phases', () => {
      const result = transition({ status: 'idle' }, startEvent(), entryGraph);

      expect(result.nextState.status).toBe('running');
      const rs = narrowRunning(result.nextState);
      expect(rs.runId).toMatch(/^[0-9a-f-]{36}$/);
      expect(rs.graphName).toBe('test-graph');
      expect(rs.phases['n1'].status).toBe('active');
      expect(rs.startedAt).toBeTruthy();
    });

    it('START returns TransitionResult with effects', () => {
      const result = transition({ status: 'idle' }, startEvent(), entryGraph);
      expect(result.effects.length).toBeGreaterThan(0);
      expect(result.effects[0].type).toBe('persist_run_state');
    });

    it('START from non-idle throws', () => {
      const runningState: FsmState = {
        status: 'running',
        runId: 'r1',
        graphName: 'g',
        phases: { n1: { status: 'active', retryCount: 0 } },
        routes: {},
        startedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => transition(runningState, startEvent(), entryGraph)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('COMPLETE transition', () => {
    it('marks node done, next node active (linear graph)', () => {
      const g = linearEndGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(startResult.nextState, completeEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;

      expect(phases['n1'].status).toBe('done');
      expect(phases['n2'].status).toBe('active');
      expect(result.nextState.status).toBe('running');
    });

    it('COMPLETE last node → completed (natural drain)', () => {
      const g = linearEndGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);
      const afterN1 = transition(startResult.nextState, completeEvent('n1'), g).nextState;

      const result = transition(afterN1, completeEvent('n2'), g);
      expect(result.nextState.status).toBe('completed');
      expect(
        result.effects.some((e) => e.type === 'persist_run_state' && 'status' in e && e.status === 'completed'),
      ).toBe(true);
    });

    it('COMPLETE of a plain node does NOT complete the run (not drained yet)', () => {
      const g = linearEndGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(startResult.nextState, completeEvent('n1'), g);
      expect(result.nextState.status).toBe('running');
    });

    it('COMPLETE non-existent phaseId throws', () => {
      const g = entryOnlyGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      expect(() => transition(startResult.nextState, completeEvent('bad-id'), g)).toThrow(InvalidStateTransitionError);
    });

    it('COMPLETE non-active phaseId throws', () => {
      const g = linearEndGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      expect(() => transition(startResult.nextState, completeEvent('n2'), g)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('FORCE_END transition', () => {
    it('FORCE_END from running → terminated, pending/active nodes aborted', () => {
      const g = linearEndGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      const result = transition(state, forceEndEvent, g);
      expect(result.nextState.status).toBe('terminated');
      const phases = narrowTerminated(result.nextState).phases;
      expect(phases['n1'].status).toBe('aborted');
      expect(phases['n2'].status).toBe('aborted');
    });

    it('FORCE_END from idle throws', () => {
      expect(() => transition({ status: 'idle' }, forceEndEvent, entryOnlyGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });
  });

  describe('Completed by natural drain', () => {
    it('linear 2-node: START → COMPLETE×2 → completed', () => {
      const g = linearEndGraph();

      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      expect(state.status).toBe('running');

      state = transition(state, completeEvent('n1'), g).nextState;
      expect(state.status).toBe('running');

      state = transition(state, completeEvent('n2'), g).nextState;
      expect(state.status).toBe('completed');
    });
  });

  // ── ROUTE routing (route-first redesign) ──────────────────────────────────────────────

  describe('COMPLETE with branchTo — approval branch-route activation', () => {
    it('branchTo activates a route whose member topology would not reach', () => {
      const g = branchForwardGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // a active; b on inactive route t1 — pending; x on inactive route other — pending
      expect(narrowRunning(state).phases['a'].status).toBe('active');
      expect(narrowRunning(state).phases['b'].status).toBe('pending');
      expect(narrowRunning(state).phases['x'].status).toBe('pending');

      // complete a → accept active
      state = transition(state, completeEvent('a'), g).nextState;
      expect(narrowRunning(state).phases['accept'].status).toBe('active');
      // b still not ready: its route is inactive
      expect(narrowRunning(state).phases['b'].status).toBe('pending');

      // accept decides branchTo=t1 → the route activates, b activates via it
      state = transition(state, completeEvent('accept', 10, 't1'), g).nextState;
      expect(narrowRunning(state).phases['b'].status).toBe('active');

      // b → done → the run drains to completed even though x never finishes
      state = transition(state, completeEvent('b'), g).nextState;
      expect(state.status).toBe('completed');
    });

    it('branchTo without a branch leaves the route inactive — the node never activates', () => {
      const g = branchForwardGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      // No branchTo — the branch node stays pending (no skip, no activation);
      // nothing eligible remains → the run drains
      state = transition(state, completeEvent('accept', 10), g).nextState;
      expect(state.status).toBe('completed');
      const completedPhases = narrowCompleted(state).phases;
      expect(completedPhases['b'].status).toBe('pending');
      expect(completedPhases['x'].status).toBe('pending');
    });

    it('branchTo targeting a non-existent phase throws', () => {
      const g = branchForwardGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      expect(() => transition(state, completeEvent('accept', 10, 'ghost'), g)).toThrow(InvalidStateTransitionError);
    });

    it('branchTo targeting an active node throws — pending or route id only', () => {
      const g = branchForwardGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      // a is active — an invalid branch target state
      expect(() => transition(state, completeEvent('accept', 10, 'a'), g)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('COMPLETE with branchTo — gate jump reset on terminal target', () => {
    it('branchTo to a done upstream node resets target + closure with retryCount increment', () => {
      const g = branchJumpGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // writer → review → gate
      state = transition(state, completeEvent('writer'), g).nextState;
      expect(narrowRunning(state).phases['review'].status).toBe('active');
      state = transition(state, completeEvent('review'), g).nextState;
      expect(narrowRunning(state).phases['gate'].status).toBe('active');

      // gate jump → writer (done) → JUMP reset
      state = transition(state, completeEvent('gate', 10, 'writer'), g).nextState;
      const phases = narrowRunning(state).phases;
      expect(phases['writer'].status).toBe('active');
      expect(phases['writer'].retryCount).toBe(1);
      expect(phases['review'].status).toBe('pending');
      expect(phases['review'].retryCount).toBe(1);
      expect(phases['gate'].status).toBe('pending');
      expect(phases['gate'].retryCount).toBe(1);
    });

    it('branchTo to an aborted node also triggers JUMP reset', () => {
      const g = branchJumpGraph();
      // Reconstructed running state — writer aborted (FORCE_END residue), gate active
      const runningState: FsmState = {
        status: 'running',
        runId: 'r1',
        graphName: g.name,
        startedAt: '2026-08-01T00:00:00.000Z',
        phases: {
          writer: { status: 'aborted', retryCount: 0 },
          review: { status: 'done', retryCount: 0 },
          gate: { status: 'active', retryCount: 0 },
        },
        routes: {},
      };

      const result = transition(runningState, completeEvent('gate', 10, 'writer'), g);
      expect(result.nextState.status).toBe('running');
      const phases = narrowRunning(result.nextState).phases;
      // Terminal (aborted) target → JUMP reset; writer re-activated with retryCount 1
      expect(phases['writer'].status).toBe('active');
      expect(phases['writer'].retryCount).toBe(1);
    });

    it('branchTo to a pending target throws — gate jumps are backward-only (terminal targets)', () => {
      const g = branchJumpGraph();
      // Reconstructed running state — gate active, writer pending (impossible in
      // a healthy run, but the FSM must assert terminal targets mechanically)
      const runningState: FsmState = {
        status: 'running',
        runId: 'r1',
        graphName: g.name,
        startedAt: '2026-08-01T00:00:00.000Z',
        phases: {
          writer: { status: 'pending', retryCount: 0 },
          review: { status: 'done', retryCount: 0 },
          gate: { status: 'active', retryCount: 0 },
        },
        routes: {},
      };

      expect(() => transition(runningState, completeEvent('gate', 10, 'writer'), g)).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('branchTo retry accumulates retryCount across repeated resets', () => {
      const g = branchJumpGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // Round 1: writer → review → gate → branchTo writer (retryCount 1)
      state = transition(state, completeEvent('writer'), g).nextState;
      state = transition(state, completeEvent('review'), g).nextState;
      state = transition(state, completeEvent('gate', 10, 'writer'), g).nextState;
      expect(narrowRunning(state).phases['writer'].retryCount).toBe(1);

      // Round 2: writer → review → gate → branchTo writer (retryCount 2)
      state = transition(state, completeEvent('writer'), g).nextState;
      state = transition(state, completeEvent('review'), g).nextState;
      state = transition(state, completeEvent('gate', 10, 'writer'), g).nextState;
      expect(narrowRunning(state).phases['writer'].retryCount).toBe(2);
    });

    it('gate jump clears route activations made by reset nodes — single persist carries the cleared map', () => {
      const g = routeClearGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      // accept activates route t1 — exactly ONE persist effect, with { t1: accept }
      const branch = transition(state, completeEvent('accept', 10, 't1'), g);
      state = branch.nextState;
      const branchPersists = branch.effects.filter((e) => e.type === 'persist_run_state');
      expect(branchPersists).toHaveLength(1);
      expect((branchPersists[0] as { routes: Record<string, string> }).routes).toEqual({ t1: 'accept' });
      expect(narrowRunning(state).phases['b'].status).toBe('active');
      expect(narrowRunning(state).phases['c'].status).toBe('pending');

      // b done → gate active → gate jumps back to the activator (accept, done terminal)
      state = transition(state, completeEvent('b'), g).nextState;
      const jump = transition(state, completeEvent('gate', 10, 'accept'), g);
      state = jump.nextState;
      // Closure reset includes the activator — its route activation clears
      // in memory AND in the persist effect (the stateless server rebuilds
      // state from the DB; an unpersisted clearing dies across dispatches).
      expect(narrowRunning(state).routes).toEqual({});
      const jumpPersists = jump.effects.filter((e) => e.type === 'persist_run_state');
      expect(jumpPersists).toHaveLength(1);
      expect((jumpPersists[0] as { routes: Record<string, string> }).routes).toEqual({});
      // Rebuilt eligibility: with the cleared map, neither track member is
      // ready; only the reset activator re-runs and re-decides.
      const phases = narrowRunning(state).phases;
      expect(phases['accept'].status).toBe('active');
      expect(phases['b'].status).toBe('pending');
      expect(phases['c'].status).toBe('pending');
    });
  });

  describe('COMPLETE with branchTo — route activation recording', () => {
    it('approval branchTo a route id records route activation', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      state = transition(state, completeEvent('accept', 10, 't1'), g).nextState;
      const rs = narrowRunning(state);
      expect(rs.routes).toEqual({ t1: 'accept' });
    });

    it('approval branchTo a route activates its members; unselected route stays pending', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      state = transition(state, completeEvent('accept', 10, 't1'), g).nextState;
      const rs = narrowRunning(state);
      expect(rs.phases['t1'].status).toBe('active');
      expect(rs.phases['t2'].status).toBe('pending');
    });

    it('branchTo on a non-approval/non-gate phase is ignored (no route recording)', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      state = transition(state, completeEvent('a', 10, 't1'), g).nextState;
      // branchTo on a main phase is ignored
      expect(narrowRunning(state).routes).toEqual({});
    });

    it('JUMP clears route activations made by nodes inside the reset closure', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      // accept activates route t1
      state = transition(state, completeEvent('accept', 10, 't1'), g).nextState;
      expect(narrowRunning(state).routes).toEqual({ t1: 'accept' });

      // Explicit JUMP back to accept resets it — the stale route activation is dropped
      state = transition(state, jumpEvent('accept'), g).nextState;
      expect(narrowRunning(state).routes).toEqual({});
    });
  });

  // ── Completion by natural drain (route-first redesign) ────────────────────────────────

  describe('Natural-drain completion', () => {
    it('run drains when no active and no eligible remain — unselected route members stay pending', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // a → accept
      state = transition(state, completeEvent('a'), g).nextState;
      expect(narrowRunning(state).phases['accept'].status).toBe('active');

      // accept activates route t1 — the activation is recorded
      state = transition(state, completeEvent('accept', 10, 't1'), g).nextState;
      const afterAccept = narrowRunning(state);
      expect(afterAccept.phases['t1'].status).toBe('active');
      expect(afterAccept.routes).toEqual({ t1: 'accept' });
      // unselected route member stays pending forever
      expect(afterAccept.phases['t2'].status).toBe('pending');

      // t1 → done → the run drains to completed; t2 still pending does NOT block
      const final = transition(state, completeEvent('t1'), g);
      expect(final.nextState.status).toBe('completed');
      const completedPhases = narrowCompleted(final.nextState).phases;
      expect(completedPhases['t2'].status).toBe('pending');
    });

    it('a graph drains to completed when its last node completes (no end node needed)', () => {
      const g = entryOnlyGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      const result = transition(state, completeEvent('n1'), g);
      expect(result.nextState.status).toBe('completed');
    });

    it('approval endRun completes the run immediately regardless of pending nodes', () => {
      const g = endCompletionGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      state = transition(state, completeEvent('a'), g).nextState;

      // accept completes with endRun — run completes; pending nodes stay pending
      const event: FsmEvent = { type: 'COMPLETE', phaseId: 'accept', durationMs: 10, endRun: true };
      const result = transition(state, event, g);
      expect(result.nextState.status).toBe('completed');
      const completedPhases = narrowCompleted(result.nextState).phases;
      expect(completedPhases['t1'].status).toBe('pending');
      expect(completedPhases['t2'].status).toBe('pending');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// InvalidStateTransitionError
// ══════════════════════════════════════════════════════════════════════════

describe('InvalidStateTransitionError', () => {
  it('has _tag property', () => {
    const err = new InvalidStateTransitionError('idle', 'COMPLETE');
    expect(err._tag).toBe('InvalidStateTransitionError');
  });

  it('has name "InvalidStateTransitionError"', () => {
    const err = new InvalidStateTransitionError('idle', 'COMPLETE');
    expect(err.name).toBe('InvalidStateTransitionError');
  });

  it('is instance of Error', () => {
    const err = new InvalidStateTransitionError('idle', 'COMPLETE');
    expect(err).toBeInstanceOf(Error);
  });

  it('exposes currentStatus and eventType', () => {
    const err = new InvalidStateTransitionError('running', 'START');
    expect(err.currentStatus).toBe('running');
    expect(err.eventType).toBe('START');
  });

  it('default message', () => {
    const err = new InvalidStateTransitionError('idle', 'COMPLETE');
    expect(err.message).toBe('Illegal transition: cannot dispatch COMPLETE from state idle');
  });

  it('custom message overrides default', () => {
    const err = new InvalidStateTransitionError('running', 'COMPLETE', 'Phase not found');
    expect(err.message).toBe('Phase not found');
  });

  it('thrown by dispatch() on illegal transition', () => {
    try {
      dispatchState(idleState(), completeEvent('n1'), entryOnlyGraph());
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStateTransitionError);
      const iste = e as InvalidStateTransitionError;
      expect(iste._tag).toBe('InvalidStateTransitionError');
      expect(iste.currentStatus).toBe('idle');
      expect(iste.eventType).toBe('COMPLETE');
    }
  });

  it('thrown by transition() on illegal state', () => {
    try {
      transition({ status: 'idle' }, completeEvent('n1'), entryOnlyGraph());
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidStateTransitionError);
      expect((e as InvalidStateTransitionError).currentStatus).toBe('idle');
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════
// events.ts — FsmEvent discriminated union
// ══════════════════════════════════════════════════════════════════════════

describe('FsmEvent discriminated union', () => {
  describe('type narrowing', () => {
    it('START event identifiable by type', () => {
      const ev: FsmEvent = { type: 'START', graphName: 'g' };
      if (ev.type === 'START') {
        expect(ev.graphName).toBe('g');
      } else {
        expect.fail('should be START');
      }
    });

    it('COMPLETE event identifiable by type', () => {
      const ev: FsmEvent = { type: 'COMPLETE', phaseId: 'p1', durationMs: 100 };
      if (ev.type === 'COMPLETE') {
        expect(ev.phaseId).toBe('p1');
        expect(ev.durationMs).toBe(100);
      } else {
        expect.fail('should be COMPLETE');
      }
    });

    it('JUMP event identifiable by type', () => {
      const ev: FsmEvent = { type: 'JUMP', targetPhaseId: 'n1' };
      if (ev.type === 'JUMP') {
        expect(ev.targetPhaseId).toBe('n1');
      } else {
        expect.fail('should be JUMP');
      }
    });

    it('FORCE_END event identifiable by type', () => {
      const ev: FsmEvent = { type: 'FORCE_END' };
      expect(ev.type).toBe('FORCE_END');
    });
  });

  describe('event payloads', () => {
    it('START has graphName and optional args', () => {
      const ev1: FsmEvent = { type: 'START', graphName: 'my-graph' };
      if (ev1.type === 'START') {
        expect(ev1.graphName).toBe('my-graph');
        expect(ev1.args).toBeUndefined();
      }

      const ev2: FsmEvent = { type: 'START', graphName: 'g', args: { key: 'val' } };
      if (ev2.type === 'START') {
        expect(ev2.args).toEqual({ key: 'val' });
      }
    });

    it('COMPLETE has phaseId and durationMs', () => {
      const ev: FsmEvent = { type: 'COMPLETE', phaseId: 'node-a', durationMs: 123 };
      if (ev.type === 'COMPLETE') {
        expect(ev.phaseId).toBe('node-a');
        expect(ev.durationMs).toBe(123);
      }
    });

    it('COMPLETE has optional branchTo (branch-routing redesign — skip removed)', () => {
      const evBranch: FsmEvent = { type: 'COMPLETE', phaseId: 'n1', durationMs: 42, branchTo: 'target' };
      if (evBranch.type === 'COMPLETE') {
        expect(evBranch.branchTo).toBe('target');
      }
      const evNoBranch: FsmEvent = { type: 'COMPLETE', phaseId: 'n2', durationMs: 99 };
      if (evNoBranch.type === 'COMPLETE') {
        expect(evNoBranch.branchTo).toBeUndefined();
      }
    });

    it('JUMP has targetPhaseId', () => {
      const ev: FsmEvent = { type: 'JUMP', targetPhaseId: 'phase-3' };
      if (ev.type === 'JUMP') {
        expect(ev.targetPhaseId).toBe('phase-3');
      }
    });

    it('FORCE_END has no extra fields', () => {
      const ev: FsmEvent = { type: 'FORCE_END' };
      expect(Object.keys(ev)).toEqual(['type']);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// effects.ts — FsmEffect discriminated union
// ══════════════════════════════════════════════════════════════════════════

describe('FsmEffect discriminated union', () => {
  describe('type narrowing', () => {
    it('persist_node_state identifiable by type', () => {
      const eff: FsmEffect = {
        type: 'persist_node_state',
        runId: 'r1',
        nodeId: 'n1',
        state: { status: 'active', retryCount: 0 },
      };
      if (eff.type === 'persist_node_state') {
        expect(eff.runId).toBe('r1');
        expect(eff.nodeId).toBe('n1');
        expect(eff.state.status).toBe('active');
      } else {
        expect.fail('should be persist_node_state');
      }
    });

    it('persist_run_state identifiable by type', () => {
      const eff: FsmEffect = {
        type: 'persist_run_state',
        runId: 'r1',
        status: 'running',
      };
      if (eff.type === 'persist_run_state') {
        expect(eff.runId).toBe('r1');
        expect(eff.status).toBe('running');
      } else {
        expect.fail('should be persist_run_state');
      }
    });
  });

  describe('FsmNodeState', () => {
    it('default pending state', () => {
      const ns: FsmNodeState = { status: 'pending', retryCount: 0 };
      expect(ns.status).toBe('pending');
      expect(ns.retryCount).toBe(0);
      expect(ns.startedAt).toBeUndefined();
    });

    it('active state with startedAt', () => {
      const ns: FsmNodeState = { status: 'active', retryCount: 0, startedAt: '2024-01-01T00:00:00Z' };
      expect(ns.status).toBe('active');
      expect(ns.startedAt).toBe('2024-01-01T00:00:00Z');
    });

    it('done state with duration', () => {
      const ns: FsmNodeState = {
        status: 'done',
        retryCount: 0,
        completedAt: '2024-01-01T00:00:05Z',
        durationMs: 5000,
      };
      expect(ns.status).toBe('done');
      expect(ns.durationMs).toBe(5000);
    });

    it('aborted state (branch-routing redesign — skipped removed)', () => {
      const ns: FsmNodeState = {
        status: 'aborted',
        retryCount: 0,
        completedAt: '2024-01-01T00:00:01Z',
      };
      expect(ns.status).toBe('aborted');
      expect(ns.completedAt).toBe('2024-01-01T00:00:01Z');
    });
  });

  describe('FsmRunStatus', () => {
    it('all status values are assignable', () => {
      const statuses: Array<FsmRunStatus> = ['running', 'completed', 'terminated'];
      expect(statuses.length).toBe(3);
    });
  });
});
