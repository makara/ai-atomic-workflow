# graph-mcp-api Specification

## Purpose

9 MCP tools (CRUD/query/maintenance) + DTOs + server process support. Assets: `packages/graph-scheduler/src/api/` (7 files), `runtime-start.ts`, `debug.ts`, `filesystem.ts`.

## Requirements

### Requirement: graph_force_end — force terminate a run

MODIFIED: `graph_force_end` SHALL terminate a run that is neither `completed` nor `terminated`: the run record SHALL be set to `terminated` and the checkpoint state SHALL carry the terminated flag so subsequent dispatches fail. The operation SHALL be irreversible. Force-end SHALL NOT annotate individual nodes (no per-node `aborted` writes — nothing consumes node status after termination; jump/advance reject terminated runs). Mechanism: the adapter mutates the checkpoint state (terminated flag) and the run record (`fsm_state='terminated'`) directly — no goto-END traversal. A force-end on an already `completed` or `terminated` run SHALL be a no-op with no state change (guard parity with `graph_advance`/`graph_jump`).

#### Scenario: graph_force_end terminates running graph

- **WHEN** `graph_force_end({ runId })` is called on a running run
- **THEN** run status SHALL be set to `terminated`
- **THEN** the checkpoint SHALL carry the terminated flag
- **THEN** subsequent `graph_advance` and `graph_jump` calls SHALL fail
- **THEN** node statuses SHALL be unchanged (no aborted annotations)

#### Scenario: graph_force_end on completed run is no-op

- **WHEN** `graph_force_end` is called on an already completed run
- **THEN** no state change SHALL occur — the run SHALL remain `completed`

#### Scenario: graph_force_end on terminated run is no-op

- **WHEN** `graph_force_end` is called on an already terminated run
- **THEN** no state change SHALL occur

### Requirement: graph_status — query run snapshot

MODIFIED: `graph_status` SHALL return the full snapshot: run metadata plus the complete `nodes` array (one compact line per node: `nodeId`, `status`, `retryCount`) and `changed` full-field rows. The full snapshot SHALL be produced by the same builder as the hot-path dispatches (single snapshot path — one builder, two delivery shapes; no divergent shape from a second builder). Snapshot SHALL be derived from the runtime's persisted execution state (`getState`/`getStateHistory`) via the adapter. `graph_status` SHALL NOT return node output text — run content lives in the platform session transcript.

#### Scenario: graph_status returns full snapshot

- **WHEN** `graph_status` queries an existing run
- **THEN** the response SHALL include run metadata plus the complete `nodes` array with per-node status, retry count, and timestamps

#### Scenario: status and dispatch snapshots share shape

- **WHEN** a run is queried via graph_status and via graph_advance
- **THEN** both responses SHALL be produced by the identical snapshot builder — `graph_status` delivers the full shape (nodes + changed), hot-path dispatches deliver the compact shape (progress + changed)

#### Scenario: Advance and jump snapshots include node states

- **WHEN** `graph_advance` or `graph_jump` returns its snapshot
- **THEN** the compact snapshot SHALL carry `progress` plus `changed` rows for changed nodes; the full `nodes` array SHALL be retrievable via `graph_status`

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

System SHALL create the database schema (checkpoint tables) and run migrations, then run the machine health check: scan the workflow directories for graph definitions, validate each matched YAML against the workflow schema (schema validation, not YAML-parse only), and report config health. Operation SHALL be idempotent — safe to call multiple times. Scan matching SHALL be suffix-free (any `.yaml`/`.yml` under the workflow dirs), consistent with schema-determined graph identity.

#### Scenario: graph_init creates tables on first call

- **WHEN** `graph_init()` is called on a fresh database
- **THEN** the checkpoint schema tables SHALL be created
- **THEN** a success response SHALL be returned

#### Scenario: graph_init is idempotent

