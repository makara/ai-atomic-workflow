# graph-definition Specification

## Purpose

Graph definition loading/validation/flattening/topology/contract checks/routing semantics + data shapes (zod schemas + shared types). Assets: `packages/graph-scheduler/src/graph-definition.ts`, `flow-flatten.ts`, `topology.ts`, `types.ts`, `schemas/` (7 files).

## Requirements

### Requirement: Subgraph load failure SHALL propagate the original error

During graph loading with registry (`loadGraphWithRegistry`), a subgraph referenced by a flow phase SHALL propagate its original load error (schema validation failures, file system errors) instead of being silently dropped and re-reported as a generic "not found" error.

#### Scenario: Child graph schema validation fails

- **WHEN** a flow phase references a child graph whose file fails schema validation
- **THEN** the load SHALL fail fast with the original validation error (including violations)
- **AND** the error SHALL NOT be reported as "not found in registry"

#### Scenario: Child graph missing from registry and dirs

- **WHEN** a flow phase references a child graph name that resolves nowhere (no registry entry, no taskflow dir match)
- **THEN** the load SHALL fail with a `GRAPH_NOT_FOUND` error whose message reads "not found in registry or taskflow dirs"

### Requirement: Subgraph resolution SHALL use registry-aware unified semantics

Top-level and subgraph graph-name resolution SHALL share one resolution path: project registry override (explicit path) first, then taskflow-directory search as fallback. A project registry entry for a subgraph name SHALL take precedence over directory search.

#### Scenario: Registry entry overrides subgraph resolution

- **WHEN** a flow phase references a child graph name that has an explicit path entry in the project registry
- **THEN** the entry's explicit path SHALL be used for loading
- **AND** directory search SHALL NOT be consulted first

#### Scenario: No registry entry falls back to directory search

- **WHEN** a flow phase references a child graph name with no registry entry
- **THEN** resolution SHALL fall back to taskflow-directory search
- **AND** the resolution result SHALL match top-level graph loading behavior

### Requirement: Contract warnings in run metadata

graph_start SHALL attach a contract-warning summary to the returned run metadata: count + truncated entries (each entry: phase prefix + warning text, capped length). Absent warnings SHALL yield an empty summary — field optional, backward compatible.

#### Scenario: Warning summary visible at start

- **WHEN** a graph with contract warnings (e.g. unbounded eval retry) is started
- **THEN** graph_start response SHALL include the warning summary naming the phase and warning
- **AND** entry text SHALL be truncated to a bounded length

#### Scenario: Clean graph yields empty summary

- **WHEN** a graph passes with zero contract warnings
- **THEN** the warning summary SHALL be empty
- **AND** existing consumers SHALL be unaffected (field optional)

### Requirement: Detailed warnings remain on debugLog

The full warning list SHALL continue through debugLog (`contract_warning` events) — run metadata carries the summary, debugLog carries detail.

#### Scenario: Debug detail unchanged

- **WHEN** OMP_DEBUG is enabled and a graph loads with warnings
- **THEN** each warning SHALL still be emitted as a `contract_warning` debugLog entry

### Requirement: Skill schema tables consistent with TS DTOs

The system SHALL verify, on every test run, that the contract tables in `atom-pilot/SKILL.md` and `atom-phase-handler/SKILL.md` match the field sets of the TypeScript DTOs they document (`IBaseNodeDetail`/`INodeDetail` from phase-handler types). A documented field missing from the DTO, or a DTO field missing from the doc table, SHALL fail the check.

#### Scenario: Drift fails the guard

- **WHEN** a skill markdown table documents a NodeDetail field (e.g. `dependsOn`) that the TypeScript `INodeDetail` lacks
- **THEN** the guard test SHALL fail, naming the skill file and the missing field

#### Scenario: DTO field not documented warns

- **WHEN** the TypeScript DTO gains a field that no skill table documents
- **THEN** the guard SHALL report the undocumented field — a DTO field absent from docs is a doc-gap signal

### Requirement: fsmState vocabulary matches implementation

The skill documentation's fsmState table SHALL list exactly the run-level states the FSM can produce: `idle`, `running`, `completed`, `terminated`. States the FSM never produces (`failed`, `paused`) SHALL NOT appear in the documented table.

#### Scenario: Stale state table fails the guard

