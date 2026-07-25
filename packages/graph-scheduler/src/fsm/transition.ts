/**
 * FSM transition — pure function: state × event × graph → next state + effects.
 *
 * Layer 1 — highest-depth module in the FSM core. Four event paths, each with
 * independent state transition logic. Zero Effect dependency, zero I/O.
 *
 * Dependencies:
 * - Layer 1: fsm/events (FsmEvent), fsm/effects (FsmEffect)
 * - Layer 3: topology (resolveReady, findUpstream)
 *
 * @module
 */

import { randomUUID } from 'node:crypto';
import type { Phase } from '../schemas/index.js';
import { findDownstream, findUpstream, resolveReady } from '../topology.js';
import type { FsmEffect, FsmNodeState, FsmRunStatus } from './effects.js';
import type { FsmEvent } from './events.js';

// ---------------------------------------------------------------------------
// Types
/** Graph definition — name + phases, enough for topology and state init. */
export interface TaskflowGraph {
  readonly name: string;
  readonly phases: readonly Phase[];
}

/**
 * FSM run-level status — aligned with ADR 0020 state model.
 *
 * State machine legal-event matrix (see fsm/state-machine):
 *   idle       → START
 *   running    → COMPLETE, JUMP, FORCE_END
 *   completed  → (terminal)
 *   terminated → (terminal)
 */
export type FsmStatus = 'idle' | 'running' | 'completed' | 'terminated';

/**
 * FSM state — discriminated union on status.
 *
 * - idle: no run exists (initial state after createStateMachine)
 * - running: run active, at least one node active or pending
 * - completed: all nodes done (terminal)
 * - terminated: run force-ended (terminal)
 */
export type FsmState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'running';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      readonly startedAt: string;
    }
  | {
      readonly status: 'completed';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      readonly startedAt: string;
    }
  | {
      readonly status: 'terminated';
      readonly runId: string;
      readonly graphName: string;
      readonly phases: Record<string, FsmNodeState>;
      readonly startedAt: string;
    };

/**
 * Transition result — next state + side-effect declarations.
 * The api/ layer is responsible for executing effects[] in order.
 */
