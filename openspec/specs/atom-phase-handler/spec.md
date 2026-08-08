# atom-phase-handler Specification

## Purpose

Central dispatch — single-node routing for main/approval/gate. Asset: `packages/graph-workflow/skills/atom-phase-handler/SKILL.md`.

## Requirements

### Requirement: Skill references SHALL use plain names

Every reference to a skill in repo content (skill bodies, graph task text, channels, documentation) SHALL use the plain skill name (`atom-kernel`), never the `skill://` URI form.

#### Scenario: skill:// URI absent from repo content

- **WHEN** repo content is scanned for the literal `skill://` prefix
- **THEN** no occurrence SHALL exist in repo-owned files (packages/, graphs/, skills/, docs/)

#### Scenario: Reference channel uses plain name

- **WHEN** a graph declares a reference channel `skill:atom-graph-spec`
- **THEN** the channel SHALL be resolved by name to the skill's SKILL.md

### Requirement: Resolution rule SHALL be single-sourced in atom-skill-spec

atom-skill-spec §Reference Constraints SHALL define the resolution rule: `<name>` → `<skillsDir>/<name>/SKILL.md`, with skillsDir candidates in order: config `skillsDir` → `packages/graph-workflow/skills` → `~/.agents/skills` (mirroring scheduler `resolveSkillsDir`). Sibling files resolve as `<name>/<path>` relative to the skill's SKILL.md.

#### Scenario: Name resolves via deterministic directory lookup

- **WHEN** an agent must load skill `atom-kernel`
- **THEN** the agent SHALL locate `<skillsDir>/atom-kernel/SKILL.md` by the declared candidate order
- **AND** the lookup SHALL require only file tools — no platform URI resolver

### Requirement: Loading instruction SHALL be plain-name

Skill bodies and graph task text SHALL instruct loading as `load skill <name>` — never `load skill://<name>`.

#### Scenario: Runtime constraints use plain names

- **WHEN** a SKILL.md declares a runtime dependency
- **THEN** it SHALL read `load skill <name>` (or channel-injected wording), with no URI form

### Requirement: Deployment mirrors SHALL NOT hold retired skill copies

The global deployment candidate `~/.agents/skills` SHALL NOT contain copies of skills retired from the repo (atom-tool-detection, atom-arch-review, atom-arch-decision, atom-dual-review, misc-platform-api, atom-dispatch, atom-question, atom-docs-writer, atom-sync-docs, docs-categories, docs-guide, docs-maintain). The `~/.claude/skills` mirror SHALL match the same retirement set. Name resolution against the third candidate SHALL therefore never land on a stale retired copy.

#### Scenario: Retired skill absent from deployment candidates

- **WHEN** the resolver checks `~/.agents/skills` for a retired skill name
- **THEN** no SKILL.md SHALL be found for retired skill names
- **AND** resolution SHALL continue or fail per the declared candidate order

#### Scenario: Current skill mirrors remain

- **WHEN** the resolver checks `~/.agents/skills` for an active skill (e.g. atom-kernel, writing-great-skills)
- **THEN** the deployed copy SHALL remain available and resolvable

### Requirement: atom-phase-handler — central dispatch handler

`atom-phase-handler` SHALL be the single entry point for processing `NextNode` objects. It SHALL route by `node.type` to the appropriate handler (main, approval, or gate) and return the execution result. The approval handler SHALL assemble card content + the AI-judged recommendation and delegate the mode decision to `approval()` (assemble → approval() → IApprovalDecision → persist → route) — the mode branch lives in the kernel contract, not handler documents.

#### Scenario: Handler routes by node type

- **WHEN** `atom-phase-handler` receives `NextNode { type: "main", ... }`
- **THEN** it SHALL execute the main handler inline (with inline context assembly when channels present)
- **WHEN** `NextNode { type: "approval", ... }`
- **THEN** it SHALL assemble card content + recommendation and delegate the mode decision to `approval()` (auto + recommendation → executes; manual/absent/no recommendation → card), map to IApprovalDecision, persist, and route
- **WHEN** `NextNode { type: "gate", ... }`
- **THEN** it SHALL evaluate rework jumps against the judgment context — no approval(), no pause

#### Scenario: Handler assembles runtime context

- **WHEN** dispatching any node type
- **THEN** the handler SHALL assemble context including: `runId`, `graphName`, `nodeId`, `snapshot?` (from `graph_status` for resume scenarios)
- **THEN** context SHALL be injected into the sub-agent prompt or decision UI

#### Scenario: Handler returns structured result

- **WHEN** execution completes (main, approval, or gate)
- **THEN** the result SHALL include `nodeId` and `durationMs` — enough for `graph_advance` reporting
- **THEN** approval decisions SHALL carry the selected action and optional note

