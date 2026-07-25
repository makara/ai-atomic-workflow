/**
 * Shared DB helpers — extracted from repository.ts and migration.ts.
 *
 * Single tryDb() wrapper used by all db/ modules to isolate
 * synchronous libsql operations in Effect with typed PersistenceError.
 *
 * @module
 */

import { Effect } from 'effect';
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
