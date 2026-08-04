/**
 * API FSM Reconstruct — FSM state reconstruction and effects execution.
 *
 * Extracted from crud.ts.
 * Reconstructs FsmState from persisted DB rows and executes FSM effects
 * (persist state, jump resets persist via persist_node_state).
 *
 * @module
 */

import { Effect } from 'effect';
import type { FsmEffect, FsmNodeState } from '../fsm/effects.js';
import type { FsmState, TaskflowGraph } from '../fsm/transition.js';
import { GraphRepository, type GraphRun, type NodeStateEntry, type NodeStateUpdate } from '../lib/db/repository.js';
import { NodeStateSchema } from '../schemas/index.js';
import type { PersistenceError } from '../types.js';

/**
 * Valid FsmNodeState status values — runtime guard. Single authority:
 * derived from NodeStateSchema.status, which mirrors FSM production points
 * (pending/active/done/aborted). 'blocked' was never FSM-produced (run-level
 * legacy only, normalized to running below).
 */
const VALID_NODE_STATUSES: ReadonlySet<string> = new Set(NodeStateSchema.shape.status.options);

/** Reconstruct an FsmState from persisted run + node states. */
export function reconstructFsmState(
  run: GraphRun,
  nodeStates: ReadonlyArray<NodeStateEntry>,
): Effect.Effect<FsmState, PersistenceError> {
  return Effect.gen(function* () {
    const phases: Record<string, FsmNodeState> = {};
    for (const ns of nodeStates) {
      if (!VALID_NODE_STATUSES.has(ns.status)) {
        return yield* Effect.fail<PersistenceError>({
          _tag: 'PersistenceError',
          operation: 'reconstructFsmState',
          message: `Unknown node status "${ns.status}" for node "${ns.nodeId}"`,
        });
      }
      phases[ns.nodeId] = {
        status: ns.status as FsmNodeState['status'],
        retryCount: ns.retryCount,
        startedAt: ns.startedAt ?? undefined,
        completedAt: ns.completedAt ?? undefined,
      };
    }

    switch (run.fsmState) {
      case 'running':
        return {
          status: 'running',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          routes: run.routes,
          startedAt: run.createdAt,
        };
      case 'blocked':
        // Map legacy 'blocked' runs to 'running' — 'blocked' removed from FsmState
        return {
          status: 'running',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          routes: run.routes,
          startedAt: run.createdAt,
        };
      case 'terminated':
        return {
          status: 'terminated',
          runId: run.runId,
          graphName: run.graphName,
          phases,
          routes: run.routes,
          startedAt: run.createdAt,
        };
      default:
        return yield* Effect.fail<PersistenceError>({
          _tag: 'PersistenceError',
          operation: 'reconstructFsmState',
          message: `Unknown fsmState: ${run.fsmState}`,
        });
    }
  });
}

/**
 * Execute all FSM effects in order — delegates to GraphRepository.
 *
 * - persist_node_state → repo.updateNodeState
 * - persist_run_state  → repo.updateRunStatus
 */
export function executeEffects(
  effects: readonly FsmEffect[],
  repo: GraphRepository['Type'],
  _graph: TaskflowGraph,
): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    for (const effect of effects) {
      switch (effect.type) {
        case 'persist_node_state': {
          const update: NodeStateUpdate = {
            status: effect.state.status,
            retryCount: effect.state.retryCount,
            startedAt: effect.state.startedAt,
            completedAt: effect.state.completedAt,
          };
          yield* repo.updateNodeState(effect.runId, effect.nodeId, update);
          break;
        }
        case 'persist_run_state': {
          yield* repo.updateRunStatus(effect.runId, effect.status, effect.routes);
          break;
        }
      }
    }
  });
}
