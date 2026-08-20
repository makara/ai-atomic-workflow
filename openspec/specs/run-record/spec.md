# run-record Specification

## Purpose

Run record persistence (libsql) plus snapshot reconstruction. Assets: `packages/graph-scheduler/src/lib/db/` (5 files — schema.ts, checkpoint-saver.ts, migration.ts, repository.ts, helpers.ts), `src/adapter.ts` (snapshot reconstruction — single builder); progress-only state — output content is never persisted (it lives in agent sessions or durable artifacts).

## Requirements

### Requirement: State persistence — single final shape

System SHALL persist run and node execution state to a libsql database via a custom checkpoint saver (`BaseCheckpointSaver` adapter wrapping libsql). The schema SHALL be the single final shape applied by one DDL — no versioned migration ladder, no interim repair steps. Persisted run record SHALL contain: runId (TEXT PK), graphName, fsmState, args (JSON), createdAt, updatedAt. Node execution state (status, retryCount, startedAt, completedAt) SHALL be persisted as checkpointed graph state — the separate `node_states` table is replaced by the checkpoint store. No `durationMs` column SHALL exist — duration is derived from timestamps. Output content SHALL NOT be persisted — it lives in agent sessions. Snapshot reconstruction SHALL be built by the single builder.

The run-database DDL SHALL be single-sourced in the pure DDL module (`src/lib/db/schema.ts`) — the checkpoint store DDL (checkpoints, checkpoint_writes) SHALL NOT be declared in the saver implementation module; the pure module is the one DDL definition site. Run deletion SHALL cascade checkpoints through a single cleanup implementation — the repository SHALL NOT inline the cascade SQL.

#### Scenario: Database initialization is idempotent

- **WHEN** `initialize()` is called on an empty database
- **THEN** the run-record table SHALL be created with columns: runId (TEXT PK), graphName, fsmState, args, createdAt, updatedAt
- **THEN** the checkpoint store tables SHALL be created (checkpoints + checkpoint metadata)
- **WHEN** called again on an existing database — no error, no duplicate tables

#### Scenario: DDL single source

- **WHEN** the db module is inspected
- **THEN** all DDL statements (graph_runs + checkpoints + checkpoint_writes) SHALL be defined in `src/lib/db/schema.ts`
- **THEN** the saver implementation module (`src/lib/db/checkpoint-saver.ts`) SHALL contain no DDL definition — the pure module is the one definition site

#### Scenario: Cleanup single source

- **WHEN** a run is deleted
- **THEN** its checkpoint cascade SHALL execute through the single cleanup implementation
- **THEN** the repository SHALL contain no inline checkpoint-table SQL

#### Scenario: Asset inventory complete

- **WHEN** the run-record assets are inspected
- **THEN** `src/lib/db/` SHALL be listed with 5 files — schema.ts, checkpoint-saver.ts, migration.ts, repository.ts, helpers.ts — in the run-record spec Purpose and the docs/domains.md run-record row

#### Scenario: Single final schema version

- **WHEN** a fresh database initializes
- **THEN** no migration ladder SHALL run — the created shape IS the final shape (no schema_version table, no version meta-table)

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
- **THEN** all completed runs with `updatedAt` before the timestamp SHALL be deleted along with their checkpoints
- **WHEN** `cleanAll()` is called — all runs regardless of status SHALL be deleted

#### Scenario: routes column present from first DDL

- **WHEN** a fresh database initializes
- **THEN** the run-record table carries no route-activation column (the route mechanism is deleted — no route state persists)

#### Scenario: Checkpoint write is atomic

- **WHEN** a transition persists execution state
- **THEN** the write is all-or-nothing (single checkpoint row per transition) — a crash mid-write leaves the previous checkpoint intact

#### Scenario: Snapshot builder reference is live

- **WHEN** the run-record spec assets are inspected
- **THEN** the snapshot-reconstruction builder SHALL be named `src/adapter.ts`
- **THEN** no asset reference SHALL name the deleted `src/api/fsm-reconstruct.ts`

### Requirement: No historical machinery in migration

The migration module SHALL contain no versioned delta ladder, no interim repair steps, no `applied_at` tracking, and no upgrade paths for legacy shapes. History lives in git and ADRs, not in the DB bootstrap.

#### Scenario: No interim repair code

- **WHEN** the migration module is inspected
- **THEN** no interim repair, no versioned delta ladder, and no `applied_at` tracking SHALL exist

#### Scenario: Fresh database is the only path

- **WHEN** `migrate()` runs
- **THEN** it SHALL apply the single final DDL if absent — nothing else

### Requirement: Run record holds identity, progress, routing, timestamps

The run record SHALL hold only: identity (runId, graphName), progress (fsmState), dispatch parameters (args), and timestamps (createdAt, updatedAt). Duration SHALL be derived, never persisted. Node states SHALL hold only: status, retryCount, startedAt, completedAt — carried in checkpointed execution state, not a separate table.