- **WHEN** atom-phase-handler/SKILL.md documents fsmState values including `failed` or `paused`
- **THEN** the guard SHALL fail, naming the stale state values

#### Scenario: Node status list matches schema

- **WHEN** a skill document lists node status values
- **THEN** the list SHALL match `NodeStateSchema.status` exactly: `pending`, `active`, `done`, `skipped`
- **THEN** any extra value (e.g. `failed`, `blocked`) SHALL fail the guard
- **THEN** the schema set SHALL also match the runtime FSM's actual production points (derived from `fsm/transition.ts` node-state writes) — a status the schema allows but the FSM never produces SHALL fail the guard

### Requirement: skip parameter documented only when implemented

A skill document SHALL document the `skip` parameter of `graph_advance` only when the MCP schema actually accepts it. Documentation without implementation SHALL fail the guard (documentation-first drift).

#### Scenario: Doc-without-impl fails

- **WHEN** a skill documents `graph_advance(..., skip?)` but `GraphAdvanceSchema` lacks a `skip` field
- **THEN** the guard SHALL fail, naming the doc site and the missing schema field

### Requirement: Route SHALL be declared per phase or inherited from flow

Route membership SHALL be declared explicitly — the backend performs zero inference.

#### Scenario: Phase-level route annotation

- **WHEN** a phase declares `route: <id>`
- **THEN** the phase belongs to route `<id>`; it activates only when route `<id>` is active and its dependencies are satisfied

#### Scenario: Flow-as-route propagation

- **WHEN** a gate/approval branch option targets a flow (or a phase declares a route inside a flow)
- **THEN** all flattened children of the flow inherit the flow route unless they declare their own

#### Scenario: Flow route requires declaration

- **WHEN** a flow phase declares `route: <id>`
- **THEN** it becomes a route: children inherit `<id>` unless they declare their own; a flow WITHOUT `route:` is plain composition — its children stay on the implicit default route and always run (routes are never inferred from composition)

#### Scenario: Default route

- **WHEN** a phase declares no route and is not inside a route-declaring flow
- **THEN** it belongs to the implicit default route, which is always active

### Requirement: Unselected route members SHALL never activate

Unselected route members SHALL never activate — an unchosen branch route means the entire route's nodes are collectively ignored (case 1) — not a skipped state, never activated.

#### Scenario: Unchosen branch route

- **WHEN** an approval chooses branch option targeting route A while route B exists
- **THEN** route A members activate as dependencies complete; route B members stay pending forever, never active, never dispatched

#### Scenario: Dependency on inactive route

- **WHEN** a node's dependency belongs to an inactive route
- **THEN** the dependency does NOT count as satisfied (no vacuous satisfaction — implementation amendment); the graph must sequence through the decision node or use an `any`-join (branch-route join pattern) so the unselected route never blocks while the chosen route's terminal satisfies the join

### Requirement: Approval branch options SHALL activate routes

Branch-route scenarios (unique system-wide: minimal/non-minimal) SHALL be carried by approval options, which activate the target route.

#### Scenario: Branch option with target

- **WHEN** an approval declares a branch-route option with `target` and the option is chosen (manual) or recommended (auto)
- **THEN** the target route activates; the decision records the option value

#### Scenario: No branch options declared

- **WHEN** an approval declares no branch-route options (the default)
- **THEN** the approval presents Accept + free input + AI-generated options (retry/jump/end); no route activation is implied by mere presence of the approval

### Requirement: Node self-discovered no-work SHALL be normal completion

Case 5: a node/flow entry that self-discovers no work during execution SHALL count as normal execution producing an empty output — not a skip, and no special status or event is produced. Current usage: doc-update composite flow entry reads the archive output to self-judge (archive_status: success); doc-trigger reads upstream events to self-judge. Production graph phases (graph-generate spec/implement) SHALL NOT use case-5 no-work self-judgment in place of topology — the condition SHALL land in the entry decision/gate/route selection.

#### Scenario: Empty-task execution

- **WHEN** a flow entry executes and finds no work (e.g. a doc-update flow entry whose upstream archive output shows no archive_succeeded)
- **THEN** the node completes normally with an empty-output declaration; downstream proceeds; no skip marker, no special status

#### Scenario: Candidate actions resolved by entry decision

- **WHEN** a production graph supports multiple candidate routes (e.g. spec-implement minimal/detailed track selection)
- **THEN** the entry SHALL confirm the route once and exactly one writer path SHALL be active — no no-work peer phases self-judging in parallel (graph-generate single-writer convention)

