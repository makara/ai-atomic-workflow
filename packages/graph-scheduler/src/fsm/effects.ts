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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-node FSM state — canonical NodeState sans runId (FSM is run-scoped). */
export type FsmNodeState = Omit<NodeState, 'runId'>;

/** Run-level status values used by persist_run_state effect. */
export type FsmRunStatus = 'running' | 'completed' | 'terminated';

// ---------------------------------------------------------------------------
// FsmEffect
// ---------------------------------------------------------------------------

/**
 * FSM side-effect descriptor — 3 kinds of work the api/ layer must carry out.
 *
 * - persist_node_state: write a single node's state to node_states table
 * - persist_run_state: update the run-level status in graph_runs table
 * - reset_upstream: reset all upstream nodes of a node to pending (jump retry)
 * - reset_downstream: reset a node and its downstream dependents to pending (jump)
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
    }
  | {
      readonly type: 'reset_upstream';
      readonly runId: string;
      readonly fromNodeId: string;
    }
  | {
      readonly type: 'reset_downstream';
      readonly runId: string;
      readonly nodeId: string;
    };
