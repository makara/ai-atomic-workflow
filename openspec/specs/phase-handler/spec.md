# phase-handler Specification

## Purpose

Single main handler plus decision persistence. Asset: `packages/graph-scheduler/src/phase-handler/` (6 files).

## Requirements

### Requirement: PhaseHandler interface

MODIFIED: dispatch is a single path: every dispatched node runs the main handler (task execution + decision card when the node's `NodeDetail.completion` declares options). Confirmation cards SHALL be rendered from the machine-declared `completion` block (default / choices / rework / direct_end) — task-text branch parsing SHALL be removed from the dispatch path. The `routingActions` extension is deleted (0 graph usages at migration) — no routingActions option delivery exists. Unknown phase types SHALL fail at schema parse — never a silent default handler.

#### Scenario: Handler normalizes phase config

- **WHEN** a phase loads with missing optional fields
- **THEN** defaults SHALL be applied by the schema — handlers SHALL NOT duplicate default logic

#### Scenario: Handler extends base node detail

- **WHEN** `extendNodeDetail()` runs with base fields
- **THEN** the returned `NodeDetail` SHALL contain all base fields + the main extensions (task/channels/agent/completion) — no routingActions, no route fields, no topic

#### Scenario: Handler processes agent result

- **WHEN** a main node produces a decision output
- **THEN** the decision SHALL carry the target (rework/branch decision) with optional note — routed via branchTo

#### Scenario: Handler resolved statically by type

- **WHEN** a phase has `type: "main"` — the main handler runs
- **THEN** any other type value SHALL fail at schema parse — the single main path never falls back silently

### Requirement: Context field semantics — uniform channels

Context mechanics are unified: `channels` spans all phases with every entry kind (skill:/glob/node:) legal; composing phases SHALL NOT declare `channels` (ambient context lives at the graph's top-level `context:`, cross-level data reads on the consuming phase via `channels: [node:<id>]`). `preText`/`reads` are removed — rework-condition context = direct dependsOn output (auto-injected) + channels node: entries. Residual preText/reads declarations SHALL be loudly rejected by the schema with a migration hint. NodeDetail exposes channels for all phases.

#### Scenario: Phase declares channels

- **WHEN** a phase declares `channels: ["node:review", "skill:atom-graph-spec"]`
- **THEN** the NodeDetail SHALL carry the `channels` array
- **THEN** the handler SHALL resolve each entry per the skill contract

#### Scenario: Flow phase declares channels

- **WHEN** a composing phase declares `channels`
- **THEN** schema validation SHALL reject it with a migration hint pointing at the graph-level `context:` field

#### Scenario: Phase context field silently stripped

- **WHEN** a phase declares a `context` field
- **THEN** the field is not in the schema surface and SHALL be silently stripped

### Requirement: Main handler — direct execution

The main handler SHALL provide a pass-through execution path for phases that require no sub-agent dispatch or decision UI.

#### Scenario: Main handler returns node detail directly

- **WHEN** a phase has `type: "main"`
- **THEN** the handler SHALL return a `NodeDetail` with the phase's task and agent fields
- **THEN** no sub-agent routing or decision UI SHALL be assembled

### Requirement: Error handling

Phase handlers SHALL surface configuration and routing errors through typed error objects, never through thrown exceptions in the dispatch path.

#### Scenario: Missing required field produces typed error

- **WHEN** a dispatched phase is missing a required configuration field
- **THEN** a typed error SHALL be returned indicating the missing configuration
- **THEN** the error SHALL include the phase id and the specific missing field

#### Scenario: Invalid routing produces typed error

- **WHEN** a decision output carries an invalid target
- **THEN** a typed error SHALL be returned with the invalid target and valid options

### Requirement: Entry skill upstream contract alignment

Graph phases SHALL only dispatch entry skills whose declared `## Context Requirements` upstream set matches the upstream nodes the graph actually injects. An entry skill with zero graph phases dispatching it SHALL be flagged as orphaned.

#### Scenario: Dispatch upstream matches declared contract

- **WHEN** a graph phase dispatches an entry skill
- **THEN** every upstream node the entry skill declares in `## Context Requirements` SHALL be present in the graph's injected upstreams
- **THEN** an upstream mismatch SHALL fail validation with the conflicting names

#### Scenario: Orphan entry skill detection

- **WHEN** an entry skill declares graph dispatch (e.g. "Use as graph phase …") but no graph phase references it
- **THEN** validation SHALL report the skill as orphaned

### Requirement: NodeDetail carries dependsOn

The `INodeDetail` contract SHALL include `dependsOn?: string[]`, populated by `buildNodeDetail` from the phase's `dependsOn` declaration. The field SHALL be present for all phases so implicit upstream coverage is verifiable at runtime.

#### Scenario: Agent NodeDetail carries dependsOn

- **WHEN** `buildNodeDetail` constructs the NodeDetail for a phase with `dependsOn: ["writer"]`
- **THEN** the NodeDetail SHALL include `dependsOn: ["writer"]`

#### Scenario: Main NodeDetail carries dependsOn

- **WHEN** `buildNodeDetail` constructs the NodeDetail for a main phase with declared dependencies
- **THEN** the NodeDetail SHALL include the same `dependsOn` values as the phase
- **THEN** implicit-upstream resolution SHALL use this field — no doc/code drift between the skill contract and the DTO

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

The arch-review graph SHALL declare `agent: [scout, task]` on its arch-review phase — the phase executes via upstream improve-codebase-architecture, whose §1 Explore dispatch consumes the injected `## Agent hints` block (ADR 0058 F17); scout is the read-only explorer preference with platform-default fallback. Atom-pilot display rules SHALL cover the `main` node type only: no agent-node status template SHALL exist, and the status icon legend SHALL read "done" (not "agent done").

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

PhaseSchema SHALL NOT accept `topic`, `retry`, `with`, `def`, `maxDepth`, `context`, `routing.context`, `routing.actions`, `route`, or `join` — removed fields SHALL be rejected at parse (no silent declaration surface). The decision-card topic SHALL derive from the phase `task` field (fallback `Decision Required`); main confirmation nodes SHALL declare their card title via `task`, never a separate `topic` field. Composing phases SHALL reference a sub-graph via `use` only — inline `def` sub-graphs are removed.

#### Scenario: Card title comes from task

- **WHEN** a main confirmation node declares `task: 'Spec approval'`
- **THEN** the decision card header SHALL read `Spec approval`
- **AND** a `topic` declaration in YAML SHALL have no effect (field removed — graph authors never write it)

#### Scenario: Removed fields are rejected

- **WHEN** a graph declares `retry`, `with`, `def`, `maxDepth`, `topic`, `routing.actions`, `route`, `join`, or legacy `context`
- **THEN** validation SHALL fail with a clear error (or the field SHALL be stripped with no documented meaning)
- **AND** no removed field SHALL be silently accepted as a functional declaration

#### Scenario: Flow requires use

- **WHEN** a phase composes a subgraph
- **THEN** it SHALL declare `use` — `def` is not a valid alternative

### Requirement: Version SHALL follow the graph-format version policy

The graph top-level `version` SHALL follow the graph-format version policy: optional; when present it SHALL be semver; a major-version mismatch SHALL fail load loudly. An absent `version` SHALL NOT default to `1` — the engine SHALL NOT fabricate an implicit format version — and graphs MAY declare the current format version.

#### Scenario: Omitted version loads without implicit default

- **WHEN** a graph omits `version`
- **THEN** it SHALL load with no implicit format version assigned (no default, no rejection)

#### Scenario: Declared version validated per format policy

- **WHEN** a graph declares `version`
- **THEN** it SHALL be semver, and a major mismatch against the engine's supported format version SHALL fail load loudly (never silent degradation)

### Requirement: Dispatch types SHALL be a closed enum with constant handler

Phase `type` SHALL be `main` only (zod enum — unknown types fail at schema parse). The `flow` type is deleted — subgraph composition is expressed via `use` phases (no flow-typed phase exists to dispatch). The NodeDetail `handlerSkill` SHALL be the constant `atom-phase-handler` — no agent-registry lookup. The agent-registry file, its merge logic, the PhaseHandlerRegistry service, and the DEFAULT_PHASE_HANDLERS array SHALL be removed; project config SHALL NOT accept an `agentRegistry` field.

#### Scenario: Unknown phase type fails at parse

- **WHEN** a graph declares `type: custom`, `type: agent`, or `type: flow`
- **THEN** schema validation SHALL fail with an error naming the invalid type

#### Scenario: handlerSkill is constant

- **WHEN** any main phase is dispatched
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

The system SHALL NOT register, dispatch, or document an `agent` phase type. PhaseHandlerRegistry SHALL contain only the `main` handler. Graph loading SHALL reject any phase declaring `type: agent` with a clear error naming the type and the registered type list.

#### Scenario: Agent-typed phase fails at load

- **WHEN** a graph declares a phase with `type: agent`
- **THEN** graph loading SHALL fail with a GraphDefinitionError
- **THEN** the error message SHALL include the phase type `agent` and the registered types (`main`)

#### Scenario: DEFAULT_PHASE_HANDLERS excludes agent

- **WHEN** the runtime registers default phase handlers
- **THEN** `DEFAULT_PHASE_HANDLERS` SHALL contain exactly `mainPhaseHandler`
- **THEN** `agentPhaseHandler` and `approvalPhaseHandler` modules SHALL NOT exist in the source tree

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

- **WHEN** `validateGraphContracts` runs on a main-only graph
- **THEN** no agent-related violations SHALL be reported
- **THEN** the validation code SHALL contain no `type === 'agent'` branches

### Requirement: agent registry entry type SHALL be removed

`AgentRegistryEntrySchema` SHALL NOT define an `agent` sub-agent-type field. The agent registry SHALL map phase types to handler skills only.

#### Scenario: Registry entries carry type + skill only

- **WHEN** the built-in agent-registry.json is loaded
- **THEN** every entry SHALL have exactly `type` and `skill` fields
- **THEN** `agent-registry.json` SHALL contain the `main` entry only

### Requirement: Test fixtures SHALL be migrated from agent type

All test fixtures, unit tests, and integration tests SHALL use `main` phases instead of `agent` phases. `contract-doc-guard.test.ts` SHALL assert the post-removal field set (no entrySkill/agent/agentName).

#### Scenario: Full test suite passes post-removal

- **WHEN** the test suite runs after agent-type removal
- **THEN** no test SHALL reference `type: 'agent'` in phase fixtures
- **THEN** contract-doc-guard SHALL validate the field set without entrySkill/agent/agentName

### Requirement: Handler resolution SHALL be constant

Phase-type handler resolution SHALL NOT consult project config or a builtin registry file. `handlerSkill` for `main` SHALL be the constant `atom-phase-handler`; no other phase type exists to resolve.

#### Scenario: Dispatch never reads a registry

- **WHEN** a main phase is dispatched
- **THEN** `handlerSkill` SHALL be `atom-phase-handler` without config lookup or registry read

### Requirement: Handler persists run-scoped outputs + forwards references to sub-agents

The phase handler SHALL assemble upstream context from the agent session (no advance output, no scheduler content). When a main phase dispatches sub-agents, the handler SHALL forward the injected `## Reference:` blocks into each sub-agent's context — reference skills resolved once at the phase level, never self-discovered by sub-agents.

#### Scenario: Decisions persist in run directory

- **WHEN** a main node produces a decision (routing or rework)
- **THEN** the decision SHALL be kept in the conversation and routed via `branchTo` (no file path, no scheduler store)

#### Scenario: Sub-agents inherit reference blocks

- **WHEN** a main phase dispatches sub-agents
- **THEN** each sub-agent's context SHALL include the parent's reference blocks — no self-discovery of spec skills

### Requirement: NodeDetail construction SHALL accept a single object input

`buildNodeDetail` and `buildNextNode` SHALL accept all inputs as a single object parameter (all fields required, no optional positional parameters); field names carry the semantics.

#### Scenario: Construction calls pass an object, not positional parameters

- **WHEN** the scheduler constructs the next dispatchable node
- **THEN** the call takes a single object parameter, with all input fields required and type-consistent

### Requirement: args empty semantics SHALL be unified to null

The default semantics of args on the construction chain SHALL be unified to `null` (same shape as the persistence-layer record); absent caller arguments are normalized once at the boundary, with no null→undefined conversions inside the chain.

#### Scenario: Advance construction for a no-args run

- **WHEN** a run created without args performs an advance
- **THEN** the construction chain passes args as null throughout, with no `?? undefined` shim; `{args.X}` interpolation does not trigger (the confirm node task text keeps the literal = unset)

### Requirement: Input type SHALL reside in the canonical types module

The NodeDetail construction input contract (object parameter type) SHALL be declared in the canonical DTO module (`types.ts`) — implementation modules only import-reference it and do not declare it locally. The `RunMode`/`GraphRun` type references are deleted (run mode removed, ADR 0215).

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

### Requirement: NodeDetail SHALL carry node type

NodeDetail SHALL carry the node's `type` (always `main`) so consumer-side dispatch (atom-phase-handler) and display (atom-pilot) retain their type-agnostic behavior without engine-side type dispatch.

#### Scenario: Dispatch is type-agnostic

- **WHEN** a node is dispatched
- **THEN** the payload carries type `main` and the handler executes the single main path — no type-based handler selection occurs

### Requirement: NodeDetail SHALL carry completion

The `NodeDetail` dispatch payload SHALL carry a `completion` block — `{ default, choices[], rework, direct_end }` — derived at compile time from the graph's branch targets (`branchTargets`) and the task text's explicit `direct end:` declarations. A node with no declared branch/rework/direct-end options SHALL carry a plain `default` completion. Consumers SHALL route decisions from this block, never from task-text parsing.

#### Scenario: branch node delivers machine-declared choices

- **WHEN** a main node's task text declares branch choices via backtick branch targets
- **THEN** the dispatched NodeDetail SHALL carry `completion.choices` listing the target options, and the consumer SHALL NOT parse the task text to discover them

#### Scenario: direct-end node delivers the label

- **WHEN** a main confirmation node's task text declares `direct end: <label>`
- **THEN** the dispatched NodeDetail SHALL carry `completion.direct_end` with the declared label

#### Scenario: plain node carries default completion

- **WHEN** a main node declares no branch/rework/direct-end options
- **THEN** the dispatched NodeDetail SHALL carry `completion.default` and no choices/rework/direct_end

### Requirement: NodeDetail SHALL NOT carry topic

The NodeDetail dispatch payload SHALL NOT include a `topic` field — card titles derive from the task text first line; the adapter SHALL NOT compute or attach a topic value per dispatch.

#### Scenario: NodeDetail omits topic

- **WHEN** a NodeDetail is built for any node
- **THEN** the payload SHALL contain no `topic` field

### Requirement: Router template nodes SHALL auto-select or present recommendation cards

The handler SHALL recognize router template nodes (`template: router` — machine-declared via the NodeDetail) and apply selection semantics distinct from generic confirmation cards: (1) the executing agent SHALL evaluate the router task text's hard criterion and the candidate count — exactly one candidate or a satisfied hard criterion SHALL complete the node WITHOUT presenting an approval card (self-decide); (2) multiple candidates with no satisfied criterion SHALL present an approval card whose options are the candidate graphs, with the agent's recommended option marked; (3) the chosen path SHALL NOT be routed through `branchTo` — the agent starts the graph as a sibling run (`graph_start`) and the node completes with the result report. Options SHALL come from the machine-declared `template_args.paths` — never parsed from task text.

#### Scenario: Unique candidate no card

- **WHEN** a router node dispatches with a single candidate path
- **THEN** the handler SHALL complete the node without a card, the agent starting the graph

#### Scenario: Hard criterion no card

- **WHEN** a router node dispatches and its task-text criterion is satisfied by the node context
- **THEN** the handler SHALL complete the node without a card

#### Scenario: Ambiguity presents candidate card

- **WHEN** a router node dispatches with multiple candidates and no satisfied criterion
- **THEN** the handler SHALL present an approval card with the candidate graphs as options and the recommended one marked

#### Scenario: Options from template_args only

- **WHEN** the router selection card is presented
- **THEN** its options SHALL be the `template_args.paths` entries — task-text parsing SHALL never supply options
