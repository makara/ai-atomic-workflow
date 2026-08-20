/**
 * Unit tests for lib/db/repository.ts — direct DAO CRUD operations.
 *
 * Uses :memory: libsql for isolation. Tests run-record CRUD round-trips,
 * checkpoint cascade deletion, list/cleanup maintenance, and idempotent
 * initialization. The node_states table and its routes column are gone
 * (syntax v2): execution state lives in LangGraph checkpoints, managed by
 * the adapter — this DAO owns run records only.
 *
 * No Effect Layer wiring needed — buildService + Effect.runPromise directly.
 *
 * @module
 */
import { Effect } from 'effect';
import Database from 'libsql';
import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from '../../src/lib/db/migration.js';
import { buildService, type GraphRepository } from '../../src/lib/db/repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Unwrap a domain error's _tag from an Effect failure. */
function errorTag(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  try {
    const p = JSON.parse(err.message);
    return ((p as Record<string, unknown>)?._tag as string) ?? null;
  } catch {
    return null;
  }
}

/** Create an isolated in-memory repo for each test. */
function makeRepo(): GraphRepository['Type'] {
  const db = new Database(':memory:');
  // Run migration synchronously (DDL is fast, no I/O wait).
  Effect.runSync(migrate(db));
  return buildService(db);
}

/** Simulate LangGraph checkpoint state for a run thread. */
function seedCheckpoint(db: ReturnType<typeof Database>, runId: string, checkpointId = 'cp1'): void {
  db.prepare(
    `INSERT INTO checkpoints (thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id, type, checkpoint, metadata, created_at)
     VALUES (?, '', ?, NULL, 'json', '{}', '{}', ?)`,
  ).run(runId, checkpointId, '2026-08-01T00:00:00.000Z');
  db.prepare(
    `INSERT INTO checkpoint_writes (thread_id, checkpoint_ns, checkpoint_id, task_id, idx, channel, type, value)
     VALUES (?, '', ?, 'task1', 0, 'nodeStatus', 'json', '{}')`,
  ).run(runId, checkpointId);
}

// ---------------------------------------------------------------------------
// createRun + getRun + updateRunStatus + deleteRun — CRUD round-trip
// ---------------------------------------------------------------------------

describe('run CRUD round-trip', () => {
  let repo = makeRepo();

  afterEach(() => {
    // Fresh repo for isolation — recreate each test.
    repo = makeRepo();
  });

  it('createRun → getRun returns the inserted run', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph', { key: 'val' }));
    const run = await Effect.runPromise(repo.getRun('r1'));

    expect(run.runId).toBe('r1');
    expect(run.graphName).toBe('test-graph');
    expect(run.fsmState).toBe('idle');
    expect(run.args).toEqual({ key: 'val' });
    expect(run.createdAt).toBeDefined();
    expect(run.updatedAt).toBeDefined();
  });

  it('updateRunStatus changes fsmState', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.updateRunStatus('r1', 'running'));

    const run = await Effect.runPromise(repo.getRun('r1'));
    expect(run.fsmState).toBe('running');
  });

  it('deleteRun removes the run', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.deleteRun('r1'));

    await expect(Effect.runPromise(repo.getRun('r1'))).rejects.toThrow();
  });

  it('deleteRun cascades — checkpoint rows removed with the run', async () => {
    const db = new Database(':memory:');
    Effect.runSync(migrate(db));
    const repo = buildService(db);
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    seedCheckpoint(db, 'r1');

    await Effect.runPromise(repo.deleteRun('r1'));

    const cps = db.prepare('SELECT COUNT(*) AS n FROM checkpoints WHERE thread_id = ?').get('r1') as { n: number };
    expect(cps.n).toBe(0);
    const writes = db.prepare('SELECT COUNT(*) AS n FROM checkpoint_writes WHERE thread_id = ?').get('r1') as {
      n: number;
    };
    expect(writes.n).toBe(0);
    await expect(Effect.runPromise(repo.getRun('r1'))).rejects.toThrow();
  });

  it('getRun for nonexistent id throws PersistenceError', async () => {
    try {
      await Effect.runPromise(repo.getRun('nonexistent'));
      expect.unreachable('expected error');
    } catch (err) {
      expect(errorTag(err)).toBe('PersistenceError');
    }
  });
});

