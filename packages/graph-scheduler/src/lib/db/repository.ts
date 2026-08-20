/**
 * GraphRepository — DAO for the graph_runs table (run identity/progress).
 *
 * v2: node execution state lives in LangGraph checkpoints
 * (checkpoint-saver.ts), not a node_states table — this DAO manages run
 * records only: identity (runId, graphName), progress (fsmState), dispatch
 * parameters (args), timestamps. Cleanup operations cascade to the
 * checkpoint store.
 *
 * Effect-TS Context.Tag with CRUD methods. All I/O isolated
 * inside Effect; callers provide a libsql Database handle through
 * `makeRepositoryLayer`.
 *
 * @module
 */

import { Context, Effect, Layer } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { NotFoundError, PersistenceError, RunSummary } from '../../types.js';
import { deleteThreadCascade, tryDb } from './helpers.js';
import { migrate } from './migration.js';
/** Row shape for graph_runs table. */
interface GraphRunRow {
  run_id: string;
  graph_name: string;
  fsm_state: string;
  args: string | null;
  created_at: string;
  updated_at: string;
}

/** Public run record — returned by getRun. */
export interface GraphRun {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly args: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Summary row for run listing — canonical RunSummary shape. */
export type RunSummaryItem = RunSummary;

/**
 * GraphRepository Context.Tag — injectable DAO seam.
 *
 * Run-record CRUD only. All write operations return `Effect<void,
 * PersistenceError>`; read operations return typed domain DTOs.
 */
export class GraphRepository extends Context.Tag('GraphRepository')<
  GraphRepository,
  {
    /** Insert a new run row. */
    readonly createRun: (
      runId: string,
      graphName: string,
      args?: Record<string, unknown>,
    ) => Effect.Effect<void, PersistenceError>;

    /** Fetch a single run by id. */
    readonly getRun: (runId: string) => Effect.Effect<GraphRun, PersistenceError | NotFoundError>;

    /** List all runs, newest first. */
    readonly listRuns: () => Effect.Effect<ReadonlyArray<RunSummaryItem>, PersistenceError>;

    /** Delete a run and cascade its checkpoints. */
    readonly deleteRun: (runId: string) => Effect.Effect<void, PersistenceError>;

    /** Update the run-level fsm_state + updated_at timestamp. */
    readonly updateRunStatus: (runId: string, fsmState: string) => Effect.Effect<void, PersistenceError>;

    /** Delete completed runs, optionally filtered by updated_at cutoff. Returns deleted run ids. */
    readonly deleteCompletedRuns: (before?: string) => Effect.Effect<ReadonlyArray<string>, PersistenceError>;

    /** Run schema migration — ensure tables exist (idempotent). */
    readonly initialize: () => Effect.Effect<void, PersistenceError>;
  }
>() {}

/** Map a DB row (snake_case) to a GraphRun DTO (camelCase). */
function rowToGraphRun(row: GraphRunRow): GraphRun {
  return {
    runId: row.run_id,
    graphName: row.graph_name,
    fsmState: row.fsm_state,
    args: row.args ? (JSON.parse(row.args) as Record<string, unknown>) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Cascade-delete a run's checkpoints — single implementation (helpers.deleteThreadCascade). */
function deleteCheckpoints(db: ReturnType<typeof Database>, runId: string): void {
  deleteThreadCascade(db, runId);
}

/**
 * Build the GraphRepository service object from a pre-created Database handle.
 *
 * All 6 Tag methods wired to libsql prepared statements.
 * Caller is responsible for lifecycle (open/close) via Layer.scoped + acquireRelease.
 */
export function buildService(db: ReturnType<typeof Database>): GraphRepository['Type'] {
  return {
    createRun: (
      runId: string,
      graphName: string,
      args?: Record<string, unknown>,
    ): Effect.Effect<void, PersistenceError> =>
      tryDb('createRun', () => {
        const nowISO = new Date().toISOString();
        debugLog('runtime', { event: 'run_created', runId, graphName });
        db.prepare(
          `INSERT INTO graph_runs (run_id, graph_name, fsm_state, args, created_at, updated_at)
           VALUES (?, ?, 'idle', ?, ?, ?)`,
        ).run(runId, graphName, args ? JSON.stringify(args) : null, nowISO, nowISO);
      }),

    getRun: (runId: string): Effect.Effect<GraphRun, PersistenceError | NotFoundError> =>
      tryDb('getRun', () => {
        const row = db.prepare('SELECT * FROM graph_runs WHERE run_id = ?').get(runId) as GraphRunRow | undefined;
        if (!row) {
          const err: NotFoundError = {
            _tag: 'NotFoundError',
            runId,
            message: `Run not found: ${runId}`,
          };
          throw err;
        }
        return rowToGraphRun(row);
      }),

    listRuns: (): Effect.Effect<ReadonlyArray<RunSummaryItem>, PersistenceError> =>
      tryDb('listRuns', () => {
        const rows = db
          .prepare(
            'SELECT run_id, graph_name, fsm_state, created_at, updated_at FROM graph_runs ORDER BY created_at DESC',
          )
          .all() as Array<{
          run_id: string;
          graph_name: string;
          fsm_state: string;
          created_at: string;
          updated_at: string;
        }>;
        return rows.map((r) => ({
          runId: r.run_id,
          graphName: r.graph_name,
          fsmState: r.fsm_state,
          createdAt: r.created_at,
          updatedAt: r.updated_at,
        }));
      }),

    deleteRun: (runId: string): Effect.Effect<void, PersistenceError> =>
      tryDb('deleteRun', () => {
        debugLog('runtime', { event: 'run_deleted', runId });
        db.transaction(() => {
          deleteCheckpoints(db, runId);
          db.prepare('DELETE FROM graph_runs WHERE run_id = ?').run(runId);
        })();
      }),

    updateRunStatus: (runId: string, fsmState: string): Effect.Effect<void, PersistenceError> =>
      tryDb('updateRunStatus', () => {
        const nowISO = new Date().toISOString();
        debugLog('runtime', { event: 'run_status_update', runId, fsmState });
        db.prepare(`UPDATE graph_runs SET fsm_state = ?, updated_at = ? WHERE run_id = ?`).run(fsmState, nowISO, runId);
      }),

    deleteCompletedRuns: (before?: string): Effect.Effect<ReadonlyArray<string>, PersistenceError> =>
      tryDb('deleteCompletedRuns', () => {
        const deletedIds: string[] = [];
        db.transaction(() => {
          // Find completed run IDs matching the cutoff
          let query = `SELECT run_id FROM graph_runs WHERE fsm_state = 'completed'`;
          const params: string[] = [];
          if (before !== undefined) {
            query += ` AND updated_at < ?`;
            params.push(before);
          }
          const rows = db.prepare(query).all(...params) as Array<{ run_id: string }>;

          // Cascade-delete checkpoints then graph_runs
          const deleteRun = db.prepare(`DELETE FROM graph_runs WHERE run_id = ?`);
          for (const row of rows) {
            deleteCheckpoints(db, row.run_id);
            deleteRun.run(row.run_id);
            deletedIds.push(row.run_id);
          }
        })();
        debugLog('runtime', { event: 'completed_runs_deleted', count: deletedIds.length, before: before ?? null });
        return deletedIds;
      }),

    initialize: (): Effect.Effect<void, PersistenceError> => migrate(db),
  };
}

/**
 * Create a GraphRepository Layer backed by the given Database handle.
 *
 * The caller manages the Database lifecycle (e.g. via Layer.scoped).
 *
 * @param db — open libsql Database handle
 * @returns a Layer providing GraphRepository with no further requirements
 */
export function makeRepositoryLayer(db: ReturnType<typeof Database>): Layer.Layer<GraphRepository, never, never> {
  return Layer.succeed(GraphRepository, buildService(db));
}
