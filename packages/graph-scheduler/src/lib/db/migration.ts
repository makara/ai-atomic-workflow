/**
 * Database initialization — single final shape.
 *
 * No versioned migration ladder, no interim repair steps: history lives in
 * git and ADRs, not in the DB bootstrap. `SCHEMA_VERSION = 1` with one final
 * DDL applied idempotently (CREATE TABLE IF NOT EXISTS). The schema_version
 * meta-table records the applied version; existing databases whose shape
 * matches the final DDL are left untouched.
 *
 * @module
 */

import { Effect } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { FINAL_DDL, SCHEMA_VERSION } from './schema.js';

/** Ensure the schema_version meta-table exists (idempotent). */
function ensureVersionTable(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
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
 * Initialize the database to the single final shape.
 *
 * Idempotent — the final DDL uses CREATE TABLE IF NOT EXISTS; a database
 * already at the final shape is left untouched and the version row is
 * recorded once. No ladder, no repair steps, no legacy upgrade paths.
 *
 * @param db — open libsql Database handle
 * @returns Effect that completes when the database is initialized
 */
export function migrate(db: ReturnType<typeof Database>): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    const version = yield* currentVersion(db);

    yield* tryDb('migrate_apply_final_ddl', () => {
      db.transaction(() => {
        for (const statement of FINAL_DDL) {
          db.exec(statement);
        }
        if (version === 0) {
          db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(SCHEMA_VERSION);
        }
      })();
    });

    debugLog('runtime', { event: 'migration_complete', version: SCHEMA_VERSION, from: version });
  });
}
