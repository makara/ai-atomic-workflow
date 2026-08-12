# graph-mcp-api Specification

## Purpose

9 MCP tools (CRUD/query/maintenance) + DTOs + server process support. Assets: `packages/graph-scheduler/src/api/` (7 files), `runtime-start.ts`, `debug.ts`, `filesystem.ts`.

## Requirements

### Requirement: graph_force_end — force terminate a run

System SHALL force-terminate a running graph: all non-terminal nodes marked `skipped`, run status set to `terminated`. Operation is irreversible.

#### Scenario: graph_force_end terminates running graph

- **WHEN** `graph_force_end({ runId })` is called on a running run
- **THEN** all `pending` or `active` nodes SHALL be marked `skipped`
- **THEN** run status SHALL be set to `terminated`
- **THEN** subsequent `graph_advance` calls SHALL fail

#### Scenario: graph_force_end on completed run is no-op

- **WHEN** `graph_force_end` is called on an already completed or terminated run
- **THEN** no state change SHALL occur
- **THEN** a success response SHALL still be returned

### Requirement: graph_status — query run snapshot

System SHALL return the full state of a run: run metadata plus per-node states with status, retry count, and timestamps. The compact snapshot returned by `graph_advance` and `graph_jump` SHALL also include per-node states, enabling downstream jump-target enumeration without a separate `graph_status` call. `graph_status` SHALL NOT return node output text — run content lives in the platform session transcript.

#### Scenario: graph_status returns full snapshot

- **WHEN** `graph_status({ runId })` is called
- **THEN** the response SHALL include run-level fields: `runId`, `graphName`, `status`, `createdAt`, `updatedAt`
- **AND** per-node states with `nodeId`, `status`, `retryCount`, `startedAt`, `completedAt`, `durationMs`

#### Scenario: Advance and jump snapshots include node states

- **WHEN** `graph_advance` or `graph_jump` returns its snapshot
- **THEN** the snapshot SHALL include a `nodes` array with `nodeId` and `status` for every phase of the run

#### Scenario: graph_status returns outputs

- **WHEN** `graph_status({ runId })` is called after nodes completed
- **THEN** the response SHALL include status and timestamps per node
- **AND** SHALL NOT include node output text (content is queried via the platform session, not the scheduler)

### Requirement: graph_list — list all runs

System SHALL return a summary of all runs, ordered by creation time descending.

#### Scenario: graph_list returns run summaries

- **WHEN** `graph_list()` is called
- **THEN** a list of run summaries SHALL be returned, sorted newest-first
- **THEN** each summary SHALL include: `runId`, `graphName`, `status`, `startedAt`
- **THEN** an empty list SHALL be returned when no runs exist

### Requirement: graph_init — initialize database

System SHALL create database tables and run migrations. Operation SHALL be idempotent — safe to call multiple times.

#### Scenario: graph_init creates tables on first call

- **WHEN** `graph_init()` is called on a fresh database
- **THEN** `graph_runs` and `node_states` tables SHALL be created
- **THEN** a success response SHALL be returned

#### Scenario: graph_init is idempotent

- **WHEN** `graph_init()` is called on an already-initialized database
- **THEN** no error SHALL occur
- **THEN** existing data SHALL be preserved

### Requirement: graph_clean_completed — clean completed runs

System SHALL remove completed run records and their node states. An optional `before` timestamp filters by completion time.

#### Scenario: graph_clean_completed removes old runs

- **WHEN** `graph_clean_completed({ before: "2026-01-01T00:00:00Z" })` is called
- **THEN** all runs with status `completed` and `updatedAt` before the timestamp SHALL be deleted
- **THEN** associated `node_states` rows SHALL be cascade-deleted
- **THEN** running, failed, or terminated runs SHALL be preserved

#### Scenario: graph_clean_completed without timestamp cleans all completed

- **WHEN** `graph_clean_completed()` is called with no `before` argument
- **THEN** all completed runs regardless of age SHALL be deleted

### Requirement: graph_clean_all — clean all runs

System SHALL remove all run records regardless of status. This is a dangerous operation and SHALL be called explicitly by the user.

#### Scenario: graph_clean_all removes everything

- **WHEN** `graph_clean_all()` is called
- **THEN** all rows in `graph_runs` and `node_states` SHALL be deleted
- **THEN** a success response SHALL be returned indicating the number of runs removed

### Requirement: MCP transport and error mapping

System SHALL communicate via MCP JSON-RPC 2.0 over stdio. Domain errors SHALL map to MCP error codes with descriptive messages.

