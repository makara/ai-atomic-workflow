/**
 * Unit tests for lib/db/repository.ts — direct DAO CRUD operations.
 *
 * Uses :memory: libsql for isolation. Tests CRUD round-trips,
 * node state batch ops, and error paths. No Effect Layer wiring needed —
 * buildService + Effect.runPromise directly.
 *
 * @module
 */
import { Effect } from 'effect';
import Database from 'libsql';
import { afterEach, describe, expect, it } from 'vitest';

import { migrate } from '../../src/lib/db/migration.js';
import { buildService, type GraphRepository } from '../../src/lib/db/repository.js';
import { SCHEMA_VERSION } from '../../src/lib/db/schema.js';
import type { NotFoundError } from '../../src/types.js';

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
// Node state operations — batch create, read, update
// ---------------------------------------------------------------------------

describe('node state operations', () => {
  let repo = makeRepo();

  afterEach(() => {
    repo = makeRepo();
  });

  const NODES = [
    { nodeId: 'n1', type: 'main', topoOrder: 0 },
    { nodeId: 'n2', type: 'main', topoOrder: 1 },
    { nodeId: 'n3', type: 'main', topoOrder: 2 },
  ] as const;

  it('createNodeStates → getNodeStates returns all nodes in topo order', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.createNodeStates('r1', NODES));

    const states = await Effect.runPromise(repo.getNodeStates('r1'));
    expect(states.length).toBe(3);
    expect(states[0].nodeId).toBe('n1');
    expect(states[1].nodeId).toBe('n2');
    expect(states[2].nodeId).toBe('n3');
    // Default status is 'pending'
    expect(states[0].status).toBe('pending');
  });

  it('updateNodeState changes status and retryCount', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.createNodeStates('r1', NODES));
    await Effect.runPromise(repo.updateNodeState('r1', 'n1', { status: 'active', retryCount: 1 }));

    const states = await Effect.runPromise(repo.getNodeStates('r1'));
    expect(states[0].status).toBe('active');
    expect(states[0].retryCount).toBe(1);
    // Other nodes unchanged
    expect(states[1].status).toBe('pending');
    expect(states[2].status).toBe('pending');
  });

  it('updateNodeState with timestamps sets startedAt/completedAt', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.createNodeStates('r1', NODES));

    const now = new Date().toISOString();
    await Effect.runPromise(
      repo.updateNodeState('r1', 'n2', {
        status: 'done',
        startedAt: now,
        completedAt: now,
      }),
    );

    const states = await Effect.runPromise(repo.getNodeStates('r1'));
    expect(states[1].status).toBe('done');
    expect(states[1].startedAt).toBe(now);
    expect(states[1].completedAt).toBe(now);
  });

  it('getNodeStates for run with no nodes returns empty', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));

    const states = await Effect.runPromise(repo.getNodeStates('r1'));
    expect(states.length).toBe(0);
  });

  it('deleteRun cascades — node states removed', async () => {
    await Effect.runPromise(repo.createRun('r1', 'test-graph'));
    await Effect.runPromise(repo.createNodeStates('r1', NODES));
    await Effect.runPromise(repo.deleteRun('r1'));

    const states = await Effect.runPromise(repo.getNodeStates('r1'));
    expect(states.length).toBe(0);
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
// Schema migration — v1-era → current (v2) in-place upgrade (Run Mode run field)
// ---------------------------------------------------------------------------

describe('schema migration v1-era → current', () => {
  it('upgrades a v1 database in place: adds mode column, keeps rows', () => {
    const db = new Database(':memory:');
    // Simulate a v1 database: original DDL + version marker, no mode column.
    db.exec(`
      CREATE TABLE graph_runs (
        run_id           TEXT PRIMARY KEY,
        graph_name       TEXT NOT NULL,
        fsm_state        TEXT NOT NULL DEFAULT 'idle',
        args             TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      );
      CREATE TABLE node_states (
        run_id        TEXT NOT NULL,
        node_id       TEXT NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending',
        retry_count   INTEGER NOT NULL DEFAULT 0,
        topo_order    INTEGER NOT NULL DEFAULT 0,
        started_at    TEXT,
        completed_at  TEXT,
        PRIMARY KEY (run_id, node_id),
        FOREIGN KEY (run_id) REFERENCES graph_runs(run_id)
      );
      CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_version (version, applied_at) VALUES (1, '2026-08-01T00:00:00.000Z');
      INSERT INTO graph_runs (run_id, graph_name, fsm_state, args, created_at, updated_at)
      VALUES ('old-run', 'legacy-graph', 'completed', NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z');
    `);

    // Upgrade to current version.
    Effect.runSync(migrate(db));

    // Version marker reaches the current schema version.
    const ver = db.prepare('SELECT MAX(version) AS v FROM schema_version').get() as { v: number };
    expect(ver.v).toBe(SCHEMA_VERSION);

    // Pre-existing row preserved, mode defaults to manual.
    const row = db.prepare('SELECT mode FROM graph_runs WHERE run_id = ?').get('old-run') as
      { mode: string } | undefined;
    expect(row?.mode).toBe('manual');

    // New run with explicit mode persists.
    const repo = buildService(db);
    Effect.runSync(repo.createRun('new-run', 'g', undefined, 'auto'));
    const run = Effect.runSync(repo.getRun('new-run'));
    expect(run.mode).toBe('auto');

    // Idempotent — second migrate is a no-op.
    Effect.runSync(migrate(db));
    expect(Effect.runSync(repo.getRun('old-run')).mode).toBe('manual');
  });
});
