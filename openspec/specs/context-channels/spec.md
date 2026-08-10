# context-channels Specification

## Purpose

Context contract parsing + channel resolution. Assets: `packages/graph-scheduler/src/context/` (2 files).

## Requirements

### Requirement: Skill contract is the single source of truth for channels

The system SHALL treat the entry skill's `## Context Requirements` section (From upstream / Reference skills / Files subsections) as the single source of truth for a graph phase's data-flow needs. Graph-side channel declarations SHALL be derived from and cross-checked against this contract. A skill contract SHALL be machine-parseable — each subsection SHALL contain a machine-readable list, and placeholder entries such as `<configurable>` SHALL be rejected. Contract parsing SHALL skip markdown code-fenced blocks: documentation examples inside fences SHALL never be parsed as contract entries.

#### Scenario: Contract subsections are machine-parseable

- **WHEN** a skill declares `### From upstream`, `### Reference skills`, or `### Files` subsections under `## Context Requirements`
- **THEN** each subsection SHALL be parseable into a list of entries (node IDs, skill names, file globs)
- **THEN** a placeholder entry like `<configurable — …>` SHALL fail contract parsing with an error naming the skill

#### Scenario: Graph channels checked against contract

- **WHEN** a graph phase's `channels` are validated
- **THEN** every Reference skill and Files entry in the dispatched skill's contract SHALL appear in the phase's `channels`
- **THEN** a missing entry SHALL fail validation as an error (channel deletion is never silent)

#### Scenario: Extra channels flagged as warnings

- **WHEN** a phase declares a `channels` entry that matches no contract subsection and is not an explicit glob
- **THEN** validation SHALL emit a warning naming the phase and the phantom entry

#### Scenario: Fenced contract examples are inert

- **WHEN** a skill's contract example appears inside a ``` code fence
- **THEN** the parser SHALL produce no contract entries from it
- **THEN** validation SHALL neither error on its placeholders nor report the skill as an orphan because of it

### Requirement: Channel type derived from contract, not guesswork

The system SHALL resolve each `channels` entry's type by looking it up in the dispatched skill's contract: entry in the From upstream table → upstream node output; entry in the Reference skills table → skill; entry in the Files table or containing a path separator or glob character → file glob. No fallback search SHALL be applied; an entry matching nothing SHALL be a resolution error. A `node:` channel whose target node's output file does not exist SHALL resolve as a warning with skipped injection — the missing file is a legal temporal state in retry loops, not a configuration error. For an agent phase whose dispatched skill has no contract (review-type skills whose contract is graph-decided), every `channels` entry SHALL carry an explicit `skill:` or `node:` prefix or be a file glob — a bare name SHALL fail validation as an error.

#### Scenario: Entry type determined by contract lookup

- **WHEN** a `channels` entry matches an entry in the skill's From upstream table
- **THEN** it SHALL be resolved as an upstream node output (injected context)
- **WHEN** an entry matches the Reference skills table
- **THEN** it SHALL be resolved as a skill reference
- **WHEN** an entry matches the Files table or is an explicit glob
- **THEN** it SHALL be resolved as file globs

#### Scenario: Unresolvable channel is an error

- **WHEN** a `channels` entry matches no contract subsection, has no explicit `skill:`/`node:` prefix, and is not a glob
- **THEN** resolution SHALL fail with an error naming the entry — no fallback guessing

#### Scenario: Review-type phase channels require explicit prefixes

- **WHEN** an agent phase dispatches a skill with an empty contract (e.g. atom-dual-review, contract graph-decided)
- **THEN** every `channels` entry SHALL be an explicit `skill:<name>`, `node:<nodeId>`, or file glob
- **THEN** a bare-name entry SHALL fail validation with an error stating that review-type channels require explicit prefixes

#### Scenario: Cross-level upstream via explicit node prefix

- **WHEN** a phase consumes an upstream node output that is not a direct `dependsOn` dependency
- **THEN** the phase SHALL declare it with an explicit `node:<nodeId>` prefix in `channels`
- **THEN** a `node:` channel SHALL be valid regardless of the direct-dependency closure

#### Scenario: Missing node output file warns and skips