#### Scenario: stdio transport is the sole interface

- **WHEN** graph-scheduler starts — it SHALL listen on stdin and write to stdout
- **THEN** no network port SHALL be opened
- **THEN** all 9 tools SHALL be registered with their JSON Schema input schemas

#### Scenario: Domain errors map to MCP error codes

- **WHEN** a `NotFoundError` occurs — MCP error code SHALL indicate resource not found
- **WHEN** an `InvalidStateError` occurs — MCP error code SHALL indicate invalid state transition
- **WHEN** a `GraphDefinitionError` occurs — MCP error code SHALL indicate invalid input
- **WHEN** a `PersistenceError` occurs — MCP error code SHALL indicate internal error
- **THEN** each error response SHALL include a human-readable message with context (runId, phaseId, file path)

### Requirement: graph_start — snapshot response unchanged

`graph_start` SHALL continue to return the run snapshot (isomorphic with graph_advance/graph_jump). Snapshot consumption points = jump-target enumeration (M2) + progress display + API self-containment.

#### Scenario: graph_start returns snapshot with node states

- **WHEN** `graph_start` returns the first node
- **THEN** the response SHALL include a `snapshot` with run-level fields and a `nodes` array (nodeId/status/retryCount/startedAt/completedAt/durationMs per phase)

#### Scenario: advance and jump snapshots unchanged

- **WHEN** `graph_advance` or `graph_jump` returns its snapshot
- **THEN** the snapshot SHALL include the `nodes` array with `nodeId` and `status` for every phase
- **AND** jump-target enumeration from snapshot SHALL remain available

### Requirement: skill field SHALL accept plain names only

The PhaseSchema `skill:` field SHALL reject URI-form values (`skill://…`) at schema parse time. Accepted values SHALL be plain skill names. Rejection SHALL be a schema-level error (declared surface = effective surface), not a runtime dependency on platform resolution.

#### Scenario: URI-form skill value rejected at load

- **WHEN** a graph declares `skill: 'skill://my-agent'` in a phase
- **THEN** graph loading SHALL fail with a schema error identifying the URI-form value
- **AND** no run SHALL be created

#### Scenario: Plain-name skill value accepted

- **WHEN** a graph declares `skill: atom-scope-interview`
- **THEN** the phase SHALL load with `skill` passed through as the plain name

### Requirement: graph_advance SHALL carry branch routing

`graph_advance` SHALL accept an optional branch routing parameter (branch target node id) alongside runId/nodeId/durationMs. The scheduler SHALL apply it as a BRANCH event (activate target or JUMP-reset per target state).

#### Scenario: Advance applies forward branch

- **WHEN** the agent advances a gate node with a selected branch target
- **THEN** the scheduler SHALL activate that target as the next node

### Requirement: graph_start — resolution source and description in response

`graph_start` SHALL return, alongside the first node and snapshot: the resolved graph's `description` (graph top-level field, when declared) and `resolvedFrom` (`project` | `builtin` | `fallback`) with the resolved absolute path. Consumers (pilot) SHALL use these for the identity banner before first-node execution.

#### Scenario: graph_start carries description and source

- **WHEN** `graph_start({ graphName: "graph-generate" })` is called
- **THEN** the response SHALL include the graph's `description` text (when declared)
- **AND** `resolvedFrom` SHALL identify the resolution source (project/builtin/fallback)
- **AND** the resolved absolute path SHALL be present

#### Scenario: Description absent yields no field

- **WHEN** the graph declares no description
- **THEN** the response SHALL omit the description field (no empty string sentinel)

### Requirement: graph_force_end — probe-run cleanup contract

`graph_force_end` SHALL remain the cleanup mechanism for validation probe runs: terminating a probe run marks its non-terminal nodes and completes the run as `terminated`. Graph tasks SHALL use force_end (or graph_clean_completed) after load probes — probe runs SHALL NOT be left as residue.

#### Scenario: Probe run force-ended

- **WHEN** a validation probe run is force-ended
- **THEN** the run SHALL be `terminated` with no active nodes
- **AND** subsequent probe runs SHALL NOT collide with it

### Requirement: graph_advance — report completion without durationMs

