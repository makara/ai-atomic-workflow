/**
 * FSM event legality — pure validation helper.
 *
 * Layer 1 — checks a state×event pair against the legality matrix before
 * dispatch. The actual transition logic lives in transition(); this module
 * only answers "is this event legal in this state?". Zero Effect dependency,
 * zero I/O, no mutable state.
 *
 * @module
 */

import { InvalidStateTransitionError } from './transition.js';

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

/**
 * Check whether an event type is legal in a given run state.
 *
 * Callers run this check before calling transition() — fail-fast with a
 * clear error instead of letting transition() reject mid-dispatch.
 *
 * @param status    current run status (FsmStatus value)
 * @param eventType event type to check
 * @returns true when the event is legal in the given state
 */
export function isLegalTransition(status: string, eventType: string): boolean {
  const legal = LEGAL_EVENTS[status];
  return legal !== undefined && legal.has(eventType);
}

/**
 * Validate an event against the current state, throwing
 * InvalidStateTransitionError when illegal.
 *
 * Convenience wrapper over isLegalTransition for dispatch paths that want
 * the error thrown at the call site (e.g. Effect.suspend boundaries).
 */
export function assertLegalTransition(status: string, eventType: string): void {
  if (!isLegalTransition(status, eventType)) {
    throw new InvalidStateTransitionError(status, eventType);
  }
}
