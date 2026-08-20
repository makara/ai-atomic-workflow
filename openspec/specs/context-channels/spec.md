# context-channels Specification

## Purpose

Context contract parsing + channel resolution. Assets: `packages/graph-scheduler/src/context/` (2 files).

## Requirements

### Requirement: Main branch inline context injection

MODIFIED: the main handler SHALL assemble the phase's context inline before executing the phase task: read `node:`/implicit `dependsOn` upstream outputs as `## Upstream: <nodeId>` blocks (from the agent session — upstream content is never delivered in the payload), load `skill:` entries as `## Reference:` blocks (the handler reads the skill itself), resolve globs as `## File:` blocks, then prepend the blocks in order (upstream → reference → file → constraints → task) to the task text and execute inline. A `node:` channel whose target has no produced output SHALL warn and skip — never fail.

#### Scenario: Main phase receives injected upstream block

- **WHEN** a main phase declares `channels: ["node:writer"]` and the writer output exists in the session
- **THEN** the inline execution context SHALL contain a `## Upstream: writer` block with the output content
- **THEN** the assembled blocks SHALL precede the phase task in the order upstream → reference → file → constraints → task

#### Scenario: Missing node output warns and skips

- **WHEN** a main phase's `node:` channel target has no produced output yet (e.g. first round of a retry loop)
- **THEN** assembly SHALL emit a warning naming the channel
- **THEN** the channel SHALL be skipped (no injection block) and assembly SHALL NOT fail
- **THEN** the phase SHALL execute with the remaining blocks and the task

#### Scenario: Main phase consumes reference skill

- **WHEN** a main phase declares `channels: ["skill:atom-graph-spec"]`
- **THEN** the inline context SHALL contain a `## Reference` block with the skill content (handler-loaded)

### Requirement: Run-scoped node channel resolution

MODIFIED: `node:` channel resolution SHALL validate that the target nodeId belongs to the current run's node set (the current run's graph-definition nodes — including all nodes after flow flattening). This validation SHALL be performed by the scheduler at **dispatch time** (NodeDetail construction): a target not in the run node set → warning (naming the channel and the target nodeId) + the channel is stripped (no injection, no failure). The scope gate exists because the declaration must resolve within the run; content delivery is session-side (the scheduler never holds content, so no stale content can leak by construction). Engine validation SHALL use the same predicate implementation across dispatch paths — one implementation, no second copy.

#### Scenario: Cross-run stale output not injected

- **WHEN** a standalone graph (e.g. arch-review) resolves a `node:loop-entry` channel while the current run's node set does not contain `loop-entry` (the node exists only in nested composition scenarios)
- **THEN** scheduler dispatch SHALL output a warning naming the channel and the target nodeId
- **AND** the channel SHALL be stripped — no upstream block is assembled for it
- **AND** resolution SHALL NOT fail — the remaining channels and the task assemble normally

#### Scenario: Current-run node channel resolves normally

