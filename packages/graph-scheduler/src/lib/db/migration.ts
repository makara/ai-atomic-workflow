/**
 * Database initialization — versioned migration ladder.
 *
 * Tracks applied version in a `schema_version` meta-table.
 * v1: original full schema (graph_runs + node_states + topo index).
 * v2: final shape — mode + routes columns, unused-field cleanup (topo_order /
 * topo index / applied_at dropped).
 * Fresh databases apply the ladder in one pass; existing databases upgrade
 * only the missing versions (idempotent).
 *
 * @module
 */

import { Effect } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { SCHEMA_VERSION, VERSIONED_DDL } from './schema.js';

/** Ensure the schema_version meta-table exists (idempotent). */
function ensureVersionTable(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT
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
 * Applies versioned DDL ladders inside one transaction per version.
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

    // Versioned ladder — apply each missing version in order.
    for (let v = version; v < SCHEMA_VERSION; v++) {
      const ddl = VERSIONED_DDL[v] ?? [];
      yield* tryDb(`migrate_v${v + 1}`, () => {
        db.transaction(() => {
          for (const statement of ddl) {
            db.exec(statement);
          }
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(v + 1);
        })();
      });
      debugLog('runtime', { event: 'migration_applied', from: version, to: v + 1 });
    }

    debugLog('runtime', { event: 'migration_complete', version: SCHEMA_VERSION });
  });
}
