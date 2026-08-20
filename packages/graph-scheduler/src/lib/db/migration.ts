/**
 * Database initialization — single final shape.
 *
 * No versioned migration ladder, no version meta-table, no interim repair
 * steps: history lives in git and ADRs, not in the DB bootstrap. The final
 * DDL (graph_runs + checkpoint store) is applied idempotently (CREATE TABLE
 * IF NOT EXISTS); existing databases whose shape matches the final DDL are
 * left untouched.
 *
 * @module
 */

import { Effect } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { FINAL_DDL } from './schema.js';

/**
 * Initialize the database to the single final shape.
 *
 * Idempotent — the final DDL uses CREATE TABLE IF NOT EXISTS; a database
 * already at the final shape is left untouched.
 *
 * @param db — open libsql Database handle
 * @returns Effect that completes when the database is initialized
 */
export function migrate(db: ReturnType<typeof Database>): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    yield* tryDb('migrate_apply_final_ddl', () => {
      db.transaction(() => {
        for (const statement of FINAL_DDL) {
          db.exec(statement);
        }
      })();
    });

    debugLog('runtime', { event: 'migration_complete', shape: 'final' });
  });
}
