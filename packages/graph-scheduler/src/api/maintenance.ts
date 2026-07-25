/**
 * API Maintenance — 3 maintenance operations as Effect generators.
 *
 * Layer 2 — delegates to lib/db/repository (DAO) and lib/db/migration (DDL).
 *
 * Dependencies:
 * - Layer 3: lib/db/repository (GraphRepository), types (PersistenceError)
 *
 * @module
 */

import { Effect } from 'effect';

import { GraphRepository } from '../lib/db/repository.js';
import type { PersistenceError, SchedulerError } from '../types.js';

// ---------------------------------------------------------------------------
// Public API — maintenance operations
// ---------------------------------------------------------------------------

/**
 * Initialise the database schema — ensure tables exist (idempotent).
 *
 * Delegates to repository.initialize() which runs forward-only versioned
 * migrations. Safe to call multiple times.
 */
export function graphInit(): Effect.Effect<void, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    yield* repo.initialize();
  });
}

/**
 * Clean completed graph runs.
 *
 * Deletes all runs with fsm_state = 'completed'. If `before` is provided,
 * only deletes runs whose updated_at is before the given ISO timestamp.
 *
 * @param before — optional ISO 8601 cutoff; runs updated before this are deleted
 * @returns number of runs deleted
 */
export function cleanCompleted(before?: string): Effect.Effect<number, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    return yield* repo.deleteCompletedRuns(before);
  });
}

/**
 * Clean all graph runs — deletes every run and their node states.
 *
 * @returns number of runs deleted
 */
export function cleanAll(): Effect.Effect<number, PersistenceError, GraphRepository> {
  return Effect.gen(function* () {
    const repo = yield* GraphRepository;
    const runs = yield* repo.listRuns();

    let count = 0;
    for (const run of runs) {
      yield* repo.deleteRun(run.runId);
      count++;
    }

    return count;
  });
}
