# run-record Specification

## Purpose

Run record persistence (libsql) plus snapshot reconstruction. Assets: `packages/graph-scheduler/src/lib/db/` (4 files), `src/api/run-caches.ts`, `src/api/fsm-reconstruct.ts`; output under `.taskflow/outputs/`.

## Requirements

### Requirement: State persistence

System SHALL persist run and node execution state to a libsql database with two tables: `graph_runs` and `node_states`. `graph_runs` SHALL contain the columns: runId (TEXT PK), graphName, fsmState, args (JSON), routes (JSON, default `'{}'`), createdAt, updatedAt; the routes column exists from v2. mode/constraints SHALL NOT exist as columns — mode is decided by the `$run-mode-confirm` prologue node and constraints are loaded by the `$load-constraints` prologue node; both are passed through node outputs and are not persisted columns. Output content SHALL NOT be persisted — it lives in agent sessions or on-disk files.

#### Scenario: Database initialization is idempotent

- **WHEN** `initialize()` is called on an empty database
- **THEN** `graph_runs` table SHALL be created with columns: runId (TEXT PK), graphName, fsmState, args (JSON), createdAt, updatedAt
- **THEN** `node_states` table SHALL be created with columns: runId, nodeId, status, retryCount, startedAt, completedAt
- **WHEN** called again on an existing database — no error, no duplicate tables

#### Scenario: v2 migration adds routes column

- **WHEN** a database migrates from v1 to v2
- **THEN** `graph_runs.routes` SHALL exist with default `'{}'`
- **THEN** no `mode` or `constraints` column SHALL exist in any version

#### Scenario: Run lifecycle tracked end to end

- **WHEN** a run is created — status `running`, createdAt set, all node states initialized as `pending`
- **WHEN** nodes complete — status updated to `done`/`skipped`, completedAt and durationMs recorded
- **WHEN** a run finishes — status updated to `completed` or `terminated`, updatedAt set
- **WHEN** a node retries — retryCount incremented

#### Scenario: Query returns full run snapshot

- **WHEN** `getStatus(runId)` is called
- **THEN** the run record and all associated node states SHALL be returned
- **THEN** missing runId SHALL return a `NotFoundError`

#### Scenario: Cleanup removes old runs

- **WHEN** `cleanCompleted(before)` is called with an ISO 8601 timestamp
- **THEN** all completed runs with `updatedAt` before the timestamp SHALL be deleted along with their node states
- **WHEN** `cleanAll()` is called — all runs regardless of status SHALL be deleted

### Requirement: Dead persistence columns removed

`graph_runs.current_phase_id` and `node_states.type` SHALL NOT exist in the schema; snapshots compute `currentPhaseId` from node states.

#### Scenario: Migration drops write-only columns

- **WHEN** a database migrates (any prior version)
- **THEN** `current_phase_id` and `node_states.type` SHALL be dropped (existence-guarded, idempotent)

### Requirement: Route activation persistence SHALL survive jump resets

Changes to the route activation table SHALL be persisted once, in a unified manner, after a single routing decision (gate jump cleanup and approval activation at the same point) — activations cleared by the JUMP closure SHALL reach the persisted state. A stateless server (rebuilding state from the DB on every dispatch) SHALL see the cleaned route table on the next dispatch; routes activated by a reset node SHALL NOT survive across a JUMP.

#### Scenario: Gate jump clearing persists

- **WHEN** a gate jump resets a route activator (the activator falls in the jump closure)
- **THEN** the transition SHALL emit exactly one `persist_run_state` effect carrying the cleared route map — the next dispatch rebuilt from the DB SHALL see no activation for that route

#### Scenario: Approval activation persists once

- **WHEN** an approval branchTo activates a route (route id or node-with-route)
- **THEN** the transition SHALL emit exactly one `persist_run_state` effect carrying the merged route map (no per-branch duplicate persists)

#### Scenario: Rebuilt eligibility follows the persisted map

- **WHEN** a dispatch rebuilds state from the DB after a jump reset
- **THEN** only the reset activator (and nodes on still-active routes) SHALL be eligible; stale track members SHALL stay pending until the activator re-decides

#### Scenario: No branchTo — no route persist

- **WHEN** a COMPLETE event carries no branchTo
- **THEN** no `persist_run_state` effect SHALL be emitted (route map unchanged)