### Requirement: Input-stage consumption

atom-phase-handler SHALL read activation inputs from input-node outputs: `## Run Mode:` block from the run-mode input node output (absence → manual + warning, never auto), `## Constraints` block from the constraints input node output (absence → empty + warning). Consumption shape SHALL be unchanged from the prologue-output reads — only the source naming follows the injected defaults.

#### Scenario: Mode read from input node

- **WHEN** an approval or gate node dispatches
- **THEN** the handler SHALL read the run-mode input node output file and inject the `## Run Mode:` block; missing output degrades to manual + warning

#### Scenario: Constraints read from input node

- **WHEN** any node dispatches
- **THEN** the handler SHALL read the constraints input node output file and inject the `## Constraints` block; missing output degrades to empty + warning

### Requirement: Handler SHALL enforce the todo node-boundary lifecycle

atom-phase-handler SHALL clear the platform todo list at every node boundary: dispatch (before task execution) and completion (after the output write, before returning to the pilot). The clear SHALL be unconditional on success/failure and SHALL apply uniformly to main, approval, gate, and activation prologue nodes. The clear SHALL go through the kernel `todo()` primitive's clear semantics — never a platform-specific spelling in the handler body.

#### Scenario: Dispatch clears the scratchpad

- **WHEN** the handler begins executing any node type
- **THEN** it SHALL invoke the `todo()` clear semantics before the node's task runs

#### Scenario: Completion clears before advance

- **WHEN** the handler finishes a node — done or failed
- **THEN** it SHALL invoke the `todo()` clear semantics after the output file write and before the pilot's `graph_advance` call

#### Scenario: Handler uses the kernel primitive

- **WHEN** the handler's todo lifecycle step executes
- **THEN** it SHALL reference the `todo()` contract from atom-kernel §Platform Spellings
- **AND** no platform tool name (e.g. `todo rm` spelled directly) SHALL appear in the handler body

### Requirement: Handler SHALL enforce the Tool usage check self-report

atom-phase-handler SHALL end every main node output with a `Tool usage check:` section — one line per Tool Usage Matrix rule (atom-mcp-contract §Tool Usage Matrix): `used: <tool> — <evidence>` / `n/a: <reason>` / `violated: <rule> — <evidence>`. Any `violated` line SHALL prefix the node output with `[TOOL USAGE VIOLATION: <count>]`, and approval pre-call SHALL scan dependsOn outputs for the marker and append `[TOOL USAGE VIOLATION: <nodeId> × N]` (same aggregation pipeline as constraint violations).

#### Scenario: Self-report closes main nodes

- **WHEN** a main node finishes execution
- **THEN** the output SHALL include the `Tool usage check:` section with per-rule lines

#### Scenario: Violations prefix and aggregate

- **WHEN** any matrix rule is violated
- **THEN** the output SHALL carry `[TOOL USAGE VIOLATION: <count>]`
- **AND** approval pre-call SHALL surface the marker per dependsOn node

### Requirement: Registry entries inject per declared classes

On main-node dispatch, the handler SHALL inject the HLT registry entries for the node's declared operation classes — the union of the phase `operations:` declaration and the dispatched skill's `Operation classes` subsection (phase declaration overrides/complements the skill default). Injection SHALL ride the existing reference-block pipeline (deterministic, no fallback search). Nodes declaring no classes SHALL receive no registry injection.

#### Scenario: Phase declares locate and edit

- **WHEN** a phase declares `operations: [locate, edit]` and the skill declares a default set
- **THEN** the dispatch SHALL inject the registry entries for the merged class set
- **AND** the entries SHALL arrive as context blocks before the task text

#### Scenario: No declaration, no injection

- **WHEN** neither the phase nor the skill declares operation classes
- **THEN** no registry entries SHALL be injected
- **AND** no warning SHALL be emitted

### Requirement: Class-based Tool usage verification

The handler SHALL perform the Tool usage check by declared class: scan the node output for chain-head tool-call evidence per declared class, or an n/a reason; missing evidence SHALL auto-prefix `[TOOL USAGE VIOLATION: <count>]`. A missing `Tool usage check:` block SHALL count as violations for all declared classes. The marker pipeline (approval pre-call scan + pilot stats aggregation) SHALL consume the auto-generated markers unchanged.

#### Scenario: Violation marker auto-generated

- **WHEN** a node declared `locate` and its output shows no locate-chain evidence
- **THEN** the handler SHALL prefix `[TOOL USAGE VIOLATION: 1]` to the persisted output
- **AND** the approval pre-call SHALL surface `[TOOL USAGE VIOLATION: <nodeId> × 1]`

