/**
 * DDL definitions for graph_runs and node_states tables.
 *
 * Pure string constants — zero dependencies, zero side effects.
 * Referenced by migration.ts for versioned forward-only execution
 * and by repository.ts for schema reference.
 *
 * @module
 */

/** Current schema version — increment on every DDL change. */
export const SCHEMA_VERSION = 3;

/** Create the graph_runs table — one row per graph execution run. */
export const CREATE_GRAPH_RUNS = `
  CREATE TABLE IF NOT EXISTS graph_runs (
    run_id           TEXT PRIMARY KEY,
    graph_name       TEXT NOT NULL,
    fsm_state        TEXT NOT NULL DEFAULT 'idle',
    current_phase_id TEXT,
    args             TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )
`;

/** Create the node_states table — one row per phase within a run. */
export const CREATE_NODE_STATES = `
  CREATE TABLE IF NOT EXISTS node_states (
    run_id        TEXT NOT NULL,
    node_id       TEXT NOT NULL,
    type          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    topo_order    INTEGER NOT NULL DEFAULT 0,
    started_at    TEXT,
    completed_at  TEXT,
    PRIMARY KEY (run_id, node_id),
    FOREIGN KEY (run_id) REFERENCES graph_runs(run_id)
  )
`;

/** Create an index on node_states for topo-ordered queries. */
export const CREATE_NODE_STATES_TOPO_INDEX = `
  CREATE INDEX IF NOT EXISTS idx_node_states_topo
  ON node_states(run_id, topo_order)
`;

/** V2 migration — add error column to node_states. */
export const V2_DDL = [`ALTER TABLE node_states ADD COLUMN error TEXT`] as const;

/**
 * V3 migration — remove output and error columns from node_states.
 * graph-scheduler tracks only topology state; output lives on disk or in agent session.
 * See docs/reports/atom-phase-handler-task-dispatch-analysis.md §11.0.
 */
export const V3_DDL = [
  `ALTER TABLE node_states DROP COLUMN output`,
  `ALTER TABLE node_states DROP COLUMN error`,
] as const;

/** All DDL statements for the current schema version, in dependency order. */
export const V1_DDL = [CREATE_GRAPH_RUNS, CREATE_NODE_STATES, CREATE_NODE_STATES_TOPO_INDEX] as const;