- **WHEN** `graph_init()` is called on an already-initialized database
- **THEN** no error SHALL occur
- **THEN** existing data SHALL be preserved

#### Scenario: Health scan validates schema

- **WHEN** `graph_init()` scans a workflow directory containing a YAML that fails the workflow schema validation
- **THEN** the health report SHALL surface the schema violation (not merely a YAML parse result)

### Requirement: graph_clean_completed — clean completed runs

System SHALL remove completed run records and their checkpoints. An optional `before` timestamp filters by completion time.

#### Scenario: graph_clean_completed removes old runs

- **WHEN** `graph_clean_completed({ before: "2026-01-01T00:00:00Z" })` is called
- **THEN** all runs with status `completed` and `updatedAt` before the timestamp SHALL be deleted
- **THEN** associated checkpoint data SHALL be cascade-deleted
- **THEN** running, failed, or terminated runs SHALL be preserved

#### Scenario: graph_clean_completed without timestamp cleans all completed

- **WHEN** `graph_clean_completed()` is called with no `before` argument
- **THEN** all completed runs regardless of age SHALL be deleted

### Requirement: graph_clean_all — clean all runs

System SHALL remove all run records regardless of status. This is a dangerous operation and SHALL be called explicitly by the user.

#### Scenario: graph_clean_all removes everything

- **WHEN** `graph_clean_all()` is called
- **THEN** all run and checkpoint rows SHALL be deleted
- **THEN** a success response SHALL be returned indicating the number of runs removed

### Requirement: MCP transport and error mapping

MODIFIED: domain errors SHALL be a single contract — one `SchedulerError` union (including `ConfigError`) SHALL be the sole domain-error surface; adapter errors SHALL be members of that union; one `TAG_TO_CODE` map SHALL map the union to MCP error codes. Invalid-state transition errors SHALL retain the phase-level detail (phase id, expected state, attempted action) — dispatch catches SHALL NOT replace the phase detail with a generic status-only message.

#### Scenario: stdio transport is the sole interface

- **WHEN** graph-scheduler starts — it SHALL listen on stdin and write to stdout
- **THEN** no network port SHALL be opened
- **THEN** all 10 tools SHALL be registered with their JSON Schema input schemas

#### Scenario: Domain errors map to MCP error codes

- **WHEN** a `NotFoundError` occurs — MCP error code SHALL indicate resource not found
- **WHEN** an `InvalidStateError` occurs — MCP error code SHALL indicate invalid state transition
- **WHEN** a `GraphDefinitionError` occurs — MCP error code SHALL indicate invalid input
- **WHEN** a `PersistenceError` occurs — MCP error code SHALL indicate internal error
- **WHEN** a `ConfigError` occurs — MCP error code SHALL indicate invalid configuration
- **THEN** each error response SHALL include a human-readable message with context (runId, phaseId, file path)

#### Scenario: Invalid transition error carries phase detail

- **WHEN** a transition fails because the reported phase is not active or does not exist
- **THEN** the error message SHALL name the phase and the expected/actual state, never a generic message without the phase

### Requirement: graph_start — snapshot response unchanged

MODIFIED: `graph_start` SHALL return the compact snapshot (run scalars + `progress` + `changed`) alongside the first node, isomorphic with `graph_advance`/`graph_jump`. API self-containment for jump-target enumeration SHALL be served via `graph_status`.

#### Scenario: graph_start returns snapshot with node states

- **WHEN** `graph_start` returns the first node
- **THEN** the response SHALL include a compact `snapshot` with run-level fields and a `progress` line; the first node SHALL be `active`; the full `nodes` array SHALL be available via `graph_status`

#### Scenario: advance and jump snapshots unchanged

- **WHEN** `graph_advance` or `graph_jump` returns its snapshot
- **THEN** the snapshot SHALL carry the compact delivery (progress + changed)
- **AND** jump-target enumeration from the full snapshot SHALL remain available via `graph_status`

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

