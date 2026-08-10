# phase-handler Specification

## Purpose

Handlers of three types (main/approval/gate) plus decision persistence. Asset: `packages/graph-scheduler/src/phase-handler/` (6 files).

## Requirements

### Requirement: PhaseHandler interface

System SHALL define an `IPhaseHandler` interface implemented once per supported phase type (`main`/`approval`/`gate`), resolved statically by `phaseType` at dispatch — no handler registry, no extensible registration. Each handler SHALL support two operations: `validate` (validate phase-specific fields after schema parse, throwing `PhaseHandlerError` on failure) and `extendNodeDetail` (enrich the base NodeDetail with type-specific fields). Base fields (`nodeId`, `type`, `handlerSkill`, `skill`, `retryAttempt`, `dependsOn`) SHALL be set by the core dispatch path — handlers SHALL only add type-specific fields.

#### Scenario: Handler normalizes phase config

- **WHEN** a phase is loaded with missing optional fields
- **THEN** defaults SHALL be applied by the schema (e.g. `join` absent = all, `agent` absent = no preference) — handlers SHALL NOT duplicate defaulting logic

#### Scenario: Handler extends base node detail

- **WHEN** `extendNodeDetail()` is called with base fields (nodeId, type, handlerSkill, skill, retryAttempt, dependsOn)
- **THEN** the returned `NodeDetail` SHALL include all base fields plus type-specific additions
- **THEN** main-type handlers SHALL add: `task`, `channels`, `agent` (hints array), `route` when declared
- **THEN** approval-type handlers SHALL add: `routing` (actions), `jumps`, `route` when declared
- **THEN** gate-type handlers SHALL add: `jumps`, `channels` (node:-only judgment context)

#### Scenario: Handler processes agent result

- **WHEN** an approval handler receives the decision output
- **THEN** it SHALL parse and validate the output as an `IApprovalDecision` for its phase type
- **THEN** invalid output SHALL return a structured error, not throw

#### Scenario: Handler resolved statically by type

- **WHEN** a phase has `type: "main"` — the main handler SHALL be returned
- **WHEN** a phase has `type: "approval"` — the approval handler SHALL be returned
- **WHEN** a phase has `type: "gate"` — the gate handler SHALL be returned
- **THEN** any other type SHALL fail at schema parse — never a silent default handler

### Requirement: Context field semantics split by phase type

Context mechanics are unified: `channels` spans main/approval/gate — main derives it from the entry skill contract (skill:/node:/bare contract name/glob); approval/gate allow only `node:` entries (judgment context = node output, schema-level restriction). `preText` is removed — approval card static text folds into `task` (first line = header, remaining lines = body); `reads` is removed — judgment context = direct dependsOn output (auto-injected) + channels node:. Residual preText/reads declarations SHALL be loudly rejected by the schema with a migration hint. NodeDetail exposes channels (all types) + topic (derived from the task first line).

#### Scenario: Agent phase declares channels

- **WHEN** a phase declares `channels: ["node:review", "skill:atom-graph-spec"]`
- **THEN** the NodeDetail SHALL carry the `channels` array
- **THEN** the handler SHALL resolve each entry per the skill contract (main) or as node:-only judgment context (gate/approval)
- **THEN** a `context` field SHALL fail validation with a rename hint

#### Scenario: Approval phase declares preText

- **WHEN** an approval phase declares `preText` (removed field)
- **THEN** schema parsing SHALL fail with a migration hint to `task` (first line = header, rest = card body)

#### Scenario: Main phase rejects context fields

- **WHEN** a main phase declares `context` or `preText`/`reads` (removed fields)
- **THEN** validation SHALL reject the phase loudly with migration hints

#### Scenario: Approval phase declares node: channels

- **WHEN** an approval phase declares `channels: ["node:review"]`
- **THEN** the NodeDetail SHALL carry the `channels` array (judgment context)
- **THEN** a `channels` entry without the `node:` prefix on an approval/gate SHALL fail schema parsing with a migration hint

#### Scenario: Approval card text lives in task

- **WHEN** an approval phase declares a multi-line `task`
- **THEN** the decision-card header SHALL be the task's first line; the full task text SHALL be displayed as the card prompt
- **THEN** a `preText` declaration on any phase SHALL fail schema parsing with a migration hint to `task` (field removed)

#### Scenario: Reads removed globally

- **WHEN** any phase declares `reads`
- **THEN** schema parsing SHALL fail with a migration hint to `channels: [node:<id>]` (field removed)

#### Scenario: Main phase channels accepted

- **WHEN** a main phase declares `channels: ["node:writer", "skill:atom-graph-spec"]`
- **THEN** schema parsing SHALL accept the phase — no main+channels error
- **THEN** the channels SHALL reach the node detail for inline injection

### Requirement: Approval handler — decision routing

The approval presentation SHALL be a dynamic-options protocol: a mandatory Accept (accept the AI recommendation) + built-in free input + AI-generated contextual options (retry/jump/end/branch); only branch-route scenarios declare routing actions (target + value).

#### Scenario: Accept + free input

- **WHEN** an approval declares no routing actions
- **THEN** the card presents Accept (AI recommendation) + free-input box + AI-generated contextual options; auto mode executes the recommendation

#### Scenario: Branch-route options