- **WHEN** a `node:<nodeId>` channel is resolved but `.taskflow/outputs/<runId>/<nodeId>.output.txt` does not exist (e.g. first round of a retry loop)
- **THEN** resolution SHALL emit a warning naming the channel and the missing path
- **THEN** the channel SHALL be skipped (no injection block) and resolution SHALL NOT fail
- **THEN** the phase SHALL proceed with remaining channels and the assembled prompt

### Requirement: Resolver shared between runtime and validation

The system SHALL implement channel resolution as a single pure function module consumed by the runtime assembly path, the contract check path, and the load-time validation path. Coverage checks (forward: contract entries missing from channels) SHALL delegate to the same resolver — no self-implemented path/glob matching in the checker. Both directions SHALL observe identical matching semantics for the same inputs.

#### Scenario: Runtime and validator share resolution

- **WHEN** the runtime assembles a sub-agent prompt from a phase's `channels`, `dependsOn`, and skill contract
- **THEN** it SHALL call the shared resolver module
- **WHEN** the CLI validates a graph's channel declarations
- **THEN** it SHALL call the same shared resolver module
- **THEN** a resolution outcome (error or warning) SHALL be identical in both paths for identical inputs

#### Scenario: Resolution output is deterministic and testable

- **WHEN** the resolver is invoked with the same (channels, dependsOn, contract) triple
- **THEN** it SHALL return the same structured result: upstream blocks, reference blocks, file paths, and aggregated errors
- **THEN** the result SHALL be independently assertable in table-driven tests

#### Scenario: Bidirectional checks share one implementation

- **WHEN** a channel set passes the forward coverage check AND the reverse resolution
- **THEN** both SHALL have used the same matching implementation (resolve-channels)
- **AND** a semantic change to matching (e.g. glob shape) affects both directions identically

### Requirement: Contract parsing ignores code-fenced documentation examples

The system SHALL parse a skill's `## Context Requirements` contract from the document body only — markdown code-fenced blocks (``` delimiters) SHALL NOT contribute contract entries. Documentation examples showing contract syntax inside fences SHALL have no effect on contract parsing, orphan detection, or channel validation. A skill whose only `## Context Requirements` occurrences are inside code fences SHALL be treated as having no contract.

#### Scenario: Fenced examples do not leak into contracts

- **WHEN** a skill's body contains a ```markdown fence that includes a `## Context Requirements` example with placeholder entries
- **THEN** the parser SHALL NOT produce contract entries from those lines
- **WHEN** the skill is otherwise contract-less
- **THEN** validation SHALL treat it as an empty contract — no placeholder errors, no orphan reports

### Requirement: Main contract source — dual track

A main phase's channels SHALL resolve against a contract source chosen by the phase's `skill` field: when the main phase declares `skill`, its `## Context Requirements` section SHALL be the contract (identical path to agent phases); when the main phase declares no `skill`, the contract SHALL be empty and every `channels` entry SHALL be an explicit `skill:`/`node:` prefix or a file glob — a bare name SHALL be a resolution error. The channels field scope SHALL cover `agent` and `main` types.

#### Scenario: Main with skill resolves by contract

- **WHEN** a main phase declares `skill: atom-openspec-archive` and `channels: ["node:apply-change", "skill:atom-graph-spec"]`
- **THEN** each entry SHALL be typed by lookup in that skill's contract — same resolver path as an agent phase
- **THEN** a contract Reference/Files entry missing from `channels` SHALL fail validation as an error

#### Scenario: Main without skill requires explicit prefixes

- **WHEN** a main phase declares no `skill` and a bare-name `channels` entry
- **THEN** resolution SHALL fail with an error stating that contract-less channels require explicit `skill:`/`node:` prefixes or globs
- **WHEN** the same phase uses only `skill:`/`node:`/glob entries
- **THEN** resolution SHALL succeed

#### Scenario: Channels scope covers main in field documentation

- **WHEN** a graph-authoring document describes the `channels` field
- **THEN** its applicability SHALL be stated as `agent, main` — never `agent` only

### Requirement: Main branch inline context injection

The main handler SHALL assemble the phase's context inline before executing the phase task: resolve channels per contract → read `node:`/implicit `dependsOn` upstream outputs as `## Upstream: <nodeId>` blocks → load `skill:` entries as `## Reference:` blocks → resolve globs as `## File:` blocks → prepend the blocks in order (upstream → reference → file → constraints → task) to the task text and execute inline. A `node:` channel whose target output file is missing SHALL warn and skip — never fail — matching the agent-phase retry semantics.