MODIFIED: `graph_advance` SHALL accept an optional `condition` value (normal advance — the reported node's flow-matched condition; the scheduler looks up the transition table and activates the matched target; no match SHALL fail loudly — missed-condition guard) and an optional `jump` target (forced rework — restricted to the node's topological ancestors plus `__handoff`; forward jumps SHALL be rejected loudly; the target and its downstream terminal nodes reset to pending with retryCount incremented, never zeroed, upstream kept). The `branchTo` parameter SHALL NOT exist — no backward-reset/activation disambiguation parameter remains. The `end` parameter SHALL keep direct-end semantics (reported node done + run completed, no graph resume). `nodeId` SHALL be validated as the run's active node; an unrecognized nodeId SHALL fail loudly. A re-reported completed nodeId without condition/jump/end SHALL remain an idempotent no-op.

#### Scenario: Advance applies forward branch

- **WHEN** the agent advances a main node with a condition that matches an outgoing flow edge
- **THEN** the scheduler SHALL activate the matched edge's target as the next node — forward routing is condition-matched, never a target parameter

#### Scenario: Advance applies rework reset

- **WHEN** the agent advances a main node with a jump target (backward forced rework)
- **THEN** the scheduler SHALL reset the target + downstream terminal nodes to pending (retryCount incremented) and re-activate the target

#### Scenario: Invalid branch target fails loudly

- **WHEN** `graph_advance` receives a `jump` target that is not a node of the compiled graph (or is a forward target outside the ancestor set ∪ `__handoff`)
- **THEN** the call SHALL return an InvalidStateError naming the target and no state transition SHALL occur

#### Scenario: Condition advance activates matched target

- **WHEN** `graph_advance` carries `condition: "pass"` and the reported node's flow table maps `pass` to a target
- **THEN** the target activates as the next node

#### Scenario: Condition no-match fails loudly

- **WHEN** `graph_advance` carries a condition that matches no outgoing edge label
- **THEN** the advance SHALL fail loudly (missed-condition guard) — never silently default

#### Scenario: Jump backward rework

- **WHEN** `graph_advance` carries a `jump` target that is a topological ancestor
- **THEN** the target and its downstream terminal nodes reset to pending, retryCount incremented, upstream kept; the target re-dispatches

#### Scenario: Jump forward rejected

- **WHEN** `graph_advance` carries a `jump` target outside the ancestor set (and not `__handoff`)
- **THEN** the advance SHALL be rejected loudly — structure cannot be skipped

#### Scenario: End direct-end unchanged

- **WHEN** `graph_advance` carries `end: true`
- **THEN** the reported node SHALL be marked done and the run completes as `completed` without resuming the graph

#### Scenario: Advance without condition/jump

- **WHEN** `graph_advance` reports a node with neither condition nor jump
- **THEN** the node's sequence default activates — no branch parameter required

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

MODIFIED: `graph_force_end` SHALL remain the cleanup mechanism for validation probe runs: terminating a probe run completes it as `terminated`. Graph tasks SHALL use force_end (or graph_clean_completed) after load probes — probe runs SHALL NOT be left as residue.

#### Scenario: Probe run force-ended

- **WHEN** a validation probe run is force-ended
- **THEN** the run SHALL be `terminated`
- **AND** subsequent probe runs SHALL NOT collide with it

### Requirement: graph_advance — report completion without durationMs

MODIFIED: the call SHALL accept the optional `condition` and `jump` parameters (per the branch-routing requirement) and SHALL NOT accept `durationMs` — node duration is derived by the scheduler from startedAt/completedAt timestamps, never reported. The call SHALL NOT accept an `output` parameter — node content is produced and consumed in the agent session (platform-persisted), never persisted by the scheduler. The call SHALL NOT accept a `status` or failure flag — a phase that failed during execution SHALL be recorded by the scheduler as `done` (failure semantics live in the agent session). No `skip` and no `branchTo` parameter exist.

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