### Requirement: Branch decisions SHALL be applied by the backend without judgment

The gate jump-condition evaluation context SHALL equal direct `dependsOn` outputs (auto-injected) + `channels` `node:` target outputs + snapshot (including retryCount) + run mode; a missing output SHALL be noted as `<id> has no output` (the condition evaluates false when referencing it). The `reads` field has been removed (schema field convergence).

#### Scenario: Hit — backward jump

- **WHEN** a gate's `when` evaluates true and its `to` target is an upstream terminal node
- **THEN** the backend resets the target and its downstream terminal nodes to pending (retryCount++ each, never zeroed), re-activates ready nodes; no forward activation happens

#### Scenario: No hit — pass through

- **WHEN** no `when` evaluates true
- **THEN** the gate completes with no routing side effect; downstream activates via dependency satisfaction

#### Scenario: Upstream auto-inject

- **WHEN** a gate's jump condition references its direct dependsOn output
- **THEN** that output SHALL be present in the evaluation context automatically (no `reads` declaration — the field is removed)

#### Scenario: Node-channel context

- **WHEN** a gate declares `channels: [node:<id>]` and the condition references that node's output
- **THEN** the output SHALL be injected via the shared channel resolver; missing output SHALL be noted and the condition evaluated conservatively (false)

#### Scenario: Reads context

- **WHEN** a gate declares `reads: [<nodeId>]`
- **THEN** schema validation rejects it loudly with a migration hint to `channels: [node:<id>]` (field removed — judgment context = direct dependsOn outputs + node: channels)

#### Scenario: Forward branch activation

- **WHEN** an approval branch-route option is chosen
- **THEN** the backend activates the target route mechanically (no judgment)

#### Scenario: Retry branch resets upstream

- **WHEN** a gate jump hits a terminal upstream target
- **THEN** the backend resets the target + downstream terminal nodes (upstream kept), retryCount++ — mechanical, no judgment

### Requirement: Gate jump target SHALL be upstream with bounded rework

The gate field closure SHALL drop the `node:`-only restriction on `channels`. A gate SHALL be allowed `channels` entries of any kind (`skill:`/glob/`node:`) and SHALL inherit graph-level entries of any kind; judgment context = direct dependsOn outputs + effective channels. The closure SHALL remain: id/type/dependsOn/route/jumps/channels/join; task/preText/routing/reads/agent/skill/use remain forbidden on gates. Gate jump semantics unchanged: `to` SHALL be an upstream terminal node, first matching `when` selects, hit → backward jump (retryCount++ never zeroed), no hit → pass through.

#### Scenario: Gate with file channel accepted

- **WHEN** a gate declares `channels: ["./judgment-notes.md"]` or inherits a `skill:` entry from graph level
- **THEN** schema validation SHALL accept the phase
- **THEN** the entry SHALL be part of the gate's judgment context

#### Scenario: Gate closure otherwise unchanged

- **WHEN** a gate declares `task`, `preText`, `routing`, `reads`, `agent`, `skill`, or `use`
- **THEN** schema validation SHALL reject it loudly with a migration hint — unchanged

#### Scenario: Retry bound

- **WHEN** a gate `when` references the target's retryCount (e.g. `retryCount < 2`)
- **THEN** the bound is enforced by the single counter; exhausted bound = no more jumps, pass through

#### Scenario: Multiple jump targets

- **WHEN** a gate declares multiple when/to pairs (different failures → different targets)
- **THEN** the first matching when selects its target; no forward routing, no default, no parallel mode

#### Scenario: Forbidden fields rejected

- **WHEN** a gate declares task/preText/routing/reads/agent/skill/use
- **THEN** schema validation rejects it loudly with a migration hint — non-node channel entries remain legal (full-type inheritance)

### Requirement: Graph definition loading and validation

System SHALL load `.taskflow.yaml` files, validate them against the Taskflow schema, resolve flow phases (sub-graph composition) at load time via merge-at-load flattening, AND execute the full contract validation pass (bidirectional channel coverage, approval routing hygiene, retry/jump explicit-target checks, redundant-dependency rejection) on the flattened graph. Any contract violation SHALL fail loading with GraphDefinitionError — fail-fast at load, never deferred to dispatch.

