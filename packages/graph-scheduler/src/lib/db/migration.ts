/**
 * Versioned database migration — forward-only, idempotent v1 init.
 *
 * Tracks applied version in a `schema_version` meta-table.
 * Each migration step is a DDL array executed in order;
 * run from current version up to SCHEMA_VERSION.
 *
 * @module
 */

import { Effect } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { SCHEMA_VERSION, V1_DDL, V2_DDL, V3_DDL } from './schema.js';

/** Ensure the schema_version meta-table exists (idempotent). */
function ensureVersionTable(db: ReturnType<typeof Database>): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);
}

// ---------------------------------------------------------------------------
// Public functions
// ---------------------------------------------------------------------------

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
 * Apply all pending forward migrations up to SCHEMA_VERSION.
 *
 * Idempotent — skips already-applied versions. Each migration
 * runs inside a transaction.
 *
 * @param db — open libsql Database handle
 * @returns Effect that completes when migrations are up to date
 */
export function migrate(db: ReturnType<typeof Database>): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    const version = yield* currentVersion(db);

    if (version >= SCHEMA_VERSION) {
      debugLog('runtime', { event: 'migration_already_current', version, target: SCHEMA_VERSION });
      return;
    }

    // v1: initial schema
    if (version < 1) {
      yield* tryDb('migrate_v1', () => {
        db.transaction(() => {
          for (const ddl of V1_DDL) {
            db.exec(ddl);
          }
          db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
        })();
      });
      debugLog('runtime', { event: 'migration_applied', from: version, to: 1 });
    }

    // v2: add error column to node_states (idempotent — may already exist from pre-fix V1)
    if (version < 2) {
      yield* tryDb('migrate_v2', () => {
        // Check if error column already exists (e.g. from V1 before schema.ts fix)
        const cols = db.prepare("PRAGMA table_info('node_states')").all() as ReadonlyArray<{ name: string }>;
        const hasError = cols.some((c) => c.name === 'error');
        if (!hasError) {
          db.exec(V2_DDL[0]);
        }
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (2, ?)').run(new Date().toISOString());
      });
      debugLog('runtime', { event: 'migration_applied', from: version, to: 2 });
    }

    // v3: drop output and error columns — graph-scheduler tracks topology only
    if (version < 3) {
      yield* tryDb('migrate_v3', () => {
        // Check if output column exists (may have been added by V1)
        const cols = db.prepare("PRAGMA table_info('node_states')").all() as ReadonlyArray<{ name: string }>;
        const hasOutput = cols.some((c) => c.name === 'output');
        const hasError = cols.some((c) => c.name === 'error');
        if (hasOutput) db.exec(V3_DDL[0]);
        if (hasError) db.exec(V3_DDL[1]);
        db.prepare('INSERT INTO schema_version (version, applied_at) VALUES (3, ?)').run(new Date().toISOString());
      });
      debugLog('runtime', { event: 'migration_applied', from: version, to: 3 });
    }

    debugLog('runtime', { event: 'migration_complete', version: SCHEMA_VERSION });
  });
}
