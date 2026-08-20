/**
 * Shared DB helpers — extracted from repository.ts and migration.ts.
 *
 * Single tryDb() wrapper used by all db/ modules to isolate
 * synchronous libsql operations in Effect with typed PersistenceError.
 *
 * @module
 */

import { Effect } from 'effect';
import type Database from 'libsql';
import type { PersistenceError } from '../../types.js';

/**
 * Wrap a synchronous libsql operation in an Effect with typed PersistenceError.
 *
 * @param operation — name for error attribution (e.g. 'createRun')
 * @param fn        — synchronous function to execute inside Effect.try
 */
export function tryDb<A>(operation: string, fn: () => A): Effect.Effect<A, PersistenceError> {
  return Effect.try({
    try: fn,
    catch: (cause): PersistenceError => ({
      _tag: 'PersistenceError',
      operation,
      message: cause instanceof Error ? cause.message : String(cause),
      cause,
    }),
  });
}

/**
 * Cascade-delete a thread's checkpoint rows (checkpoint_writes then
 * checkpoints) — the single cleanup implementation shared by the
 * checkpoint saver and the repository.
 *
 * Runs the two statements inline so callers control atomicity: the saver
 * wraps the call in `db.transaction(...)`; the repository calls it inside
 * its own delete transaction (never nests a transaction).
 *
 * @param db       — open libsql Database handle
 * @param threadId — the checkpoint thread id (same logical id as graph_runs.run_id)
 */
export function deleteThreadCascade(db: ReturnType<typeof Database>, threadId: string): void {
  db.prepare('DELETE FROM checkpoint_writes WHERE thread_id = ?').run(threadId);
  db.prepare('DELETE FROM checkpoints WHERE thread_id = ?').run(threadId);
}