- **WHEN** an approval declares branch-route options (minimal/detailed) with target
- **THEN** options render with the AI-recommended one marked; choosing one activates its target route; the decision records the chosen value

#### Scenario: Routing actions define decision options

- **WHEN** an approval declares branch-route actions
- **THEN** the card renders them as options with the AI-recommended one marked

#### Scenario: Approval declares eval rejected

- **WHEN** an approval declares the removed eval field
- **THEN** schema validation rejects it loudly

#### Scenario: Approval always presents decision UI

- **WHEN** an approval dispatches in manual mode
- **THEN** the card always presents Accept + free input + AI options

#### Scenario: Approval decision carries custom input

- **WHEN** the user types free text
- **THEN** the decision persists it as the note

#### Scenario: Decision-card title synthesized from task

- **WHEN** an approval declares task
- **THEN** the card topic is the task text

#### Scenario: Missing task falls back to default title

- **WHEN** an approval declares no task
- **THEN** the card topic falls back to 'Decision Required'

#### Scenario: Handler skill references stay protocol-consistent

- **WHEN** an approval dispatches
- **THEN** handlerSkill is the constant atom-phase-handler

### Requirement: Gate handler — machine decision routing

Gate judgment SHALL be pure rework: the agent evaluates when (reads output + snapshot + run mode) → on a hit, a backward jump (target + downstream reset); on no hit, pass through; no branch decision is returned.

#### Scenario: Hit — backward jump

- **WHEN** a gate `when` evaluates true
- **THEN** the handler returns the jump decision (target); the backend resets target + downstream terminal nodes (retryCount++), upstream kept

#### Scenario: Gate node detail carries eval only

- **WHEN** a gate dispatches
- **THEN** NodeDetail carries jumps + reads; no task/routing/options

#### Scenario: Gate eval match auto-decides

- **WHEN** a gate `when` evaluates true
- **THEN** the gate reports the backward jump (mechanical reset)

#### Scenario: Gate eval no-match falls through

- **WHEN** no gate `when` evaluates true
- **THEN** the gate passes through with zero routing side effect

### Requirement: Gate schema field closure

The gate field closure SHALL be id/type/dependsOn/route/jumps/channels(node:-only)/join; task/preText/routing/reads/agent/skill/use are forbidden on gates. `jumps` SHALL be required and non-empty — a gate without a rework jump is a silent pass-through and is inexpressible.

#### Scenario: Field rejection

- **WHEN** a gate declares task/preText/routing/reads/agent/skill/use or forward branches/default/mode
- **THEN** schema validation rejects it loudly (removed-field hint)

#### Scenario: Gate forbidden fields rejected

- **WHEN** a gate declares task/preText/routing/reads/agent/skill/use
- **THEN** schema validation rejects it

#### Scenario: Gate channels node:-only

- **WHEN** a gate declares `channels: [node:<id>]`
- **THEN** schema validation accepts it; a non-node entry (skill:/glob/bare) SHALL be rejected

#### Scenario: Gate eval continue rejected

- **WHEN** a gate declares the removed eval field
- **THEN** schema validation rejects it loudly

#### Scenario: Gate eval missing rejected

- **WHEN** a gate declares no jumps
- **THEN** schema validation rejects it (silent pass-through unexpressible)

### Requirement: Main handler — direct execution

The main handler SHALL provide a pass-through execution path for phase types that require no sub-agent dispatch or decision UI.

#### Scenario: Main handler returns node detail directly

- **WHEN** a phase has `type: "main"`
- **THEN** the handler SHALL return a `NodeDetail` with the phase's task and agent fields
- **THEN** no sub-agent routing or decision UI SHALL be assembled

### Requirement: Error handling

Phase handlers SHALL surface configuration and routing errors through typed error objects, never through thrown exceptions in the dispatch path.

#### Scenario: Missing required field produces typed error

- **WHEN** a gate handler encounters a phase with no `eval` array
- **THEN** a typed error SHALL be returned indicating the missing configuration
- **THEN** the error SHALL include the phase id and the specific missing field

#### Scenario: Invalid approval routing produces typed error

- **WHEN** approval handler encounters a phase with `routing.actions` containing an unknown `action` value
- **THEN** a typed error SHALL be returned with the invalid action and valid options

### Requirement: Entry skill upstream contract alignment

Graph phases SHALL only dispatch entry skills whose declared `## Context Requirements` upstream set matches the upstream nodes the graph actually injects. An entry skill with zero graph phases dispatching it SHALL be flagged as orphaned.

#### Scenario: Dispatch upstream matches declared contract

- **WHEN** a graph phase dispatches an entry skill
- **THEN** every upstream node the entry skill declares in `## Context Requirements` SHALL be present in the graph's injected upstreams
- **THEN** an upstream mismatch SHALL fail validation with the conflicting names

#### Scenario: Orphan entry skill detection

- **WHEN** an entry skill declares graph dispatch (e.g. "Use as graph phase …") but no graph phase references it
- **THEN** validation SHALL report the skill as orphaned

### Requirement: Bounded auto-rework conditions

Eval conditions that drive automatic retry SHALL live on gate nodes and SHALL reference observable contract fields of upstream output AND be bounded by the gate node's own retry attempt count. An unbounded auto-rework condition (no retry bound) SHALL be flagged by graph validation as a warning. Retry targets SHALL be explicit node IDs — the node whose output must change (typically the writer), never a reviewer node.