- **WHEN** `graph_advance` completes the final phase (all phases `done`)
- **THEN** `null` SHALL be returned — indicating graph execution is complete

#### Scenario: graph_advance has no skip parameter

- **WHEN** an agent calls `graph_advance` attempting a `skip` flag
- **THEN** the call SHALL fail schema validation — no skip state exists, untargeted branch nodes stay `pending` forever

#### Scenario: graph_advance fails on unknown runId

- **WHEN** `graph_advance` references a non-existent `runId`
- **THEN** an MCP error SHALL be returned with code indicating the run was not found

#### Scenario: failed phase advances as done

- **WHEN** a phase fails and the agent calls `graph_advance` without a status parameter
- **THEN** the scheduler SHALL record the node as `done` and dispatch the next node

#### Scenario: No duration/output parameters

- **WHEN** an agent reports a node completion
- **THEN** the advance accepts runId/nodeId plus optional condition/jump/end only — durationMs and output SHALL be rejected

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

NodeDetail SHALL NOT carry `handlerSkill` — dispatch is the constant main path (`atom-phase-handler`) known agent-side.

#### Scenario: NodeDetail omits the constant field

- **WHEN** graph_start/graph_advance/graph_jump returns a NodeDetail
- **THEN** it SHALL NOT include `handlerSkill` — the single main dispatch path is a constant known agent-side

### Requirement: Snapshot delta payload

MODIFIED: hot-path dispatch responses (`graph_start`, `graph_advance`, `graph_jump`) SHALL carry a compact snapshot — run-level scalars plus a single-line `progress` field and `snapshot.changed` (full-field rows for nodes whose state changed since the previous dispatch). The full `nodes` array (one compact line per node) SHALL NOT be re-serialized on hot-path responses; `graph_status` SHALL serve the full enumeration. Jump navigation and progress display SHALL consume `graph_status` for complete jump-target enumeration. Delta computation SHALL compare current execution state against the per-run snapshot cursor (signature diff).

#### Scenario: Dispatch with changes

- **WHEN** a node completes and `graph_advance` returns the next node
- **THEN** the response includes the completing node's full state in `changed` and a single-line `progress` entry — no full `nodes` array re-serialized

#### Scenario: Dispatch without changes

- **WHEN** a dispatch returns without any node state change
- **THEN** `snapshot.changed` is empty and the response carries the compact progress line only

### Requirement: graph_start — create run and return first author node

MODIFIED: `graph_start` SHALL create a run of the named root graph and return its first author node — root-graph semantics only. No subgraph-launch semantics exist: composition is compile-time nesting, members never start their own runs.

#### Scenario: Root graph start

- **WHEN** `graph_start` is called with a graph name
- **THEN** the run SHALL start at the graph's first author node

#### Scenario: No subgraph start surface

- **WHEN** the frontend needs to execute a composed subgraph
- **THEN** it SHALL advance the root run — no subgraph `graph_start` call exists

### Requirement: graph_jump — reset target and downstream

System SHALL reset a target phase and its downstream terminal nodes to `pending`, then return the next node. Jump targets are node ids; jumps never touch an activation prefix (no prefix exists — entry-node jumps reset author nodes only). Mechanism: adapter routes jump to the runtime's goto transition (backward reset semantics preserved).

#### Scenario: graph_jump resets target and upstream

- **WHEN** `graph_jump({ runId, targetPhaseId: "loop-entry" })` and loop-entry is an entry node
- **THEN** the target and its downstream terminal nodes are reset to `pending` (upstream preserved)

#### Scenario: graph_jump to mid-graph keeps entry

- **WHEN** `graph_jump` targets a non-entry node (re-running the review node)
- **THEN** the entry node is not reset — only the target and its downstream are reset

#### Scenario: graph_jump fails on non-existent phase

- **WHEN** `graph_jump` references a `targetPhaseId` not in the graph
- **THEN** an MCP error SHALL be returned

