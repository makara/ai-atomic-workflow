/**
 * Database initialization — versioned migration ladder.
 *
 * Tracks applied version in a `schema_version` meta-table.
 * v1: original full schema (graph_runs + node_states + topo index).
 * v2: final shape — routes column + unused-field cleanup (topo_order / topo
 * index / applied_at dropped). mode/constraints never shipped in any version.
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
 * Interim-V2 column drop — dev databases that ran the interim V2 (which
 * shipped mode + constraints columns before the activation-prologue redesign)
 * drop the two columns; routes stays (still a V2 feature). Idempotent by
 * column existence check — fresh databases have no columns and skip. Runs
 * before the version ladder so repaired DBs then proceed normally.
 */
function dropInterimV2RunColumns(db: ReturnType<typeof Database>): void {
  const rows = db.prepare(`SELECT name FROM pragma_table_info('graph_runs')`).all() as Array<{ name: string }>;
  const names = new Set(rows.map((r) => r.name));
  const dropped: string[] = [];
  for (const col of ['mode', 'constraints']) {
    if (names.has(col)) {
      db.exec(`ALTER TABLE graph_runs DROP COLUMN ${col}`);
      dropped.push(col);
    }
  }
  if (dropped.length > 0) {
    debugLog('runtime', { event: 'migration_local_repair', dropped });
  }
}

/**
 * Initialize the database up to SCHEMA_VERSION.
 *
 * Idempotent — no-op once the applied version is >= SCHEMA_VERSION.
 * Applies versioned DDL ladders inside one transaction per version.
 * Runs the stripped-column repair on every init (cheap existence checks).
 *
 * @param db — open libsql Database handle
 * @returns Effect that completes when the database is initialized
 */
export function migrate(db: ReturnType<typeof Database>): Effect.Effect<void, PersistenceError> {
  return Effect.gen(function* () {
    const version = yield* currentVersion(db);

    yield* tryDb('migrate_interim_v2_drop', () => dropInterimV2RunColumns(db));

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