### Requirement: Migration ladder version numbers are the change history

`SCHEMA_VERSION` SHALL = 2; the ladder SHALL be v1 (original historical shape) + v2 (`graph_runs.routes` column + cleanup of unused fields); SHALL NOT exist intermediate states or placeholder versions. v1 SHALL contain the `node_states.topo_order` column, the `idx_node_states_topo` index, and the `schema_version.applied_at` column (original shape); v2 SHALL add the routes column and drop all three — the final shape is delivered by v2. The mode/constraints columns SHALL NOT exist in any published version (stripped by the activation-prologue redesign, merged/removed during the unpublished interim-V2 period). **Ladder replay discipline**: published/recorded versions SHALL be immutable (ghost DDL prohibited: a version that has been recorded but whose statements change is never replayed); **unpublished versions SHALL be corrected to the final complete shape** (DDL changes are merged directly into the existing version statement set, no placeholder version added); local databases that already applied such a version SHALL be corrected via direct SQL to match the code (zero data-row touches).

#### Scenario: Fresh database migration

- **WHEN** an empty database executes the initial migration
- **THEN** v1 and v2 are applied in sequence and `schema_version` records [1, 2]; after v2 the routes column exists, the mode/constraints columns do not exist, and topo_order/idx_node_states_topo/applied_at do not exist

#### Scenario: Already-current database is idempotent

- **WHEN** a migration runs again while the database records a version >= SCHEMA_VERSION
- **THEN** it is a no-op and the records are unchanged

#### Scenario: Node state read order preserved

- **WHEN** getNodeStates queries a run's nodes
- **THEN** results are returned deterministically in insertion order (rowid) — equivalent to the original topo_order order

#### Scenario: In-place upgrade of a v1 legacy-shape database

- **WHEN** a legacy v1 database (with topo_order/idx/applied_at, no routes column, schema_version row 1) runs migrate()
- **THEN** v2 applies successfully: routes='{}', topo_order/idx/applied_at are dropped; MAX(version)=2

#### Scenario: DDL changes must bump the version

- **WHEN** the statement set of a published/recorded ladder version changes after the version was fixed (e.g. v2 statements are added or removed)
- **THEN** the change SHALL be delivered as a new ladder version (v3+) — the statement set of a recorded version SHALL NOT be modified (ghost DDL prohibited); databases on a recorded version SHALL be upgraded by the new version's ladder rather than replayed in place

#### Scenario: Unpublished version absorbs corrections

- **WHEN** an unpublished ladder statement set needs an added column
- **THEN** the column is merged directly into that version's statement set (SCHEMA_VERSION is not bumped) — no placeholder version is added; local databases that already applied the version are corrected with a direct ALTER, max(version) stays unchanged, and migrate() is an idempotent no-op

### Requirement: Local database records SHALL match code constants

An operational database's `schema_version` table SHALL NOT retain rows for removed version numbers — the maximum recorded version equals `SCHEMA_VERSION`; corrections SHALL NOT touch run/node_states data rows. An operational database SHALL NOT retain removed columns/indexes (topo_order / idx_node_states_topo / applied_at). A local database that ran interim-V2 (with mode/constraints columns) SHALL have those two columns dropped at migration start via a column-existence check — mode/constraints were never part of a formal version shape; residue is corrected.

#### Scenario: Residual v3/v4 rows corrected

- **WHEN** a local database's `schema_version` contains rows 3/4
- **THEN** rows 3/4 are deleted, leaving max=2=SCHEMA_VERSION, `migrate()` is an idempotent no-op, and data rows are untouched

#### Scenario: Local database column removal

- **WHEN** a local database executes DROP COLUMN topo_order / DROP INDEX idx_node_states_topo / DROP COLUMN applied_at
- **THEN** all three residues disappear; the data-row count is unchanged; max(version)=2=SCHEMA_VERSION and migrate() is an idempotent no-op

#### Scenario: interim-V2 residual columns corrected

- **WHEN** a local database contains mode/constraints columns (interim-V2-era residue, v2 version row already recorded)
- **THEN** the migration-start column-existence check drops those two columns (routes is kept — still a v2 feature), the version row is unchanged (v2 remains valid), and run data is untouched

#### Scenario: Local database column addition