export interface TransitionResult {
  readonly nextState: FsmState;
  readonly effects: readonly FsmEffect[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build initial node states — all pending, first ready batch set to active. */
function initPhases(phases: readonly Phase[], startedAt: string): Record<string, FsmNodeState> {
  const map: Record<string, FsmNodeState> = {};
  for (const p of phases) {
    map[p.id] = { status: 'pending', retryCount: 0 };
  }
  const ready = resolveReady(phases, new Set());
  for (const p of ready) {
    map[p.id] = { ...map[p.id], status: 'active', startedAt };
  }
  return map;
}

/** Deep-clone the phases map so transition never mutates input state. */
function clonePhases(phases: Record<string, FsmNodeState>): Record<string, FsmNodeState> {
  const clone: Record<string, FsmNodeState> = {};
  for (const [id, ns] of Object.entries(phases)) {
    clone[id] = { ...ns };
  }
  return clone;
}

/** Collect completed phase ids from phases map. */
function completedIds(phases: Record<string, FsmNodeState>): Set<string> {
  return new Set(
    Object.entries(phases)
      .filter(([, ns]) => ns.status === 'done')
      .map(([id]) => id),
  );
}

/** Check if all phases are in a terminal node state (done or skipped). */
function allTerminal(phases: Record<string, FsmNodeState>): boolean {
  return Object.values(phases).every((ns) => ns.status === 'done' || ns.status === 'skipped');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure state transition — computes next FsmState and effects from current
 * state, event, and graph definition.
 *
 * Four event paths, each independent:
 * 1. START      — init run: all nodes pending, first ready batch active
 * 2. COMPLETE   — mark phase done, advance to next ready
 * 3. JUMP       — reset target + upstream to pending, re-activate ready
 * 4. FORCE_END  — all pending/active → skipped, run terminated
 *
 * @param state  current FSM state
 * @param event  dispatch event from api/ layer
 * @param graph  graph definition (phases + metadata)
 */
export function transition(state: FsmState, event: FsmEvent, graph: TaskflowGraph): TransitionResult {
  switch (event.type) {
    // ------------------------------------------------------------------
    // START — initialise a new run
    // ------------------------------------------------------------------
    case 'START': {
      if (state.status !== 'idle') {
        throw new InvalidStateTransitionError(state.status, 'START');
      }
      const runId = randomUUID();
      const startedAt = new Date().toISOString();
      const phases = initPhases(graph.phases, startedAt);
      const nextState: FsmState = {
        status: 'running',
        runId,
        graphName: graph.name,
        phases,
        startedAt,
      };

      const effects: FsmEffect[] = [{ type: 'persist_run_state', runId, status: 'running' }];
      for (const [nodeId, ns] of Object.entries(phases)) {
        effects.push({ type: 'persist_node_state', runId, nodeId, state: ns });
      }

      return { nextState, effects };
    }

    // ------------------------------------------------------------------
    // COMPLETE — normal node completion, advance to next
    // ------------------------------------------------------------------
    case 'COMPLETE': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'COMPLETE');
      }

      const nodeState = state.phases[event.phaseId];
      if (!nodeState) {
        throw new InvalidStateTransitionError(
          state.status,
          'COMPLETE',
          `Phase ${event.phaseId} not found in run ${state.runId}`,
        );
      }
      if (nodeState.status !== 'active') {
        throw new InvalidStateTransitionError(
          state.status,
          'COMPLETE',
          `Phase ${event.phaseId} is ${nodeState.status}, expected active`,
        );
      }

      const now = new Date().toISOString();
      const phases = clonePhases(state.phases);

      // Mark the completed node done
      phases[event.phaseId] = {
        ...nodeState,
        status: 'done',
        completedAt: now,
        durationMs: event.durationMs,
      };

      const effects: FsmEffect[] = [
        {
          type: 'persist_node_state',
          runId: state.runId,
          nodeId: event.phaseId,
          state: phases[event.phaseId],
        },
      ];

      // Find next ready nodes
      const doneSet = completedIds(phases);
      const ready = resolveReady(graph.phases, doneSet);

      if (ready.length === 0) {
        // No more ready nodes — check if all are terminal
        if (allTerminal(phases)) {
          const nextState: FsmState = {
            ...state,
            status: 'completed',
            phases,
          };
          effects.push({
            type: 'persist_run_state',
            runId: state.runId,
            status: 'completed',
          });
          return { nextState, effects };
        }
        // Ready is empty but not all terminal — waiting on active nodes
        // (e.g., parallel branches still running). Stay in running.
        return {
          nextState: { ...state, phases },
          effects,
        };
      }

      // Activate next ready nodes
      for (const p of ready) {
        phases[p.id] = {
          ...phases[p.id],
          status: 'active',
          startedAt: now,
        };
        effects.push({
          type: 'persist_node_state',
          runId: state.runId,
          nodeId: p.id,
          state: phases[p.id],
        });
      }

      return {
        nextState: { ...state, phases },
        effects,
      };
    }

    // ------------------------------------------------------------------
    // JUMP — reset target + downstream, re-activate from target
    // ------------------------------------------------------------------
    case 'JUMP': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'JUMP');
      }

      const phases = clonePhases(state.phases);
      const now = new Date().toISOString();

      // Find target phase and its upstream closure
      const upstreamIds = findUpstream(event.targetPhaseId, graph.phases);
      const resetSet = new Set([event.targetPhaseId, ...upstreamIds]);

      // Reset target + upstream to pending
      for (const id of resetSet) {
        const ns = phases[id];
        if (ns) {
          phases[id] = { status: 'pending', retryCount: 0 };
        }
      }

      // Reset downstream nodes (transitively depend on target) to pending
      // so the FSM state snapshot is correct immediately, not just DB via effects.
      const downstreamIds = findDownstream(event.targetPhaseId, graph.phases);
      for (const id of downstreamIds) {
        if (!resetSet.has(id)) {
          const ns = phases[id];
          if (ns && (ns.status === 'done' || ns.status === 'active' || ns.status === 'skipped')) {
            phases[id] = { status: 'pending', retryCount: 0 };
          }
        }
      }

      // Activate ready nodes among the reset set
      const doneSet = completedIds(phases);
      const ready = resolveReady(graph.phases, doneSet);

      const effects: FsmEffect[] = [
        {
          type: 'reset_upstream',
          runId: state.runId,
          fromNodeId: event.targetPhaseId,
        },
        {
          type: 'reset_downstream',
          runId: state.runId,
          nodeId: event.targetPhaseId,
        },
      ];

      for (const p of ready) {
        phases[p.id] = {
          ...phases[p.id],
          status: 'active',
          startedAt: now,
        };
        effects.push({
          type: 'persist_node_state',
          runId: state.runId,
          nodeId: p.id,
          state: phases[p.id],
        });
      }

      const nextState: FsmState = {
        status: 'running',
        runId: state.runId,
        graphName: state.graphName,
        phases,
        startedAt: state.startedAt,
      };

      effects.push({
        type: 'persist_run_state',
        runId: state.runId,
        status: 'running',
      });

      return { nextState, effects };
    }

    // ------------------------------------------------------------------
    // FORCE_END — skip all unfinished, terminate run
    // ------------------------------------------------------------------
    case 'FORCE_END': {
      if (state.status !== 'running') {
        throw new InvalidStateTransitionError(state.status, 'FORCE_END');
      }

      const phases = clonePhases(state.phases);
      const now = new Date().toISOString();
      const effects: FsmEffect[] = [];

      // Skip all nodes that are not in a terminal state
      for (const [nodeId, ns] of Object.entries(phases)) {
        if (ns.status === 'pending' || ns.status === 'active') {
          phases[nodeId] = {
            ...ns,
            status: 'skipped',
            completedAt: now,
          };
          effects.push({
            type: 'persist_node_state',
            runId: state.runId,
            nodeId,
            state: phases[nodeId],
          });
        }
      }

      const nextState: FsmState = {
        status: 'terminated',
        runId: state.runId,
        graphName: state.graphName,
        phases,
        startedAt: state.startedAt,
      };

      effects.unshift({
        type: 'persist_run_state',
        runId: state.runId,
        status: 'terminated',
      });

      return { nextState, effects };
    }

    default: {
      const _exhaustive: never = event;
      throw new InvalidStateTransitionError(
        'unknown',
        (_exhaustive as FsmEvent).type,
        `Unknown event type: ${(_exhaustive as FsmEvent).type}`,
      );
    }
  }
}

/**
 * Thrown when an event is dispatched in an illegal state or when
 * a phase validation fails (missing phase, wrong status).
 *
 * Caught by the api/ layer and state-machine.dispatch().
 *
 * @param currentStatus  run-level FSM status at time of error
 * @param eventType      event type that triggered the error
 * @param message        optional custom message; auto-generated from status+event if omitted
 */
export class InvalidStateTransitionError extends Error {
  public readonly _tag = 'InvalidStateTransitionError';

  constructor(
    public readonly currentStatus: string,
    public readonly eventType: string,
    message?: string,
  ) {
    super(message ?? `Illegal transition: cannot dispatch ${eventType} from state ${currentStatus}`);
    this.name = 'InvalidStateTransitionError';
  }
}