Flattening SHALL rewrite all three reference surfaces consistently: (a) downstream `dependsOn` edges referencing a flow phase SHALL be rewired to the flow's child terminal nodes; (b) child-phase routing/eval targets SHALL be prefixed with the flow phase id; (c) parent-phase routing/eval targets referencing a flow phase id SHALL be remapped to the flow's flattened entry node (the child's first phase). After flattening, every routing/eval target SHALL resolve to an existing phase id in the flattened graph — an unresolved target SHALL fail loading with GraphDefinitionError (never a silent no-op jump).

#### Scenario: Valid graph loads successfully

- **WHEN** a `.taskflow.yaml` file exists at the resolved path and passes schema validation
- **THEN** the graph SHALL be returned as a typed `Taskflow` with `name`, `version`, and `phases` array
- **THEN** extra fields (not in schema) SHALL be preserved via passthrough

#### Scenario: Invalid graph returns structured error

- **WHEN** a `.taskflow.yaml` file fails schema validation (missing required fields, type mismatch, constraint violation)
- **THEN** the loader SHALL return a structured error with file path, violation details, and fix suggestions
- **THEN** no exception SHALL be thrown

#### Scenario: Flow phases are flattened at load time

- **WHEN** a phase has `type: "flow"` with `use: "<graphName>"` referencing another `.taskflow.yaml`
- **THEN** the flow phase SHALL be replaced inline with the referenced graph's phases
- **THEN** `with` params SHALL be interpolated into the child graph's phase fields using `{key}` template expressions
- **THEN** recursion depth SHALL be capped at `maxDepth` (default 5)
- **THEN** `use` and `def` SHALL be mutually exclusive — exactly one required for flow type

#### Scenario: Parent routing targets remapped at flatten

- **WHEN** a parent-phase approval routing or eval action declares `target` equal to a flow phase id (e.g. `target: review`)
- **THEN** flattening SHALL remap the target to the flow's flattened entry node id (e.g. `review/scope-detect`)
- **THEN** the remapped target SHALL resolve in the flattened graph

#### Scenario: Unresolvable routing target fails load

- **WHEN** after flattening any routing or eval target references a phase id absent from the flattened graph
- **THEN** loading SHALL fail with GraphDefinitionError naming the phase and the missing target
- **THEN** no run SHALL be created

#### Scenario: Contract breach blocks run start

- **WHEN** a graph with a contract violation is started via graph_start
- **THEN** graph_start SHALL return GraphDefinitionError describing the phase and violation
- **AND** no run SHALL be created for the invalid graph

#### Scenario: Retry target warning surfaces at load

- **WHEN** an approval retry/jump action lacks an explicit target (dependsOn[0] fallback path)
- **THEN** loading SHALL succeed
- **AND** the load SHALL emit the deprecated-fallback warning

### Requirement: Topological ordering and dependency resolution

Activation judgment SHALL be route active ∧ dependencies satisfied; satisfied = dependencies terminal (join default — all) or at least one dependency done (`join: any` — track join: the chosen route's terminal satisfies, the unchosen route never completes and never blocks). `join` SHALL accept only the literal `'any'` — an explicit `join: 'all'` is a schema parse error (default is all, declaring it is redundant). `join: any` SHALL be used only for branch-route convergence — direct upstreams MUST span ≥2 different routes (validator-enforced). **No vacuous satisfaction** — depending on an unchosen route means the graph author SHALL sequence through a decision node or express it with an any-join. O(1) lookup table, zero closure inference.

#### Scenario: When guard references only direct upstream fields

- **WHEN** a gate jump condition references an upstream output
- **THEN** the condition references observable fields of the declared judgment context (direct dependsOn ∪ channels node: targets ∪ jump targets — validator-enforced)

#### Scenario: Route-aware readiness

- **WHEN** resolveReady checks a pending node
- **THEN** it activates iff the node's route is active and every dependency is terminal (or one is done under `join: any`)

#### Scenario: Track join without vacuous

- **WHEN** a join node depends on two track flows (minimal/detailed) with `join: any`
- **THEN** it waits for the CHOSEN track's terminal; the unselected track never completes and never blocks; the node never activates before the track decision fires

#### Scenario: topoLayers produces dependency-ordered layers

- **WHEN** a graph loads
- **THEN** topoLayers yields dependency-ordered layers; cycles fail loudly

#### Scenario: resolveReady returns nodes with satisfied dependencies

- **WHEN** readiness resolves
- **THEN** a node returns iff its route is active and deps are terminal (or one done under `join: any`)

#### Scenario: Approval readiness follows review conclusion

- **WHEN** a downstream node depends on an approval
- **THEN** it waits for the approval decision

#### Scenario: Redundant transitive dependencies rejected

- **WHEN** a phase declares a redundant transitive dependency
- **THEN** the validator rejects it (gate exemption removed — judgment context declares via channels node:, never by padding dependsOn)

#### Scenario: findUpstream traces transitive dependencies

- **WHEN** validator/jump logic needs upstream
- **THEN** findUpstream traces transitive dependsOn edges

#### Scenario: Explicit join all rejected

- **WHEN** a phase declares `join: all`
- **THEN** schema parsing SHALL fail (only the literal `any` is valid; absent = all)

#### Scenario: Single-route any-join rejected

- **WHEN** a node declares `join: any` while all direct upstreams share one route (or all sit on the default route)
- **THEN** contract validation SHALL error naming the phase and the reason (any-join converges branch routes — upstreams must span ≥2 distinct routes)

### Requirement: Schema single source of truth

- node status SHALL be exactly the `NodeStateSchema.status` values: `pending`, `active`, `done`, `skipped`
- All consumers SHALL reference this schema as the single authority — no duplicate node-status enums, no dead DTOs carrying stale node-status values
- The status set SHALL match the runtime FSM's actual production points (no dead enum values the FSM never writes)

#### Scenario: Phase schema defines all phase fields

- **WHEN** a phase definition is validated
- **THEN** optional fields SHALL include: `dependsOn`, `agent`, `skill`, `channels` (agent-type), `preText` (approval-type), `task`, `routing`, `join`, `when`, `eval`, `use`
- **THEN** removed fields (`topic`, `retry`, `with`, `def`, `maxDepth`, `context`) SHALL be rejected loudly with a delete hint — never silently stripped

#### Scenario: NodeState schema constrains valid states

- **WHEN** a node state is validated
- **THEN** `status` SHALL be one of: `pending`, `active`, `done`, `skipped`
- **THEN** `retryCount` SHALL be a non-negative integer
- **THEN** timestamps (`startedAt`, `completedAt`) SHALL be ISO 8601 strings or absent

#### Scenario: Schema is the sole node-status authority

- **WHEN** any module defines or validates node status values
- **THEN** it SHALL reference `NodeStateSchema.status` — no hand-written copies

### Requirement: Retry and jump targets explicit

The JUMP reset scope SHALL be the target + downstream terminal nodes (upstream kept).

#### Scenario: Jump reset scope

- **WHEN** a gate jump or approval retry/jump targets node X
- **THEN** X and every terminal node in X's downstream closure reset to pending with retryCount++ ; X's upstream stays terminal (inputs unchanged); route-activation flags set by gates inside the reset closure are cleared

#### Scenario: Eval auto-retry carries target

- **WHEN** a gate jump (rework) carries an explicit target
- **THEN** the target is applied mechanically (retryCount++ on the reset closure)

#### Scenario: Retry with explicit target re-executes target

- **WHEN** an approval retry/jump action carries a target
- **THEN** the run jumps to it (target + downstream reset)

#### Scenario: Target-less retry or jump warns

- **WHEN** a written retry/jump action has no target
- **THEN** the validator warns; the pilot resolves the target from context

#### Scenario: Target resolves after flatten

- **WHEN** a target names a flow
- **THEN** flatten remaps retry/jump targets to the flow's entry node

### Requirement: Maturity-declared scope entries

A journey's scope entry SHALL declare its maturity by construction: raw journeys wire an interview entry (skill: atom-scope-interview — unconditional interview); sharpened/decided journeys wire an extract entry (task: read upstream artifact channel → scope fields; ADR judgment = existence check on docs/adr/index.md; adr_created echoes the upstream artifact's decision). In-degree-0 prefix entries (never composed with dependencies) SHALL carry `input: true` (input-stage membership); composed stage entries (inheriting composer dependsOn) SHALL NOT carry the flag — their reset semantics follow the stage. No node SHALL detect input source, branch on input state, or degrade its interview.

#### Scenario: Raw journey interviews

- **WHEN** a graph declares an interview entry
- **THEN** the node SHALL conduct the interview — at least one question, recommendation first — regardless of context completeness (no skip path exists)

#### Scenario: Sharpened journey extracts

- **WHEN** a graph declares an extract entry with an upstream artifact channel
- **THEN** the node SHALL read the artifact, emit scope fields + ADR existence check, and SHALL NOT ask questions

#### Scenario: Composed entry skips the input flag

- **WHEN** an entry is composed with a composer dependsOn (flattened in-degree > 0)
- **THEN** it SHALL NOT declare `input: true` — the loader's flattened in-degree-0 check rejects flagged nodes with dependencies, and the flag would mis-reset the stage on rework

### Requirement: Graph-level channels field in taskflow schema

The `.taskflow.yaml` format SHALL declare a top-level `channels` field — an optional array of channel entries — alongside `name`, `version`, and `phases`. Entries SHALL follow graph-level entry rules: explicit `skill:`/`node:` prefix or file-glob shape; bare names SHALL be rejected at load. The field SHALL be documented in the graph format reference (atom-graph-spec) as the graph's ambient context layer.

#### Scenario: Top-level channels declared

- **WHEN** a graph file declares `channels: ["skill:atom-graph-spec"]` at top level
- **THEN** schema validation SHALL accept the graph
- **THEN** the entries SHALL be inherited by every flattened phase of the graph

#### Scenario: Top-level bare name rejected

- **WHEN** a graph file declares top-level `channels: ["atom-graph-spec"]` (bare name)
- **THEN** load SHALL fail with GraphDefinitionError naming the entry and the missing prefix

#### Scenario: Format reference documents the field

- **WHEN** a graph author reads the format reference (atom-graph-spec §Channels)
- **THEN** the top-level `channels` field, its entry rules, and the inheritance semantics SHALL be present

### Requirement: Config schema — project channels array

The project configuration (`.graph-scheduler/config.json`) SHALL accept a `channels` array of graph-level-style channel entries (explicit prefix or glob; bare name rejected at config parse). The array SHALL be the outermost scope in the effective-channel merge for every graph run in the project. Absent array SHALL be an empty scope — no behavior change for existing configs.

#### Scenario: Project channels declared

- **WHEN** `.graph-scheduler/config.json` declares `"channels": ["./CONTEXT.md"]`
- **THEN** every dispatched phase in the project SHALL inherit the entry (outermost, deduplicated)

#### Scenario: Missing project channels

- **WHEN** `.graph-scheduler/config.json` declares no `channels` field
- **THEN** the project scope SHALL be empty and existing graph behavior SHALL be unchanged

### Requirement: Flatten carries child graph-level channels

Merge-at-load flattening SHALL carry a child graph's top-level channels into the flattened child phases as their inheritance layer. Flattening SHALL NOT rewrite skill:/glob graph-level entries (they resolve in the child's own scope); `node:` targets SHALL be rewritten like phase entries (child-sibling → prefixed, parent-level stays unprefixed). The parent's flow-level channels SHALL merge into entry children per the existing input-interface rule.

