# graph-mcp-api Specification

## Purpose

9 MCP tools (CRUD/query/maintenance) + DTOs + server process support. Assets: `packages/graph-scheduler/src/api/` (7 files), `runtime-start.ts`, `debug.ts`, `filesystem.ts`.

## Requirements

### Requirement: graph_start — create run and return first node

System SHALL create a new graph execution run and immediately return the first ready node, combining run creation and initial askNext into a single atomic call. The response SHALL include the run snapshot (`runId`, `graphName`, `fsmState`/`status`, `currentPhaseId`, `nodeCount`, `completedCount`, timestamp, `nodes` array — isomorphic with graph_advance/graph_jump) — the first node (entry dispatch) carries the snapshot for jump-target enumeration and progress display. The first node SHALL be an activated prefix node (when approvals exist, `$run-mode-confirm` comes first, then `$load-constraints`), and only then the author entry node.

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

#### Scenario: First node is prologue when approvals exist

- **WHEN** `graph_start` creates a run with approval nodes
- **THEN** the first dispatched node is `$run-mode-confirm`, followed by `$load-constraints`, then the author entry node

#### Scenario: First node is load only for approval-less graph

- **WHEN** `graph_start` creates a run without approval nodes
- **THEN** the first dispatched node is `$load-constraints` (no confirm synthesized)

#### Scenario: graph_start fails on unknown graph

- **WHEN** `graph_start` references a graph name with no corresponding `.taskflow.yaml`
- **THEN** an MCP error SHALL be returned with code indicating the graph was not found

### Requirement: graph_advance — report completion and get next node

System SHALL accept a node completion report and return the next ready node, combining notify and askNext into a single atomic call. The call SHALL NOT accept a `status` or failure flag — a phase that failed during execution SHALL be recorded by the scheduler as `done` (failure semantics live in the agent session and output files, not the scheduler DB).

#### Scenario: graph_advance returns next ready node

- **WHEN** `graph_advance({ runId, nodeId: "lint", durationMs: 1234 })` is called
- **THEN** the `lint` node SHALL be marked `done` with the reported duration
- **THEN** the next ready node (whose dependencies are now satisfied) SHALL be returned
- **THEN** the returned `NextNode` SHALL have type `agent` or `approval`

#### Scenario: graph_advance returns null when graph complete

- **WHEN** `graph_advance` completes the final phase (all phases `done` or `skipped`)
- **THEN** `null` SHALL be returned — indicating graph execution is complete
- **THEN** run status SHALL be `completed`

#### Scenario: graph_advance with skip marks node as skipped

- **WHEN** `graph_advance({ runId, nodeId: "...", durationMs: 0, skip: true })` is called
- **THEN** the node SHALL be marked `skipped` instead of `done`
- **THEN** downstream nodes SHALL become ready as if the node completed normally

#### Scenario: graph_advance fails on unknown runId

- **WHEN** `graph_advance` references a non-existent `runId`
- **THEN** an MCP error SHALL be returned with code indicating the run was not found

#### Scenario: failed phase advances as done

- **WHEN** a phase fails and the agent calls `graph_advance` without a status parameter
- **THEN** the scheduler SHALL record the node as `done` and dispatch the next node
- **THEN** the failure SHALL NOT be observable via `graph_status` or snapshot node states (session-local visibility)

### Requirement: graph_jump — directed jump to target phase

System SHALL reset a target phase and its downstream terminal nodes to `pending`, then return the next node. When the target is an entry node (in-degree 0 after flattening), SHALL also reset the activation prefix and dispatch it first; when the target is a non-entry node, SHALL NOT touch P (in-round rework).

#### Scenario: graph_jump resets target and upstream

- **WHEN** `graph_jump({ runId, targetPhaseId: "loop-entry" })` and loop-entry is an entry node
- **THEN** the target and its downstream terminal nodes are reset to `pending` (upstream preserved)
- **THEN** P is reset and dispatched first (confirm/load re-run), followed by the target node

#### Scenario: graph_jump to mid-graph keeps P

