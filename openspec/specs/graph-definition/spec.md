# graph-definition Specification

## Purpose

Graph definition loading/validation/flattening/topology/contract checks/routing semantics + data shapes (zod schemas + shared types). Assets: `packages/graph-scheduler/src/graph-definition.ts`, `flow-flatten.ts`, `topology.ts`, `types.ts`, `schemas/` (7 files).

## Requirements

### Requirement: Contract warnings in run metadata

graph_start SHALL attach a contract-warning summary to the returned run metadata: count + truncated entries (each entry: phase prefix + warning text, capped length). Absent warnings SHALL yield an empty summary — field optional, backward compatible.

#### Scenario: Warning summary visible at start

- **WHEN** a graph with contract warnings (e.g. unbounded rework jump condition) is started
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

MODIFIED: the skill documentation's fsmState table SHALL list exactly the run-level states the FSM can produce: `idle`, `running`, `completed`, `terminated`. States the FSM never produces (`failed`, `paused`) SHALL NOT appear in the documented table. The node status guard list SHALL match `NodeStateSchema.status` exactly: `pending`, `active`, `done` — `aborted` is removed from the enum (the v22 force-end change removed the only writer; a status the schema allows but the runtime never produces SHALL fail the guard).

#### Scenario: Stale state table fails the guard

- **WHEN** atom-phase-handler/SKILL.md documents fsmState values including `failed` or `paused`
- **THEN** the guard SHALL fail, naming the stale state values

#### Scenario: Node status list matches schema

- **WHEN** a skill document lists node status values
- **THEN** the list SHALL match `NodeStateSchema.status` exactly: `pending`, `active`, `done`
- **THEN** any extra value (e.g. `aborted`, `failed`, `blocked`) SHALL fail the guard
- **THEN** the schema set SHALL also match the runtime FSM's actual production points — a status the schema allows but the FSM never produces SHALL fail the guard

### Requirement: skip parameter documented only when implemented

A skill document SHALL document the `skip` parameter of `graph_advance` only when the MCP schema actually accepts it. Documentation without implementation SHALL fail the guard (documentation-first drift).

#### Scenario: Doc-without-impl fails

- **WHEN** a skill documents `graph_advance(..., skip?)` but `GraphAdvanceSchema` lacks a `skip` field
- **THEN** the guard SHALL fail, naming the doc site and the missing schema field

### Requirement: Node self-discovered no-work SHALL be normal completion

Case 5: a node/flow entry that self-discovers no work during execution SHALL count as normal execution producing an empty output — not a skip, and no special status or event is produced. Production graph phases SHALL NOT use case-5 no-work self-judgment in place of topology — the condition SHALL land in the entry decision.

#### Scenario: Empty-task execution

- **WHEN** a flow entry executes and finds no work
- **THEN** the node completes normally with an empty-output declaration; downstream proceeds; no skip marker, no special status

#### Scenario: Candidate actions resolved by entry decision

- **WHEN** a production graph supports multiple candidate tracks (e.g. spec-implement minimal/detailed track selection)
- **THEN** the entry SHALL confirm the track once and exactly one writer path SHALL be active — no no-work peer phases self-judging in parallel (single-writer convention)

### Requirement: Branch decisions SHALL be applied by the backend without judgment

MODIFIED: the backend SHALL apply branch decisions mechanically — never judge them — and SHALL apply them EXCLUSIVELY: a resumed node's `Command({goto})` SHALL be the single source of the next activation set (no static-successor addition on resume). A main node's decision output (rework or branch decision) travels via `graph_advance` `branchTo`; the backend disambiguates by target state: terminal target (status `done` — `aborted` removed by headroom-estate-cleanup) → backward rework reset (target + downstream terminal nodes → `pending`, retry count incremented each, never zeroed, upstream kept); pending target → activation. The `end` decision action SHALL be applied mechanically too: the reported node completes and the graph routes to END (natural drain — run `completed`). No route mechanism exists — `branchTo` targets a node id only; `end` is a decision action, never a node target. No gate type exists — rework conditions live in main task text (IF/ELSE), evaluated inline by the executing agent; the evaluation result drives `branchTo` directly.

#### Scenario: Hit — backward jump

- **WHEN** a main rework condition holds and its decision target is an upstream terminal node
- **THEN** the backend resets the target + downstream terminal nodes to `pending` (retry count incremented each, never zeroed), re-activates ready nodes; no forward activation

#### Scenario: No hit — pass through

- **WHEN** no rework condition holds (the decision carries no target)
- **THEN** the node completes with no routing side effect; downstream activates via dependency satisfaction

#### Scenario: Upstream auto-inject

- **WHEN** a main rework condition references its direct dependsOn outputs
- **THEN** those outputs SHALL be auto-injected into the node context (no `reads` declaration — field removed)

#### Scenario: Node-channel context

- **WHEN** a main node declares `channels: [node:<id>]` and its condition references that node's output
- **THEN** the output SHALL be injected via the shared channel resolver; a missing output SHALL be noted as missing and the condition evaluates conservatively (no rework)

#### Scenario: Reads context

- **WHEN** a node declares `reads: [<nodeId>]`
- **THEN** schema validation SHALL loud-reject and hint migration to `channels: [node:<id>]` (field removed)

#### Scenario: Forward branch activation

- **WHEN** a main branch decision is chosen (branchTo = node id of a pending node)
- **THEN** the backend mechanically activates the target node (no judgment) and nothing else — unselected branch nodes stay `pending` (exclusive activation)

#### Scenario: Retry branch resets upstream

- **WHEN** a main rework decision targets a terminal upstream node
- **THEN** the backend resets the target + downstream terminal nodes (upstream kept), retry count incremented — mechanical, no judgment, exclusive (no static-successor activation)

#### Scenario: End decision completes mechanically

- **WHEN** an advance resumes with `end: true`
- **THEN** the backend marks the reported node `done` and completes the run (`completed`) without resuming the graph — no judgment, no target resolution

### Requirement: Graph definition loading and validation