#### Scenario: Dispatch reads from the same source

- **WHEN** a run is reconstructed after restart
- **THEN** the same frozen fields (identity/progress/args/timestamps) SHALL drive dispatch — no additional fields are reconstructed from elsewhere

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
- **THEN** its checkpoints SHALL be deleted with it

### Requirement: Active-run progress mirror unchanged

The active-run mirror SHALL remain scheduler-owned progress facts (runId, graphName, currentPhaseId, nodeStatus, retryCount, nodeOperations, declaredAt) written atomically on transitions; consumers read-only.

#### Scenario: Mirror written on transitions

- **WHEN** a run starts/advances/jumps/force-ends
- **THEN** the mirror SHALL be rewritten atomically (tmp+rename) with the new run position

#### Scenario: Mirror reflects progress only

- **WHEN** the mirror is read
- **THEN** it SHALL contain progress facts only — never node content or agent session output

#### Scenario: No active run

- **WHEN** no run is active
- **THEN** the mirror SHALL be cleared (absence = no run-position constraint)

### Requirement: No in-memory graph definition cache

The scheduler SHALL NOT hold loaded graph definitions in an in-memory cache (per-run or shared); graph definitions are loaded fresh per dispatch. Run-scoped in-memory dispatch bookkeeping (the snapshot delta cursor, the idempotency cursor, the single-flight lock) SHALL be bounded — entries SHALL be pruned when a run terminates or completes — and SHALL NOT be the authority for idempotency across process restarts: a re-reported completed nodeId SHALL be recognized from persisted run state. Idempotency semantics SHALL survive a server restart.

#### Scenario: Run lifecycle without cache drop

- **WHEN** a run is deleted or force-ended
- **THEN** no graph definition cache entry exists to drop — only bookkeeping cleanup runs, and the run's bookkeeping entries SHALL be pruned

#### Scenario: No graphLoadCache symbol remains

- **WHEN** the scheduler source is scanned for a graph definition cache
- **THEN** no `graphLoadCache` symbol and no per-run load cache SHALL exist

#### Scenario: Idempotency survives restart

- **WHEN** a server process restarts between an advance and a duplicate re-report of the same completed nodeId without a branch
- **THEN** the duplicate call SHALL remain an idempotent no-op success derived from persisted run state

### Requirement: Checkpoint history SHALL be queryable

The checkpoint store SHALL retain a queryable transition history per run: each persisted transition appends a checkpoint; consumers SHALL be able to enumerate a run's state history in order (event history — the former gap covered by the framework's checkpoint history).

#### Scenario: Transition history listing

- **WHEN** a run has executed multiple transitions
- **THEN** its checkpoint history lists each transition in execution order with its resulting state

### Requirement: Checkpoint write idx SHALL be stable per channel

The checkpoint saver's `putWrites` SHALL assign every written channel a stable, non-colliding `idx` — channels not covered by the framework's standard channel map SHALL receive a deterministic in-batch index. Two distinct channels SHALL never collapse onto the same conflict key in `checkpoint_writes`.

#### Scenario: custom channels do not clobber each other

- **WHEN** a checkpoint write batch contains multiple custom state channels (e.g. nodeStatus and retryCount) in one task
- **THEN** each channel SHALL persist under its own `idx`, and re-reading the checkpoint SHALL return all channels' values

### Requirement: Adapter dispatch internals SHALL be instance-scoped and strongly typed

The adapter dispatch core (`src/adapter.ts`) SHALL keep its dispatch bookkeeping (the single-flight lock `inflight`, the idempotency cursor `lastReported`) on the `GraphAdapter` instance — module-scope shared mutable state SHALL NOT exist (two instances sharing one lock is implicit coupling). Internal snapshot/NodeDetail builders SHALL be private (no widening of the public surface without external consumers). The snapshot node status SHALL be typed by the `NodeStatus` union (`pending` | `active` | `done`) — the strict union SHALL NOT be loosened to `string` at the snapshot boundary. The dispatch core (idempotency guards, missed-selection branch exclusivity, direct-end, natural drain, Command resume, force-end guards) SHALL carry focused unit coverage in `adapter.test.ts` (table-driven state transitions) — indirect integration coverage alone is insufficient.

#### Scenario: Instance-scoped bookkeeping

- **WHEN** two `GraphAdapter` instances run in one process
- **THEN** their single-flight locks and idempotency cursors SHALL be independent (instance fields, not module state)

#### Scenario: Snapshot status typed

- **WHEN** a snapshot is assembled
- **THEN** `ISnapshotNode.status` SHALL be the `NodeStatus` union — no `string` loosening at the boundary

#### Scenario: Focused unit coverage

- **WHEN** the test suite runs
- **THEN** `adapter.test.ts` SHALL exercise the guard/idempotency/exclusivity/drain/end branches directly (table-driven state transitions)