#### Scenario: Child top-level channels flattened

- **WHEN** a flow references a child graph declaring top-level `channels: ["./CONTEXT.md"]`
- **THEN** each flattened child phase SHALL carry `./CONTEXT.md` in its inherited layer
- **THEN** parent phases outside the flow SHALL NOT carry it

#### Scenario: Flatten rewrites no skill/glob graph-level entries

- **WHEN** flattening composes a child with top-level `channels: ["skill:atom-graph-spec"]`
- **THEN** the entry SHALL appear unchanged (no flow-prefix rewrite) in the child phases' inherited layer

#### Scenario: Child graph-level node ref prefixed like phase entries

- **WHEN** a child declares top-level `channels: ["node:sibling"]` targeting its own phase
- **THEN** the flattened child phase's inherited layer SHALL carry `node:<flow>/sibling`

### Requirement: Maker-graph conventions reference graph-generate

Production-graph phase conventions SHALL name the concrete maker graph `graph-generate` (spec/implement phases via atom-graph-design / atom-graph-writer). Case-5 no-work self-judgment SHALL NOT be used by graph-generate's spec/implement phases (topology decides, per the single-writer convention).

#### Scenario: graph-generate single-writer convention

- **WHEN** a validator scans graph-generate for case-5 no-work self-judgment in spec/implement
- **THEN** none SHALL be found — the phases' work is decided by the DAG (spec → spec-accept → implement → review → gate)