#### Scenario: Bounded condition validates clean

- **WHEN** a gate node declares `eval: [{ when: "review output shows overall: fail AND retryAttempt < 2", action: "retry", target: "apply-change" }]`
- **THEN** validation SHALL pass the condition (contract-field reference + retry bound + explicit writer target)

#### Scenario: Unbounded condition warns

- **WHEN** a gate node declares an auto-rework eval condition without a retry-attempt bound
- **THEN** validation SHALL emit a warning naming the phase and the unbounded condition
- **THEN** the condition remains valid but the warning documents the infinite-loop risk

#### Scenario: Reviewer-target retry warns

- **WHEN** an eval retry condition on a gate node targets a node whose execution does not change the reviewed artifact (reviewer node)
- **THEN** validation SHALL emit a warning — re-running the reviewer without artifact change reproduces the same verdict

#### Scenario: Retry-attempt counts gate re-executions

- **WHEN** a gate node is re-executed via graph_jump (retry)
- **THEN** the gate node's `retryAttempt` SHALL increment per jump — never reset
- **THEN** the eval evaluation context SHALL state `Retry attempt: N` alongside the upstream output

### Requirement: NodeDetail carries dependsOn

The `INodeDetail` contract SHALL include `dependsOn?: string[]`, populated by `buildNodeDetail` from the phase's `dependsOn` declaration. The field SHALL be present for both agent and main phases so implicit upstream coverage is verifiable at runtime.

#### Scenario: Agent NodeDetail carries dependsOn

- **WHEN** `buildNodeDetail` constructs the NodeDetail for an agent phase with `dependsOn: ["writer"]`
- **THEN** the NodeDetail SHALL include `dependsOn: ["writer"]`

#### Scenario: Main NodeDetail carries dependsOn

- **WHEN** `buildNodeDetail` constructs the NodeDetail for a main phase with declared dependencies
- **THEN** the NodeDetail SHALL include the same `dependsOn` values as the phase
- **THEN** implicit-upstream resolution SHALL use this field — no doc/code drift between the skill contract and the DTO

### Requirement: Base and composition type ownership

Phase types SHALL belong to one of two layers, documented as the ownership model: base types (`main`, `approval`, `gate`) SHALL always be registered — the FSM jump protocol, decision-card flow, and gate protocol depend on them; composition type (`flow`) SHALL be a load-time expansion axis, never a dispatch-registry member — `IPhaseHandler` methods have no meaning for it.

#### Scenario: Base types always registered

- **WHEN** the handler registry is inspected
- **THEN** `main`, `approval`, and `gate` SHALL always be present — removal of any SHALL be treated as a registry-completeness violation

#### Scenario: Flow never enters the dispatch registry

- **WHEN** the phase handler registry enumerates its types
- **THEN** `flow` SHALL NOT appear — flow phases SHALL be expanded at load time (merge-at-load), invisible to FSM and dispatch

### Requirement: Dispatch types SHALL be a static closed set

The enabled phase-type set SHALL be fixed: `main`/`approval`/`gate` dispatch types (static handlers) + `flow` composition type (load-time expansion). No registry SHALL define the set — schema `type` is a zod enum; unknown types fail parse. The `DEFAULT_PHASE_HANDLERS` array and project `agentRegistry` keys SHALL NOT exist as type-set sources.

#### Scenario: Unknown type rejected at parse

- **WHEN** a graph declares `type: custom` or `type: agent`
- **THEN** schema validation SHALL fail with an invalid-enum error

#### Scenario: Gate type accepted at parse

- **WHEN** a graph declares `type: gate` with a valid `eval` array
- **THEN** schema validation SHALL pass it as a valid enum member
- **THEN** dispatch SHALL route it to the gate handler via the shared handler-skill constant

#### Scenario: No registry sources remain

- **WHEN** a consumer searches for type-set configuration
- **THEN** neither `DEFAULT_PHASE_HANDLERS` nor config `agentRegistry` SHALL exist

### Requirement: Type-semantics checks SHALL live in schema only

Approval SHALL NOT declare `channels`/`agent`/`eval`; main SHALL NOT declare `preText`/`eval`; gate SHALL NOT declare `task`/`preText`/`routing`/`channels`/`agent`/`skill`/`use` and SHALL declare `eval` — enforced by PhaseSchema superRefine (single enforcement point). The contract-validation layer SHALL NOT duplicate these checks.

#### Scenario: One enforcement point

- **WHEN** a graph violates a type-field rule (e.g. approval declares `channels` or `eval`, main declares `preText` or `eval`, gate declares `task` or omits `eval`)
- **THEN** schema validation rejects it at parse
- **AND** no unreachable copy exists in the contract layer

### Requirement: Gate no-match — pilot routing contract

A gate with no match SHALL pass through (no branch decision, no default target); the pilot advances normally without branchTo.

#### Scenario: No-match pass through

- **WHEN** no gate `when` evaluates true
- **THEN** the gate completes with no routing side effect; the pilot advances normally without branchTo; downstream activates via dependency satisfaction

#### Scenario: Gate no-match routes as continue

- **WHEN** a gate completes with no jump hit
- **THEN** the pilot advances normally without branchTo

#### Scenario: No-match marker never carries routing fields

- **WHEN** a gate passes through
- **THEN** no default target or branch fields are emitted

### Requirement: Approval redundancy rule

