/**
 * DDL definitions for graph_runs and node_states tables.
 *
 * Pure string constants — zero dependencies, zero side effects.
 * Referenced by migration.ts for database initialization.
 *
 * @module
 */

/** Current schema version — bump on DDL change. */
export const SCHEMA_VERSION = 2;

/** Create the graph_runs table — one row per graph execution run. v1 shape (pre-mode). */
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

/** Create the node_states table — one row per phase within a run. */
export const CREATE_NODE_STATES = `
  CREATE TABLE IF NOT EXISTS node_states (
    run_id        TEXT NOT NULL,
    node_id       TEXT NOT NULL,
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

/** All DDL statements for the current schema version, in dependency order. */
export const V1_DDL = [CREATE_GRAPH_RUNS, CREATE_NODE_STATES, CREATE_NODE_STATES_TOPO_INDEX] as const;

/**
 * v2 delta — final shape delivered: routes (route activation map) +
 * unused-field cleanup (topo_order / topo index / applied_at dropped).
 * mode/constraints columns were stripped before release (activation-prologue
 * redesign — they never shipped in any version; local dev databases that ran
 * the interim V2 are repaired by migration's column-drop step).
 */
export const V2_DDL = [
  `ALTER TABLE graph_runs ADD COLUMN routes TEXT NOT NULL DEFAULT '{}'`,
  `DROP INDEX IF EXISTS idx_node_states_topo`,
  `ALTER TABLE node_states DROP COLUMN topo_order`,
  `ALTER TABLE schema_version DROP COLUMN applied_at`,
] as const;

/** All versioned DDL ladders, in application order. */
export const VERSIONED_DDL: ReadonlyArray<readonly string[]> = [V1_DDL, V2_DDL];
