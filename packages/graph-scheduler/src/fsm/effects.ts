/**
 * FSM effects — 3 side-effect descriptors emitted by transition().
 *
 * Layer 1 — pure type definitions, zero Effect dependency, zero I/O.
 * FSM core never executes effects; it only declares them. The api/ layer
 * iterates effects[] and calls the corresponding lib/ modules.
 *
 * @module
 */
import type { NodeState } from '../schemas/index.js';

/** Per-node FSM state — canonical NodeState sans runId (FSM is run-scoped). */
export type FsmNodeState = Omit<NodeState, 'runId'>;

/** Run-level status values used by persist_run_state effect.
 *  Derived from FsmStatus (transition.ts) — single source, no parallel enum.
 *  idle excluded: only running/completed/terminated ever reach persistence. */
export type FsmRunStatus = Exclude<import('./transition.js').FsmStatus, 'idle'>;

/**
 * FSM side-effect descriptor — 2 kinds of work the api/ layer must carry out.
 *
 * - persist_node_state: write a single node's state to node_states table
 * - persist_run_state: update the run-level status (and route activation
 *   map, route-first redesign — route-aware readiness survives reconstruction)
 *   in graph_runs table
 *
 * Jump resets (target + downstream) persist via persist_node_state with the
 * in-memory retryCount increment — no separate reset effect types.
 */
export type FsmEffect =
  | {
      readonly type: 'persist_node_state';
      readonly runId: string;
      readonly nodeId: string;
      readonly state: FsmNodeState;
    }
  | {
      readonly type: 'persist_run_state';
      readonly runId: string;
      readonly status: FsmRunStatus;
      /** route activation map (routeId → activating node id) — persisted for reconstruction */
      readonly routes?: Readonly<Record<string, string>>;
    };