Approval phases SHALL present a reviewable artifact or a semantic branch to the human — never re-confirm a decision already confirmed by an interactive upstream node. An approval card whose decision (scope, name, plan, judgment) was just interactively confirmed in the same conversation and whose card surfaces no new artifact for review SHALL be considered redundant and SHALL NOT be declared in graph YAML. The completeness/rework duties of such a card SHALL be assumed by the paired gate (bounded eval retry) or by a downstream degraded output path — removing the card SHALL NOT create a silent pass-through. Gate nodes SHALL NOT replace approval acceptance semantics: eval action values are closed to `retry`/`jump` (continue rejected), so acceptance decisions SHALL always be expressed as approval nodes.

#### Scenario: Interactive interview precedes generation — no re-confirmation card

- **WHEN** a graph has an interactive interview node (e.g. scope interview) whose output confirms all decision fields, followed by a gate checking those fields, followed by an artifact-generation node
- **THEN** the graph SHALL NOT interpose an approval node between the gate and the generation node merely to re-confirm the interview — the interview IS the human confirmation point
- **THEN** the gate no-match SHALL fall through directly to the generation node
- **THEN** when the gate retry bound is exhausted with still-incomplete fields, the generation node SHALL degrade observably (e.g. `spec_status: blocked` with candidates) — never silently proceed as if complete

#### Scenario: Card with reviewable artifact stays valid

- **WHEN** an approval card presents an artifact the human has not yet seen (synthesized PRD, generated spec, implementation diff, review verdict)
- **THEN** the approval SHALL remain — the card is the first review point of that artifact, not a re-confirmation

#### Scenario: Gate cannot express acceptance

- **WHEN** a graph author attempts to replace an acceptance approval with a gate eval condition (`action: continue`)
- **THEN** schema validation SHALL reject the condition — auto-approval is unexpressible on gate nodes (silent bypass of a non-bypassable gate)
- **THEN** the acceptance decision SHALL be modeled as an approval node

### Requirement: Approval auto-execution — run field direct branch

Auto execution SHALL be the AI recommendation (dynamic), not a static default:true; with no recommendation, the card is shown (see run-mode).

#### Scenario: Auto executes recommendation

- **WHEN** an approval runs in auto mode and the AI forms a recommendation
- **THEN** the recommended action executes without a card; the decision persists with value + label + note 'run mode: auto'

#### Scenario: Auto mode executes first action without card

- **WHEN** an approval runs in auto mode and the AI forms a recommendation
- **THEN** the recommended action executes without a card; the decision persists with value + label + note 'run mode: auto'

#### Scenario: Manual mode presents the card

- **WHEN** an approval runs in manual mode
- **THEN** the card always presents

### Requirement: Run Mode context injection

The handler SHALL inject a `## Run Mode: <mode>` context block for all nodes (main/approval/gate) — same channel and same level as the constraints block. The gate eval evaluation context SHALL include this block so eval conditions can reference the run mode (e.g. the auto fast path of the arch-review-loop loop-gate).

#### Scenario: Main and approval receive run-mode block

- **WHEN** any main or approval node executes
- **THEN** its context SHALL include the `## Run Mode: <mode>` block (prepended in the injected-block order)

#### Scenario: Gate eval context includes run-mode block

- **WHEN** a gate node evaluates its eval conditions
- **THEN** the evaluation context SHALL include `## Run Mode: <mode>` — eval text may reference it (e.g. `run mode is auto`)

#### Scenario: Auto-mode approval card note

- **WHEN** a run is in auto mode and an approval presents a human card due to an anomaly (empty routingActions)
- **THEN** the card SHALL show a line reading "Run mode: auto — this card auto-executes routingActions[0]" (handler-injected, replacing the graph preText boilerplate)

### Requirement: Phase route field

All phase types SHALL be able to declare `route: <id>` (optional) — route membership attribution (route-routing).

#### Scenario: Route on any phase type

- **WHEN** a main/approval/gate/flow phase declares `route: <id>`
- **THEN** flatten propagates the route to flow children; the route is a first-class activation axis (graph-scheduling)

### Requirement: join SHALL accept only the literal any

`join` SHALL accept only the literal `'any'` — declaring it means any-join; the default is all. An explicit `join: 'all'` SHALL be loudly rejected by the schema (all is the default, so declaring it is redundant).

#### Scenario: Explicit all rejected

- **WHEN** a phase declares `join: all`
- **THEN** schema parsing SHALL fail (only the literal `any` is valid)

#### Scenario: Any-join declaration

- **WHEN** a phase declares `join: any`
- **THEN** the phase fires when any direct upstream completes (done); other upstreams stay pending

### Requirement: main phase agent field SHALL be a priority-ordered hint array

PhaseSchema SHALL accept `agent` as an optional `string[]` on `main`-typed phases. Array order SHALL encode priority — first available entry wins. An empty or absent array SHALL mean "no preference" (platform default applies).

#### Scenario: Priority-ordered hints declared on main phase

- **WHEN** a graph declares `agent: [reviewer, task]` on a `main` phase
- **THEN** PhaseSchema SHALL parse it as a string array preserving order
- **THEN** the NodeDetail for that phase SHALL carry the array

#### Scenario: No hints means platform default

- **WHEN** a `main` phase declares no `agent` field
- **THEN** skills dispatching sub-agents SHALL use the platform default agent type