- **WHEN** `graph_jump` targets a non-entry node (re-running the review node)
- **THEN** P state is preserved — this round's confirm/load outputs remain valid

#### Scenario: graph_jump fails on non-existent phase

- **WHEN** `graph_jump` references a `targetPhaseId` not in the graph
- **THEN** an MCP error SHALL be returned

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

System SHALL return the full state of a run: run metadata plus per-node states with status, retry count, and timestamps. The compact snapshot returned by `graph_advance` and `graph_jump` SHALL also include per-node states, enabling downstream jump-target enumeration without a separate `graph_status` call.

#### Scenario: graph_status returns full snapshot

- **WHEN** `graph_status({ runId })` is called
- **THEN** the response SHALL include run-level fields: `runId`, `graphName`, `status`, `createdAt`, `updatedAt`
- **THEN** the response SHALL include a `nodes` array where each entry has: `nodeId`, `status`, `retryCount`, `startedAt`, `completedAt`, `durationMs`

#### Scenario: Advance and jump snapshots include node states

- **WHEN** `graph_advance` or `graph_jump` returns its snapshot
- **THEN** the snapshot SHALL include a `nodes` array with `nodeId` and `status` for every phase of the run
- **THEN** a pilot SHALL be able to enumerate completed (`done`) and `skipped` nodes from the snapshot for jump-target enumeration
- **THEN** node `status` SHALL be one of the FSM-produced values (`pending`, `active`, `done`, `skipped`) — `failed` is not a node status (failures are session-local, not persisted by the scheduler)

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

### Requirement: graph_start — mode parameter

`graph_start` SHALL NOT accept a `mode` parameter (removed — the separation-from-args semantics is finalized). Mode is consumed by the `$run-mode-confirm` node via `args.mode` (an `{args.X}` interpolation variable) — args keep their graph-level input semantics unchanged.

#### Scenario: graph_start with mode creates auto run

- **WHEN** `graph_start({ graphName: "...", mode: "auto" })` is called
- **THEN** input validation rejects the unknown top-level parameter `mode` — graph-level mode is passed via `args: { mode: "auto" }` (callers must migrate)

#### Scenario: graph_start without mode defaults manual

- **WHEN** `graph_start({ graphName: "..." })` is called and args.mode is not set
- **THEN** the `$run-mode-confirm` node asks per the absence-never-auto protocol (Manual recommended default) — no run-level default injection

#### Scenario: mode is distinct from args

- **WHEN** `graph_start({ graphName: "...", args: { mode: "auto", changeName: "x" } })` is called
- **THEN** `args.mode` participates in `{args.X}` interpolation — the confirm node's task text carries the value and emits `{ "mode": "auto" }`; the remaining args keep their semantics unchanged

### Requirement: graph_start — snapshot response unchanged

`graph_start` SHALL continue to return the run snapshot (isomorphic with graph_advance/graph_jump). Snapshot consumption points = jump-target enumeration (M2) + progress display + API self-containment; P nodes SHALL appear in the snapshot `nodes` (status/retryCount visible).

#### Scenario: graph_start returns snapshot with node states

- **WHEN** `graph_start` returns the first node
- **THEN** the response SHALL include a `snapshot` with run-level fields and a `nodes` array (nodeId/status/retryCount/startedAt/completedAt/durationMs per phase)
- **AND** P nodes are included in `nodes` (`$run-mode-confirm`, `$load-constraints`)

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

### Requirement: handlerSkill SHALL be name-based

NodeDetail `handlerSkill` SHALL carry the plain skill name (`atom-phase-handler`) and SHALL be documented as "load skill named X per the skill-resolution convention" — never "load via `skill://<name>`".

#### Scenario: NodeDetail documents name-based loading

- **WHEN** NodeDetail is constructed with `handlerSkill: 'atom-phase-handler'`
- **THEN** the consuming agent SHALL load the skill by the resolution convention (plain name → SKILL.md)
- **AND** the documented loading mechanism SHALL contain no URI form

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