### Requirement: graph_start — problems surfaced in response

`graph_start` SHALL return, alongside the first node, snapshot, and resolution identity: a `problems` array carrying the load-time contract-pass warnings for the resolved graph (inventory id/type mismatch, registry description drift, project-context warnings). The array SHALL be empty when the graph loads clean. Warning semantics SHALL NOT change — warnings never block, never fail the load.

#### Scenario: Graph with inventory mismatch

- **WHEN** a graph with an inventory id/type mismatch is started
- **THEN** the response carries the mismatch in `problems` with the offending entry and phase cited

#### Scenario: Clean graph

- **WHEN** a graph loads without warnings
- **THEN** `problems` is an empty array — no noisy success output

### Requirement: graph_init — full contract and inventory health pass

`graph_init` SHALL run the machine health check over the complete load pipeline — schema validation AND the contract/inventory pass (errors fail fast, warnings surfaced) — for every graph definition in the workflow directories, and SHALL report per-graph problems in its health output. Operation SHALL remain idempotent.

#### Scenario: Graph with drift found at init

- **WHEN** graph_init scans a graph whose registry description references a non-existent phase
- **THEN** the health report lists that graph with the drift warning attached

### Requirement: graph_assets — graph asset query

A graph asset query tool SHALL return the graph catalog: for each entry `{ id, description, run_conditions, source, problems }` from the merged registries (project-first) plus schema-valid workflow YAML discovered in the workflow directories. `id` SHALL be the graph name (identity). `description` SHALL be the graph definition's top-level description (catalog single source — registry entries carry no description). `run_conditions` SHALL carry the graph definition's `interaction` value (`none` | `enabled`) plus a constraints-presence fact, projected from the graph definition at query time (never a new fact source). `source` SHALL be one of `builtin | project | fallback` — the merged form of the former `registered`/`resolvedFrom` pair: a graph found in a registry resolves to `builtin`/`project` by registry layer; a schema-valid YAML with no registry entry resolves to `fallback`. `problems` SHALL carry the load-time warnings per graph, empty when clean. The payload SHALL NOT carry `version`, `args`, `tags`, `registered`, or `resolvedFrom` as separate fields. The tool SHALL be read-only and SHALL NOT create runs.

#### Scenario: Workflow locates a graph for maintenance

- **WHEN** graph-maintain entry queries the asset surface for a named graph
- **THEN** it receives the five-field entry (`id`, `description`, `run_conditions`, `source`, `problems`) without creating a run — file path resolution stays engine-internal, never surfaced in the catalog payload

#### Scenario: Shadowed graph visible

- **WHEN** a project graph shadows a builtin of the same name
- **THEN** the asset query reports the project entry (`source: project`) — shadowing explicit, never mysterious

#### Scenario: Catalog carries category tags

- **WHEN** the catalog is queried
- **THEN** no entry carries a `tags` field — the category axis is deleted (no use case); users read descriptions instead of filtering by category

#### Scenario: Unregistered valid graph visible

- **WHEN** a schema-valid workflow YAML exists in a workflow directory without a registry entry
- **THEN** the asset query lists it with `source: fallback` — schema-valid graphs are never invisible to the discovery channel

#### Scenario: run_conditions projects from the graph definition

- **WHEN** a graph definition declares `interaction: none` and a non-empty top-level `constraints` array
- **THEN** the entry's `run_conditions` reports interaction `none` and constraints present

#### Scenario: version and args are not perception fields

- **WHEN** a graph declares a `version` and a run is started with args
- **THEN** neither the version nor any args shape appears in the catalog payload

### Requirement: Contract warnings single channel

Contract/inventory pass warnings SHALL surface through the API `problems` surface only. debugLog SHALL NOT carry contract-warning semantics — the dual-emission path (debugLog 'contract_warning' event plus the problems array) is removed. Debug logging SHALL NOT be a warning delivery channel.