### Requirement: atom-phase-handler SHALL inject agent hints into main-phase context

When a `main` phase's NodeDetail carries a non-empty `agent` array, the handler SHALL prepend a deterministic `## Agent hints: [<priority list>]` block to the assembled task context, positioned before the task text.

#### Scenario: Hint block injected before task

- **WHEN** a `main` phase with `agent: [reviewer, task]` is dispatched
- **THEN** the executed task context SHALL contain `## Agent hints: [reviewer, task]` preceding the task text
- **THEN** the block SHALL be byte-deterministic for the same input

#### Scenario: No hints — no block

- **WHEN** a `main` phase has no `agent` field
- **THEN** no `## Agent hints:` block SHALL be injected

### Requirement: Skills SHALL consume hints for sub-agent dispatch

A skill that dispatches sub-agents SHALL select the first agent type in the hints array that is available in the current platform environment, and SHALL fall back to the platform default when none are available.

#### Scenario: First available hint wins

- **WHEN** a skill dispatches sub-agents and hints are `[scout, task]`
- **THEN** the skill SHALL use `scout` when available
- **THEN** the skill SHALL use `task` when `scout` is unavailable

#### Scenario: Skill may decline dispatch

- **WHEN** a skill's flow does not require sub-agent isolation
- **THEN** it SHALL execute inline regardless of hints

#### Scenario: arch-review Explore dispatch follows hints

- **WHEN** the arch-review phase dispatches its Explore sub-agent with hints `[scout, task]`
- **THEN** the upstream skill's §1 Explore dispatch SHALL use `scout` when available
- **THEN** the skill SHALL use `task` when `scout` is unavailable

### Requirement: Registry SHALL NOT supply dispatch types

`AgentRegistryEntrySchema.agent` SHALL be removed; the registry maps type → handler skill only. Agent-type selection for sub-agent dispatch SHALL come exclusively from the phase `agent` hints array.

#### Scenario: Dispatch type comes from phase hints only

- **WHEN** a `main` phase dispatches sub-agents
- **THEN** the agent type SHALL be resolved from the phase `agent` hints (or platform default)
- **THEN** no registry entry SHALL contribute an agent type

### Requirement: Every sub-agent-dispatching graph node SHALL declare agent hints

The arch-review graph SHALL declare `agent: [scout, task]` on its arch-review phase — the phase executes via upstream improve-codebase-architecture, whose §1 Explore dispatch consumes the injected `## Agent hints` block (ADR 0058 F17); scout is the read-only explorer preference with platform-default fallback. Atom-pilot display rules SHALL cover only `main` and `approval` node types: no agent-node status template SHALL exist, and the status icon legend SHALL read "done" (not "agent done").

#### Scenario: arch-review node declares hints

- **WHEN** the arch-review graph is loaded
- **THEN** its arch-review phase SHALL declare `agent: [scout, task]`
- **THEN** arch-review-loop inherits the hints through flow composition

#### Scenario: Explore dispatch follows hints

- **WHEN** the arch-review phase dispatches its Explore sub-agent with hints `[scout, task]`
- **THEN** the executing skill SHALL use `scout` when available
- **THEN** the skill SHALL use `task` when `scout` is unavailable

#### Scenario: Pilot display has no agent residue

- **WHEN** atom-pilot renders node status lines
- **THEN** no `agent` node template SHALL exist in its display rules
- **THEN** the status icon legend SHALL describe `done`, never `agent done`

### Requirement: PhaseSchema SHALL remove phantom and dead fields

PhaseSchema SHALL NOT accept `topic`, `retry`, `with`, `def`, `maxDepth`, `context`, or `routing.context` — unknown or removed fields SHALL be rejected or stripped at parse (no silent declaration surface). The approval decision-card topic SHALL derive from the phase `task` field (fallback `Decision Required`); approval phases SHALL declare their card title via `task`, never a separate `topic` field. Flow phases SHALL reference a sub-graph via `use` only — inline `def` sub-graphs are removed.

#### Scenario: Approval card title comes from task

- **WHEN** an approval phase declares `task: 'Spec approval'`
- **THEN** the decision card header SHALL read `Spec approval`
- **AND** a `topic` declaration in YAML SHALL have no effect (field removed — graph authors never write it)

#### Scenario: Removed fields are rejected

- **WHEN** a graph declares `retry`, `with`, `def`, `maxDepth`, `topic`, or legacy `context`
- **THEN** validation SHALL fail with a clear error (or the field SHALL be stripped with no documented meaning)
- **AND** no removed field SHALL be silently accepted as a functional declaration

#### Scenario: Flow requires use

- **WHEN** a `flow` phase is declared
- **THEN** it SHALL declare `use` — `def` is not a valid alternative

### Requirement: Version defaults to 1, graphs omit it

The taskflow top-level `version` SHALL default to `1` when absent; built-in graphs SHALL NOT declare it.

#### Scenario: Omitted version loads as 1

- **WHEN** a graph omits `version`
- **THEN** it SHALL load with version 1

### Requirement: Type semantics guard SHALL live in schema only

Phase-type field semantics (approval SHALL NOT declare `channels`/`agent`; main SHALL NOT declare `preText`) SHALL be enforced exactly once, in PhaseSchema validation — the contract-validation layer SHALL NOT duplicate these checks.

