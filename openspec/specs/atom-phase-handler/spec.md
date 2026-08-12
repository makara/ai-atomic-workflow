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
- **THEN** the result SHALL include `nodeId`, `status`, `output`, and `durationMs` (session display — the handler-measured wall clock; duration is NOT transmitted to `graph_advance`, which derives it from timestamps)
- **THEN** approval decisions SHALL carry the selected action and optional note

### Requirement: Input-stage consumption

atom-phase-handler SHALL read activation inputs from the activation boundary: `## Run Mode:` block from the session activation facts (graph_start `args.mode` — required, absent → MODE_REQUIRED at start; the handler consumes the run-mode block from the session copy, absence → manual + warning, never auto), `## Constraints` block from the pilot-loaded constraints (absent → empty + warning). Consumption shape SHALL be unchanged from the prologue-output reads — only the source naming follows the activation boundary model (ADR 0148).

#### Scenario: Mode read from activation facts

- **WHEN** an approval or gate node dispatches
- **THEN** the handler SHALL inject the `## Run Mode:` block from the session activation facts; missing facts degrade to manual + warning

#### Scenario: Constraints read from activation facts

- **WHEN** any node dispatches
- **THEN** the handler SHALL inject the `## Constraints` block from the pilot-loaded session copy; missing degrades to empty + warning

### Requirement: Handler SHALL enforce the todo node-boundary lifecycle

atom-phase-handler SHALL clear the platform todo list at every node boundary: dispatch (before task execution) and completion (after the output write, before returning to the pilot). The clear SHALL be unconditional on success/failure and SHALL apply uniformly to main, approval, and gate nodes. The clear SHALL go through the kernel `todo()` primitive's clear semantics — never a platform-specific spelling in the handler body.

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

MODIFIED: the tool-usage self-report SHALL be the `tools:` row of the single `## Checks` block — one line naming chain-head evidence per declared class or an `n/a` structural reason. Any `violated` line SHALL prefix the node output with `[TOOL USAGE VIOLATION: <count>]`; approval pre-call SHALL scan dependsOn outputs for the marker and append `[TOOL USAGE VIOLATION: <nodeId> × N]` (aggregation pipeline unchanged).

#### Scenario: Self-report closes main nodes

- **WHEN** a main node finishes execution
- **THEN** the output SHALL include the `## Checks` block with a `tools:` row naming per-class evidence or n/a reasons

#### Scenario: Violations prefix and aggregate

- **WHEN** any declared class is violated
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

MODIFIED: the handler SHALL perform the tool-usage verification by declared class against the `## Checks` `tools:` row: missing chain-head evidence per declared class, or a missing `tools:` row, SHALL auto-prefix `[TOOL USAGE VIOLATION: <count>]`. A `## Checks` block without a `tools:` row SHALL count as violations for all declared classes. The marker pipeline (approval pre-call scan + pilot stats aggregation) SHALL consume the auto-generated markers unchanged.

#### Scenario: Violation marker auto-generated

- **WHEN** a node declared `locate` and its output shows no locate-chain evidence
- **THEN** the handler SHALL prefix `[TOOL USAGE VIOLATION: 1]` to the persisted output
- **AND** the approval pre-call SHALL surface `[TOOL USAGE VIOLATION: <nodeId> × 1]`

#### Scenario: Check block absent counts all classes

- **WHEN** a node output has no `## Checks` block or no `tools:` row
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

### Requirement: Error handling table in SKILL.md

The handler error-handling table (scenario -> response) SHALL live in atom-phase-handler SKILL.md; DECISION-CARDS.md SHALL NOT contain an error-handling section.

#### Scenario: Error semantics located once

- **WHEN** a consumer looks up handler error semantics
- **THEN** they resolve to SKILL.md §Error Handling; DECISION-CARDS.md holds only card content, gate evaluation, and persist rules

### Requirement: Marker emission spec single home

The marker emission spec (all marker strings: `[CONSTRAINT VIOLATION]`, `[TOOL USAGE VIOLATION]`, `[FILE MISSING]`, headroom health markers, with emission-side rules) SHALL live in atom-phase-handler SKILL.md.

#### Scenario: Marker list changed

- **WHEN** a marker string spelling changes
- **THEN** atom-phase-handler SKILL.md is the single edited site; downstream consumers reference it

### Requirement: NODE-SCHEMA owns runtime shapes only

NODE-SCHEMA.md SHALL define NodeDetail, GraphSnapshot, IApprovalDecision, and the fsmState status-value table (idle/running/completed/terminated); it SHALL NOT restate completion mechanisms (owned by atom-graph-spec ROUTING + atom-pilot SKILL.md).

#### Scenario: Completion defined once

- **WHEN** a consumer needs run completion semantics
- **THEN** they resolve to atom-graph-spec ROUTING §Completion + atom-pilot SKILL §Run Completion; NODE-SCHEMA holds the status-value table only

### Requirement: Mode-Source Canonical Sites

The run-mode source rule (`## Run Mode` block, absence never auto) SHALL be stated at exactly two canonical sites: atom-kernel §approval() (decision semantics) and atom-phase-handler CONTEXT-ASSEMBLY.md §Prologue Context Blocks (block sourcing). All other files SHALL reference these by pointer and SHALL NOT restate the rule.

#### Scenario: Two-site rule

- **WHEN** scanning phase-handler SKILL.md, DECISION-CARDS.md, NODE-SCHEMA.md, or atom-pilot SKILL.md for run-mode semantics
- **THEN** each carries only pointers to the canonical sites — no restatement