#### Scenario: Warning emitted once

- **WHEN** a graph loads with an inventory mismatch
- **THEN** the warning appears in `problems` and no debugLog event carries warning semantics for it

### Requirement: Graph loading without in-memory cache

The load pipeline SHALL NOT cache loaded graph definitions in memory — no per-run graph definition cache, no cross-call cache. Every load (graph_start, graph_advance/graph_jump reload, graph_assets, graph_init) SHALL read and validate the graph fresh from disk. loadGraphForRun SHALL return the load result including `problems` (no type-level erasure), with no compatibility layer for a retired cache API.

#### Scenario: Loads are direct

- **WHEN** graph_assets or graph_init loads a graph
- **THEN** the graph file is read and validated fresh — no cached definition is reused

#### Scenario: loadGraphForRun carries problems

- **WHEN** a run dispatch reloads the graph
- **THEN** the returned load result includes the graph's problems — the field is not erased at the type level

### Requirement: NodeDetail carries graph constraints

Every dispatch response (`graph_start`, `graph_advance`, `graph_jump`) SHALL carry the graph-level constraint set on the returned node: `NodeDetail.constraints` = graph-level rules from the loaded graph definition, `[graph]`-prefixed, assembled by the scheduler — a dispatch fact, never sourced from the agent session. Absent graph-level field SHALL contribute an empty set. Project-level rules are NOT carried in the payload (agent-side activation session copy; merged by the dispatch handler into the `## Constraints` block).

#### Scenario: Graph constraints on first node

- **WHEN** a graph declares 2 constraints and `graph_start` returns the first node
- **THEN** `NodeDetail.constraints` contains 2 `[graph]`-prefixed entries

#### Scenario: Graph constraints on every dispatch

- **WHEN** a run with a graph-level `constraints` field advances through nodes
- **THEN** every returned `NodeDetail` carries the `[graph]`-prefixed entries of the current graph definition — dispatch-time snapshot semantics

#### Scenario: Composed run carries the constraint union

- **WHEN** a run's graph composes subgraphs via `use` phases and advances through nodes
- **THEN** every returned `NodeDetail.constraints` includes the root entries and the composed subgraphs' entries (union)

### Requirement: Unified dispatch return DTO

All dispatch operations SHALL return a consistent envelope. `graph_advance` and `graph_jump` SHALL return `{ snapshot, node }`; `graph_force_end` SHALL return the same envelope with `node: null` (run terminated — no next node). `graph_start` SHALL return `{ snapshot, node, resolvedFrom, resolvedPath, description?, problems? }` (identity fields are start-specific). No operation SHALL return a bare snapshot without the envelope.

#### Scenario: force_end returns the envelope

- **WHEN** graph_force_end terminates a run
- **THEN** the response SHALL be `{ snapshot, node: null }` — same envelope as advance/jump with a null node

### Requirement: NodeDetail SHALL carry no routing actions

NodeDetail SHALL NOT carry a `routingActions` field — the routing-actions mechanism is deleted (0 graph usages at migration). The decision-card topic SHALL derive from the phase `task` field (fallback `Decision Required`).

#### Scenario: Payload carries no routing actions

- **WHEN** graph_start/graph_advance/graph_jump returns a NodeDetail for a confirmation node
- **THEN** the payload SHALL NOT include `routingActions` — no branch-route options are delivered

### Requirement: graph_jump SHALL validate run state

`graph_jump` SHALL reject runs in `terminated` or `completed` state with an InvalidStateError (guard parity with `graph_advance`), and SHALL reject a target phase that is not in the compiled graph.

#### Scenario: jump on terminated run fails

- **WHEN** `graph_jump` is called on a run whose `fsmState` is `terminated` or `completed`
- **THEN** the call SHALL fail with InvalidStateError and no state transition SHALL occur

#### Scenario: jump on unknown target fails