#### Scenario: Maker graph naming

- **WHEN** graph-definition docs reference the maker journey graph
- **THEN** they SHALL name `graph-generate`, never `graph-workflow`

### Requirement: Route unreferenced by hardcoded routing action SHALL trigger a validator warning

Graph load validation SHALL check every declared route for whether it is referenced by any approval's hardcoded routing action (`action: continue` + `target`). An unreferenced route SHALL produce a warning — its activation depends on AI dynamic recommendation (soft path); the author SHALL explicitly declare a routing action or delete the route. The check SHALL be warning-level (AI-dynamic activation remains legal) and SHALL NOT block loading.

#### Scenario: Unreferenced route warns

- **WHEN** a graph declares `route: implement` and no approval's hardcoded routing action target references it
- **THEN** loading produces a warning: activation depends on AI dynamic judgment; the author SHALL declare a routing action or delete the route

#### Scenario: Hardcoded reference does not warn

- **WHEN** a route is referenced by some approval's hardcoded routing action target (e.g. minimal-track/detailed-track)
- **THEN** no warning — activation is mechanical

#### Scenario: Pure default-route graph produces zero warnings

- **WHEN** a graph declares no route (or after redundant routes are deleted)
- **THEN** no route warning — dependency ordering is guaranteed by dependsOn, and end is expressed by endRun