#### Scenario: Main phase receives injected upstream block

- **WHEN** a main phase declares `channels: ["node:writer"]` and the writer output file exists
- **THEN** the inline execution context SHALL contain a `## Upstream: writer` block with the output content
- **THEN** the assembled blocks SHALL precede the phase task in the order upstream → reference → file → constraints → task

#### Scenario: Missing node output warns and skips

- **WHEN** a main phase's `node:` channel target output does not exist (e.g. first round of a retry loop)
- **THEN** assembly SHALL emit a warning naming the channel and the missing path
- **THEN** the channel SHALL be skipped (no injection block) and assembly SHALL NOT fail
- **THEN** the phase SHALL execute with the remaining blocks and the task

#### Scenario: Main phase consumes reference skill

- **WHEN** a main phase declares `channels: ["skill:atom-graph-spec"]`
- **THEN** the inline context SHALL contain a `## Reference` block with the skill content

### Requirement: Validation covers main channels

CLI validate SHALL apply channel validation to main phases with the same strength as agent phases: forward coverage (contract Reference/Files entries present), reverse resolution (bare-name/ghost-entry detection), and contract-less explicit-prefix enforcement. Upstream coverage checks SHALL include main phases' channels and `dependsOn` in the effective dependency set. The field-type assertion SHALL add the `main + preText` error branch.

#### Scenario: Main channel contract gap errors

- **WHEN** a main phase dispatches a skill whose contract lists a Reference/Files entry missing from the phase's `channels`
- **THEN** validate SHALL report an error naming the phase and the missing entry

#### Scenario: Main ghost entry warns

- **WHEN** a main phase declares a `channels` entry matching no contract subsection and not an explicit glob
- **THEN** validate SHALL emit a warning naming the phase and the phantom entry

#### Scenario: Main bare-name without contract errors

- **WHEN** a main phase declares no `skill` and a bare-name `channels` entry
- **THEN** validate SHALL report an error stating that contract-less main channels require explicit prefixes

#### Scenario: Main preText flagged by validate

- **WHEN** validate inspects a main phase declaring `preText`
- **THEN** it SHALL report an error naming the phase and the `preText` field — mirroring the schema-level rejection

### Requirement: Contract validation executes at graph load

Bidirectional scoped-context contract validation (forward coverage + reverse resolution + phantom/redundant warnings) SHALL run as part of the graph loading path — after schema parse and merge-at-load flattening, before the run is dispatched. Violations SHALL fail the load with GraphDefinitionError; warnings SHALL not block loading.

#### Scenario: Deleted channel fails at load

- **WHEN** a graph's phase channel set no longer covers an entry skill contract Reference/Files entry
- **THEN** loading the graph SHALL fail with GraphDefinitionError naming the phase and the missing entry
- **AND** no CLI invocation is required for the check to fire

#### Scenario: Phantom channel warns at load

- **WHEN** a phase declares a channels entry matching no contract subsection and not an explicit glob
- **THEN** loading SHALL succeed
- **AND** the load SHALL surface a warning naming the phase and the unmatched entry

#### Scenario: Existing graphs still load

- **WHEN** the load-time hook is mounted
- **THEN** every built-in graph in the registry SHALL pass contract validation (all-graph smoke)
- **AND** no silent runtime fallback masks a contract breach

### Requirement: Task-text hardcoded output path detection

The contract validation SHALL scan each phase's `task` text for hardcoded runtime output paths (`.taskflow/outputs/`). A match SHALL fail validation as an **error** naming the phase — mirroring the existing when-guard check for the same pattern. Task texts SHALL reference upstream outputs by nodeId name, not by filesystem path.

#### Scenario: Task text hardcodes output path

- **WHEN** a phase's `task` text contains `.taskflow/outputs/`
- **THEN** validation SHALL report an error naming the phase

#### Scenario: Task text references output by nodeId

- **WHEN** a phase's `task` text references upstream output by nodeId name only (no path)
- **THEN** validation SHALL NOT report a hardcoded-path error

### Requirement: Undeclared injection claim detection