- **WHEN** `graph_jump` is called with a target phase not in the compiled graph
- **THEN** the call SHALL fail with InvalidStateError naming the target

### Requirement: MCP input schemas SHALL be strict

MODIFIED: all tool input schemas SHALL remain strict (unknown fields rejected loudly); `graph_advance` SHALL declare `runId`, `nodeId`, optional `condition`, optional `jump`, optional `end` — any other field SHALL be rejected at parse.

#### Scenario: unknown field rejected

- **WHEN** a tool call includes a field absent from its declared input schema
- **THEN** the call SHALL fail with a schema validation error naming the unknown field

#### Scenario: Unknown advance field rejected

- **WHEN** a caller passes an undeclared field on `graph_advance` (e.g. `branchTo`)
- **THEN** parse SHALL fail loudly (strict schema)

### Requirement: graph_advance — direct-end drains the run

`graph_advance` SHALL accept the run-terminating `end` parameter on its resume call: when the pilot reports a node whose output contract declares `direct_end: true`, it SHALL advance with `end: true` — the reported node SHALL be marked `done` and the run SHALL complete as `completed` without resuming the graph's continuation (adapter-level completion: the pending interrupt becomes inert — advance/jump reject completed runs). Unfinished nodes SHALL stay `pending` (never aborted, never activated). `graph_force_end` SHALL serve abnormal termination only (PCL terminate / operator abort / stuck runs) — the direct-end path SHALL NEVER produce `terminated`.

#### Scenario: Direct-end advances to completed

- **WHEN** the pilot advances a node with `end: true` (direct_end report)
- **THEN** the reported node SHALL be marked `done`
- **THEN** the run SHALL be `completed` — `node: null`, `fsmState: completed`
- **THEN** unfinished branch nodes SHALL remain `pending` — never aborted, never activated

#### Scenario: Force-end reserved for abnormal termination

- **WHEN** a run is force-ended
- **THEN** it SHALL be the PCL/operator/stuck-run path — never the direct-end path

### Requirement: Workflow-directory scan pattern SHALL be single-sourced

The workflow-directory YAML scan matching rule (suffix-free `.yaml`/`.yml`) SHALL be declared once as a shared constant (`TASKFLOW_FILE_PATTERN`) and referenced by every consumer — no module or test SHALL re-inline the regex. Duplicated inline copies are a drift risk against the graph-init scan contract.

#### Scenario: Single pattern constant

- **WHEN** the scheduler source is scanned for the YAML scan pattern
- **THEN** `api/maintenance.ts` SHALL export the single `TASKFLOW_FILE_PATTERN` constant
- **THEN** `scheduler-runtime.ts` and tests SHALL import it — no inline `/\\.ya?ml$/` copies SHALL exist outside the single declaration

### Requirement: NodeDetail SHALL NOT carry execution position or mode hint

MODIFIED: NodeDetail SHALL NOT carry an execution position (`position`) or execution-mode hint (`executionMode`) — all nodes dispatch through the same contract regardless of composition. Composed subgraph members are distinguished only by their namespaced node ids.

#### Scenario: Composed member NodeDetail

- **WHEN** a composed subgraph member node is dispatched
- **THEN** its NodeDetail SHALL carry the standard fields only — no `position`, no `executionMode`

#### Scenario: Peer and member share the contract

- **WHEN** any node dispatches
- **THEN** the NodeDetail shape SHALL be identical for peer nodes and composed members

### Requirement: Dispatch snapshot SHALL NOT carry subgraph boundary enumeration

MODIFIED: the dispatch snapshot SHALL NOT carry a `subgraphs` boundary enumeration. Frontend concept surface for composition is the namespaced node id only — the pilot never consumes membership or execution-mode facts.

#### Scenario: Snapshot without subgraphs

- **WHEN** a run snapshot is dispatched
- **THEN** no `subgraphs` enumeration SHALL be present
