/**
 * Database initialization — single consolidated version.
 *
 * Tracks applied version in a `schema_version` meta-table.
 * v1: full schema (graph_runs + node_states + topo index). Fresh databases
 * initialize in one step; older databases are disposable run state and are
 * never upgraded (release recreates them).
 *
 * @module
 */

import { Effect } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { SCHEMA_VERSION, V1_DDL } from './schema.js';

/** Ensure the schema_version meta-table exists (idempotent). */
function ensureVersionTable(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

/**
 * Query the currently applied schema version.
 *
 * Returns 0 if the version table is empty (fresh database).
 *
 * @param db — open libsql Database handle
 * @returns Effect yielding the current version number
 */
export function currentVersion(db: ReturnType<typeof Database>): Effect.Effect<number, PersistenceError> {
  return tryDb('currentVersion', () => {
    ensureVersionTable(db);
    const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as
      { version: number | null } | undefined;
    return row?.version ?? 0;
  });
}

/**
 * Initialize the database up to SCHEMA_VERSION.
 *
 * Idempotent — no-op once the applied version is >= SCHEMA_VERSION.
 * Runs inside a transaction.
 *
 * @param db — open libsql Database handle
 * @returns Effect that completes when the database is initialized
 */
export function migrate(db: ReturnType<typeof Database>): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    const version = yield* currentVersion(db);

    if (version >= SCHEMA_VERSION) {
      debugLog('runtime', { event: 'migration_already_current', version, target: SCHEMA_VERSION });
      return;
    }

    // Single consolidated init — no versioned migration ladder (databases are disposable run state).
    yield* tryDb('migrate_v1', () => {
      db.transaction(() => {
        for (const ddl of V1_DDL) {
          db.exec(ddl);
        }
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
      })();
    });
    debugLog('runtime', { event: 'migration_applied', from: version, to: 1 });

    debugLog('runtime', { event: 'migration_complete', version: SCHEMA_VERSION });
  });
}