The contract validation SHALL scan each phase's `task` text for injection claims — patterns `injected via (node:)?<id>` and `Read <id> output` — and cross-check the referenced nodeIds against the phase's effective input set (`dependsOn` ∪ `node:` channels). A referenced nodeId outside the effective set SHALL produce a **warning** naming the phase and the nodeId.

#### Scenario: Injection claim covered by dependsOn

- **WHEN** a phase's `task` text claims injection of a nodeId listed in its `dependsOn`
- **THEN** validation SHALL NOT report an undeclared-claim warning

#### Scenario: Injection claim covered by node: channel

- **WHEN** a phase's `task` text claims injection of a nodeId listed in its `channels` with `node:` prefix
- **THEN** validation SHALL NOT report an undeclared-claim warning

#### Scenario: Injection claim references undeclared node

- **WHEN** a phase's `task` text claims injection of a nodeId absent from both `dependsOn` and `node:` channels
- **THEN** validation SHALL report a warning naming the phase and nodeId

### Requirement: Declared-inputs doc contract

The graph-authoring documentation (atom-graph-spec §Task Content Rules) SHALL state the declared-inputs contract: task text input references SHALL be covered by `dependsOn` (implicit) or `channels` (explicit); hardcoded output paths SHALL be prohibited; "injected" wording SHALL correspond to declared channels.

#### Scenario: Doc states declared-inputs contract

- **WHEN** a graph author reads the task content rules section
- **THEN** the three declared-inputs rules SHALL be present

### Requirement: Test coverage

The contract validation test suite SHALL include table-driven cases for: hardcoded path → error; undeclared injection claim → warning; covered injection claim → clean.

#### Scenario: Table-driven cases present

- **WHEN** the contract validation tests run
- **THEN** the three case classes SHALL be asserted

### Requirement: Run-scoped node channel resolution

`node:` channel resolution SHALL validate that the target nodeId belongs to the current run's node set (the current run's graph-definition nodes — including all nodes after flow flattening). This validation SHALL be performed by the scheduler at **dispatch time** (NodeDetail construction): a target not in the run node set → warning (naming the channel and the target nodeId) + the channel is stripped (no injection, no failure); validation SHALL complete before the output file is read — residual disk files SHALL NOT be injected. CLI validate SHALL share the same predicate implementation with the runtime (resolve-channels `runScoped`) — the "validate + runtime share one implementation" claim holds. Agent-side execution SHALL NOT rely on the snapshot node set for this check.

#### Scenario: Cross-run stale output not injected

- **WHEN** a standalone graph (e.g. arch-review) resolves a `node:loop-entry` channel while the current run's node set does not contain `loop-entry` (the node exists only in nested composition scenarios)
- **THEN** scheduler dispatch SHALL output a warning naming the channel and the target nodeId
- **AND** the channel SHALL be stripped — even if `.taskflow/outputs/loop-entry.output.txt` remains on disk from a historical run
- **AND** resolution SHALL NOT fail — the remaining channels and the task assemble normally

#### Scenario: Current-run node channel resolves normally

- **WHEN** in a composed graph (e.g. arch-review-loop) the target nodeId of a `node:loop-entry` channel belongs to the current run's node set
- **THEN** resolution SHALL read `.taskflow/outputs/loop-entry.output.txt` as usual and inject a `## Upstream: loop-entry` block
- **AND** when the file is missing, the existing missing-output warning + skip semantics SHALL be preserved

#### Scenario: Flow-propagated channels observe the same scope

- **WHEN** channels reach flow entry child nodes through the two-scope model (ADR 0107 — the four-scope hierarchy and flow-phase channel propagation to entry children are removed) and the target nodeId belongs to the current run's node set
- **THEN** the `node:` channel SHALL resolve normally
- **AND** when the target is not in the current run's node set (running the subgraph standalone) → warning + strip

#### Scenario: CLI validate shares the same predicate

- **WHEN** CLI validate checks graph channel declarations
- **THEN** its run-node-set validation SHALL call the same predicate implementation as runtime dispatch — identical behavior, no second implementation

### Requirement: Judgment context assembly SHALL use the single context pipeline

Gate/approval judgment context SHALL be assembled by the handler through the same pipeline as main: direct dependsOn outputs (`## Upstream:` blocks auto-injected) + `channels` `node:` target outputs + snapshot + run mode + constraints.