MODIFIED: phase-level unknown keys SHALL fail loading with a schema-level error — PhaseSchema validates strictly (`.strict()`); any unknown phase key is rejected uniformly, the error naming the key. Top-level unknown keys remain preserved via passthrough, EXCEPT the `flow` key SHALL be a declared member (validated by the flow subset grammar — malformed entries fail loudly, never passthrough-swallowed). Flow edges SHALL be validated at load: every edge source/target SHALL resolve to a declared phase id (loud failure naming the edge and missing id). Subgraph composition (via `use`) SHALL NOT exist — every graph compiles standalone; nesting is the router sibling run. A phase declaring `template: startup` SHALL compile its task from the startup template; a phase declaring `template: router` SHALL compile its task from the router template with `template_args.paths` applied; a phase declaring `template: scope-entry` / `review-accept` / `adopt-scope` / `adopting` / `adopt-accept` SHALL compile its task from the matching per-node template (`template_args.terminal` applied for scope-entry) — the `framework-chain` factory form SHALL NOT exist (one template one file, ADR 0245).

#### Scenario: Valid graph loads successfully

- **WHEN** a YAML file exists at the resolved path and passes the workflow schema validation (including the required `name`)
- **THEN** the graph SHALL be returned as a typed workflow with `name` (required), optional `description`/`$schema`/`version`/`flow`, and `phases` array
- **THEN** extra top-level fields (not in schema) SHALL be preserved via passthrough

#### Scenario: Invalid graph returns structured error

- **WHEN** a YAML file fails schema validation (missing required fields, type mismatch, constraint violation)
- **THEN** the loader SHALL return a structured error with file path, violation details, and fix suggestions
- **THEN** no exception SHALL be thrown

#### Scenario: Flow phases are flattened at load time

- **WHEN** a graph declares top-level `flow` edges
- **THEN** the edges SHALL compile into the per-node transition table (node × condition → target) — a single flat StateGraph, no subgraph composition exists
- **THEN** an edge referencing a phase absent from `phases` SHALL fail loading with a structured error naming the edge and the missing id

#### Scenario: Composition cycle fails load

- **WHEN** a graph's dependsOn edges form a cycle
- **THEN** loading SHALL fail with a structured graph-definition error naming the cycle
- **THEN** no run SHALL be created

#### Scenario: Handoff terminals scoped to the current level

- **WHEN** compilation synthesizes the root `__handoff`
- **THEN** its `dependsOn` SHALL be the graph's terminal members only — every graph compiles standalone with its own single root `__handoff` (no per-level synthesized handoffs exist)

#### Scenario: Composed handoff uses the session template

- **WHEN** compilation synthesizes the root `__handoff` node
- **THEN** the node task SHALL come from the zero-parameter handoff session template (`handoffTaskTemplate()`) — no report path is computed
- **AND** the task text SHALL NOT contain a report path or a file-write instruction

#### Scenario: Parent routing targets remapped at flatten

- **WHEN** a main rework decision declares a jump target equal to a node id
- **THEN** the target SHALL resolve in the compiled graph — jump targets are node ids, restricted to the topological ancestor set ∪ `__handoff` (no composition remapping exists)

#### Scenario: Standalone graph gains handoff terminal

- **WHEN** a graph passes validation
- **THEN** compilation SHALL append a `__handoff` main node depending on the graph's terminal phase
- **AND** the node task SHALL come from the zero-parameter handoff session template (`handoffTaskTemplate()`) — no report path, no file-write instruction
- **AND** the appended node SHALL NOT appear in source phases (inventory validation ignores it — validateGraphInventory is one-directional inventory→source)
- **AND** the graph SHALL still load cleanly with zero warnings from the synthesized node

#### Scenario: Composition remaps parent targets to handoff

- **WHEN** a main rework decision targets a terminal node
- **THEN** the reset scope SHALL include `__handoff` (downstream terminal closure) — the handoff resets to `pending` with the target
- **AND** the terminal-successor rewiring SHALL route the graph's completion through `__handoff` before END

#### Scenario: Unresolvable routing target fails load

- **WHEN** a flow edge or jump target references a phase id absent from the compiled graph
- **THEN** loading SHALL fail with a graph-definition error naming the phase and the missing target
- **THEN** no run SHALL be created

#### Scenario: Contract breach blocks run start

- **WHEN** a graph with a contract violation is started via graph_start
- **THEN** graph_start SHALL return a graph-definition error describing the phase and violation
- **AND** no run SHALL be created for the invalid graph

#### Scenario: Retry target warning surfaces at load

- **WHEN** a main rework condition task line declares a rework condition (rework/return to/back to/jump back) without an explicit backtick target
- **THEN** loading SHALL succeed
- **AND** the load SHALL emit a warning that the operator resolves the target via PCL graph_jump (no decision-output target since branchTo removal)

#### Scenario: Deleted syntax fields fail load

- **WHEN** a graph declares `join`, `route`, `routing.actions`, `template: loop`, or a phase `type` other than `main`
- **THEN** loading SHALL fail with a schema-level error naming the removed field — no silent stripping

#### Scenario: Unknown phase key fails load

- **WHEN** a phase declares a key not in the schema surface (a removed field like `jumps`/`mode`, or a legacy field like `topic`/`maxDepth`)
- **THEN** loading SHALL fail with a schema-level error naming the unknown key — no per-field migration hint, no silent strip

#### Scenario: Top-level unknown keys preserved

- **WHEN** a graph declares an unknown top-level key
- **THEN** loading SHALL succeed and the key SHALL be preserved via passthrough

#### Scenario: Template task injected at load