#### Scenario: One enforcement point

- **WHEN** a graph violates a type-field rule (e.g. approval declares `channels`)
- **THEN** schema validation SHALL reject it at parse
- **AND** no second, unreachable copy of the check SHALL exist in the contract layer

### Requirement: Dispatch types SHALL be a closed enum with constant handler

Phase `type` SHALL be one of `main`, `approval`, `flow` (zod enum — unknown types fail at schema parse). The NodeDetail `handlerSkill` SHALL be the constant `atom-phase-handler` for `main` and `approval` phases — no agent-registry lookup. The agent-registry file, its merge logic, the PhaseHandlerRegistry service, and the DEFAULT_PHASE_HANDLERS array SHALL be removed; project config SHALL NOT accept an `agentRegistry` field.

#### Scenario: Unknown phase type fails at parse

- **WHEN** a graph declares `type: custom` or `type: agent`
- **THEN** schema validation SHALL fail with an error naming the invalid type

#### Scenario: handlerSkill is constant

- **WHEN** any main or approval phase is dispatched
- **THEN** its NodeDetail `handlerSkill` SHALL be `atom-phase-handler`
- **AND** no registry file or merge step SHALL be consulted

#### Scenario: No agentRegistry config surface

- **WHEN** project config (`config.json`) is validated
- **THEN** an `agentRegistry` field SHALL be rejected as unknown
- **AND** setup scaffolding SHALL not emit it

### Requirement: Dispatch documentation SHALL be single-sourced

The `## Agent hints` consumption semantics SHALL be documented in atom-kernel only; atom-phase-handler SHALL document only the injection mechanics and reference atom-kernel. The `## Context Requirements` three-subsection format SHALL be documented in atom-graph-spec only; atom-skill-spec SHALL reference it, not restate it. Language/reference constraints SHALL be documented once (atom-skill-spec); atom-doc-maintain SHALL reference (estate) and atom-doc-lifecycle SHALL reference (record metadata). Constraint-injection rules SHALL be documented in atom-graph-spec; atom-phase-handler SHALL reference.

#### Scenario: No duplicated contract docs

- **WHEN** a reviewer scans atom-doc-maintain and atom-doc-lifecycle
- **THEN** neither SHALL restate language/reference constraints — both SHALL reference atom-skill-spec

### Requirement: Agent hint arrays SHALL accept multi-platform spellings

A main-phase `agent` array SHALL be allowed to interleave platform-specific agent-type spellings (e.g. OMP `reviewer`/`task`/`scout` alongside opencode `explore`/`general`) in priority order. Selection SHALL pick the first entry available in the current platform environment — availability SHALL be judged as membership in the platform's agent vocabulary as defined in atom-kernel §Platform Spellings.

#### Scenario: Review array bilingualized

- **WHEN** a graph declares `agent: [reviewer, explore, task, general]` on a review phase
- **THEN** on the OMP platform the skill SHALL select `reviewer` (first available)
- **THEN** on the opencode platform the skill SHALL select `explore` (`reviewer` unavailable — first vocabulary member)

#### Scenario: Explore array bilingualized

- **WHEN** a graph declares `agent: [explore, scout, task, general]` on an explore phase
- **THEN** on the OMP platform the skill SHALL select `scout` (`explore` absent from OMP vocabulary)
- **THEN** on the opencode platform the skill SHALL select `explore` (codebase-exploration semantics — `scout` on opencode means external-docs research and must not be selected for this role)

#### Scenario: Implement array bilingualized

- **WHEN** a graph declares `agent: [task, general]` on an implementation phase
- **THEN** on the OMP platform the skill SHALL select `task`
- **THEN** on the opencode platform the skill SHALL select `general`

### Requirement: Built-in graphs SHALL declare bilingual hint arrays

The built-in graphs SHALL declare the bilingualized arrays: the 4 code-review phases (`[reviewer, explore, task, general]`) and the arch-review explore phase (`[explore, scout, task, general]`).

#### Scenario: Review graphs carry opencode fallbacks

- **WHEN** any of doc-update, openspec-apply, openspec-engineer, graph-workflow review phases is loaded
- **THEN** its `agent` array SHALL be `[reviewer, explore, task, general]`

#### Scenario: arch-review carries explore-first fallback

- **WHEN** the arch-review graph is loaded
- **THEN** its arch-review phase SHALL declare `agent: [explore, scout, task, general]`

### Requirement: agent phase type SHALL be removed from dispatch

The system SHALL NOT register, dispatch, or document an `agent` phase type. PhaseHandlerRegistry SHALL contain only `main` and `approval` handlers. Graph loading SHALL reject any phase declaring `type: agent` with a clear error naming the type and the registered type list.

#### Scenario: Agent-typed phase fails at load

- **WHEN** a graph declares a phase with `type: agent`
- **THEN** graph loading SHALL fail with a GraphDefinitionError
- **THEN** the error message SHALL include the phase type `agent` and the registered types (`main`, `approval`)

#### Scenario: DEFAULT_PHASE_HANDLERS excludes agent

- **WHEN** the runtime registers default phase handlers
- **THEN** `DEFAULT_PHASE_HANDLERS` SHALL contain exactly `mainPhaseHandler` and `approvalPhaseHandler`
- **THEN** `agentPhaseHandler` module SHALL NOT exist in the source tree

