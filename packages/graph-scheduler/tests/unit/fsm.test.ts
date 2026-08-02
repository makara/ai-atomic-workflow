/**
 * Unit tests for fsm/ modules — state-machine, transition, events, effects.
 *
 * All modules are pure functions — zero DB, zero filesystem, zero Effect-TS.
 * Tested via vitest with direct imports.
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

// ══════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════

function singleAgentGraph(name?: string): TaskflowGraph {
  return {
    name: name ?? 'test-graph',
    phases: [{ id: 'n1', type: 'main' }],
  };
}

function linearTwoGraph(): TaskflowGraph {
  return {
    name: 'linear-two',
    phases: [
      { id: 'n1', type: 'main' },
      { id: 'n2', type: 'main', dependsOn: ['n1'] },
    ],
  };
}

function startEvent(graphName?: string): FsmEvent {
  return { type: 'START', graphName: graphName ?? 'test-graph' };
}

function completeEvent(phaseId: string, durationMs?: number): FsmEvent {
  return { type: 'COMPLETE', phaseId, durationMs: durationMs ?? 42 };
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
function dispatchState(state: FsmState, event: FsmEvent, graph: TaskflowGraph): TransitionResult {
  assertLegalTransition(state.status, event.type);
  return transition(state, event, graph);
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
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());

      expect(result.nextState.status).toBe('running');
      const rs = narrowRunning(result.nextState);
      expect(typeof rs.runId).toBe('string');
      expect(rs.graphName).toBe('test-graph');
      expect(rs.phases['n1'].status).toBe('active');
      expect(result.effects.length).toBeGreaterThan(0);
    });

    it('START generates a valid UUID v4 runId', () => {
      const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());
      const rs = narrowRunning(result.nextState);

      expect(rs.runId).toMatch(UUID_V4_RE);
    });

    it('START records startedAt timestamp', () => {
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());
      const rs = narrowRunning(result.nextState);

      expect(rs.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(rs.phases['n1'].startedAt).toBe(rs.startedAt);
    });

    it('START produces persist_run_state effect with running status', () => {
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: string } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('running');
    });

    it('START produces persist_node_state effects for all phases', () => {
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());

      const nodeEffects = result.effects.filter(
        (e): e is { type: 'persist_node_state'; runId: string; nodeId: string; state: FsmNodeState } =>
          e.type === 'persist_node_state',
      );
      expect(nodeEffects.length).toBe(1);
      expect(nodeEffects[0].nodeId).toBe('n1');
    });

    it('START on non-idle throws InvalidStateTransitionError', () => {
      const running = dispatchState(idleState(), startEvent(), singleAgentGraph()).nextState;

      expect(() => dispatchState(running, startEvent(), singleAgentGraph())).toThrow(InvalidStateTransitionError);
    });
  });

  describe('COMPLETE event', () => {
    it('COMPLETE marks node done and advances to next pending', () => {
      const g = linearTwoGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      const result = dispatchState(started, completeEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;

      expect(phases['n1'].status).toBe('done');
      expect(phases['n1'].durationMs).toBe(42);
      expect(phases['n2'].status).toBe('active');
    });

    it('COMPLETE on idle throws InvalidStateTransitionError', () => {
      expect(() => dispatchState(idleState(), completeEvent('n1'), singleAgentGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('COMPLETE for non-existent phaseId throws', () => {
      const started = dispatchState(idleState(), startEvent(), singleAgentGraph()).nextState;

      expect(() => dispatchState(started, completeEvent('nonexistent'), singleAgentGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });

    it('COMPLETE for non-active phaseId throws', () => {
      const g = linearTwoGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      // n2 is pending, not active
      expect(() => dispatchState(started, completeEvent('n2'), g)).toThrow(InvalidStateTransitionError);
    });

    it('COMPLETE last node → completed with persist_run_state', () => {
      const g = singleAgentGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      const result = dispatchState(started, completeEvent('n1'), g);
      expect(result.nextState.status).toBe('completed');

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: string } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('completed');
    });
  });

  describe('FORCE_END event', () => {
    it('FORCE_END from running → terminated, unfinished nodes skipped', () => {
      const g = linearTwoGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;

      const result = dispatchState(started, forceEndEvent, g);
      expect(result.nextState.status).toBe('terminated');

      const phases = narrowTerminated(result.nextState).phases;
      expect(phases['n1'].status).toBe('skipped');
      expect(phases['n2'].status).toBe('skipped');

      const runEffect = result.effects.find(
        (e): e is { type: 'persist_run_state'; runId: string; status: string } => e.type === 'persist_run_state',
      );
      expect(runEffect).toBeDefined();
      expect(runEffect!.status).toBe('terminated');
    });

    it('FORCE_END from idle throws', () => {
      expect(() => dispatchState(idleState(), forceEndEvent, singleAgentGraph())).toThrow(InvalidStateTransitionError);
    });

    it('FORCE_END from completed throws', () => {
      const g = singleAgentGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const completed = dispatchState(started, completeEvent('n1'), g).nextState;

      expect(() => dispatchState(completed, forceEndEvent, g)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('Full cycle', () => {
    it('START → COMPLETE×N → completed (linear 2-node)', () => {
      const g = linearTwoGraph();

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
      const g = singleAgentGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const completed = dispatchState(started, completeEvent('n1'), g).nextState;

      expect(() => dispatchState(completed, completeEvent('n1'), g)).toThrow(InvalidStateTransitionError);
    });

    it('terminated state is terminal', () => {
      const g = singleAgentGraph();
      const started = dispatchState(idleState(), startEvent(), g).nextState;
      const terminated = dispatchState(started, forceEndEvent, g).nextState;

      expect(() => dispatchState(terminated, startEvent(), g)).toThrow(InvalidStateTransitionError);
    });

    it('state threading tracks the full lifecycle', () => {
      const g = singleAgentGraph();
      let state: FsmState = idleState();
      expect(state.status).toBe('idle');

      state = dispatchState(state, startEvent(), g).nextState;
      expect(state.status).toBe('running');

      state = dispatchState(state, completeEvent('n1'), g).nextState;
      expect(state.status).toBe('completed');
    });
  });

  describe('JUMP event', () => {
    it('JUMP from running succeeds', () => {
      const g = singleAgentGraph();
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
      const g = linearTwoGraph();
      const running = runToPartialDone(g);

      const result = transition(running, jumpEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;
      expect(phases['n1'].status).toBe('active');
      expect(phases['n1'].retryCount).toBe(1);
    });

    it('JUMP increments upstream closure retryCount', () => {
      const g = linearTwoGraph();
      const running = runToPartialDone(g);

      // Jump to n2 — n1 is upstream closure, both reset
      const result = transition(running, jumpEvent('n2'), g);
      const phases = narrowRunning(result.nextState).phases;
      expect(phases['n1'].status).toBe('active');
      expect(phases['n1'].retryCount).toBe(1);
      expect(phases['n2'].retryCount).toBe(1);
    });

    it('JUMP accumulates retryCount across repeated jumps', () => {
      const g = linearTwoGraph();
      let state = runToPartialDone(g);

      state = transition(state, jumpEvent('n1'), g).nextState;
      state = transition(state, completeEvent('n1'), g).nextState;
      state = transition(state, jumpEvent('n1'), g).nextState;

      const phases = narrowRunning(state).phases;
      expect(phases['n1'].retryCount).toBe(2);
    });

    it('JUMP preserves retryCount of untouched nodes', () => {
      const g = linearTwoGraph();
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
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());

      const types = result.effects.map((e) => e.type);
      expect(types).toContain('persist_run_state');
      expect(types.filter((t) => t === 'persist_node_state').length).toBe(1);
    });

    it('effects are readonly (array runtime check)', () => {
      const result = dispatchState(idleState(), startEvent(), singleAgentGraph());
      expect(Array.isArray(result.effects)).toBe(true);
      expect(result.effects.length).toBeGreaterThan(0);
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// transition.ts — direct transition() calls
// ══════════════════════════════════════════════════════════════════════════

describe('transition()', () => {
  const graph = singleAgentGraph();

  describe('START transition', () => {
    it('idle → running, produces runId and phases', () => {
      const result = transition({ status: 'idle' }, startEvent(), graph);

      expect(result.nextState.status).toBe('running');
      const rs = narrowRunning(result.nextState);
      expect(rs.runId).toMatch(/^[0-9a-f-]{36}$/);
      expect(rs.graphName).toBe('test-graph');
      expect(rs.phases['n1'].status).toBe('active');
      expect(rs.startedAt).toBeTruthy();
    });

    it('START returns TransitionResult with effects', () => {
      const result = transition({ status: 'idle' }, startEvent(), graph);
      expect(result.effects.length).toBeGreaterThan(0);
      expect(result.effects[0].type).toBe('persist_run_state');
    });

    it('START from non-idle throws', () => {
      const runningState: FsmState = {
        status: 'running',
        runId: 'r1',
        graphName: 'g',
        phases: { n1: { status: 'active', retryCount: 0 } },
        startedAt: '2024-01-01T00:00:00Z',
      };

      expect(() => transition(runningState, startEvent(), graph)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('COMPLETE transition', () => {
    it('marks node done, next node active (linear graph)', () => {
      const g = linearTwoGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(startResult.nextState, completeEvent('n1'), g);
      const phases = narrowRunning(result.nextState).phases;

      expect(phases['n1'].status).toBe('done');
      expect(phases['n2'].status).toBe('active');
      expect(result.nextState.status).toBe('running');
    });

    it('COMPLETE last node → completed', () => {
      const g = singleAgentGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(startResult.nextState, completeEvent('n1'), g);
      expect(result.nextState.status).toBe('completed');
      expect(
        result.effects.some((e) => e.type === 'persist_run_state' && 'status' in e && e.status === 'completed'),
      ).toBe(true);
    });

    it('COMPLETE non-existent phaseId throws', () => {
      const g = singleAgentGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      expect(() => transition(startResult.nextState, completeEvent('bad-id'), g)).toThrow(InvalidStateTransitionError);
    });

    it('COMPLETE non-active phaseId throws', () => {
      const g = linearTwoGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      expect(() => transition(startResult.nextState, completeEvent('n2'), g)).toThrow(InvalidStateTransitionError);
    });
  });

  describe('FORCE_END transition', () => {
    it('FORCE_END from running → terminated, pending/active nodes skipped', () => {
      const g = linearTwoGraph();
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      const result = transition(state, forceEndEvent, g);
      expect(result.nextState.status).toBe('terminated');
      const phases = narrowTerminated(result.nextState).phases;
      expect(phases['n1'].status).toBe('skipped');
      expect(phases['n2'].status).toBe('skipped');
    });

    it('FORCE_END from idle throws', () => {
      expect(() => transition({ status: 'idle' }, forceEndEvent, singleAgentGraph())).toThrow(
        InvalidStateTransitionError,
      );
    });
  });

  describe('Completed after all done', () => {
    it('linear 3-node: START → COMPLETE×3 → completed', () => {
      const g: TaskflowGraph = {
        name: 'triple',
        phases: [
          { id: 'n1', type: 'main' },
          { id: 'n2', type: 'main', dependsOn: ['n1'] },
          { id: 'n3', type: 'main', dependsOn: ['n2'] },
        ],
      };

      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;
      expect(state.status).toBe('running');

      state = transition(state, completeEvent('n1'), g).nextState;
      expect(state.status).toBe('running');

      state = transition(state, completeEvent('n2'), g).nextState;
      expect(state.status).toBe('running');

      const result = transition(state, completeEvent('n3'), g);
      expect(result.nextState.status).toBe('completed');
    });
  });

  describe('COMPLETE with skip', () => {
    it('skip: true → node status = skipped', () => {
      const g = singleAgentGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(
        startResult.nextState,
        { type: 'COMPLETE', phaseId: 'n1', durationMs: 10, skip: true },
        g,
      );
      expect(result.nextState.status).toBe('completed');
      const cs = result.nextState as Extract<FsmState, { status: 'completed' }>;
      expect(cs.phases['n1'].status).toBe('skipped');
    });
    it('skip: false → node status = done (normal)', () => {
      const g = singleAgentGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(
        startResult.nextState,
        { type: 'COMPLETE', phaseId: 'n1', durationMs: 10, skip: false },
        g,
      );
      expect(result.nextState.status).toBe('completed');
      const cs = result.nextState as Extract<FsmState, { status: 'completed' }>;
      expect(cs.phases['n1'].status).toBe('done');
    });

    it('skip absent → node status = done (backward compat)', () => {
      const g = singleAgentGraph();
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      const result = transition(startResult.nextState, { type: 'COMPLETE', phaseId: 'n1', durationMs: 10 }, g);
      // single-node graph → completed after node done
      expect(result.nextState.status).toBe('completed');
      const completedState = result.nextState as Extract<FsmState, { status: 'completed' }>;
      expect(completedState.phases['n1'].status).toBe('done');
    });

    it('skipped node unblocks downstream (counts as completed dep)', () => {
      const g: TaskflowGraph = {
        name: 'skip-chain',
        phases: [
          { id: 'n1', type: 'main' },
          { id: 'n2', type: 'main', dependsOn: ['n1'] },
        ],
      };
      const startResult = transition({ status: 'idle' }, startEvent(), g);

      // skip n1
      const afterSkip = transition(
        startResult.nextState,
        { type: 'COMPLETE', phaseId: 'n1', durationMs: 10, skip: true },
        g,
      );
      const phases = narrowRunning(afterSkip.nextState).phases;
      expect(phases['n1'].status).toBe('skipped');
      // n2 should be active (unblocked by n1 skipped)
      expect(phases['n2'].status).toBe('active');
    });
  });

  describe('Cascade-skip for OR-join', () => {
    it('OR-join node auto-skipped when all upstream skipped', () => {
      const g: TaskflowGraph = {
        name: 'or-join-cascade',
        phases: [
          { id: 'a', type: 'main' },
          { id: 'b', type: 'main' },
          { id: 'c', type: 'main', dependsOn: ['a', 'b'], join: 'any' },
        ],
      };
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // skip both upstream
      state = transition(state, { type: 'COMPLETE', phaseId: 'a', durationMs: 10, skip: true }, g).nextState;
      // b is still active, c should not be skipped yet (b is still pending → wait for b)
      const phases = narrowRunning(state).phases;
      expect(phases['c'].status).toBe('pending');

      state = transition(state, { type: 'COMPLETE', phaseId: 'b', durationMs: 10, skip: true }, g).nextState;
      // both upstream skipped → c cascade-skipped → all terminal → completed
      expect(state.status).toBe('completed');
      const completedState = state as Extract<FsmState, { status: 'completed' }>;
      expect(completedState.phases['c'].status).toBe('skipped');
    });

    it('OR-join node NOT skipped when one upstream done', () => {
      const g: TaskflowGraph = {
        name: 'or-join-partial',
        phases: [
          { id: 'a', type: 'main' },
          { id: 'b', type: 'main' },
          { id: 'c', type: 'main', dependsOn: ['a', 'b'], join: 'any' },
        ],
      };
      let state: FsmState = { status: 'idle' };
      state = transition(state, startEvent(), g).nextState;

      // a done normally, b skipped
      state = transition(state, { type: 'COMPLETE', phaseId: 'a', durationMs: 10 }, g).nextState;
      state = transition(state, { type: 'COMPLETE', phaseId: 'b', durationMs: 10, skip: true }, g).nextState;
      const phases = narrowRunning(state).phases;
      // c should be active (unblocked by a done + OR-join)
      expect(phases['c'].status).toBe('active');
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
      dispatchState(idleState(), completeEvent('n1'), singleAgentGraph());
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
      transition({ status: 'idle' }, completeEvent('n1'), singleAgentGraph());
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

    it('COMPLETE has optional skip flag', () => {
      const evSkip: FsmEvent = { type: 'COMPLETE', phaseId: 'n1', durationMs: 42, skip: true };
      if (evSkip.type === 'COMPLETE') {
        expect(evSkip.skip).toBe(true);
      }
      const evNoSkip: FsmEvent = { type: 'COMPLETE', phaseId: 'n2', durationMs: 99 };
      if (evNoSkip.type === 'COMPLETE') {
        expect(evNoSkip.skip).toBeUndefined();
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

    it('reset_upstream identifiable by type', () => {
      const eff: FsmEffect = {
        type: 'reset_upstream',
        runId: 'r1',
        fromNodeId: 'g1',
      };
      if (eff.type === 'reset_upstream') {
        expect(eff.runId).toBe('r1');
        expect(eff.fromNodeId).toBe('g1');
      } else {
        expect.fail('should be reset_upstream');
      }
    });

    it('reset_downstream identifiable by type', () => {
      const eff: FsmEffect = {
        type: 'reset_downstream',
        runId: 'r1',
        nodeId: 'n1',
      };
      if (eff.type === 'reset_downstream') {
        expect(eff.runId).toBe('r1');
        expect(eff.nodeId).toBe('n1');
      } else {
        expect.fail('should be reset_downstream');
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

    it('skipped state', () => {
      const ns: FsmNodeState = {
        status: 'skipped',
        retryCount: 0,
        completedAt: '2024-01-01T00:00:01Z',
      };
      expect(ns.status).toBe('skipped');
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