### Requirement: Single-path ordering SHALL NOT be expressed with route

A flow with only one active path SHALL use `dependsOn` for ordering (+ endRun to express termination) and SHALL NOT declare a route — route carries exclusive branch selection only (multiple routes mutually exclusive); a single-path route is a redundant activation mechanism (missing branchTo silently drains the flow).

#### Scenario: Single-path flow without route

- **WHEN** a flow is entered only after a single approval decision (implement mode), and the end path is expressed by the approval's `end` action
- **THEN** the flow declares no route — the default route is always active, dispatch is mechanical after the approval completes, with zero branchTo dependency

### Requirement: Mandatory operation declarations on main phases

Every main phase declares its operation classes from the closed hlt-classes set; undeclared main phases fail graph load.

#### Scenario: Undeclared main phase rejected

- **WHEN** a graph defines a main phase without `operations:`
- **THEN** graph load fails with a validation error naming the phase

#### Scenario: Conversation-only nodes declare empty

- **WHEN** a main phase performs only conversation work (scope interviews, grilling)
- **THEN** it declares `operations: []` and validation accepts it

#### Scenario: Closed set membership

- **WHEN** a main phase declares an operation not in the closed hlt-classes set
- **THEN** graph load fails with a validation error listing the valid classes

### Requirement: No version field

The graph definition schema has no `version` field; `version: 1` declarations are rejected at load.

#### Scenario: Legacy version declaration

- **WHEN** a taskflow YAML declares `version`
- **THEN** graph load fails with a loud rejection

### Requirement: Engine validates shapes, not content

The engine's load-time contract checks are limited to machine facts: target resolvability (dependsOn, routing targets, jump targets, route members), closed-set membership (types, operation classes, channel prefixes), and graph-level context entry shape. Task-text content checks (canonical Output contract spelling, legacy spellings, protocol restatement, declared-input claims) are no longer performed by the engine; they move to the agent-side consistency gate (estate-maintain).

#### Scenario: Malformed task text

- **WHEN** a main-phase task uses a legacy output spelling
- **THEN** the engine loads the graph without error; the consistency gate flags the spelling

#### Scenario: Unresolvable jump target

- **WHEN** a gate jump targets a non-existent node
- **THEN** graph load fails with a loud rejection

### Requirement: Reserved `$` prefix rejected

The phase schema SHALL reject any phase id starting with `$` — the activation prologue was removed (activation facts live at `graph_start` / pilot startup); any `$` id is rejected with a validation error naming the removed prefix. The `input: true` flag of the reverted input-node mechanism SHALL NOT exist in the schema.

#### Scenario: $-prefixed id rejected

- **WHEN** a graph declares a phase id starting with `$`
- **THEN** schema validation SHALL fail with an error naming the `$` prefix (activation prologue removed)

#### Scenario: Plain ids accepted

- **WHEN** a graph declares any non-`$` node id
- **THEN** validation accepts it like any node id