### Requirement: NodeDetail SHALL drop agent-specific fields

`INodeDetail` SHALL NOT contain `entrySkill`, `agent`, or `agentName` fields. The phase `skill` field SHALL pass through directly as the execution-skill reference for `main` phases. `buildNodeDetail` SHALL construct base fields without any agent-type branching.

#### Scenario: Main phase NodeDetail carries skill directly

- **WHEN** a `main` phase declares `skill: atom-arch-review`
- **THEN** the returned NodeDetail SHALL expose that skill value in a single skill field
- **THEN** no `entrySkill`/`agent`/`agentName` fields SHALL be present

#### Scenario: Schema rejects agent-specific field combos

- **WHEN** a phase declares `type: agent` with any field set
- **THEN** PhaseSchema validation SHALL reject it (type not in registered set)

### Requirement: Agent-specific checks SHALL be removed from contract validation

`contracts.ts` SHALL NOT contain agent-only checks (agent-skill-required, agent-preText-forbidden). Channel validation SHALL treat `main` as the only channel-bearing phase type alongside unchanged approval rules.

#### Scenario: Contract validation passes without agent branches

- **WHEN** `validateGraphContracts` runs on a main/approval-only graph
- **THEN** no agent-related violations SHALL be reported
- **THEN** the validation code SHALL contain no `type === 'agent'` branches

### Requirement: agent registry entry type SHALL be removed

`AgentRegistryEntrySchema` SHALL NOT define an `agent` sub-agent-type field. The agent registry SHALL map phase types to handler skills only.

#### Scenario: Registry entries carry type + skill only

- **WHEN** the built-in agent-registry.json is loaded
- **THEN** every entry SHALL have exactly `type` and `skill` fields
- **THEN** `agent-registry.json` SHALL contain `main` and `approval` entries only

### Requirement: Test fixtures SHALL be migrated from agent type

All test fixtures, unit tests, and integration tests SHALL use `main` phases instead of `agent` phases. `contract-doc-guard.test.ts` SHALL assert the post-removal field set (no entrySkill/agent/agentName).

#### Scenario: Full test suite passes post-removal

- **WHEN** the test suite runs after agent-type removal
- **THEN** no test SHALL reference `type: 'agent'` in phase fixtures
- **THEN** contract-doc-guard SHALL validate the field set without entrySkill/agent/agentName

### Requirement: Approval Decision Persistence

The decision record SHALL be retained in-session (action + value + label + note); option sources = Accept (AI recommendation) / free input / AI dynamic options (retry/jump/end/branch). Routing SHALL be carried through `graph_advance` `branchTo`/`endRun` — no decision file and no scheduler decision store exists. Downstream gates read the decision from the agent session (the judging agent executed the decision node earlier in the run).

#### Scenario: Decision file written on approval completion

- **WHEN** an approval completes (AI recommendation auto-executed in auto mode, or human choice in manual mode)
- **THEN** the pilot SHALL route via `branchTo`/`endRun` per the decision
- **AND** the decision SHALL be kept in the conversation — no scheduler persistence, no file
- **AND** the decision SHALL carry the routing action (continue/retry/jump/end), the target (retry/jump/branch-route), and the free-text note (if any)

#### Scenario: Chosen label recorded

- **WHEN** a user picks from multiple options (or auto mode executes the AI recommendation)
- **THEN** the session record SHALL note the chosen option's label and value
- **AND** downstream SHALL distinguish the chosen option from the session record alone

#### Scenario: Accept decision

- **WHEN** the user (manual) or auto mode accepts the AI recommendation
- **THEN** the decision carries the recommended action's value + label; note records free text or 'run mode: auto' — kept in the session

#### Scenario: Free input

- **WHEN** the user provides natural-language input instead of picking an option
- **THEN** the input becomes the decision note; no fabricated option is recorded

### Requirement: When-Guard Evaluation on Persisted Upstream Output

The evaluation context of a when guard (ADR 0038 D1) SHALL include the reports of its dependsOn upstream nodes — guard conditions reference upstream decisions/reports, which the judging agent holds in its own session (it executed the upstream nodes).

#### Scenario: Guard reads upstream decision file

- **WHEN** a node with a when condition has completed dependsOn upstream nodes
- **THEN** the guard evaluation context SHALL include the upstream reports from the agent session
- **AND** the evaluation SHALL determine true/false from that content, not merely from node status snapshots

#### Scenario: Deterministic gate verdict on persisted upstream output

- **WHEN** the arch-review-loop loop-gate evaluates and the requirement/arch-review report shows `top_rec_remaining: false` (or the requirement/scope-entry retryCount reaches its bound)
- **THEN** the when condition SHALL evaluate to false based on the requirement/arch-review report — no rework jump is triggered and the node passes through
- **AND** on ambiguous or failed evaluation, the ADR 0038 conservative-execution fallback semantics SHALL be maintained (the verdict basis is not silently changed)

### Requirement: Approval SHALL default to Accept + free input

Except for branch-route scenarios, an approval does not need the graph to declare options — Accept and free input SHALL be built-in system behavior.

#### Scenario: No declared options

- **WHEN** an approval declares no routing actions
- **THEN** the card presents Accept (the AI recommendation) + free-input box + AI-generated contextual options; auto mode executes the recommendation

#### Scenario: Declared branch-route options