#### Scenario: Check block absent counts all classes

- **WHEN** a node output has no `Tool usage check:` block
- **THEN** every declared class SHALL be counted as a violation
- **AND** the marker SHALL be `[TOOL USAGE VIOLATION: <N>]` with N = declared class count

### Requirement: atom-phase-handler main procedure is an HLT tool-call execution wrapper

The main Dispatch Rules delegate execution to `atom-kernel §High-Level Tool Registry`: context assembly delivers the evidence sources, execution runs calls per registry contracts (bounded evidence loop default 3, verify per Entry: verify), then handler machinery (constraint check, tool usage check, output persistence, todo lifecycle) wraps the call. The handler does not define a competing execution spec.

#### Scenario: Main execution delegates

- **WHEN** a main node executes
- **THEN** the handler's Dispatch Rules reference atom-kernel §High-Level Tool Registry for the execution core, and no bespoke execution shape appears in the handler

#### Scenario: Dispatch machinery retained

- **WHEN** a main node completes
- **THEN** the handler still performs constraint check, tool usage check, output persistence, and todo lifecycle as its wrapping machinery

### Requirement: Main dispatch timing SHALL anchor tool-call execution after context assembly

The handler's main-node dispatch SHALL execute in the fixed order: dispatch todo clear → context assembly (evidence sources) → tool-call execution per `atom-kernel §High-Level Tool Registry` (bounded evidence loop, verify per Entry: verify) → constraint check → tool usage check → output persist → completion todo clear. Todo lifecycle SHALL be boundary clears only (dispatch + completion) — no plan projection, no content contract. Approval and gate paths SHALL remain unchanged (boundary clears only).

#### Scenario: Tool-call execution follows context assembly

- **WHEN** a main node dispatches with channels or dependsOn context
- **THEN** tool-call execution SHALL occur after the context blocks are assembled
- **AND** the todo list SHALL be cleared at dispatch and completion only

#### Scenario: Boundary clears bookend execution

- **WHEN** a main node completes
- **THEN** the completion todo clear SHALL run after the output persist

### Requirement: Single procedure source

The phase-dispatch procedure SHALL be defined once — §Dispatch Rules. No duplicate flow diagrams.

#### Scenario: no flow diagram duplication

Given packages/graph-workflow/skills/atom-phase-handler/SKILL.md When searching for the dispatch flow description Then the `## Flow` section is a one-line pointer to §Dispatch Rules (no ~55-line diagram)

### Requirement: Machine-renderable tables

Markdown tables SHALL be well-formed — no rows with empty first cells.

#### Scenario: no malformed table rows

Given packages/graph-workflow/skills/atom-phase-handler/SKILL.md When parsing §Error Handling table rows Then no row starts with `||`; every scenario cell is populated

### Requirement: Runtime dependencies declared

The runtime-constraints block SHALL declare every skill cited as authority in the body.

#### Scenario: atom-graph-spec declared

Given packages/graph-workflow/skills/atom-phase-handler/SKILL.md When reading the runtime-constraints block Then atom-graph-spec is declared (not just atom-kernel)

### Requirement: Short name for run-scoped stream

The phrase "the run-scoped output stream (per §Run-scoped output streams)" SHALL be defined once as "run stream" and referenced by the short name thereafter.

#### Scenario: parenthetical sprawl gone

Given packages/graph-workflow/skills/atom-phase-handler/SKILL.md When counting "(per §Run-scoped output streams)" occurrences Then it appears at most once (the definition)

### Requirement: Decision UI block injection — main-node confirmation points per approval()

The handler SHALL prepend a `## Decision UI` block to main-node context (alongside `## Run Mode:` and `## Constraints`), declaring that every user-confirmation point in the node's execution — including "ask the user" / "check with the user" / "quiz" / question()-style instructions in the dispatched skill — executes per the approval() contract: mode from `## Run Mode` (absent → manual); recommendation present + auto → execute it; no recommendation → card. Upstream skill content SHALL NOT be modified; the injection layer is the single interpretation site.

#### Scenario: Upstream skill confirmation auto-executes in auto mode

- **WHEN** a main node dispatches with an upstream skill containing a prose confirmation point (e.g. "Check with the user..."), run mode auto, and a recommendation exists
- **THEN** the confirmation SHALL execute the recommendation without a card

#### Scenario: Standalone execution presents cards as before

- **WHEN** a skill runs outside a graph (no `## Run Mode` / `## Decision UI` context)
- **THEN** confirmation points SHALL present cards as before (absence never auto)

#### Scenario: Interview turns unaffected

- **WHEN** an interview turn has no recommendation
- **THEN** the card SHALL appear in any run mode — the injection block does not change interview semantics
