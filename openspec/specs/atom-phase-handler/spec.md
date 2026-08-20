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

MODIFIED: the handler SHALL run a single main path for every dispatched node (no type dispatch — gate/approval no longer exist). Main execution = inline tool-call execution; when the node's `NodeDetail.completion` declares options (choices / direct_end), the handler SHALL assemble the decision card from the machine-declared block — no `routing.actions` wording, no task-text branch evaluation for card options. The node's decision output SHALL carry the condition value (when the node's execution produces one) and the pilot reports it on advance (`graph_advance(runId, nodeId, condition)`) — the backend routes via the flow transition table. The loop-template dispatch rules (start looped graph sibling run → drive → collect → evaluate until → re-run) SHALL NOT exist — a loop is a flow self-edge, the loop-head node executes as a plain main node. The router-template dispatch rules SHALL keep the sibling-run selection semantics. Node output reports as concise prose (no JSON fence). Rework conditions SHALL be evaluated inline per the task text (self-edges and jump targets route via the flow table).

#### Scenario: Handler routes by node type

- **WHEN** a node dispatches
- **THEN** the handler SHALL run the single main path — no type dispatch (gate/approval no longer exist)

#### Scenario: Handler assembles runtime context

- **WHEN** a node dispatches
- **THEN** the handler SHALL assemble context (runId, graphName, nodeId, snapshot?) + `## Constraints` block (no `## Run Mode` block)

#### Scenario: Handler returns structured result

- **WHEN** a node execution completes
- **THEN** the handler SHALL return `{ nodeId, status, output, durationMs }` to the pilot — the output carries the condition value when produced

#### Scenario: Main node output reported as prose summary

- **WHEN** a main node completes with reportable content
- **THEN** the output SHALL be a concise prose summary — never a JSON code fence

#### Scenario: Empty output reported without a code block

- **WHEN** a main node completes with no reportable content
- **THEN** no code block SHALL be emitted

#### Scenario: Approval/gate decision single-line with full JSON retained

- **WHEN** a main confirmation decision completes
- **THEN** the report SHALL carry the single-line decision form
- **AND** the full decision JSON SHALL remain available in the agent session

#### Scenario: Card options render from completion

- **WHEN** a dispatched NodeDetail carries `completion.choices` / `completion.direct_end`
- **THEN** the decision card SHALL render those options directly — no parsing of the task text to discover options

#### Scenario: Condition in node output

- **WHEN** a node's execution concludes with a condition value
- **THEN** the output carries it and the advance reports it — the backend matches the flow edge

#### Scenario: Loop-head executes as plain main

- **WHEN** a dispatched node is a flow self-loop head
- **THEN** the handler executes it through the plain main path — no loop template rules apply

#### Scenario: Router selection unchanged

- **WHEN** a router node dispatches
- **THEN** selection (auto/card) and sibling-run launch proceed per the router template rules

### Requirement: Handler SHALL enforce the todo node-boundary lifecycle

MODIFIED: atom-phase-handler SHALL clear the platform todo list at every node boundary: dispatch (before task execution) and completion (after the output write, before returning to the pilot). The clear SHALL be unconditional on success/failure and SHALL apply uniformly to the single main path. The clear SHALL go through the kernel `todo()` primitive's clear semantics — never a platform-specific spelling in the handler body.

#### Scenario: Dispatch clears the scratchpad

- **WHEN** the handler begins executing any node
- **THEN** it SHALL invoke the `todo()` clear semantics before the node's task runs

#### Scenario: Completion clears before advance

- **WHEN** the handler finishes a node — done or failed
- **THEN** it SHALL invoke the `todo()` clear semantics after the output write and before the pilot's `graph_advance` call

#### Scenario: Handler uses the kernel primitive

- **WHEN** the handler's todo lifecycle step executes
- **THEN** it SHALL reference the `todo()` contract from atom-kernel §Platform Spellings
- **AND** no platform tool name (e.g. `todo rm` spelled directly) SHALL appear in the handler body

### Requirement: Handler SHALL enforce the Tool usage check self-report

The tool-usage self-report SHALL be the `tools:` row of the single `## Checks` block — one line naming chain-head evidence per declared class or an `n/a` structural reason. Any `violated` line SHALL prefix the node output with `[TOOL USAGE VIOLATION: <count>]`; the decision pre-call SHALL scan dependsOn outputs for the marker and append `[TOOL USAGE VIOLATION: <nodeId> × N]` (aggregation pipeline unchanged).

#### Scenario: Self-report closes main nodes

- **WHEN** a main node finishes execution
- **THEN** the output SHALL include the `## Checks` block with a `tools:` row naming per-class evidence or n/a reasons

#### Scenario: Violations prefix and aggregate

- **WHEN** any declared class is violated
- **THEN** the output SHALL carry `[TOOL USAGE VIOLATION: <count>]`
- **AND** the decision pre-call SHALL surface the marker per dependsOn node

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

### Requirement: Main dispatch timing SHALL anchor tool-call execution after context assembly

MODIFIED: the handler's main-node dispatch SHALL execute in the fixed order: dispatch todo clear → context assembly (evidence sources) → tool-call execution per atom-kernel §Tool Discipline → constraint check → tool usage check → output persist → completion todo clear. Todo lifecycle SHALL be boundary clears only (dispatch + completion) — no plan projection, no content contract. The main path is the only path — no approval/gate paths exist to reference.

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

`## Decision UI` block SHALL prepend to main node context (alongside `## Constraints`). Block semantics = explicit declaration mapping: card presentation is triggered ONLY by explicit graph tokens (`Interview:` / `confirm:` / explicit confirmation instructions / `routing.actions` branch declarations). Prose without an explicit token SHALL NOT trigger the approval() card — the node executes self-decided. No run-mode wording exists. The "Upstream skill confirmation auto-executes in auto mode" scenario keeps its historical name; its content confirms no auto execution (run mode removed, ADR 0215).

#### Scenario: Upstream skill confirmation auto-executes in auto mode

- **WHEN** a main node dispatches and the upstream skill contains prose confirmation points (e.g. "Check with the user...") and the node's graph definition carries an explicit confirmation token (`Interview:` / `confirm:` / `routing.actions`)
- **THEN** confirmation SHALL present the card — no auto execution (run mode removed; recommendation is marked only)
- **WHEN** the same prose confirmation point sits on a node whose graph definition carries no explicit confirmation token
- **THEN** the prose confirmation point SHALL NOT trigger the card — the node executes self-decided

#### Scenario: Prose confirmation wording without token self-decides

- **WHEN** a node's task text contains prose confirmation wording but the graph definition declares no explicit token
- **THEN** no card SHALL be presented — the node executes self-decided

#### Scenario: Explicit token still maps to card

- **WHEN** a node's graph definition declares `Interview:` / `confirm:` / explicit confirmation instructions / `routing.actions`
- **THEN** the approval() card SHALL be presented at that point

#### Scenario: Standalone execution presents cards as before

- **WHEN** a main confirmation node executes standalone
- **THEN** the card SHALL present — no auto-execution path exists

#### Scenario: Interview turns unaffected

- **WHEN** an interview() turn runs on a main node
- **THEN** the card SHALL be presented without recommendation — never auto-gated

### Requirement: Error handling table in SKILL.md

The handler error-handling table (scenario -> response) SHALL live in atom-phase-handler SKILL.md; DECISION-CARDS.md SHALL NOT contain an error-handling section.

#### Scenario: Error semantics located once

- **WHEN** a consumer looks up handler error semantics
- **THEN** they resolve to SKILL.md §Error Handling; DECISION-CARDS.md holds only card content and persist rules

### Requirement: Marker emission spec single home

MODIFIED: the marker emission spec (all marker strings: `[CONSTRAINT VIOLATION]`, `[TOOL USAGE VIOLATION]`, `[FILE MISSING]`, with emission-side rules) SHALL live in atom-phase-handler SKILL.md. Headroom health markers are removed from the set — no `[HEADROOM DOWN]` marker exists (compression is the graph-fidelity-context module's internal concern).

#### Scenario: Marker list changed

- **WHEN** a marker string spelling changes
- **THEN** atom-phase-handler SKILL.md is the single edited site; downstream consumers reference it

#### Scenario: No headroom marker in the set

- **WHEN** scanning atom-phase-handler SKILL.md marker emission section for headroom
- **THEN** zero references exist

### Requirement: NODE-SCHEMA owns runtime shapes only

MODIFIED: NODE-SCHEMA restores the `agent` row — the runtime NodeDetail shape carries the `agent` hints field (priority-ordered sub-agent type preferences, advisory — fallback platform default). The `position` and `executionMode` rows stay dropped (no execution-position or mode-hint facts exist on the dispatch surface). The `template_args` row SHALL carry the full per-template shape: `{ paths }` (router), `{ terminal }` (scope-entry), `{ questions: [{ prompt, condition }] }` (router — caller-declared extra judgment entries; accept-node consolidation, ADR 0246). The `review-accept` / `adopt-accept` / `adopt-scope` template rows SHALL NOT appear in the schema table (accept templates deleted, ADR 0246; adopt-scope removed, ADR 0247 — the adoption goal is confirmed by the framework's scope-entry + requirement accept loop + adopting grilling).

#### Scenario: NodeDetail field surface

- **WHEN** NODE-SCHEMA is read
- **THEN** it SHALL document `agent` (advisory sub-agent type preferences for main phases)
- **AND** it SHALL document no `position` / `executionMode` fields

#### Scenario: Agent hints block assembled at dispatch

- **WHEN** a dispatched main node's NodeDetail carries `agent`
- **THEN** the handler SHALL assemble a `## Agent hints:` block from the field (priority-ordered — first available wins, fallback platform default)
- **AND** nodes without `agent` SHALL receive no such block (no empty block)

#### Scenario: NODE-SCHEMA matches the consolidated template surface

- **WHEN** the NODE-SCHEMA template table is read
- **THEN** it SHALL list `startup` / `router` / `scope-entry` / `adopting` only, with `template_args` shapes covering paths / terminal / questions — no review-accept / adopt-accept / adopt-scope rows

### Requirement: Error Handling Unique Rows Only

atom-phase-handler SKILL §Error Handling SHALL contain only rows whose content is not stated elsewhere in the skill family: main-phase-requires-task, channel-resolution failure, task() dispatch failure. Rows duplicating flow steps (unknown type, activation degrade) SHALL be absent — those live at their flow-step sites.

#### Scenario: Duplicate rows deleted

- **WHEN** reading phase-handler SKILL §Error Handling
- **THEN** rows of the pre-convergence table (unknown type / judge fails / auto no-recommendation / activation facts missing) are absent
- **AND** no other file restates them

### Requirement: Judge Failure Single Home

The judge() primitive and its failure table were removed with the gate type (ADR 0216). Rework conditions are evaluated inline from main task text — no judge() call exists, no conservative judge-failure rule to single-home. No skill, channel, constraint, or test SHALL reference judge() or a jump-evaluation pass. REMOVED.

#### Scenario: No judge reference exists

- **WHEN** a consumer scans repo content for judge() references
- **THEN** none SHALL exist in live assets — ADR history excepted (judge() removed with the gate type, ADR 0216)

### Requirement: Session-based upstream assembly single home

Upstream context (direct dependsOn + `node:` channels + activation facts) SHALL be assembled by the executing agent from its own session — the agent executed the upstream nodes earlier in the run; after session compaction the platform transcript (history addressing) restores full reports. CONTEXT-ASSEMBLY.md §Session-Based Upstream Assembly SHALL hold the assembly rules; schema files SHALL NOT restate them. No `## Run Mode:` block exists (run mode removed, ADR 0215).

#### Scenario: Upstream blocks from session

- **WHEN** a node dispatch references upstream reports (dependsOn / `node:` channels / activation facts)
- **THEN** the handler SHALL assemble `## Upstream:` and `## Constraints` blocks from the agent session (its own prior outputs, or platform history recovery after compaction)
- **AND** no dispatch payload content and no file reads are involved

#### Scenario: Missing upstream report degrades, never fails

- **WHEN** an upstream report is unavailable after compaction recovery
- **THEN** the handler SHALL degrade gracefully — never fail the dispatch on missing upstream content

### Requirement: Run Frame block assembly

MODIFIED: the handler prepends a deterministic frame block to every dispatched node's context as the first block of the consolidated 4-block set (adopt-scope-and-handler-blocks, ADR 0247 — display-minimalism law-2 fix + per-node token reduction): `## Run Frame` (unconditional, first — run position + task summary + declared operations + user-input contract; the declared operations line is the SINGLE render point for `node.operations` — the former separate Class block is folded here, node.operations SHALL NOT appear in any other block), `## Context` (conditional, second — upstream / reference / file / decision-ui sub-sections under compact sub-headers; absent sections omitted), `## Constraints` (unconditional, third — unchanged semantics), `## Checks` (unconditional, last — unchanged semantics). The former 7-block order (Run Frame → Upstream → Reference → Class → File → Decision UI → Constraints) is replaced. The Run Frame remains the single C1 frame signal (seam law — one emission seam per signal class); mechanical tier (seam-live) behavior unchanged: no prose Checks block, no Context hints block, markers still prefix on violation.

#### Scenario: Frame precedes other blocks

- **WHEN** the handler assembles context for a dispatched node
- **THEN** the `## Run Frame` block is the first block of the node context (before the Context/Constraints/Checks blocks) and is generated deterministically from runId, nodeId, node type, and the node's task

#### Scenario: Run Frame carries operations single-render

- **WHEN** a main node with `node.operations` dispatches
- **THEN** the `## Run Frame` block SHALL carry the declared operations line
- **AND** no other assembled block SHALL repeat `node.operations` content (no separate Class block)

#### Scenario: Context block merges conditional sections

- **WHEN** a main node dispatches with upstream (`node:` channels / dependsOn), reference (`skill:` channels), file channels, and/or a declared decision point
- **THEN** the `## Context` block SHALL carry the present sections under compact sub-headers (upstream / reference / file / decision-ui) in order
- **AND** absent sections SHALL be omitted (no empty sub-headers)

#### Scenario: Constraints and Checks unchanged

- **WHEN** a main node dispatches
- **THEN** the `## Constraints` block SHALL carry the `[graph]`/`[project]` layered entries (2 KB cap, dedup, conflicts preserved)
- **AND** the `## Checks` block SHALL be the single-line collapsed row (prose tier) or absent with markers (mechanical tier)

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

### Requirement: Checks context row — measured-first data source

The handler SHALL fill the `## Checks` `context:` row's output figure from graph-fidelity's measured usage when present; the agent estimate SHALL be the degrade path when the plugin is absent or no usage event was observed. The row format SHALL remain a single line, factual for the executed node (ledger-as-was, auditable). MODIFIED: the data source wording is corrected to the implemented seam — facts accumulate from the `message_end` metering channel (the completed assistant message carries the populated usage facts; `message_update` streaming snapshots never populate them, empirically all-zero, unregistered) and settle at the context-seam frame-change detection with the turn-boundary `session_stop` drain on the OMP face (ADR 0171). The previous wording ("fire-and-forget message-update channel, settled at the platform turn-boundary stop event") described a superseded seam — ADR 0171 decision 2 REVISED anchors metering on `message_end` only; the settle executes at context-seam frame-change (omp.ts:510), `session_stop` is the idempotent last-node drain.

#### Scenario: Measured source present

- **WHEN** the run has graph-fidelity installed and measured usage exists for the node
- **THEN** the row reports the measured figures (requests, tokens, cache) instead of an estimate, and the figure references the settled ledger (`measured`) without copying it — the metering facts originate from the `message_end` completed-message usage, never from `message_update` streaming snapshots (all-zero, unregistered)

#### Scenario: Degrade to estimate

- **WHEN** no measured usage is available
- **THEN** the row reports the agent estimate (existing behavior, unchanged)

#### Scenario: Line format reference truth

- **WHEN** the handler documents the seam line's output-figure semantics (the `▣ [seam]` line the `context:` row references as `measured`)
- **THEN** it SHALL reference the implemented 8-cell value-ratio rendering `▣ [seam] node <id> · N/M · │████░░│ cur/ref` (ADR 0161) — no percent segment, no "metering segment" label (the former `│██░░│ 40.0%` 4-cell format is pre-ADR-0161 and never renders); metering deltas fold into the settlement audit entry, not a line segment

### Requirement: Display tiering with seam-live detection

The handler SHALL detect graph-fidelity presence by seam liveness: the most recent user messages carrying a canonical `[seam]` line SHALL mark the plugin present. When present, the handler SHALL NOT assemble the prose feedback blocks it otherwise would — the Context hints block SHALL NOT be assembled, and the prose `## Checks` block SHALL NOT be assembled (violation markers SHALL still prefix node output when violations exist). When absent (degrade), the handler SHALL assemble the minimal prose baseline: NO Context hints block (removed — the frame and constraints already carry the selection and discipline facts), and a single-line `## Checks` block.

#### Scenario: Plugin present

- **WHEN** a main node dispatches and the recent user messages carry a canonical `[seam]` line
- **THEN** no Context hints block and no prose Checks block are assembled; violation markers still prefix output on violation

#### Scenario: Plugin absent — minimal prose baseline

- **WHEN** a main node dispatches and no `[seam]` line is present in recent user messages
- **THEN** the dispatch carries no Context hints block and a single-line Checks block; behavior correctness is unchanged (zero denial)

### Requirement: Single-line Checks block (prose baseline)

MODIFIED: the `## Checks` block SHALL render as ONE line — `## Checks: constraints ok · tools n/a · reasoning ok · ctx A n · B n · C n · L3 n · out ~n tok` — with green rows collapsed. Violation rows SHALL expand with detail and SHALL prefix the node output with the violation markers (emission rules unchanged: `[CONSTRAINT VIOLATION: <count>]`, `[TOOL USAGE VIOLATION: <count>]`, `[REASONING VIOLATION: <count>]`, `[CONTEXT VIOLATION: <count>]`). The tools row SHALL name chain-head evidence per declared class or an `n/a` structural reason; missing evidence per declared class SHALL count as violation (unchanged). The four former sections do not exist as separate sections. The block's position in the consolidated 4-block set is last (after `## Constraints`); the former 7-block prepend order is replaced (adopt-scope-and-handler-blocks, ADR 0247).

#### Scenario: All green

- **WHEN** a main node completes with no violations and no declared tool classes
- **THEN** the Checks block is a single line with `ok`/`n/a` values

#### Scenario: Violation expands

- **WHEN** a declared tool class lacks chain-head evidence
- **THEN** the tools segment expands with the violation detail and `[TOOL USAGE VIOLATION: 1]` prefixes the output

#### Scenario: Checks position in the 4-block set

- **WHEN** a main node dispatches
- **THEN** the `## Checks` block SHALL appear last in the assembled block order (Run Frame → Context → Constraints → Checks)

### Requirement: Constraints block merges graph and project layers

MODIFIED: the `## Constraints` block SHALL be assembled from the merged constraint set: `[graph]`-prefixed entries (dispatch fact — `NodeDetail.constraints` graph part, from the loaded definition) + `[project]`-prefixed entries (activation session fact — existing pipeline). Block shape per the unified format (title, one bullet per entry with source prefix, closing compliance sentence); layered append with conflict preservation (no silent drop); 2 KB cap and lang/git semantic dedup SHALL apply to the merged block; explicit warning on truncation, never silent. Inventory entry-level constraints SHALL NOT enter the block. Constraint-injection rule details remain single-sourced at atom-graph-spec §Constraint Layering — the handler SKILL.md carries the pointer sentence and the block format. The block's position in the consolidated 4-block set is third (after `## Run Frame` and `## Context`, before `## Checks`); the former 7-block prepend order is replaced (adopt-scope-and-handler-blocks, ADR 0247).

#### Scenario: Both layers visible before inline task

- **WHEN** a main-type node is dispatched with 2 graph constraints and 8 project rules
- **THEN** the task text received by the executing agent contains the `## Constraints` block at the top — 10 bullets, each prefixed `[graph]` or `[project]` — positioned before the task instructions

#### Scenario: Rework evaluation includes merged constraints

- **WHEN** a main node evaluates an inline rework condition with a merged constraint set
- **THEN** the evaluation context includes the merged block (rework conditions can reference graph-level rules)

#### Scenario: Constraints position in the 4-block set

- **WHEN** a main node dispatches
- **THEN** the `## Constraints` block SHALL appear third in the assembled block order (Run Frame → Context → Constraints → Checks)

### Requirement: Handler SHALL NOT orchestrate subgraph delegation

MODIFIED: the handler SHALL NOT orchestrate subgraph delegation — the boundary-delegation path is removed. Every dispatched node executes through the single main dispatch path. The loop-template node handling (repeated sibling-run execution) SHALL be removed; the router-template node handling SHALL remain (one-shot sibling-run selection). `## Agent hints:` injection is restored for peer-level main phases: when the dispatched node's NodeDetail carries `agent`, the handler SHALL assemble a `## Agent hints:` block (priority-ordered — first available wins, fallback platform default).

#### Scenario: Composed member single dispatch

- **WHEN** a dispatched node executes
- **THEN** the handler SHALL dispatch it through the standard main path — no batch assembly, no structured output package, no loop sibling-run orchestration

#### Scenario: Agent-hints block for hinted nodes

- **WHEN** a dispatched main node's NodeDetail carries `agent`
- **THEN** a `## Agent hints:` block SHALL be injected (priority-ordered — first available wins, fallback platform default)

#### Scenario: No loop sibling-run orchestration

- **WHEN** a loop-head node dispatches
- **THEN** no sibling-run start/drive/collect orchestration occurs — the node's own flow self-edge governs re-entry