- **WHEN** an approval declares branch-route options with target (the only scenario: minimal/detailed track selection)
- **THEN** options render as selectable choices with the AI-recommended one marked; choosing one activates its target route

### Requirement: Handler resolution SHALL be constant

Phase-type handler resolution SHALL NOT consult project config or a builtin registry file. `handlerSkill` for `main`/`approval` SHALL be the constant `atom-phase-handler`.

#### Scenario: Dispatch never reads a registry

- **WHEN** a main or approval phase is dispatched
- **THEN** `handlerSkill` SHALL be `atom-phase-handler` without config lookup or registry read

### Requirement: End action SHALL be an approval routing action

End SHALL be an action, not a node (case 4 — not loop-specific).

#### Scenario: End as recommendation

- **WHEN** the AI recommendation for an approval is the `end` action (e.g. no Top Rec remains)
- **THEN** auto mode ends the run automatically; manual mode shows the card with the end option

#### Scenario: Human end

- **WHEN** a user selects the `end` action in manual mode
- **THEN** the run completes; the decision is persisted with its value

### Requirement: Handler persists run-scoped outputs + forwards references to sub-agents

The phase handler SHALL assemble upstream context from the agent session (no advance output, no scheduler content). When a main phase dispatches sub-agents, the handler SHALL forward the injected `## Reference:` blocks into each sub-agent's context — reference skills resolved once at the phase level, never self-discovered by sub-agents.

#### Scenario: Decisions persist in run directory

- **WHEN** an approval or gate decision is produced
- **THEN** the decision SHALL be kept in the conversation and routed via `branchTo`/`endRun` (no file path, no scheduler store)

#### Scenario: Sub-agents inherit reference blocks

- **WHEN** a main phase dispatches sub-agents
- **THEN** each sub-agent's context SHALL include the parent's reference blocks — no self-discovery of spec skills

### Requirement: NodeDetail construction SHALL accept a single object input

`buildNodeDetail` and `buildNextNode` SHALL accept all inputs as a single object parameter (all fields required, no optional positional parameters); field names carry the semantics.

#### Scenario: Construction calls pass an object, not positional parameters

- **WHEN** the scheduler constructs the next dispatchable node
- **THEN** the call takes a single object parameter, with all input fields required and type-consistent

### Requirement: RunMode type SHALL be defined at a single point

The `'manual' | 'auto'` value set SHALL be defined by a single authoritative point: the built-in `$run-mode-confirm` default task text (`DEFAULT_CONFIRM_TASK` — single source in the scheduler, agent-side text contract). `graph_runs` has no mode column, NodeDetail has no `runMode` field, and the scheduler has no `RunMode` TS type (the mode is no longer passed through the backend; the value set exists only in the node-output JSON contract) — no inline duplication in backend code.

#### Scenario: runMode value type is uniform across the chain

- **WHEN** the confirm node output contract is confirmed or parsed on the consumer side
- **THEN** the value set comes from the `DEFAULT_CONFIRM_TASK` text — the scheduler has no duplicated literal type (no backend mode column, no NodeDetail field, no RunMode TS type)

#### Scenario: NodeDetail has no mode field

- **WHEN** any node dispatches
- **THEN** NodeDetail SHALL NOT carry `runMode`/`constraints` fields — the consumer side reads the phase output file

### Requirement: args empty semantics SHALL be unified to null

The default semantics of args on the construction chain SHALL be unified to `null` (same shape as the persistence-layer record); absent caller arguments are normalized once at the boundary, with no null→undefined conversions inside the chain.

#### Scenario: Advance construction for a no-args run

- **WHEN** a run created without args performs an advance
- **THEN** the construction chain passes args as null throughout, with no `?? undefined` shim; `{args.X}` interpolation does not trigger (the confirm node task text keeps the literal = unset)

### Requirement: Input type SHALL reside in the canonical types module

The NodeDetail construction input contract (object parameter type) SHALL be declared in the canonical DTO module (`types.ts`) — same source as RunMode/GraphRun; implementation modules only import-reference it and do not declare it locally.

#### Scenario: Declaration location of construction input types

- **WHEN** the declaration location of the NodeDetail construction input type is checked
- **THEN** the declaration lives in types.ts; implementation files (api layer) reference it with `import type`, with no local duplicate declaration

#### Scenario: Zero behavior change

- **WHEN** construction executes after the declaration location is migrated
- **THEN** the construction signature, output contract, and runtime behavior remain identical to before the migration (except for removed fields)

### Requirement: NodeDetail Field Name retryCount

The NodeDetail base field for the node's re-execution counter SHALL be named `retryCount` (per CONTEXT.md glossary + ADR 0046; `retryAttempt` is deprecated/removed wording). Runtime NodeDetail construction and the snapshot adapter SHALL use `retryCount`; documentation SHALL match (NODE-SCHEMA.md, atom-graph-spec PHASESCHEMA.md / SKILL.md).

#### Scenario: Runtime field renamed

- **WHEN** reading packages/graph-scheduler/src/phase-handler/types.ts NodeDetail and snapshot.ts adapter
- **THEN** the field is `retryCount` (no `retryAttempt` remains)

#### Scenario: Docs agree

- **WHEN** scanning NODE-SCHEMA.md §Base Fields and atom-graph-spec for the field
- **THEN** every site names `retryCount` (snapshot `retryCount` remains the gate-bound counter)
