# run-record Specification

## Purpose

Run record persistence (libsql) plus snapshot reconstruction. Assets: `packages/graph-scheduler/src/lib/db/` (4 files), `src/api/run-caches.ts`, `src/api/fsm-reconstruct.ts`; output under `.taskflow/outputs/`.

## Requirements

### Requirement: State persistence — single final shape

System SHALL persist run and node execution state to a libsql database with two tables: `graph_runs` and `node_states`. The schema SHALL be the single final shape applied by one DDL — `SCHEMA_VERSION = 1`, no versioned migration ladder, no interim repair steps. `graph_runs` SHALL contain: runId (TEXT PK), graphName, fsmState, args (JSON), routes (JSON, default `'{}'`), createdAt, updatedAt. `node_states` SHALL contain: runId, nodeId, status, retryCount, startedAt, completedAt. No `durationMs` column SHALL exist — duration is derived from timestamps. Output content SHALL NOT be persisted — it lives in agent sessions or on-disk files. mode/constraints SHALL NOT exist as columns.

#### Scenario: Database initialization is idempotent

- **WHEN** `initialize()` is called on an empty database
- **THEN** `graph_runs` table SHALL be created with columns: runId (TEXT PK), graphName, fsmState, args (JSON), routes, createdAt, updatedAt
- **THEN** `node_states` table SHALL be created with columns: runId, nodeId, status, retryCount, startedAt, completedAt
- **WHEN** called again on an existing database — no error, no duplicate tables

#### Scenario: Single final schema version

- **WHEN** a fresh database initializes
- **THEN** `schema_version` SHALL read 1 and no migration ladder SHALL run — the created shape IS the final shape

#### Scenario: No historical columns

- **WHEN** inspecting the schema
- **THEN** no `mode`, `constraints`, `current_phase_id`, `topo_order`, `node_states.type`, or `durationMs` column SHALL exist

#### Scenario: Run lifecycle tracked end to end

- **WHEN** a run is created — status `running`, createdAt set, all node states initialized as `pending`
- **WHEN** nodes complete — status updated to `done`, completedAt set (duration derived, never stored)
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

#### Scenario: routes column present from first DDL

- **WHEN** a fresh database initializes
- **THEN** `graph_runs.routes` SHALL exist with default `'{}'` in the initial DDL (no migration needed)

### Requirement: No historical machinery in migration

The migration module SHALL contain no versioned delta ladder, no interim-V2 column-drop repair (`dropInterimV2RunColumns`), no `applied_at` tracking, and no upgrade paths for legacy shapes. History lives in git and ADRs, not in the DB bootstrap.

#### Scenario: No interim repair code

- **WHEN** the migration module is inspected
- **THEN** no interim-V2 column-drop repair, no versioned delta ladder, and no `applied_at` tracking SHALL exist

#### Scenario: Fresh database is the only path

- **WHEN** `migrate()` runs
- **THEN** it SHALL ensure the schema_version table, apply the single final DDL if absent, and record version 1 — nothing else

### Requirement: Run record holds identity, progress, routing, timestamps

The run record SHALL hold only: identity (runId, graphName), progress (fsmState), dispatch parameters (args), routing state (routes), and timestamps (createdAt, updatedAt). Duration SHALL be derived, never persisted. Node states SHALL hold only: status, retryCount, startedAt, completedAt.

#### Scenario: Dispatch reads from the same source

- **WHEN** a run is reconstructed after restart
- **THEN** the same frozen fields (identity/progress/args/routes/timestamps) SHALL drive dispatch — no additional fields are reconstructed from elsewhere

#### Scenario: Snapshot immutability

- **WHEN** a snapshot is assembled twice from the same persisted state
- **THEN** both SHALL be identical (durationMs derived deterministically from timestamps)

### Requirement: Node states carry progress only — no duration

Node states SHALL carry progress only — status, retryCount, startedAt, completedAt. No durationMs field SHALL exist in the persisted or in-memory node-state shape; snapshot `durationMs` SHALL be computed from timestamps at assembly time.

#### Scenario: Completion persists progress

- **WHEN** a node completes
- **THEN** status `done` and completedAt SHALL be persisted; no duration SHALL be persisted

#### Scenario: Cleanup removes node states

- **WHEN** a run is deleted
- **THEN** its node states SHALL be deleted with it

### Requirement: Active-run progress mirror unchanged

The active-run mirror SHALL remain scheduler-owned progress facts (runId, graphName, currentPhaseId, nodeType, nodeStatus, retryCount, nodeOperations, declaredAt) written atomically on transitions; consumers read-only.

#### Scenario: Mirror written on transitions

- **WHEN** a run starts/advances/jumps/force-ends
- **THEN** the mirror SHALL be rewritten atomically (tmp+rename) with the new run position

#### Scenario: Mirror reflects progress only

- **WHEN** the mirror is read
- **THEN** it SHALL contain progress facts only — never node content or agent session output

#### Scenario: No active run

- **WHEN** no run is active
- **THEN** the mirror SHALL be cleared (absence = no run-position constraint)