- **WHEN** a phase declares `template: startup`
- **THEN** its task text SHALL be injected from the registered startup template at load time (task = template output)
- **AND** an explicit `task` on the same phase SHALL fail schema validation (template is the single source of the node's work)

#### Scenario: Router template args injected at load

- **WHEN** a phase declares `template: router` with `template_args: { paths: [openspec-apply, openspec-engineer] }`
- **THEN** its task text SHALL be injected from the registered router template with the paths applied
- **AND** an explicit `task` or `use` on the same phase SHALL fail schema validation

#### Scenario: Per-node template task injected at load

- **WHEN** a phase declares `template: scope-entry` with `template_args: { terminal: round-report }`
- **THEN** its task text SHALL be injected from the registered scope-entry template at load time (task = template output with the terminal applied)
- **AND** an explicit `task` on the same phase SHALL fail schema validation (template is the single source of the node's work)

#### Scenario: Framework-chain template rejected at load

- **WHEN** a phase declares `template: framework-chain`
- **THEN** loading SHALL fail with a schema-level error naming the removed factory form (migration: declare the per-node template)

#### Scenario: Template node ordering enforced

- **WHEN** a phase declares `template: startup` with non-empty `dependsOn`
- **THEN** loading SHALL fail with a structured error naming the ordering violation (template nodes are graph entries — startup steps run before any other node's context assembly)

#### Scenario: Router node may sit mid-graph

- **WHEN** a phase declares `template: router` with non-empty `dependsOn`
- **THEN** loading SHALL succeed (routers select among candidate graphs after upstream context — no entry constraint)

#### Scenario: Router paths validated as graph names

- **WHEN** a router template node's `template_args.paths` contains an entry that does not resolve to a graph
- **THEN** loading SHALL fail with a structured error naming the entry
- **AND** a non-graph path form (node id / prose route) SHALL be rejected

#### Scenario: Flow edge endpoint missing

- **WHEN** a flow edge references a phase absent from `phases`
- **THEN** load SHALL fail loudly naming the edge and the missing id

#### Scenario: Malformed flow syntax rejected

- **WHEN** a flow entry does not parse under the subset grammar
- **THEN** load SHALL fail loudly with the parse error — no silent drop

### Requirement: Schema single source of truth

MODIFIED: PhaseSchema keeps the peer-level `agent` field (advisory, priority-ordered sub-agent type preferences; consumed agent-side, engine passes through with zero judgment). `execution`, `position`, and `executionMode` remain removed. The `template` field SHALL be `z.enum(['startup', 'router', 'scope-entry', 'adopting']).optional()` — `adopt-scope` removed from the enum (adopt-scope-and-handler-blocks, ADR 0247: the adoption goal is confirmed by the framework's scope-entry + requirement accept loop + adopting grilling, so the second atom-scope-interview node is deleted), `loop` removed (loop semantics move to flow self-edges, graph-flow capability), the `framework-chain` factory entry replaced by the per-node templates (one template one file, ADR 0245), and `review-accept` / `adopt-accept` deleted by the accept-node consolidation (ADR 0246 — the adopting grilling consensus IS the adoption confirmation; the requirement confirmation is a caller-declared accept loop on the requirement router node). A graph declaring `template: adopt-scope` SHALL fail load with a schema-level error naming the key.

#### Scenario: Schema rejects removed fields

- **WHEN** phase-level validation runs on a phase declaring `execution`, `position`, or `executionMode`
- **THEN** those keys SHALL be rejected as unknown fields

#### Scenario: Derived schema matches

- **WHEN** the JSON Schema derived artifact is compared with the TS schema
- **THEN** `execution` / `position` / `executionMode` SHALL be absent from both
- **AND** the `agent` field SHALL be present in both
- **AND** the `template` field (enum `['startup', 'router', 'scope-entry', 'adopting']`) and `template_args` (paths / terminal / questions) SHALL be present in both
- **AND** the top-level `flow` field SHALL be present in both

#### Scenario: Peer-level agent field accepted

- **WHEN** phase-level validation runs on a main phase declaring `agent: ['explore', 'scout']`
- **THEN** the phase SHALL validate successfully
- **AND** the declared agent array SHALL be exposed on the dispatch NodeDetail (`agent` field)

#### Scenario: Template field accepted on entry

- **WHEN** phase-level validation runs on a graph-entry phase declaring `template: startup` with empty `dependsOn` and no `task`
- **THEN** the phase SHALL validate successfully

#### Scenario: Router template accepted with args

- **WHEN** phase-level validation runs on a phase declaring `template: router`, `template_args: { paths: [a, b] }`, and `dependsOn: [upstream]`
- **THEN** the phase SHALL validate successfully

#### Scenario: Per-node template accepted with args

- **WHEN** phase-level validation runs on a phase declaring `template: scope-entry`, `template_args: { terminal: round-report }`, and `dependsOn: [upstream]`
- **THEN** the phase SHALL validate successfully
- **AND** `template: scope-entry` without `template_args.terminal` SHALL be rejected (terminal required with the template)

#### Scenario: Framework-chain discriminator rejected

- **WHEN** phase-level validation runs on a phase declaring `template: framework-chain` or `template_args: { node: scope-entry, terminal: round-report }` without the matching template
- **THEN** schema validation SHALL reject the workflow naming the removed factory form

#### Scenario: Template and use conflict rejected

- **WHEN** a phase declares both `template` and `use`
- **THEN** schema validation SHALL reject the workflow with both fields named (the template is the single source of the node's work; `use` composition is deleted)

#### Scenario: Template and task conflict rejected

- **WHEN** a phase declares both `template` and `task`
- **THEN** schema validation SHALL reject the workflow with both fields named

#### Scenario: template_args without router rejected

- **WHEN** a phase declares `template_args` without the matching `template` (`router` requires `paths`; `scope-entry` requires `terminal`)
- **THEN** schema validation SHALL reject the workflow naming the field and the missing template type

#### Scenario: Loop template value rejected

- **WHEN** a phase declares `template: loop`
- **THEN** schema validation SHALL fail naming the removed value — loop SHALL be expressed as a flow self-edge

#### Scenario: Flow field declared member

- **WHEN** a graph declares a top-level `flow` array
- **THEN** loading SHALL read it into the parsed graph definition for transition-table compilation (never passthrough-swallowed)

#### Scenario: Accept templates rejected at schema level

- **WHEN** a graph phase declares `template: review-accept` or `template: adopt-accept`
- **THEN** graph load SHALL fail validation naming the enum member

#### Scenario: Adopt-scope template rejected at schema level

- **WHEN** a graph phase declares `template: adopt-scope`
- **THEN** graph load SHALL fail validation naming the enum member

#### Scenario: Router questions parameter accepted

- **WHEN** a graph phase declares `template: router` with `template_args: { paths: [...], questions: [{ prompt, condition }] }`
- **THEN** graph load SHALL succeed; the questions array SHALL be passed through to the router template text

#### Scenario: Questions rejected on non-router templates

- **WHEN** a graph phase declares `template_args.questions` without `template: router`
- **THEN** graph load SHALL fail validation naming the non-router template

### Requirement: Retry and jump targets explicit

MODIFIED: the rework reset scope SHALL be the target + downstream terminal nodes (upstream kept), including the synthesized handoff node: a rework decision targeting an upstream node SHALL reset the handoff to `pending` with retry count incremented (never zeroed) as part of the downstream terminal closure. The reset SHALL persist cleared execution timestamps: reset node rows in the database carry NULL startedAt/completedAt, matching the in-memory snapshot — a status query after a rework SHALL NOT show stale timestamps on pending nodes. Retry count SHALL be tracked in run state (LangGraph `ReducedValue` auto-increment on re-entry), never zeroed. Rework SHALL NOT cross run boundaries — composition is compile-time nesting inside the single run; root rework targets are limited to nodes of the compiled graph (root members and namespaced composed members — no sibling-run target concept exists).

#### Scenario: Jump reset scope

- **WHEN** a main rework decision targets node X
- **THEN** X and every terminal node in X's downstream closure reset to pending with retry count incremented; X's upstream stays terminal (inputs unchanged)

#### Scenario: Jump reset includes handoff

- **WHEN** a main rework decision targets node X upstream of a completed `__handoff`
- **THEN** X, the downstream terminal closure, and `__handoff` reset to `pending` with retry count incremented
- **AND** the persisted rows carry NULL startedAt/completedAt (no stale completion values)

#### Scenario: Rework target bounded to the compiled graph

- **WHEN** a root-run node declares a rework target
- **THEN** the target SHALL be a node of the compiled graph (root member or namespaced composed member) — a target outside the graph fails load

#### Scenario: Jump reset clears timestamps persistently

- **WHEN** a rework resets a previously completed node to pending
- **THEN** the persisted row's startedAt/completedAt become NULL (not the stale completion values) — a later status query reconstructed from the database matches the reset's snapshot

#### Scenario: Eval auto-retry carries target

- **WHEN** a main rework decision carries an explicit target
- **THEN** the target is applied mechanically (retry count incremented on the reset closure)

#### Scenario: Retry with explicit target re-executes target

- **WHEN** a main rework decision carries a target
- **THEN** the run re-executes it (target + downstream reset)

#### Scenario: Target-less retry or jump warns

- **WHEN** a written retry/jump action has no target
- **THEN** the validator warns; the pilot resolves the target from context

#### Scenario: Target resolves after flatten

- **WHEN** a target names a composing phase
- **THEN** composition remaps retry/jump targets to the subgraph's entry node

### Requirement: Maturity-declared scope entries

A journey's scope entry SHALL declare its maturity by construction: raw journeys wire an interview entry (skill: atom-scope-interview — unconditional interview); sharpened/decided journeys wire an extract entry (task: read upstream artifact channel → scope fields; ADR judgment = existence check on docs/adr/index.md; adr_created echoes the upstream artifact's decision). No node SHALL detect input source, branch on input state, or degrade its interview. (Composition is deleted — no entry inherits a composer dependsOn, so every graph entry is in-degree-0 by construction; the historical `input: true` flag does not exist in the schema.)

#### Scenario: Raw journey interviews

- **WHEN** a graph declares an interview entry
- **THEN** the node SHALL conduct the interview — at least one question, recommendation first — regardless of context completeness (no skip path exists)

#### Scenario: Sharpened journey extracts

- **WHEN** a graph declares an extract entry with an upstream artifact channel
- **THEN** the node SHALL read the artifact, emit scope fields + ADR existence check, and SHALL NOT ask questions

#### Scenario: Every entry is in-degree-0 by construction

- **WHEN** a graph loads
- **THEN** its entry node SHALL be in-degree-0 (no composer dependsOn exists — composition is deleted); no `input` flag exists in the schema (unknown-key rejection)

#### Scenario: Composed entry skips the input flag

- **WHEN** a graph loads with an entry that does not declare an `input` flag
- **THEN** the graph loads normally — the flag does not exist in the schema (unknown-key rejection would fire if declared); the composed-stage case that previously skipped the flag no longer exists (composition is deleted, every entry is in-degree-0 by construction)

### Requirement: Config schema — project channels array

The project configuration (`.graph-scheduler/config.json`) SHALL accept a `channels` array of graph-level-style channel entries (explicit prefix or glob; bare name rejected at config parse). The array SHALL be the outermost scope in the effective-channel merge for every graph run in the project. Absent array SHALL be an empty scope — no behavior change for existing configs.

#### Scenario: Project channels declared

- **WHEN** `.graph-scheduler/config.json` declares `"channels": ["./CONTEXT.md"]`
- **THEN** every dispatched phase in the project SHALL inherit the entry (outermost, deduplicated)

#### Scenario: Missing project channels

- **WHEN** `.graph-scheduler/config.json` declares no `channels` field
- **THEN** the project scope SHALL be empty and existing graph behavior SHALL be unchanged

### Requirement: Maker-graph conventions reference graph-generate

Production-graph phase conventions SHALL name the concrete maker graph `graph-generate` (spec/implement phases via atom-graph-design / atom-graph-writer). Case-5 no-work self-judgment SHALL NOT be used by graph-generate's spec/implement phases (topology decides, per the single-writer convention). Terminology: the phases' work SHALL be described as decided by the workflow graph — "DAG" wording retired.

#### Scenario: graph-generate single-writer convention

- **WHEN** a validator scans graph-generate for case-5 no-work self-judgment in spec/implement
- **THEN** none SHALL be found — the phases' work is decided by the workflow graph (spec → spec-accept → implement → review → gate)

#### Scenario: Maker graph naming

- **WHEN** graph-definition docs reference the maker journey graph
- **THEN** they SHALL name `graph-generate`, never `graph-workflow`

### Requirement: Mandatory operation declarations on main phases

Every main phase SHALL declare its operation classes from the closed operation-class set (scenario registry per tool-usage-contract); undeclared main phases SHALL fail graph load. No HLT class table exists (ADR 0194).

#### Scenario: Undeclared main phase rejected

- **WHEN** a graph defines a main phase without `operations:`
- **THEN** graph load fails with a validation error naming the phase

#### Scenario: Conversation-only nodes declare empty

- **WHEN** a main phase performs only conversation work (scope interviews, grilling)
- **THEN** it declares `operations: []` and validation accepts it

#### Scenario: Closed set membership

- **WHEN** a main phase declares an operation not in the closed operation-class set
- **THEN** graph load fails with a validation error listing the valid classes

### Requirement: Engine validates shapes, not content

The engine's load-time contract checks are limited to machine facts: target resolvability (dependsOn, routing targets, jump targets, route members), closed-set membership (types, operation classes, channel prefixes), and graph-level context entry shape. Task-text content checks (canonical Output contract spelling, legacy spellings, protocol restatement, declared-input claims) are no longer performed by the engine; they move to the agent-side consistency gate (estate-maintain).

#### Scenario: Malformed task text

- **WHEN** a main-phase task uses a legacy output spelling
- **THEN** the engine loads the graph without error; the consistency gate flags the spelling

#### Scenario: Unresolvable jump target

- **WHEN** a main rework decision targets a non-existent node
- **THEN** graph load fails with a loud rejection

### Requirement: Reserved `$` prefix rejected

MODIFIED: the phase schema SHALL reject any phase id starting with `$` — the activation prologue was removed (activation facts live at `graph_start` / pilot startup); any `$` id is rejected with a validation error naming the removed prefix. The `input: true` flag of the reverted input-node mechanism SHALL NOT exist in the schema. Synthesized handoff ids SHALL use the reserved-safe `__handoff` suffix (never `$`-prefixed) — compilation post-schema is not bound by the source-id rejection but SHALL respect the reserved-prefix contract.

#### Scenario: $-prefixed id rejected

- **WHEN** a graph declares a phase id starting with `$`
- **THEN** schema validation SHALL fail with an error naming the `$` prefix (activation prologue removed)

#### Scenario: Plain ids accepted

- **WHEN** a graph declares any non-`$` node id
- **THEN** validation accepts it like any node id

#### Scenario: Synthesized handoff avoids the reserved prefix

- **WHEN** compilation synthesizes the handoff node id
- **THEN** the id SHALL use the `__handoff` suffix (no `$` prefix) and SHALL NOT be subject to the source-id `$` rejection

### Requirement: Graph identity SHALL be schema-determined

A graph definition SHALL be identified by successful WorkflowSchema validation — not by file suffix and not by dependency-edge (DAG) semantics. Any YAML document that validates is a graph; a document that fails validation is not. The `name` field SHALL be required; a document without a valid `name` SHALL NOT load as a graph. Dependency-edge acyclicity is a validation concern; graph identity is schema-determined regardless of topology shape.

#### Scenario: Suffix-free YAML loads

- **WHEN** a YAML file with an arbitrary filename passes schema validation
- **THEN** it loads as a graph

#### Scenario: Name-less YAML rejected

- **WHEN** a YAML file omits `name`
- **THEN** load fails with a name-required violation

#### Scenario: Loop graph loads by schema identity

- **WHEN** a graph declares runtime rework loops (main rework decisions targeting upstream terminals) and its dependsOn edges are acyclic
- **THEN** the graph SHALL load and run — the loop capability is part of the engine contract, not a validation failure

### Requirement: Graph schema self-description — $schema declaration

The graph format SHALL accept an optional top-level `$schema` field — a URI string identifying the derived JSON Schema document the graph conforms to. Absent `$schema` SHALL validate against the default WorkflowSchema (backward compatible with existing files). When declared, the value SHALL be a URI that resolves to the derived JSON Schema document (`workflow.schema.json`): the load chain SHALL resolve the declaration relative to the declaring file's location and, failing that, against the package schemas dir; a declaration that resolves to no schema document SHALL fail at load with a loud error naming the declared URI. Malformed URIs SHALL fail at load. Shipped graph files SHALL declare the derived document in a form resolvable from the file's location (e.g. `../schemas/workflow.schema.json`).

#### Scenario: $schema declared

- **WHEN** a graph YAML declares `$schema` referencing the workflow JSON Schema and the URI resolves to the derived JSON Schema document
- **THEN** the load chain resolves the declared schema identity and validates the document against WorkflowSchema

#### Scenario: $schema declared but dangling

- **WHEN** a graph YAML declares `$schema` with a URI that resolves to no schema document (e.g. a file-relative name pointing at a missing path)
- **THEN** load fails with a loud error naming the declared URI

#### Scenario: $schema absent

- **WHEN** a graph YAML has no `$schema`
- **THEN** it validates against the default WorkflowSchema (backward compatible)

### Requirement: Version field — semver with major-mismatch rejection

The graph format SHALL accept an optional top-level `version` field — the format version of the document in semver syntax (e.g. `1.0.0`). Non-semver values SHALL fail schema validation. A major-version mismatch against the engine's supported format version SHALL fail load with a loud rejection naming the mismatch — never silent degradation.

#### Scenario: Valid semver version

- **WHEN** a graph YAML declares `version: 1.0.0` with the engine's major version
- **THEN** load succeeds

#### Scenario: Major version mismatch

- **WHEN** a graph YAML declares a major version the engine does not support
- **THEN** load fails with a loud rejection naming the mismatch

#### Scenario: Invalid version syntax

- **WHEN** a graph YAML declares a non-semver `version`
- **THEN** schema validation fails

### Requirement: JSON Schema derived artifact

The WorkflowSchema zod definition SHALL be the single source of truth for the graph format. A JSON Schema document SHALL be derived from it via zod v4 `toJSONSchema()` (draft 2020-12) and published at `schemas/workflow.schema.json`. The derived artifact SHALL NOT be hand-maintained (no dual-write); the generation channel SHALL produce the committed form directly — the generator SHALL normalize its output with the repository's prettier configuration (same formatter that touches committed JSON), and the drift guard SHALL compare the normalized derived document against the committed artifact. A prettier-formatted committed artifact SHALL NOT fail the guard.

#### Scenario: Derived artifact matches source

- **WHEN** the JSON Schema artifact is regenerated from the zod source via the generation channel
- **THEN** it matches the committed `workflow.schema.json` byte-for-byte — both sides prettier-normalized, so a prettier-formatted committed artifact passes the snapshot test

#### Scenario: Artifact out of sync fails

- **WHEN** the zod source changes without regenerating the artifact
- **THEN** the drift guard fails with the content-level diff — formatting differences alone SHALL NOT fail the guard

### Requirement: Graph-level context field in workflow schema

The workflow YAML format SHALL declare an optional top-level `context` field — an array of channel entries — alongside `name`, `description`, `$schema`, `version`, `phases`, and `inventory`. Entries SHALL follow graph-level entry rules: explicit `skill:`/`node:` prefix or file-glob shape; bare names SHALL be rejected at load. The field SHALL be documented in the graph format reference (atom-graph-spec) as the graph's ambient context layer. A top-level `channels` field SHALL remain rejected at load (renamed to `context` — loud rename contract).

#### Scenario: Top-level context declared

- **WHEN** a graph YAML declares a valid `context` array
- **THEN** load succeeds and the entries form the graph's ambient context layer

#### Scenario: Top-level channels rejected

- **WHEN** a graph YAML declares top-level `channels`
- **THEN** load fails with the rename rejection (use `context`)

### Requirement: Graph inventory — node overview table

The workflow YAML format SHALL declare an optional top-level `inventory` array — the graph's node overview table (dedicated schema key; the term "atom" SHALL NOT name the key). Each entry SHALL carry exactly `{ id, type, goal, constraints? }`:

- `id` — the phase id the entry describes; SHALL exist in the `phases` array.
- `type` — the phase type; SHALL match the referenced phase's declared type (`main` | `flow`). The `approval` / `gate` values are deleted (ADR 0215/0216).
- `goal` — a **bounded compound sentence stating the atom's intent** (what the atom accomplishes — intent semantics per the platform task contract, OMP Goal), **including its execution mechanism when one exists**: connectors limited to `AND` / `THEN` / `IF` / `ELSE` / `OR` (structural keywords ALL-CAPS, prose `and`/`or` lowercase); ordinary nodes SHALL NOT exceed 5 steps; conditional goals SHALL NOT exceed 3 paths. Skill-bound main nodes SHALL name the executing skill in verb form (e.g. "Executes atom-scope-interview to acquire scope"); flow entries SHALL state "expands <use> subgraph". The gate-goal operand bound and the approval/gate decision-semantics clause are removed with the deleted types.
- `constraints` (optional) — an array of one-sentence prose rules stating the atom's boundaries: general rules and explicit non-goals ("what the atom does NOT do / which approaches are NOT adopted"). SHALL NOT exceed 5 entries per atom (convention bound, localized from the platform constraint guidance "3–5 constraints / ≤5 constraint sentences"; user-calibratable). Rules prefer positive framing; explicit non-goals SHALL state the negation directly (e.g. "does not X" / "avoids Y"). `constraints` SHALL NOT introduce structural keywords — prose only, no new word-list members.

A dedicated `skill` field SHALL NOT exist on inventory entries (removed — the phase-level `skill` field is the single source; the mechanism lives in the goal). A legacy `skill` key in an inventory entry SHALL be ignored — stripped at parse, no rejection, no migration hint.

Consistency validation: the inventory consistency check SHALL run as part of the **post-flatten contract pass** (per source graph — each graph's inventory validated against its own phase declarations): every inventory entry SHALL be checked against its referenced phase — missing `id` or type mismatch SHALL produce a load **warning** (documented per entry); the graph SHALL still load (warning is not a rejection, and SHALL never be silent). `goal`/`constraints` content SHALL NOT be machine-validated (zero new validation axis — no bounds check, no case check, no constraint-content check; discipline = generation-time obligation + review). Inventory warnings SHALL flow through the contract-warning pipeline alongside all other contract warnings.

#### Scenario: Inventory declared with matching entries

- **WHEN** a graph YAML declares an `inventory` array whose entries all reference existing phases with matching type
- **THEN** load succeeds with no inventory warnings

#### Scenario: Inventory entry references a missing phase

- **WHEN** an inventory entry references a phase id absent from the `phases` array
- **THEN** load SHALL produce a documented warning per entry — the graph still loads

#### Scenario: Inventory entry type/skill mismatch

- **WHEN** an inventory entry declares a type that does not match its referenced phase
- **THEN** load SHALL produce a documented warning — never silent

#### Scenario: Legacy inventory skill key ignored

- **WHEN** an inventory entry carries a legacy `skill` key
- **THEN** the key SHALL be ignored — stripped at parse, no rejection, no migration hint

#### Scenario: Compound description within bounds

- **WHEN** a goal uses the bounded compound syntax
- **THEN** connectors SHALL be ALL-CAPS structural keywords (AND/OR/IF/THEN/ELSE) and ordinary nodes SHALL NOT exceed 5 steps

#### Scenario: Constraints carry rules and non-goals

- **WHEN** an entry declares `constraints`
- **THEN** the array SHALL hold one-sentence prose rules and explicit non-goals, SHALL NOT exceed 5 entries, and SHALL NOT introduce structural keywords

#### Scenario: Constraint content never machine-validated

- **WHEN** a graph loads with inventory entries
- **THEN** goal/constraints content SHALL NOT be machine-validated (no bounds check, no case check, no constraint-content check)

#### Scenario: Flow entry describes expansion

- **WHEN** an inventory entry describes a flow phase
- **THEN** the goal SHALL state "expands <use> subgraph"

### Requirement: Graph-level constraints accepted at load

The WorkflowSchema SHALL declare the top-level `constraints` field (`z.array(z.string()).optional()`) alongside `name`/`description`/`$schema`/`version`/`context`/`inventory`/`phases`, and graph loading SHALL read it into the parsed graph definition for dispatch assembly. The field SHALL NOT be silently consumed by object passthrough — declared member, zero behavior branching (no machine validation of content; no effect on topology). Absent field SHALL be an empty set.

#### Scenario: Constraints loaded with graph

- **WHEN** a graph YAML declares top-level `constraints`
- **THEN** the parsed graph definition carries the constraint array in order, and dispatch assembly can access it

#### Scenario: Absent field is empty set

- **WHEN** a graph YAML has no top-level `constraints`
- **THEN** the parsed definition carries an empty constraint set — no warning, no error

#### Scenario: Undeclared keys not silently consumed

- **WHEN** a graph YAML declares `constraints`
- **THEN** the key is a recognized schema member — the silent-passthrough path for undeclared top-level keys does not apply to it

### Requirement: Top-level interaction field — non-interactive declaration

The WorkflowSchema SHALL declare an optional top-level `interaction` field (`z.enum(['none', 'enabled']).optional()`) alongside `name`/`description`/`$schema`/`version`/`context`/`inventory`/`constraints`/`phases`, and graph loading SHALL read it into the parsed graph definition. The field SHALL NOT be silently consumed by object passthrough — declared member, zero behavior branching (no machine validation of content, no effect on topology, no load-time enforcement). Absent field SHALL be `enabled`. The declaration SHALL constrain only the declaring graph's own file — it SHALL NOT propagate through composition (`use`) into a composed graph's effective interaction state, and a composed graph SHALL NOT inherit or union child declarations. The field SHALL be documented in the graph format reference (atom-graph-spec) as the graph's interaction declaration.

#### Scenario: Absent interaction field defaults to enabled

- **WHEN** a graph YAML declares no top-level `interaction` field
- **THEN** the parsed graph SHALL read an effective value of `enabled`
- **THEN** loading SHALL succeed with no warning

#### Scenario: Explicit non-interactive declaration loads

- **WHEN** a graph YAML declares `interaction: none`
- **THEN** loading SHALL succeed and the parsed graph SHALL carry `interaction: none`
- **THEN** no load-time enforcement SHALL occur — the backend performs zero judgment on node content

#### Scenario: Invalid interaction value fails schema validation

- **WHEN** a graph YAML declares `interaction` with a value outside `none`/`enabled` (e.g. `interaction: sometimes`)
- **THEN** schema validation SHALL fail with a structured error naming the field and accepted values

#### Scenario: Subgraph declaration does not affect composed graph

- **WHEN** a framework graph composes a subgraph that declares `interaction: none` via a flow phase (`use`)
- **THEN** the composed graph SHALL keep its own declared interaction value (absent → `enabled`)
- **THEN** no union, no inheritance, no effective-view aggregation of child interaction declarations SHALL occur

### Requirement: Subgraph constraints propagate through composition

When a graph composes a subgraph via a flow phase (`use`), the subgraph's top-level `constraints` SHALL propagate into the composed graph's graph-layer constraint set — union semantics, no source prefix, symmetric with the inventory use-chain union (ADR 0183). A subgraph without top-level constraints SHALL contribute nothing. Propagated subgraph constraints SHALL ride every NodeDetail dispatch of the composed run exactly like the root graph's own constraints (`[graph]` prefix, injection order: root entries first, then subgraph entries in composition order).

#### Scenario: Composed run injects subgraph constraints

- **WHEN** a graph uses a subgraph that declares top-level `constraints` and a composed run dispatches a node from the subgraph's phases
- **THEN** the NodeDetail carries both the root graph's `[graph]` entries and the subgraph's `[graph]` entries — no subgraph rule is silently dropped at flatten

#### Scenario: Subgraph without constraints contributes nothing

- **WHEN** a composed subgraph declares no top-level `constraints`
- **THEN** the composed constraint set equals the root graph's own entries — empty subgraph contribution, no error, no warning

#### Scenario: Nested composition propagates transitively

- **WHEN** a subgraph itself composes a nested subgraph declaring constraints
- **THEN** the nested constraints propagate to the outermost composed run (transitive union, depth-capped by the existing composition depth cap)

### Requirement: Node activation and dependency resolution

MODIFIED: activation judgment SHALL remain dependency-satisfied: satisfied = all direct dependencies terminal (AND join — the only join mode). Static dependency edges SHALL be acyclic — a cycle in dependsOn edges fails loading loudly with the cycle path. Redundant transitive dependencies SHALL be rejected. Readiness resolution SHALL be O(1) lookup, zero closure inference. The next-node set SHALL derive from the flow transition table: labeled edges = condition→target map, unlabeled edges = sequence default; a node without outgoing flow edges SHALL keep its dependsOn-derived successor set as the sequence default. Runtime loops SHALL be flow self-edges (bounded by constraint prose + retryCount), never dependency edges.

#### Scenario: AND convergence is the only join mode

- **WHEN** a phase has multiple dependencies
- **THEN** it activates only after every dependency is terminal — no `join: any` exists

#### Scenario: Load validates DAG acyclicity

- **WHEN** a graph loads
- **THEN** the contract pass validates dependency-edge acyclicity — a cycle fails loading loudly with the cycle path

#### Scenario: Runtime rework loops are bounded and legal

- **WHEN** a node is a flow self-loop head (a self-edge routes back on a condition)
- **THEN** loading SHALL succeed (the loop is a flow transition, not a dependency edge)
- **AND** the runtime loop SHALL be bounded by the constraint prose + retryCount (each self-edge pass increments the node's retryCount, never zeroed)

#### Scenario: Redundant transitive dependencies rejected

- **WHEN** a phase declares a redundant transitive dependency
- **THEN** the validator rejects it — judgment context declares via channels node:, never by padding dependsOn

#### Scenario: Flow edge activates its target

- **WHEN** a node's flow table matches the reported condition
- **THEN** exactly the matched edge's target activates; sibling flow targets stay pending

#### Scenario: No flow edges — dependsOn default

- **WHEN** a node declares no outgoing flow edges
- **THEN** the dependsOn-derived successor set activates as before (sequence default)

### Requirement: Completion choices SHALL contain graph nodes only

The compile-time branch-target collection (`collectBranchTargets`) SHALL filter every gathered backtick token to the compiled graph's node set before it becomes a `completion.choices` entry — prose tokens (paths, glossary terms, plain identifiers that are not node ids) SHALL NOT surface as card options. The `rework` and `direct_end` fields SHALL keep their existing extraction (explicit backtick target / `direct end:` declaration). An unresolvable token that survives filtering SHALL be dropped, never offered.

#### Scenario: Prose token excluded from choices

- **WHEN** a phase task text contains a backticked word that is not a node id of the compiled graph
- **THEN** the token SHALL NOT appear in `completion.choices`

#### Scenario: Branch target kept

- **WHEN** a phase task text contains a backticked node id that exists in the compiled graph
- **THEN** the token SHALL appear in `completion.choices` (namespaced per composition)

### Requirement: Resume continuation SHALL be exclusive

A resumed node's decision SHALL determine the complete next activation set: the node function SHALL return `Command({goto})` for EVERY continuation (continue → its dependency-derived successor set or END; rework/branch → the target), and the graph SHALL NOT add static successors to a goto target on resume. A branch decision SHALL activate exactly the selected target — unselected branch nodes SHALL stay `pending` and SHALL NOT be interrupted or activated. A rework jump SHALL reset exactly the target + downstream terminal nodes — static successors of the jumped node SHALL NOT re-activate.

#### Scenario: Branch selection activates only the chosen target (non-composing branch)

- **WHEN** a decide node with dependency-derived successors alpha and beta is resumed with a branch decision for `alpha`
- **THEN** the next interrupts SHALL be exactly `[alpha]`
- **THEN** `beta` SHALL remain `pending` — never activated, never interrupted

#### Scenario: Rework jump stays exclusive

- **WHEN** a rework decision jumps to a node that has dependency-derived successors
- **THEN** only the target node SHALL activate (reset scope = target + downstream terminal nodes → pending)
- **THEN** the target's successors SHALL NOT activate as a side effect of the resume

### Requirement: Compile product SHALL expose only consumed surfaces

MODIFIED: the compiled graph SHALL NOT expose `meta.subgraphs` (boundary enumeration), `InterruptPayload.position`/`executionMode`, or cross-run delegation synthesis (subgraph dissolve → `<composing>/__delegate` + Pass 2 delegation node). The compile product SHALL expose: namespaced member ids, `composingTargets`/`resolveTarget` (branchTo naming a composing phase activates the subgraph entry), `levelOwnIds` terminal scoping, and per-level `__handoff` synthesis. Handoff synthesis SHALL use the zero-parameter session template (`handoffTaskTemplate()` — no report-path computation).

#### Scenario: Subgraph members namespaced and dispatched

- **WHEN** a composed graph compiles
- **THEN** member ids SHALL be namespaced (`composingId/childId`) and SHALL appear in the run's dispatch sequence like peer nodes

#### Scenario: Branch-to-composing-phase resolves

- **WHEN** `branchTo` names a composing phase
- **THEN** the scheduler SHALL activate the subgraph's entry node via `resolveTarget`

#### Scenario: No delegation node synthesized

- **WHEN** any subgraph compiles
- **THEN** no `<composing>/__delegate` node SHALL be synthesized and no delegation task template SHALL be referenced

#### Scenario: Handoff synthesized session-style

- **WHEN** a graph or subgraph compiles
- **THEN** its `__handoff` terminal SHALL be synthesized with the zero-parameter session contract task (no report path, no file-write instruction)

### Requirement: use phases SHALL NOT accept an execution-mode declaration

MODIFIED: `use` phases SHALL NOT accept an execution-mode declaration — the `execution` field remains removed. The peer-level `agent` hints field is restored for plain main phases (advisory sub-agent type preferences); composing (`use`) phases SHALL NOT declare `agent` — the subgraph agent deletion (round-12) is retained, enforced by a superRefine guard. `use` composition itself is retained: a `use` phase references another graph compiled in at load time (members namespaced `composingId/childId`, dispatched through the same advance loop as peer nodes). No composed/standalone distinction exists on the dispatch surface.

#### Scenario: Use phase without execution field loads

- **WHEN** a workflow declares a `use` phase without `execution` and `agent`
- **THEN** the workflow SHALL load and compile — the subgraph members join the run with namespaced ids, dispatched like peer main nodes

#### Scenario: Execution field rejected

- **WHEN** a workflow declares `execution: subagent` or `execution: cross-run` on a `use` phase
- **THEN** schema validation SHALL reject the workflow with the field named

#### Scenario: Agent field rejected

- **WHEN** a composing (`use`) phase declares an `agent` field
- **THEN** schema validation SHALL reject the workflow with the field named
- **AND** a plain main (non-`use`) phase declaring `agent` SHALL validate (peer-level advisory restored)

### Requirement: Top-level description SHALL be the catalog single source

The workflow YAML top-level `description` field SHALL be the single source for the graph's catalog description — registry entries SHALL NOT carry a description (registry is a pure index). Catalog consumers (graph_assets payload, drift checks) SHALL read the description from the loaded graph definition; an undeclared description SHALL yield an empty string, never a registry fallback. The field SHALL remain optional — no graph is required to declare it.

#### Scenario: catalog description comes from the definition

- **WHEN** a graph declares a top-level `description` and a catalog consumer queries the graph
- **THEN** the consumer's description value is exactly the declared top-level description

#### Scenario: undeclared description is empty, not a registry fallback

- **WHEN** a graph declares no top-level `description`
- **THEN** the catalog entry's description is empty even if a registry file (erroneously) carries one

### Requirement: Load-time mermaid compliance for project graphs

The load-time contract pass SHALL include a mermaid-format compliance check for project graphs: each project graph's declared `flow` block SHALL be parsed with the real mermaid flowchart parser. A non-conformant block SHALL NOT fail the load (the run is never blocked) — it SHALL be recorded as a load-time problem and delivered through the existing problems channel so `graph_assets` surfaces it to the frontend for repair. The check SHALL run only when the graph declares a `flow` block; builtin graphs are covered by the suite regression test instead (no runtime parse). The engine's deterministic subset parse SHALL remain the load authority (a subset-invalid block fails load loudly, unchanged).

#### Scenario: Project graph flow block is not mermaid-valid

- **WHEN** a project graph whose `flow` block fails the real mermaid parser is started
- **THEN** the run starts (non-blocking), and the graph's `graph_assets` entry carries the mermaid-compliance problem