#### Scenario: Direct upstream auto-inject

- **WHEN** a gate/approval depends directly on a node whose output its conditions/recommendation reference
- **THEN** that output SHALL be injected automatically — no `reads` declaration (the field no longer exists)

#### Scenario: Cross-level reference via channels

- **WHEN** a gate/approval references a node that is not a direct dependsOn (transitive upstream, flow child, loop origin)
- **THEN** the author SHALL declare `channels: [node:<id>]`; the handler SHALL inject that output; a missing output file SHALL be noted as `<id> has no output` and a condition referencing it evaluates false

### Requirement: Condition-reference scope

Gate jump conditions SHALL reference only node outputs within the judgment-domain formula — scope = direct dependsOn outputs ∪ phase `channels` entries ∪ `node:` streams in the global `context:`; the jump target is referenceable only within the retryCount bound (snapshot data), and output-field references SHALL guide authors to declare `channels: [node:<id>]`. The validator SHALL check that condition-text references fall within this scope (hardcoded `.taskflow/outputs/` paths and sibling-existence judgments SHALL error).

#### Scenario: Condition within scope

- **WHEN** a gate jump condition references a field of a direct dependsOn output, a declared phase `channels` `node:` target, or a global-context promoted stream
- **THEN** validation passes

#### Scenario: Jump target retryCount bound accepted

- **WHEN** a gate jump condition references `<target> retryCount < N` for its own jump target
- **THEN** validation passes — the bound is snapshot data

#### Scenario: Jump target output reference rejected

- **WHEN** a gate jump condition references its jump target's output fields without a `channels: [node:<id>]` declaration
- **THEN** validation SHALL error with the condition text and the missing declaration

#### Scenario: Condition out of scope

- **WHEN** a gate jump condition references an output not covered by the judgment domain formula (or a hardcoded `.taskflow/outputs/` path / sibling-existence judgment)
- **THEN** validation SHALL error with the condition text and the undeclared reference

### Requirement: Gate dependency minimality

Gate SHALL declare leaf dependencies only; cross-level judgment inputs go through `channels` `node:`. The gate dependsOn redundancy exemption SHALL be removed — the transitive redundancy check treats gates and other types alike.

#### Scenario: Redundant gate dependency rejected

- **WHEN** a gate declares a transitive dependency alongside its direct one (leaf rule violation)
- **THEN** contract validation SHALL error naming the redundant dependency

### Requirement: Bidirectional scoped-context contract validation

The graph loading path SHALL cross-check every phase's `channels` against the dispatched entry skill's `## Context Requirements` in both directions. Reference skills and Files entries missing from `channels` SHALL be errors (channel deletion is never silent); `channels` entries matching no contract subsection (and not explicit globs) SHALL be warnings (phantom channels surface); `channels` entries duplicating `dependsOn` node IDs SHALL be warnings (redundant declarations are visible). Validation SHALL run for every load — no manual command required — and SHALL reuse the same channel resolver as the runtime assembly path.

#### Scenario: Missing reference skill fails validation

- **WHEN** an entry skill declares a Reference skill (e.g. `atom-skill-spec`) and the dispatching phase's `channels` omit it
- **THEN** validation SHALL report an error naming the phase, the graph, and the missing entry

#### Scenario: Missing Files entry fails validation

- **WHEN** an entry skill declares a Files entry (e.g. `CONTEXT.md`) and the dispatching phase's `channels` omit it
- **THEN** validation SHALL report an error naming the phase and the missing entry

#### Scenario: Phantom channel warns

- **WHEN** a phase declares a `channels` entry that matches no contract subsection, is not a glob, and has no explicit prefix
- **THEN** validation SHALL emit a warning naming the phase and the phantom entry

#### Scenario: Redundant dependsOn channel warns

- **WHEN** a phase declares a `channels` entry whose nodeId is already in `dependsOn`
- **THEN** validation SHALL emit a redundant-declaration warning naming the entry

#### Scenario: Validation shares resolver with runtime

- **WHEN** the CLI validates a graph and the runtime later executes it
- **THEN** both SHALL use the same resolver module for channel type derivation and error aggregation

#### Scenario: Validation fires without CLI

- **WHEN** any graph loads through the standard loading path
- **THEN** the bidirectional check SHALL have executed
- **AND** results SHALL be identical to the retired CLI validate output for the same graph

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

