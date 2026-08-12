/**
 * DDL definitions for graph_runs and node_states tables.
 *
 * Pure string constants — zero dependencies, zero side effects.
 * Referenced by migration.ts for database initialization.
 *
 * Single final shape — no versioned ladder, no interim repairs.
 * History lives in git and ADRs, not in the DB bootstrap.
 *
 * @module
 */

/** Current schema version — the single final shape. */
export const SCHEMA_VERSION = 1;

/** Create the graph_runs table — one row per graph execution run.
 *  Final shape: identity + progress + routing + timestamps. */
export const CREATE_GRAPH_RUNS = `
  CREATE TABLE IF NOT EXISTS graph_runs (
    run_id           TEXT PRIMARY KEY,
    graph_name       TEXT NOT NULL,
    fsm_state        TEXT NOT NULL DEFAULT 'idle',
    args             TEXT,
    routes           TEXT NOT NULL DEFAULT '{}',
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )
`;

/** Create the node_states table — one row per phase within a run.
 *  Progress only: status, retry count, timestamps. Duration is derived
 *  from timestamps — never stored. */
export const CREATE_NODE_STATES = `
  CREATE TABLE IF NOT EXISTS node_states (
    run_id        TEXT NOT NULL,
    node_id       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT,
    completed_at  TEXT,
    PRIMARY KEY (run_id, node_id),
    FOREIGN KEY (run_id) REFERENCES graph_runs(run_id)
  )
`;

/** All DDL statements for the final shape, in dependency order. */
export const FINAL_DDL = [CREATE_GRAPH_RUNS, CREATE_NODE_STATES] as const;