#### Scenario: Schema carries no behavior rule

- **WHEN** reading NODE-SCHEMA.md §GraphSnapshot
- **THEN** no run-mode consumption rule appears — schema files carry field shapes only

### Requirement: Error Handling Unique Rows Only

atom-phase-handler SKILL §Error Handling SHALL contain only rows whose content is not stated elsewhere in the skill family: main-phase-requires-task, channel-resolution failure, task() dispatch failure. Rows duplicating flow steps (unknown type, judge failure, auto-without-recommendation, activation degrade) SHALL be absent — those live at their flow-step sites.

#### Scenario: Duplicate rows deleted

- **WHEN** reading phase-handler SKILL §Error Handling
- **THEN** rows 4-7 of the pre-convergence table (unknown type / judge fails / auto no-recommendation / activation facts missing) are absent
- **AND** no other file restates them

### Requirement: Judge Failure Single Home

The conservative judge-failure rule (failure -> no hit -> pass through; never fabricate a jump) SHALL be stated once: atom-kernel §judge() + its failure table. All other sites SHALL pointerize.

#### Scenario: Single-site conservative rule

- **WHEN** scanning phase-handler DECISION-CARDS.md §Gate Jump Evaluation or atom-pilot SKILL §Error Handling for the conservative rule
- **THEN** only a `per atom-kernel §judge()` pointer exists

### Requirement: Session-based upstream assembly single home

Upstream context (direct dependsOn + `node:` channels + prologue outputs) SHALL be assembled by the executing agent from its own session — the agent executed the upstream nodes earlier in the run; after session compaction the platform transcript (history addressing) restores full reports. CONTEXT-ASSEMBLY.md §Session-Based Upstream Assembly SHALL hold the assembly rules; schema files SHALL NOT restate them. Activation facts (`args.mode`, pilot-loaded constraints) are session facts of the activation — assembled the same way; degradation rules (missing/corrupt → manual mode + empty constraints warning) are unchanged.

#### Scenario: Upstream blocks from session

- **WHEN** a node dispatch references upstream reports (dependsOn / `node:` channels / activation facts)
- **THEN** the handler SHALL assemble `## Upstream:` / `## Constraints` / `## Run Mode:` blocks from the agent session (its own prior outputs, or platform history recovery after compaction)
- **AND** no dispatch payload content and no file reads are involved

#### Scenario: Missing upstream report degrades, never fails

- **WHEN** an upstream node has not yet produced a report (first round of a retry loop)
- **THEN** the handler SHALL warn and continue — no failure

### Requirement: Run Frame block assembly

The handler prepends a deterministic frame block to every dispatched node's context.

#### Scenario: Frame precedes other blocks

- **WHEN** the handler assembles context for a dispatched node
- **THEN** the `## Run Frame` block is the first block of the node context (before Upstream/Constraints blocks) and is generated deterministically from runId, nodeId, node type, and the node's task

### Requirement: Reasoning persistence check

Every main node output closes with a `Reasoning check:` ledger of persisted reasoning carriers.

#### Scenario: Reasoning check block present

- **WHEN** a main node completes
- **THEN** its output includes a `Reasoning check:` section with one line per carrier: CONTEXT.md term deltas (or `n/a: no new terms`), ADR decision (or `n/a: no decision-worthy change`), design/report chain updates (or `n/a`)

#### Scenario: Missing block is a ledger fact

- **WHEN** a main node output lacks the `Reasoning check:` block
- **THEN** the absence is reported as a contract violation marker on the node report

### Requirement: Single audit block

The handler SHALL close every main node output with ONE `## Checks` block containing exactly four lines — `constraints:` (ok | violation ×N), `tools:` (chain-head evidence | n/a reason), `reasoning:` (carriers | n/a), `context:` (A/B/C ledger counts + L3 prune count + output estimate). Green rows SHALL collapse to a single line each; violation rows SHALL expand with detail. The four former sections (`Constraint check:`, `Tool usage check:`, `Reasoning check:`, `Context usage check:`) SHALL NOT exist as separate sections.

#### Scenario: All-green node emits four lines

- **WHEN** a main node completes with no violations
- **THEN** its output contains one `## Checks` block with four one-line rows and no per-axis sections

#### Scenario: Violation row expands

- **WHEN** a main node has a constraint or tool-usage violation
- **THEN** the corresponding row in the `## Checks` block expands with the violation detail and the marker prefix applies unchanged

### Requirement: Handler frame carries discipline declaration

MODIFIED: the handler-assembled run-frame block for main nodes SHALL include the declared operations from `node.operations` and SHALL name the undeclared discipline operations (read/write/locate per the standard) as out of scope. The frame is the single frame injection point — the signal layer SHALL NOT render or inject frames. A conformance test SHALL pin the discipline line: for a declared operations set, the rendered frame lists exactly the declared operations and names the undeclared discipline operations as out of scope — the line is a deterministic function of `node.operations`.

#### Scenario: Out-of-scope in frame

- **WHEN** a main node declares `[locate, read, review]`
- **THEN** the frame block lists `declared operations [locate, read, review]` and `out of scope: write`

#### Scenario: discipline line pinned by test

- **WHEN** the handler skill contract tests run
- **THEN** a test asserts the discipline line for a sample declared set equals the deterministic render (declared list + out-of-scope list) — a change to the render logic fails the test