### Requirement: Load-time validation covers inherited channels

Contract validation at graph load SHALL validate graph-level `context:` entries: the prefix/glob rule (bare name → error) and `node:` target membership in the flattened node set. Config-level entries SHALL be validated at config parse for the prefix/glob rule; config `node:` membership resolves per run — an out-of-run target warns + strips at dispatch (run-scope gate), identical to phase-level semantics. Forward coverage checks (contract Reference/Files entries present in channels) SHALL evaluate against the effective list — an entry satisfied at graph level SHALL NOT be reported missing on the phase. Gate jump conditions SHALL validate against the judgment domain formula: dependsOn ∪ phase channels ∪ global-context `node:` streams ∪ jump targets.

#### Scenario: Graph-level entry satisfies forward coverage

- **WHEN** a graph declares top-level `context: ["./CONTEXT.md"]` and a phase dispatches a skill whose contract lists `./CONTEXT.md`
- **THEN** the phase's forward coverage check SHALL pass without a phase-level declaration

#### Scenario: Invalid graph-level entry fails load

- **WHEN** a graph declares top-level `context: ["node:ghost-phase"]` where `ghost-phase` is not in the flattened set
- **THEN** loading SHALL fail with GraphDefinitionError naming the entry

#### Scenario: Gate condition satisfied by global stream

- **WHEN** a gate jump condition references a node promoted via graph `context:`
- **THEN** validation SHALL accept the reference without a phase-level `channels` declaration

### Requirement: Run-scoped output streams

Node output streams SHALL be scoped per run: `.taskflow/outputs/<runId>/<nodeId>.output.txt`. Channel resolution and upstream injection SHALL read through the run's own directory — stale outputs from other runs are invisible by construction. The un-scoped `.taskflow/outputs/<nodeId>.output.txt` form SHALL NOT be the canonical convention (standalone-dispatch fallback only, with a warning).

#### Scenario: Upstream blocks read run-scoped paths

- **WHEN** a node's upstream `node:` channel output is injected
- **THEN** the read path SHALL be `.taskflow/outputs/<runId>/<nodeId>.output.txt`

#### Scenario: Stale outputs never inject

- **WHEN** a new run dispatches a node whose name matches an old run's node
- **THEN** the old run's output SHALL NOT be readable via the new run's output path

### Requirement: Tier validation at load — convention / project / graph

The system SHALL validate channel declarations against the three tiers at graph load: (a) convention layer entries SHALL be exact file paths from the fixed set (`CONTEXT.md`, `docs/domains.md`) — anything else rejected; (b) config project layer entries SHALL exist — exact-file missing -> load error, glob zero-match -> warning; (c) graph/phase file globs SHALL target workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`) — anything else is a load error. Tier validation SHALL run in the shared load-time validation path (graph load + graph_init health), never only at dispatch.

#### Scenario: Graph glob outside workflow namespaces

- **WHEN** a graph channel entry is a file glob not under `.graph-scheduler/` or `.taskflow/`
- **THEN** load SHALL fail with a tier violation error naming the entry and its legal alternatives

#### Scenario: Convention layer entry invalid

- **WHEN** a convention layer entry is a glob or directory class (e.g. `docs/adr/**`)
- **THEN** configuration validation SHALL reject it

#### Scenario: Tier check runs at load and graph_init

- **WHEN** `graph_init` health runs
- **THEN** it SHALL report tier violations for every registered graph — same implementation as load-time validation

### Requirement: Effective-merge includes convention and project layers

Coverage checks (forward: contract references/files ⊆ channels; reverse: channel resolution) SHALL evaluate the effective channel list including the convention layer and the config project layer — not only graph context and phase channels. A contract Files entry satisfied by the convention layer or config layer SHALL NOT be reported missing.

#### Scenario: Skill Files covered by convention layer

- **WHEN** a skill contract declares `CONTEXT.md` and no graph/phase channel covers it
- **THEN** the forward coverage check SHALL pass (convention layer coverage)

#### Scenario: Skill Files covered by project layer

- **WHEN** a skill contract declares `openspec/specs/` and config.json declares `openspec/specs/**/*.md`
- **THEN** the forward coverage check SHALL pass (project layer coverage)