- **WHEN** in a composed graph (e.g. arch-review-loop) the target nodeId of a `node:loop-entry` channel belongs to the current run's node set
- **THEN** resolution SHALL accept the channel and the handler SHALL assemble the upstream block from the agent session (the node's report, produced earlier in the run)
- **AND** when the node has no report yet (not yet executed), the existing missing-output warning + skip semantics SHALL be preserved

#### Scenario: Flow-propagated channels observe the same scope

- **WHEN** channels reach flow entry child nodes through the two-scope model and the target nodeId belongs to the current run's node set
- **THEN** the `node:` channel SHALL resolve normally
- **AND** when the target is not in the current run's node set (running the subgraph standalone) → warning + strip

#### Scenario: One run-scope predicate implementation

- **WHEN** any dispatch path (graph_start / graph_advance / graph_jump) validates a `node:` channel
- **THEN** all SHALL call the same predicate implementation — identical behavior, no second copy

#### Scenario: CLI validate shares the same predicate

- **WHEN** CLI validate checks graph channel declarations (estate-maintain agent-side validation)
- **THEN** its run-node-set validation SHALL call the same predicate implementation as runtime dispatch — identical behavior, no second implementation

### Requirement: Judgment context assembly SHALL use the single context pipeline

Rework-condition context SHALL be assembled through the same pipeline as main execution: direct dependsOn outputs (`## Upstream:` blocks auto-injected) + `channels` `node:` target outputs + snapshot (incl. retryCount) + constraints. The main node evaluates its task-text conditions against this context inline; no separate judgment pass exists.

#### Scenario: Direct upstream auto-inject

- **WHEN** a main node's rework condition references a direct dependsOn output
- **THEN** that output SHALL be injected automatically — no `reads` declaration (the field no longer exists)

#### Scenario: Cross-level reference via channels

- **WHEN** a main node's rework condition references a node that is not a direct dependsOn (transitive upstream, flow child, loop origin)
- **THEN** the author SHALL declare `channels: [node:<id>]`; the handler SHALL inject that output; a missing output SHALL be noted as `<id> has no output` and a condition referencing it evaluates conservatively (no rework)

### Requirement: Channel scope hierarchy — project, graph, flow, phase

`channels` context SHALL be declared at two scopes only: the global channel — `.graph-scheduler/config.json` `context:` (project default layer) merged with the graph's top-level `context:` — and per-phase `channels:`. A phase's effective ambient context SHALL be the config+graph union, deduplicated by exact string, config entries first, computed once at graph load; the phase's own `channels:` entries SHALL add on top. No override or opt-out semantics SHALL exist — context is additive. The former project → graph → flow → phase four-scope merge SHALL NOT exist.

#### Scenario: Graph-level channels inherited by every phase

- **WHEN** a graph declares top-level `context: ["./CONTEXT.md"]` and a phase declares no channels of its own
- **THEN** the phase's effective context SHALL include `./CONTEXT.md`
- **THEN** the entry SHALL be injected at dispatch exactly as if declared on the phase

#### Scenario: Phase channels merge with inherited channels

- **WHEN** a phase declares `channels: ["node:spec"]` and the graph top level declares `context: ["./CONTEXT.md"]`
- **THEN** the phase SHALL receive the global `./CONTEXT.md` block plus its own `node:spec` upstream block
- **THEN** an exact-duplicate entry declared at both levels SHALL appear once

#### Scenario: Project-level channels are outermost

- **WHEN** `.graph-scheduler/config.json` declares `context: ["./CONTEXT.md"]` and a graph declares `context: ["./CONTEXT.md", "skill:atom-graph-spec"]`
- **THEN** every phase's effective context SHALL contain `./CONTEXT.md` and `skill:atom-graph-spec`, config entries first, deduplicated

### Requirement: Graph and project-level entries — explicit prefix or glob only

Graph-level (`context:`) and config-level (`context:`) entries SHALL be explicit `skill:<name>`, `node:<id>`, or file-glob entries. A bare-name entry at these scopes (no execution-skill contract exists at these scopes) SHALL be a load-time error naming the entry and suggesting the `skill:`/`node:` prefix. For config-level entries the rejection SHALL fire at config parse (schema validation); for graph-level entries at graph load. `node:` targets SHALL validate against the flattened node set at load; run-scope gating still applies at dispatch.

#### Scenario: Bare graph-level name errors

- **WHEN** a graph declares top-level `context: ["atom-graph-spec"]`
- **THEN** loading SHALL fail with an error suggesting `skill:atom-graph-spec`

#### Scenario: Bare project-level name rejected at config parse

- **WHEN** `.graph-scheduler/config.json` declares `"context": ["atom-graph-spec"]`
- **THEN** config schema validation SHALL fail naming the entry and suggesting the `skill:` prefix

#### Scenario: Child graph-level bare name fails composed load

- **WHEN** a flow composes a child graph whose top-level `context:` contains a bare-name entry
- **THEN** flattening SHALL fail the load with an error naming the child graph and the entry

#### Scenario: Prefixed graph-level entries accepted

- **WHEN** a graph declares top-level `context: ["skill:atom-graph-spec", "./CONTEXT.md", "node:requirement/arch-review"]`
- **THEN** loading SHALL succeed
- **THEN** `node:` targets SHALL be validated against the flattened node set at load; run-scope gating still applies at dispatch

### Requirement: Scheduler-side effective-channel merge

The merge of the config default layer and the graph `context:` into the global channel SHALL be computed once at graph load. At dispatch, `NodeDetail` SHALL carry the global channel plus the phase's own `channels:` entries; the agent-side handler and the shared resolver SHALL consume them unchanged — no agent-side merge logic SHALL exist. The run-scope gate SHALL apply to `node:` entries at dispatch.

#### Scenario: NodeDetail carries merged channels

- **WHEN** a phase with inherited global context is dispatched
- **THEN** `NodeDetail.channels` SHALL contain the global entries followed by the phase's own entries, deduplicated

#### Scenario: Resolver consumes effective list

- **WHEN** the agent-side handler resolves a dispatched node's channels
- **THEN** it SHALL pass the effective list through the shared resolver — identical behavior to per-phase declarations

### Requirement: Judgment-domain references stay nodeId-based

Main task-text rework conditions SHALL reference node reports by nodeId within the judgment-domain formula (scope: direct dependsOn outputs ∪ phase `channels` entries ∪ `node:` streams in the global `context:`; rework target referenceable only within the retryCount bound). Rework evaluation is agent-executed inline from main task text — the executing agent reads the referenced reports from its own session. Runtime output paths SHALL NOT be referenced (they do not exist); ordinary document paths in task text remain legal context.

#### Scenario: Condition references nodeId only

- **WHEN** a main task-text rework condition references a report by nodeId within the judgment domain
- **THEN** validation SHALL pass (no runtime-path check exists)

### Requirement: Convention-file channel declarations warn at validation

A phase or graph `channels:` entry that resolves to a convention-layer file (`DEFAULT_CONVENTIONS` member: `./CONTEXT.md`, `docs/domains.md`, normalized) SHALL emit a validation warning naming the entry and the node, stating that the file is implicit coverage and the declaration is redundant.

#### Scenario: Convention declaration warns

- **WHEN** a graph phase declares `channels: ["./CONTEXT.md", "node:requirement/arch-review"]`
- **THEN** validation SHALL report a warning for `./CONTEXT.md` naming the phase, and no warning for the `node:` entry

#### Scenario: Non-convention file channels stay silent

- **WHEN** a phase declares `channels: ["docs/adr/0145-context-management-hints.md"]` (non-convention file)
- **THEN** validation SHALL emit no convention warning for that entry

### Requirement: Convention-file channel delivery is skipped at dispatch

A convention-layer file declared in `channels:` SHALL NOT be delivered as a channel block at dispatch — the file stays implicit coverage (available via the convention layer), the declaration has zero delivery effect. Channel delivery SHALL carry only node-specific streams (`node:` / `skill:` references) and workflow-artifact globs.

#### Scenario: Dispatch skips the convention declaration

- **WHEN** a phase declares `channels: ["./CONTEXT.md", "docs/domains.md", "node:upstream"]` and the run dispatches the phase
- **THEN** the dispatched context SHALL contain the `node:upstream` block and SHALL NOT contain channel blocks for `./CONTEXT.md` or `docs/domains.md`
- **THEN** the convention files remain available through the convention layer unchanged

#### Scenario: Skip applies to graph-level context too

- **WHEN** a graph declares top-level `context: ["docs/domains.md"]`
- **THEN** dispatch SHALL skip delivering `docs/domains.md` as a global-channel block, with the same validation warning

### Requirement: Convention semantics unchanged when undeclared

Graphs and phases that never declare convention files SHALL behave exactly as before: convention files remain implicit coverage, absence-tolerant, never existence-checked.

#### Scenario: Undeclared convention files unaffected

- **WHEN** a graph declares no convention files in `context:` or `channels:`
- **THEN** validation SHALL emit no convention warnings and dispatch SHALL deliver only the declared channels

### Requirement: Skill contract is agent-side single source

The skill's `## Context Requirements` contract SHALL be the agent-side single source of truth for context assembly — the handler reads the skill it dispatches and assembles context per its contract. The engine SHALL NOT parse skill prose: no `## Context Requirements` extraction, no machine-readable contract lists derived from SKILL.md in the scheduler.

#### Scenario: Engine loads graph without reading skills

- **WHEN** `graph_start` loads a graph whose phases declare `skill:` channels
- **THEN** the engine SHALL NOT read or parse any SKILL.md file — the `skill:` entries pass through shape-validated to the agent

### Requirement: skill: channel entries pass through

`skill:<name>` channel entries SHALL be delivered to the agent as declared (shape-validated) — the agent resolves the skill itself via its own skill system; the engine holds no skill-format knowledge.

#### Scenario: skill channel delivered verbatim

- **WHEN** a phase declares `channels: ["skill:codebase-design"]`
- **THEN** the NodeDetail channels array SHALL contain `skill:codebase-design` and no engine-side skill lookup or parsing occurs