// ---------------------------------------------------------------------------
// listRuns — ordering and filtering
// ---------------------------------------------------------------------------

describe('listRuns', () => {
  let repo = makeRepo();

  afterEach(() => {
    repo = makeRepo();
  });

  it('listRuns returns all created runs', async () => {
    await Effect.runPromise(repo.createRun('r1', 'graph-a'));
    await Effect.runPromise(repo.createRun('r2', 'graph-b'));

    const runs = await Effect.runPromise(repo.listRuns());
    expect(runs.length).toBeGreaterThanOrEqual(2);
    const ids = runs.map((r: { runId: string }) => r.runId);
    expect(ids).toContain('r1');
    expect(ids).toContain('r2');
  });

  it('listRuns returns empty when no runs', async () => {
    const runs = await Effect.runPromise(repo.listRuns());
    expect(runs.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// deleteCompletedRuns — maintenance
// ---------------------------------------------------------------------------

describe('deleteCompletedRuns', () => {
  let repo = makeRepo();

  afterEach(() => {
    repo = makeRepo();
  });

  it('deletes only completed runs when no cutoff passed', async () => {
    await Effect.runPromise(repo.createRun('r1', 'g1'));
    await Effect.runPromise(repo.updateRunStatus('r1', 'completed'));
    await Effect.runPromise(repo.createRun('r2', 'g2'));
    // r2 stays idle

    const deleted = await Effect.runPromise(repo.deleteCompletedRuns());
    expect(deleted).toEqual(['r1']);

    // r1 gone, r2 still exists
    await expect(Effect.runPromise(repo.getRun('r1'))).rejects.toThrow();
    const r2 = await Effect.runPromise(repo.getRun('r2'));
    expect(r2.runId).toBe('r2');
  });

  it('returns empty array when no completed runs', async () => {
    await Effect.runPromise(repo.createRun('r1', 'g1'));
    const deleted = await Effect.runPromise(repo.deleteCompletedRuns());
    expect(deleted).toEqual([]);
  });

  it('cascades checkpoints for the deleted completed runs', async () => {
    const db = new Database(':memory:');
    Effect.runSync(migrate(db));
    const repo = buildService(db);
    await Effect.runPromise(repo.createRun('r1', 'g1'));
    await Effect.runPromise(repo.updateRunStatus('r1', 'completed'));
    seedCheckpoint(db, 'r1');

    const deleted = await Effect.runPromise(repo.deleteCompletedRuns());
    expect(deleted).toEqual(['r1']);

    const cps = db.prepare('SELECT COUNT(*) AS n FROM checkpoints WHERE thread_id = ?').get('r1') as { n: number };
    expect(cps.n).toBe(0);
    const writes = db.prepare('SELECT COUNT(*) AS n FROM checkpoint_writes WHERE thread_id = ?').get('r1') as {
      n: number;
    };
    expect(writes.n).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// initialize — idempotent migration
// ---------------------------------------------------------------------------

describe('initialize', () => {
  it('initialize is idempotent — calling twice does not fail', async () => {
    const db = new Database(':memory:');
    const repo1 = buildService(db);
    await Effect.runPromise(repo1.initialize());

    // Second initialize on same db
    const repo2 = buildService(db);
    await expect(Effect.runPromise(repo2.initialize())).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Schema migration — single final shape (no version meta-table)
// graph_runs: identity/progress/args/timestamps only (routes column removed,
// syntax v2). Execution state lives in the LangGraph checkpoint tables.
// No versioned ladder, no version table, no interim repairs: FINAL_DDL
// applies idempotently.
// ---------------------------------------------------------------------------

describe('schema migration — single final shape', () => {
  function finalShapeColumns(db: ReturnType<typeof Database>): {
    runCols: string[];
    checkpointCols: string[];
    writesCols: string[];
  } {
    return {
      runCols: (db.prepare('PRAGMA table_info(graph_runs)').all() as Array<{ name: string }>).map((c) => c.name),
      checkpointCols: (db.prepare('PRAGMA table_info(checkpoints)').all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
      writesCols: (db.prepare('PRAGMA table_info(checkpoint_writes)').all() as Array<{ name: string }>).map(
        (c) => c.name,
      ),
    };
  }

  it('migrate on a fresh database creates the final tables', () => {
    const db = new Database(':memory:');

    Effect.runSync(migrate(db));

    // Final shape — run identity/progress/args/timestamps only; no routes,
    // mode, or constraints columns; node_states is gone entirely.
    const { runCols, checkpointCols, writesCols } = finalShapeColumns(db);
    expect(runCols).toEqual(['run_id', 'graph_name', 'fsm_state', 'args', 'created_at', 'updated_at']);
    expect(checkpointCols).toEqual(
      expect.arrayContaining(['thread_id', 'checkpoint_ns', 'checkpoint_id', 'checkpoint', 'metadata', 'created_at']),
    );
    expect(writesCols).toEqual(
      expect.arrayContaining(['thread_id', 'checkpoint_id', 'task_id', 'idx', 'channel', 'value']),
    );

    // No version meta-table — the schema has no ladder to track.
    const versionTable = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_version'")
      .all() as Array<{ name: string }>;
    expect(versionTable).toHaveLength(0);

    // node_states and its legacy indexes no longer exist
    const nodeStates = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'node_states'")
      .all() as Array<{ name: string }>;
    expect(nodeStates).toHaveLength(0);

    // New run persists (no mode/constraints/routes params).
    const repo = buildService(db);
    Effect.runSync(repo.createRun('new-run', 'g', { changeName: 'x' }));
    const run = Effect.runSync(repo.getRun('new-run'));
    expect(run.args).toEqual({ changeName: 'x' });
    expect(run).toEqual({
      runId: 'new-run',
      graphName: 'g',
      fsmState: 'idle',
      args: { changeName: 'x' },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });

    // Idempotent — second migrate is a no-op.
    expect(() => Effect.runSync(migrate(db))).not.toThrow();
  });

  it('migrate on an existing final-shape database is idempotent — rows preserved, shape untouched', () => {
    const db = new Database(':memory:');
    // Simulate an already-migrated database with data (incl. a legacy
    // schema_version table from an older bootstrap — left untouched, the
    // final shape never writes it).
    db.exec(`
      CREATE TABLE graph_runs (
        run_id           TEXT PRIMARY KEY,
        graph_name       TEXT NOT NULL,
        fsm_state        TEXT NOT NULL DEFAULT 'idle',
        args             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      CREATE TABLE checkpoints (
        thread_id            TEXT NOT NULL,
        checkpoint_ns        TEXT NOT NULL DEFAULT '',
        checkpoint_id        TEXT NOT NULL,
        parent_checkpoint_id TEXT,
        type                 TEXT NOT NULL DEFAULT 'json',
        checkpoint           BLOB NOT NULL,
        metadata             BLOB NOT NULL,
        created_at           TEXT NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
      );
      CREATE TABLE checkpoint_writes (
        thread_id     TEXT NOT NULL,
        checkpoint_ns TEXT NOT NULL DEFAULT '',
        checkpoint_id TEXT NOT NULL,
        task_id       TEXT NOT NULL,
        idx           INTEGER NOT NULL,
        channel       TEXT NOT NULL,
        type          TEXT NOT NULL DEFAULT 'json',
        value         BLOB NOT NULL,
        PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
      );
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY);
      INSERT INTO schema_version (version) VALUES (1);
      INSERT INTO graph_runs (run_id, graph_name, fsm_state, args, created_at, updated_at)
      VALUES ('old-run', 'legacy-graph', 'completed', NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    `);

    Effect.runSync(migrate(db));

    // Rows preserved, shape untouched.
    const row = db.prepare('SELECT graph_name FROM graph_runs WHERE run_id = ?').get('old-run') as {
      graph_name: string;
    };
    expect(row.graph_name).toBe('legacy-graph');
    const { runCols, checkpointCols } = finalShapeColumns(db);
    expect(runCols).toEqual(['run_id', 'graph_name', 'fsm_state', 'args', 'created_at', 'updated_at']);
    expect(checkpointCols).toEqual(
      expect.arrayContaining(['thread_id', 'checkpoint_ns', 'checkpoint_id', 'checkpoint', 'metadata', 'created_at']),
    );
  });
});
