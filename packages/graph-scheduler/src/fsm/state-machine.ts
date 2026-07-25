/**
 * FSM state machine engine — event validation + transition delegation.
 *
 * Layer 1 — thin wrapper around transition(). Core logic is event legality
 * checking per the state×event matrix. Zero Effect dependency, zero I/O.
 *
 * Dependencies:
 * - Layer 1: fsm/transition (transition, FsmState, TransitionResult, TaskflowGraph)
 * - Layer 1: fsm/events (FsmEvent)
 *
 * @module
 */

import type { FsmEvent } from './events.js';
import {
  InvalidStateTransitionError,
  transition,
  type FsmState,
  type TaskflowGraph,
  type TransitionResult,
} from './transition.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * State machine handle — returned by createStateMachine().
 *
 * dispatch() validates the event against the current state, delegates to
 * transition(), updates internal state, and returns the result.
 * getState() returns a read-only snapshot of the current FSM state.
 */
export interface IStateMachine {
  /** Dispatch an event — validates, transitions, updates internal state. */
  dispatch(event: FsmEvent): TransitionResult;

  /** Return a read-only snapshot of the current FSM state. */
  getState(): FsmState;
}

// ---------------------------------------------------------------------------
// Event legality matrix
// ---------------------------------------------------------------------------

/**
 * State × event legality map.
 *
 * | current    | legal events                  |
 * |------------|-------------------------------|
 * | idle       | START                         |
 * | running    | COMPLETE, JUMP, FORCE_END     |
 * | completed  | (terminal — no events)        |
 * | terminated | (terminal — no events)        |
 */
const LEGAL_EVENTS: Record<string, ReadonlySet<string>> = {
  idle: new Set(['START']),
  running: new Set(['COMPLETE', 'JUMP', 'FORCE_END']),
  completed: new Set(),
  terminated: new Set(),
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new FSM state machine instance.
 *
 * Default initial state is `{ status: 'idle' }`. An optional `initialState`
 * can be passed to reconstruct state from persistence (e.g., for
 * graphAdvance/graphJump/graphForceEnd). The machine holds the current
 * state internally and updates it on each dispatch() call.
 *
 * The graph is passed through to transition() on every dispatch.
 *
 * @param graph         graph definition (phases + metadata)
 * @param initialState  optional initial FSM state; defaults to `{ status: 'idle' }`
 * @returns state machine handle with dispatch() and getState()
 */
export function createStateMachine(graph: TaskflowGraph, initialState?: FsmState): IStateMachine {
  let currentState: FsmState = initialState ?? { status: 'idle' };

  return {
    dispatch(event: FsmEvent): TransitionResult {
      // Validate event legality
      const legal = LEGAL_EVENTS[currentState.status];
      if (!legal || !legal.has(event.type)) {
        throw new InvalidStateTransitionError(currentState.status, event.type);
      }

      // Delegate to pure transition
      const result = transition(currentState, event, graph);

      // Update internal state
      currentState = result.nextState;

      return result;
    },

    getState(): FsmState {
      return currentState;
    },
  };
}