System SHALL accept a node completion report and return the next ready node, combining notify and askNext into a single atomic call. The call SHALL accept optional `branchTo` (routing decision target) and optional `endRun` (approval end action) and SHALL NOT accept `durationMs` — node duration is derived by the scheduler from `startedAt`/`completedAt` timestamps, never reported. The call SHALL NOT accept an `output` parameter — node content is produced and consumed in the agent session (platform-persisted), never persisted by the scheduler. The call SHALL NOT accept a `status` or failure flag — a phase that failed during execution SHALL be recorded by the scheduler as `done` (failure semantics live in the agent session, not the scheduler DB). No `skip` parameter SHALL exist — there is no skip state (unchosen branches stay pending forever).

#### Scenario: graph_advance returns next ready node

- **WHEN** `graph_advance({ runId, nodeId: "lint" })` is called
- **THEN** the `lint` node SHALL be marked `done` with `completedAt` set
- **AND** the next ready node SHALL be returned with its dispatch payload

#### Scenario: graph_advance derives duration from timestamps

- **WHEN** a node has `startedAt` and `completedAt` set
- **THEN** the snapshot's `durationMs` for that node SHALL equal `Date.parse(completedAt) - Date.parse(startedAt)`

#### Scenario: graph_advance reports output

- **WHEN** `graph_advance({ runId, nodeId: "lint" })` is called
- **THEN** no output SHALL be accepted or persisted — node content stays in the agent session (platform-persisted)

#### Scenario: Upstream outputs delivered with dispatch

- **WHEN** `graph_advance` or `graph_jump` returns the next node
- **THEN** the response SHALL include channel/dependsOn declarations but SHALL NOT include upstream output text — consumers assemble upstream context from the executing agent's session (platform-persisted), never from the payload or files

#### Scenario: graph_advance returns null when graph complete

- **WHEN** `graph_advance` completes the final phase (all phases `done` or `aborted`)
- **THEN** `null` SHALL be returned — indicating graph execution is complete

#### Scenario: graph_advance has no skip parameter

- **WHEN** an agent calls `graph_advance` attempting a `skip` flag
- **THEN** the call SHALL fail schema validation — no skip state exists, unchosen branch-route nodes stay `pending` forever

#### Scenario: graph_advance fails on unknown runId

- **WHEN** `graph_advance` references a non-existent `runId`
- **THEN** an MCP error SHALL be returned with code indicating the run was not found

#### Scenario: failed phase advances as done

- **WHEN** a phase fails and the agent calls `graph_advance` without a status parameter
- **THEN** the scheduler SHALL record the node as `done` and dispatch the next node

### Requirement: graph_start — snapshot response without contract warnings

The `graph_start` response SHALL include the run snapshot, resolution identity (`resolvedFrom`, `resolvedPath`, `description`), and the first node — and SHALL NOT include `contractWarnings` (the load-time skill-contract pass is removed from the engine; entry-skill alignment runs agent-side in estate-maintain).

#### Scenario: graph_start response carries no contract warnings

- **WHEN** `graph_start({ graphName })` returns a node
- **THEN** the response SHALL have no `contractWarnings` field regardless of graph/skill contract state

### Requirement: snapshot carries fsmState only

The run snapshot SHALL carry `fsmState` as the single run-status field; a `status` alias SHALL NOT exist. `graphList` SHALL return the same shape from every path (runId, graphName, fsmState, createdAt, updatedAt).

#### Scenario: snapshot has no status alias

- **WHEN** any tool returns a run snapshot
- **THEN** `fsmState` SHALL be present and `status` SHALL be absent

#### Scenario: graph_list shape unified

- **WHEN** `graph_list` is called
- **THEN** every entry SHALL carry runId, graphName, fsmState, createdAt, updatedAt — identical across code paths

### Requirement: NodeDetail carries no handlerSkill

NodeDetail SHALL NOT carry `handlerSkill` — the handler skill for main/approval/gate dispatch is the constant `atom-phase-handler` known agent-side.

#### Scenario: NodeDetail omits the constant field

- **WHEN** graph_start/graph_advance/graph_jump returns a NodeDetail
- **THEN** the payload SHALL have no `handlerSkill` field

### Requirement: graph_advance SHALL carry branch routing without durationMs

MODIFIED: `graph_advance` SHALL accept an optional branch routing parameter (branch target node id) alongside runId/nodeId — and SHALL NOT accept `durationMs` (derived from timestamps). The scheduler SHALL apply it as a BRANCH event (activate target or JUMP-reset per target state).

#### Scenario: Advance applies forward branch

- **WHEN** the agent advances a gate node with a selected branch target
- **THEN** the scheduler SHALL activate that target as the next node

#### Scenario: Advance reports no duration

- **WHEN** an agent calls `graph_advance({ runId, nodeId, branchTo })`
- **THEN** the call SHALL succeed without a durationMs argument — the node's duration is derived from startedAt/completedAt