- **WHEN** a local database has v2 recorded but lacks the routes column
- **THEN** `ALTER TABLE graph_runs ADD COLUMN routes TEXT NOT NULL DEFAULT '{}'` is run directly; data rows are untouched; max(version)=2=SCHEMA_VERSION and migrate() is an idempotent no-op

#### Scenario: Clean database, zero residue

- **WHEN** the operational database never ran interim-V2
- **THEN** no column-drop operation occurs (the existence check is skipped)

### Requirement: Migration tests assert the final shape of the two columns

v1-era upgrade tests SHALL assert that after upgrade `MAX(version)` = SCHEMA_VERSION, routes defaults to `'{}'`, and the mode/constraints columns do not exist.

#### Scenario: v1 database in-place upgrade

- **WHEN** a v1-shape database (without the routes column) runs `migrate()`
- **THEN** `MAX(version)` = SCHEMA_VERSION; existing rows have routes='{}'; the mode/constraints columns do not exist

### Requirement: Migration ladder versions SHALL be the change history

`SCHEMA_VERSION` SHALL = 2; the ladder is v1 (full schema) + v2 (routes column + cleanup of unused fields) — the mode/constraints columns were never published in any version (stripped by the activation-prologue design, merged/removed during the unpublished V2 period, no empty placeholder versions). Applied version numbers = actual change sets, no fictional eras.

#### Scenario: Fresh database migration

- **WHEN** an empty database executes the initial migration
- **THEN** v1 and v2 are applied in sequence, `schema_version` records [1, 2], and `graph_runs` has no mode/constraints columns

#### Scenario: Already-current database is idempotent

- **WHEN** a migration runs again while the database records a version >= SCHEMA_VERSION
- **THEN** it is a no-op and the records are unchanged

### Requirement: interim-V2 residue databases SHALL be corrected to match code

An operational database's `schema_version` table SHALL NOT retain rows for removed version numbers — the maximum recorded version equals `SCHEMA_VERSION`. A local database that ran interim-V2 (with mode/constraints columns, v2 version row already recorded) SHALL be repaired via the column-existence check at migration start: drop the two columns (routes is kept — still a v2 feature), version row unchanged (v2 remains valid).

#### Scenario: Residual v3 row corrected

- **WHEN** the operational database contains a v3 row left over from before the renumbering and the mode column was applied (interim-V2-era residue)
- **THEN** the migration-start column-existence check drops the mode/constraints columns, `MAX(version)` stays 2 (v2 remains valid — routes is a v2 feature), and run data is untouched

#### Scenario: Clean database, zero residue

- **WHEN** the operational database never ran interim-V2
- **THEN** no column-drop operation occurs (the existence check is skipped)

### Requirement: Run record = frozen execution contract

Each run record SHALL freeze its execution contract at creation: graphName, args, routes; it SHALL NOT change during the run's lifetime (force-end/end actions only change fsmState). The run mode and constraints snapshots SHALL NOT be run-record columns — mode is decided each round by the `$run-mode-confirm` prologue node (args.mode short-circuit or a question), constraints are loaded by the `$load-constraints` prologue node (from the parsed `.graph-scheduler/constraints.md`; missing/empty file -> empty array); both are passed to subsequent dispatches via the prologue nodes' output files (single source of truth, no run-record columns, no process-cache fallback).

#### Scenario: Dispatch reads from the same source

- **WHEN** any node of a run is dispatched (start/advance/jump)
- **THEN** both mode and constraints are read from the prologue nodes' outputs — single source of truth, no run-record columns, no process-cache fallback

#### Scenario: Snapshot immutability

- **WHEN** `.graph-scheduler/constraints.md` is edited after the run was created
- **THEN** the run's subsequent dispatches still carry the snapshot loaded by the prologue nodes at start; only a new run reflects the new content

### Requirement: Node states carry progress only

`node_states` SHALL store execution progress: status, retry count, start/end timestamps, duration. No content column exists — node output text is never persisted by the scheduler. Run cleanup SHALL remove node states with their run record (no content to clean).

#### Scenario: Completion persists progress

- **WHEN** a node completes with a reported duration
- **THEN** `node_states` SHALL be updated atomically (status + duration + timestamps in the same persist effect)
- **AND** no output text SHALL be written

#### Scenario: Cleanup removes node states

- **WHEN** a run is cleaned or force-ended
- **THEN** its node states SHALL be deleted with the run record — no content residue remains (content never left the session)
