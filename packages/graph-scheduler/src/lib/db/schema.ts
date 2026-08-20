/**
 * DDL definitions for the graph_runs table + checkpoint store.
 *
 * Pure string constants — zero dependencies, zero side effects.
 * Referenced by migration.ts for database initialization.
 *
 * Single final shape — no versioned ladder, no interim repairs.
 * History lives in git and ADRs, not in the DB bootstrap.
 *
 * v2: node execution state moved out of the node_states table
 * into LangGraph checkpoints (checkpoints + checkpoint_writes). The
 * graph_runs table keeps run identity/progress/args/timestamps only.
 *
 * Single DDL source for the run database:
 * - checkpoint store DDL lives here, not in the saver implementation
 *   module (checkpoint-saver.ts imports nothing DDL-wise — pure module
 *   is the one definition site).
 *
 * Cross-file contracts:
 * - Run id bridge: graph_runs.run_id ↔ checkpoint thread_id — the same
 *   logical run id. thread_id is the LangGraph contract key
 *   (configurable.thread_id), immutable; the bridge is explicit
 *   (repository deletion maps run_id → thread_id), never renamed.
 * - Status vocabularies: graph_runs.fsm_state is run-level
 *   (idle | running | completed | terminated, persisted); NodeStatus
 *   (pending | active | done) is node-level, in-memory/snapshot only —
 *   never persisted as a table column.
 *
 * @module
 */

/** Create the graph_runs table — one row per graph execution run.
 *  Final shape: identity + progress + timestamps (routes column removed —
 *  the route mechanism is deleted). */
export const CREATE_GRAPH_RUNS = `
  CREATE TABLE IF NOT EXISTS graph_runs (
    run_id           TEXT PRIMARY KEY,
    graph_name       TEXT NOT NULL,
    fsm_state        TEXT NOT NULL DEFAULT 'idle',
    args             TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )
`;

/** Final checkpoint schema — additive over graph_runs; single shape, no ladder. */
export const CREATE_CHECKPOINTS = `
  CREATE TABLE IF NOT EXISTS checkpoints (
    thread_id            TEXT NOT NULL,
    checkpoint_ns        TEXT NOT NULL DEFAULT '',
    checkpoint_id        TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    type                 TEXT NOT NULL DEFAULT 'json',
    checkpoint           BLOB NOT NULL,
    metadata             BLOB NOT NULL,
    created_at           TEXT NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
  )
`;

export const CREATE_CHECKPOINT_WRITES = `
  CREATE TABLE IF NOT EXISTS checkpoint_writes (
    thread_id     TEXT NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id       TEXT NOT NULL,
    idx           INTEGER NOT NULL,
    channel       TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'json',
    value         BLOB NOT NULL,
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
  )
`;

/** All checkpoint DDL statements, in dependency order. */
export const CHECKPOINT_DDL = [CREATE_CHECKPOINTS, CREATE_CHECKPOINT_WRITES] as const;

/**
 * All DDL statements for the final shape, in dependency order:
 * graph_runs (identity/progress) + checkpoint store (execution state).
 */
export const FINAL_DDL = [CREATE_GRAPH_RUNS, ...CHECKPOINT_DDL] as const;
