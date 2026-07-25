/**
 * GraphRepository — DAO for graph_runs and node_states tables.
 *
 * Effect-TS Context.Tag with 12 CRUD methods. All I/O isolated
 * inside Effect; callers provide a libsql Database handle through
 * `makeRepositoryLayer`.
 *
 * @module
 */

import { Context, Effect, Layer } from 'effect';
import Database from 'libsql';
import { debugLog } from '../../debug.js';
import type { NotFoundError, PersistenceError } from '../../types.js';
import { tryDb } from './helpers.js';
import { migrate } from './migration.js';
// ---------------------------------------------------------------------------
// Domain row types — snake_case matches DB columns
// ---------------------------------------------------------------------------

/** Row shape for graph_runs table. */
interface GraphRunRow {
  run_id: string;
  graph_name: string;
  fsm_state: string;
  current_phase_id: string | null;
  args: string | null;
  created_at: string;
  updated_at: string;
}

/** Row shape for node_states table. */
interface NodeStateRow {
  run_id: string;
  node_id: string;
  type: string;
  status: string;
  retry_count: number;
  topo_order: number;
  started_at: string | null;
  completed_at: string | null;
}

// ---------------------------------------------------------------------------
// Domain DTOs — camelCase for consumer-facing types
// ---------------------------------------------------------------------------

/** Public run record — returned by getRun. */
export interface GraphRun {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly currentPhaseId: string | null;
  readonly args: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
/** Public node state record — returned by getNodeStates. */
export interface NodeStateEntry {
  readonly runId: string;
  readonly nodeId: string;
  readonly type: string;
  readonly status: string;
  readonly retryCount: number;
  readonly topoOrder: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
}
/** Update payload for a single node state row. */
export interface NodeStateUpdate {
  readonly status?: string;
  readonly retryCount?: number;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

/** Summary row for run listing. */
export interface RunSummaryItem {
  readonly runId: string;
  readonly graphName: string;
  readonly fsmState: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

/**
 * GraphRepository Context.Tag — injectable DAO seam.
 *
 * 11 CRUD methods covering graph_runs and node_states tables.
 * All write operations return `Effect<void, PersistenceError>`;
 * read operations return typed domain DTOs.
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

    /** Update a single node state row (partial). */
    readonly updateNodeState: (
      runId: string,
      nodeId: string,
      update: NodeStateUpdate,
    ) => Effect.Effect<void, PersistenceError>;

    /** Fetch a single run by id. */
    readonly getRun: (runId: string) => Effect.Effect<GraphRun, PersistenceError | NotFoundError>;

    /** Fetch all node states for a run, ordered by topo_order. */
    readonly getNodeStates: (runId: string) => Effect.Effect<ReadonlyArray<NodeStateEntry>, PersistenceError>;

    /** List all runs, newest first. */
    readonly listRuns: () => Effect.Effect<ReadonlyArray<RunSummaryItem>, PersistenceError>;

    /** Delete a run and cascade its node_states rows. */
    readonly deleteRun: (runId: string) => Effect.Effect<void, PersistenceError>;

    /** Delete all node states for a run (without deleting the run itself). */
    readonly deleteNodeStates: (runId: string) => Effect.Effect<void, PersistenceError>;

    /** Update the run-level fsm_state and updated_at timestamp. */
    readonly updateRunStatus: (runId: string, fsmState: string) => Effect.Effect<void, PersistenceError>;

    /** Batch-insert node state rows for a run (used at START). */
    readonly createNodeStates: (
      runId: string,
      nodes: ReadonlyArray<{ readonly nodeId: string; readonly type: string; readonly topoOrder: number }>,
    ) => Effect.Effect<void, PersistenceError>;

    /** Reset specified node IDs to pending (retry upstream). */
    readonly resetUpstreamNodes: (
      runId: string,
      nodeIds: ReadonlyArray<string>,
    ) => Effect.Effect<void, PersistenceError>;

    /** Reset specified node IDs to pending (jump downstream). */
    readonly resetDownstreamNodes: (
      runId: string,
      nodeIds: ReadonlyArray<string>,
    ) => Effect.Effect<void, PersistenceError>;

