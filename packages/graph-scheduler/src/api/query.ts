/**
 * API Query — 2 read operations as Effect generators.
 *
 * Layer 2 — pure delegation to lib/db/repository. Zero write side effects.
 *
 * Dependencies:
 * - Layer 3: lib/db/repository (GraphRepository), types (SchedulerError)
 * - Internal: api/crud (IGraphSnapshot)
 *
 * @module
 */

import { Effect } from 'effect';

import type { NodeStateEntry } from '../lib/db/repository.js';
import { GraphRepository } from '../lib/db/repository.js';
import type { PersistenceError, SchedulerError } from '../types.js';
import type { IGraphSnapshot } from './crud.js';
import { aggregateNodeMetrics } from './crud.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a full GraphSnapshot from a repository GraphRun + NodeStateEntry array.
 * Delegates metric computation to shared aggregateNodeMetrics from crud.ts.
 */
function buildFullSnapshot(
  runId: string,
  graphName: string,
  fsmState: string,
  nodeStates: ReadonlyArray<NodeStateEntry>,
): IGraphSnapshot {
  const nodes = nodeStates.map((ns) => ({ nodeId: ns.nodeId, status: ns.status }));
  const metrics = aggregateNodeMetrics(nodes, fsmState);

  return {
    runId,
    graphName,
    fsmState,
    currentPhaseId: metrics.currentPhaseId,
    nodeCount: metrics.nodeCount,
    completedCount: metrics.completedCount,
    failedCount: metrics.failedCount,
    updatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Public API — read operations
// ---------------------------------------------------------------------------

/**
 * Get the full status snapshot of a graph run.
 *
 * Loads run + all node states from persistence and returns a unified snapshot.
 *
 * @param runId — run identifier
 */
export function graphStatus(runId: string): Effect.Effect<IGraphSnapshot, SchedulerError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;

    const run = yield* repo.getRun(runId);

    const nodeStates = yield* repo.getNodeStates(runId);

    return buildFullSnapshot(run.runId, run.graphName, run.fsmState, nodeStates);
  });
}

/**
 * List all graph runs — newest first, summary only.
 *
 * Pure delegation to repository.listRuns().
 */
export function graphList(): Effect.Effect<
  ReadonlyArray<{
    readonly runId: string;
    readonly graphName: string;
    readonly fsmState: string;
    readonly createdAt: string;
    readonly updatedAt: string;
  }>,
  PersistenceError,
  GraphRepository
> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    return yield* repo.listRuns();
  });
}