### Requirement: Snapshot delta payload

Every dispatch response (`graph_start`, `graph_advance`, `graph_jump`) carries the run snapshot in delta form: the full `node`, `snapshot.changed` (nodes whose state changed since the previous dispatch, full fields), and `snapshot.nodes` (one compact line per node: `nodeId`, `status`, `retryCount`). Jump navigation and progress display keep their existing semantics; the compact list remains the complete jump-target enumeration.

#### Scenario: Dispatch with changes

- **WHEN** a node completes and `graph_advance` returns the next node
- **THEN** the response includes the completing node's full state in `changed` and a one-line status entry for every run node

#### Scenario: Dispatch without changes

- **WHEN** a dispatch returns without any node state change
- **THEN** `snapshot.changed` is empty and `snapshot.nodes` carries one-line entries only

### Requirement: graph_start mode parameter

`graph_start` accepts `args.mode` (`manual` | `auto`). When absent, the response reports `mode_required` (no run created). When present, the run activates immediately with that mode.

#### Scenario: Mode provided

- **WHEN** `graph_start` is called with `args.mode: "manual"`
- **THEN** a run is created and the response includes `runId`, the first author node, and the delta snapshot

#### Scenario: Mode omitted

- **WHEN** `graph_start` is called without `args.mode`
- **THEN** the response reports `mode_required` and no run is created

### Requirement: graph_advance signature unchanged

`graph_advance(runId, nodeId, branchTo?, endRun?)` keeps its exact parameter surface; no new parameters are added and none are removed.

#### Scenario: Advance

- **WHEN** a pilot reports a completed node via `graph_advance`
- **THEN** the scheduler records progress and returns the next pending node with a delta snapshot

### Requirement: graph_start — create run and return first author node

System SHALL create a new graph execution run and immediately return the first ready node, combining run creation and initial askNext into a single atomic call. The response SHALL include the run snapshot (`runId`, `graphName`, `fsmState`/`status`, `currentPhaseId`, `nodeCount`, `completedCount`, timestamp, `nodes` array — isomorphic with graph_advance/graph_jump) — the first node (entry dispatch) carries the snapshot for jump-target enumeration and progress display. The first node SHALL be the graph's first author entry node — no activation prefix exists (activation facts live at the invocation boundary: `graph_start` `args.mode`; the pilot loads constraints).

#### Scenario: graph_start creates run for valid graph

- **WHEN** `graph_start({ graphName: "ci-pipeline" })` is called
- **THEN** a new run SHALL be created with status `running` and a unique `runId`
- **THEN** all phases SHALL be initialized as `pending`
- **THEN** the first ready batch SHALL be resolved and the first node returned as `NextNode`
- **THEN** `NextNode` SHALL include: `runId`, `graphName`, `nodeId`, `type`, and type-specific fields

#### Scenario: graph_start returns snapshot with node states

- **WHEN** `graph_start` returns the first node
- **THEN** the response SHALL include a `snapshot` with run-level fields and a `nodes` array (nodeId/status/retryCount/startedAt/completedAt/durationMs per phase)
- **AND** the first node SHALL be `active` in the snapshot

#### Scenario: graph_start with args passes args to graph

- **WHEN** `graph_start({ graphName: "...", args: { branch: "main" } })` is called
- **THEN** the args SHALL be stored with the run and available for template interpolation

#### Scenario: graph_start fails on unknown graph

- **WHEN** `graph_start` references a graph name with no corresponding `.taskflow.yaml`
- **THEN** an MCP error SHALL be returned with code indicating the graph was not found

### Requirement: graph_jump — reset target and downstream

System SHALL reset a target phase and its downstream terminal nodes to `pending`, then return the next node. Jump targets are node ids; jumps never touch an activation prefix (no prefix exists — entry-node jumps reset author nodes only).

#### Scenario: graph_jump resets target and upstream

- **WHEN** `graph_jump({ runId, targetPhaseId: "loop-entry" })` and loop-entry is an entry node
- **THEN** the target and its downstream terminal nodes are reset to `pending` (upstream preserved)

#### Scenario: graph_jump to mid-graph keeps entry

- **WHEN** `graph_jump` targets a non-entry node (re-running the review node)
- **THEN** the entry node is not reset — only the target and its downstream are reset

#### Scenario: graph_jump fails on non-existent phase

- **WHEN** `graph_jump` references a `targetPhaseId` not in the graph
- **THEN** an MCP error SHALL be returned