    /** Delete completed runs, optionally filtered by updated_at cutoff. Returns count. */
    readonly deleteCompletedRuns: (before?: string) => Effect.Effect<number, PersistenceError>;

    /** Run schema migration — ensure tables exist (idempotent). */
    readonly initialize: () => Effect.Effect<void, PersistenceError>;
  }
>() {}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Map a DB row (snake_case) to a GraphRun DTO (camelCase). */
function rowToGraphRun(row: GraphRunRow): GraphRun {
  return {
    runId: row.run_id,
    graphName: row.graph_name,
    fsmState: row.fsm_state,
    currentPhaseId: row.current_phase_id,
    args: row.args ? (JSON.parse(row.args) as Record<string, unknown>) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Map a DB row (snake_case) to a NodeStateEntry DTO (camelCase). */
function rowToNodeStateEntry(row: NodeStateRow): NodeStateEntry {
  return {
    runId: row.run_id,
    nodeId: row.node_id,
    type: row.type,
    status: row.status,
    retryCount: row.retry_count,
    topoOrder: row.topo_order,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

// ---------------------------------------------------------------------------
// Service builder
// ---------------------------------------------------------------------------

/**
 * Build the GraphRepository service object from a pre-created Database handle.
 *
 * All 7 Tag methods wired to libsql prepared statements.
 * Caller is responsible for lifecycle (open/close) via Layer.scoped + acquireRelease.
 */
export function buildService(db: ReturnType<typeof Database>): GraphRepository['Type'] {
  return {
    // ── createRun ──────────────────────────────────────────────────────

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

    // ── updateNodeState ───────────────────────────────────────────────

    updateNodeState: (runId: string, nodeId: string, update: NodeStateUpdate): Effect.Effect<void, PersistenceError> =>
      tryDb('updateNodeState', () => {
        debugLog('runtime', { event: 'node_state_update', runId, nodeId, update });
        const sets: string[] = [];
        const params: unknown[] = [];

        if (update.status !== undefined) {
          sets.push('status = ?');
          params.push(update.status);
        }
        if (update.retryCount !== undefined) {
          sets.push('retry_count = ?');
          params.push(update.retryCount);
        }
        if (update.startedAt !== undefined) {
          sets.push('started_at = ?');
          params.push(update.startedAt);
        }
        if (update.completedAt !== undefined) {
          sets.push('completed_at = ?');
          params.push(update.completedAt);
        }

        if (sets.length === 0) return;

        params.push(runId, nodeId);
        db.prepare(`UPDATE node_states SET ${sets.join(', ')} WHERE run_id = ? AND node_id = ?`).run(...params);
      }),

    // ── getRun ─────────────────────────────────────────────────────────

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

    // ── getNodeStates ──────────────────────────────────────────────────

    getNodeStates: (runId: string): Effect.Effect<ReadonlyArray<NodeStateEntry>, PersistenceError> =>
      tryDb('getNodeStates', () => {
        const rows = db
          .prepare('SELECT * FROM node_states WHERE run_id = ? ORDER BY topo_order')
          .all(runId) as NodeStateRow[];
        return rows.map(rowToNodeStateEntry);
      }),

    // ── listRuns ───────────────────────────────────────────────────────

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

    // ── deleteRun ──────────────────────────────────────────────────────

    deleteRun: (runId: string): Effect.Effect<void, PersistenceError> =>
      tryDb('deleteRun', () => {
        debugLog('runtime', { event: 'run_deleted', runId });
        db.transaction(() => {
          db.prepare('DELETE FROM node_states WHERE run_id = ?').run(runId);
          db.prepare('DELETE FROM graph_runs WHERE run_id = ?').run(runId);
        })();
      }),

    // ── deleteNodeStates ───────────────────────────────────────────────

    deleteNodeStates: (runId: string): Effect.Effect<void, PersistenceError> =>
      tryDb('deleteNodeStates', () => {
        debugLog('runtime', { event: 'node_states_deleted', runId });
        db.prepare('DELETE FROM node_states WHERE run_id = ?').run(runId);
      }),

    // ── updateRunStatus ────────────────────────────────────────────────

    updateRunStatus: (runId: string, fsmState: string): Effect.Effect<void, PersistenceError> =>
      tryDb('updateRunStatus', () => {
        const nowISO = new Date().toISOString();
        debugLog('runtime', { event: 'run_status_update', runId, fsmState });
        db.prepare(`UPDATE graph_runs SET fsm_state = ?, updated_at = ? WHERE run_id = ?`).run(fsmState, nowISO, runId);
      }),

    // ── createNodeStates ───────────────────────────────────────────────

    createNodeStates: (
      runId: string,
      nodes: ReadonlyArray<{ readonly nodeId: string; readonly type: string; readonly topoOrder: number }>,
    ): Effect.Effect<void, PersistenceError> =>
      tryDb('createNodeStates', () => {
        debugLog('runtime', { event: 'node_states_created', runId, count: nodes.length });
        db.transaction(() => {
          const stmt = db.prepare(
            `INSERT INTO node_states (run_id, node_id, type, status, topo_order)
             VALUES (?, ?, ?, 'pending', ?)`,
          );
          for (const n of nodes) {
            stmt.run(runId, n.nodeId, n.type, n.topoOrder);
          }
        })();
      }),

    // ── resetUpstreamNodes ─────────────────────────────────────────────

    resetUpstreamNodes: (runId: string, nodeIds: ReadonlyArray<string>): Effect.Effect<void, PersistenceError> =>
      tryDb('resetUpstreamNodes', () => {
        if (nodeIds.length === 0) return;
        debugLog('runtime', { event: 'reset_upstream', runId, nodeIds });
        db.transaction(() => {
          const stmt = db.prepare(
            `UPDATE node_states SET status = 'pending', retry_count = 0, started_at = NULL, completed_at = NULL WHERE run_id = ? AND node_id = ?`,
          );
          for (const nodeId of nodeIds) {
            stmt.run(runId, nodeId);
          }
        })();
      }),

    // ── resetDownstreamNodes ───────────────────────────────────────────

    resetDownstreamNodes: (runId: string, nodeIds: ReadonlyArray<string>): Effect.Effect<void, PersistenceError> =>
      tryDb('resetDownstreamNodes', () => {
        if (nodeIds.length === 0) return;
        debugLog('runtime', { event: 'reset_downstream', runId, nodeIds });
        db.transaction(() => {
          const stmt = db.prepare(
            `UPDATE node_states SET status = 'pending', retry_count = 0, started_at = NULL, completed_at = NULL WHERE run_id = ? AND node_id = ?`,
          );
          for (const nodeId of nodeIds) {
            stmt.run(runId, nodeId);
          }
        })();
      }),

    // ── deleteCompletedRuns ───────────────────────────────────────────

    deleteCompletedRuns: (before?: string): Effect.Effect<number, PersistenceError> =>
      tryDb('deleteCompletedRuns', () => {
        let count = 0;
        db.transaction(() => {
          // Find completed run IDs matching the cutoff
          let query = `SELECT run_id FROM graph_runs WHERE fsm_state = 'completed'`;
          const params: string[] = [];
          if (before !== undefined) {
            query += ` AND updated_at < ?`;
            params.push(before);
          }
          const rows = db.prepare(query).all(...params) as Array<{ run_id: string }>;

          // Cascade-delete node_states then graph_runs
          const deleteNodes = db.prepare(`DELETE FROM node_states WHERE run_id = ?`);
          const deleteRun = db.prepare(`DELETE FROM graph_runs WHERE run_id = ?`);
          for (const row of rows) {
            deleteNodes.run(row.run_id);
            deleteRun.run(row.run_id);
            count++;
          }
        })();
        debugLog('runtime', { event: 'completed_runs_deleted', count, before: before ?? null });
        return count;
      }),
    // ── initialize ────────────────────────────────────────────────────

    initialize: (): Effect.Effect<void, PersistenceError> => migrate(db),
  };
}

// ---------------------------------------------------------------------------
// Layer factory
// ---------------------------------------------------------------------------

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
