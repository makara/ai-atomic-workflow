# channels-context-model Specification

## Purpose

Defines the two-scope context model: a graph-level global channel (`context:`) for ambient context and node-named channels for data flow, replacing the four-level scope hierarchy.

## Requirements

### Requirement: Global channel — graph `context:` and config default layer

The graph definition SHALL declare a top-level `context:` list (the global channel): `skill:<name>` references and `node:<id>` stream promotions. `.graph-scheduler/config.json` SHALL declare `context:` as the project default layer. A phase's effective ambient context SHALL be the deterministic union of the convention layer (`CONTEXT.md`, `docs/domains.md` — exact files, default-loaded, absence-tolerant), the config project layer, and the graph `context:` list, deduplicated by exact string — a single deterministic computation, identical for every phase, materialized at dispatch (no per-phase inheritance logic). Every phase of the run SHALL receive the global channel, injected in the fixed block order. File globs SHALL NOT appear in graph `context:` — graph-level file channels SHALL be limited to workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`); convention and project files arrive via the convention layer and config default layer respectively. The four-level scope hierarchy (project → graph → flow → phase additive merge at dispatch) SHALL NOT exist.

#### Scenario: Global channel injected into every phase

- **WHEN** a graph declares `context: ["skill:atom-graph-spec"]` and a phase declares no phase-level channels
- **THEN** the phase's dispatched context SHALL contain `skill:atom-graph-spec` plus the convention layer (`CONTEXT.md`, `docs/domains.md`) as ambient blocks

#### Scenario: Config default layer merges deterministically

- **WHEN** `.graph-scheduler/config.json` declares `context: ["docs/adr/*.md"]` and the graph declares `context: ["node:requirement/arch-review"]`
- **THEN** the effective global channel SHALL be the convention layer, then `docs/adr/*.md`, then `node:requirement/arch-review` — deduplicated, identical for every phase
- **THEN** no per-phase inheritance or scope-resolution logic SHALL exist — one deterministic merge

#### Scenario: Graph file glob rejected

- **WHEN** a graph declares `context: ["docs/adr/*.md"]`
- **THEN** load SHALL fail — graph-level file channels are restricted to workflow runtime artifacts

#### Scenario: Flow composition inherits the parent global channel

- **WHEN** a flow phase composes a child graph
- **THEN** every flattened child phase SHALL receive the parent graph's global channel — no flow-level channels propagation mechanism SHALL exist

### Requirement: Node channels — output streams and read edges

A node's report (its output-contract payload) is produced and consumed in the executing agent's session (platform-persisted) — it is not a scheduler-owned record and is not delivered with dispatch. A phase SHALL declare reads of non-`dependsOn` reports via phase-level `channels: [node:<id>]` — a read edge without scheduling implication. `dependsOn` SHALL remain the scheduling edge and SHALL imply an upstream read; a `node:` entry duplicating a `dependsOn` target SHALL be a redundant-declaration warning, never an error. Channel entries declare WHICH upstream context a node consumes; the handler assembles that context from the agent session. Outputs SHALL NOT be files and SHALL NOT be scheduler state.

#### Scenario: Cross-level stream read

- **WHEN** a phase consumes a node report that is not a direct `dependsOn` dependency
- **THEN** the phase SHALL declare `channels: [node:<id>]`
- **THEN** the report SHALL be assembled as an upstream block exactly like a direct dependency output (from the agent session)

#### Scenario: Redundant read edge warns

- **WHEN** a phase declares `channels: [node:X]` while X is already in its `dependsOn`
- **THEN** validation SHALL emit a redundant-declaration warning naming the entry
- **THEN** loading SHALL succeed

#### Scenario: No file path in channel semantics

- **WHEN** channel resolution identifies an upstream report
- **THEN** no `.taskflow/outputs/…` path SHALL be read, referenced, or validated
- **AND** the dispatch payload SHALL NOT carry the report text — content comes from the agent session

### Requirement: Uniform phase channels — one rule for all types

Phase-level `channels` SHALL accept all entry kinds (`node:<id>`, `skill:<name>`, file globs) for main, approval, and gate phases alike — no per-type restrictions, no full-type-inheritance carve-outs. Resolution SHALL follow one path: explicit prefix wins, then contract-table lookup, then glob shape, then error. The former `node:`-only restriction on approval/gate and its repeal (full-type inheritance) SHALL both be gone — there is a single rule, not a rule plus an exception.

#### Scenario: Gate declares skill entry

- **WHEN** a gate phase declares `channels: ["skill:atom-graph-spec"]` alongside its `jumps`
- **THEN** schema parsing SHALL accept the phase and the entry SHALL resolve as a reference block — identical to a main phase

#### Scenario: Approval declares file glob

- **WHEN** an approval phase declares `channels: ["./notes.md"]`
- **THEN** schema parsing SHALL accept the phase and the entry SHALL resolve as a file block — identical to a main phase

#### Scenario: Bare name fails identically everywhere

- **WHEN** any phase type declares a bare-name channel entry matching no contract table and no glob shape
- **THEN** resolution SHALL fail with the same error wording for main, approval, and gate

### Requirement: Promotion — node streams into the global channel

A graph SHALL lift a node stream into the global channel by declaring `context: [..., node:<id>]`. A promoted stream SHALL be injected into every phase's ambient context, with one exception: the owning node itself SHALL NOT receive its own promoted stream (self-read is undefined, never injected). Promotion SHALL be the only write mechanism — nodes produce their own output stream; nothing appends to another node's stream.

#### Scenario: Promoted stream reaches all phases

- **WHEN** a graph declares `context: [node:requirement/arch-review]` and a downstream gate declares no channels
- **THEN** the gate's judgment context SHALL include the arch-review output as an ambient upstream block

#### Scenario: Owned node skips its own promoted stream

- **WHEN** the owning node `requirement/arch-review` is dispatched
- **THEN** its own promoted stream SHALL NOT be injected — no self-reference, no stale-round output injection

#### Scenario: Missing promoted output degrades

- **WHEN** a promoted stream's output file does not exist (first round of a retry loop)
- **THEN** the stream SHALL warn and skip for the dispatching phase, never fail

### Requirement: Single judgment-domain formula

The gate/approval judgment context SHALL be assembled by one formula shared by dispatch and load-time validation: direct dependsOn outputs ∪ phase `channels` entries ∪ global-context `node:` streams. A gate jump target SHALL be in scope for its retryCount bound only (snapshot data — always present at evaluation); a condition referencing a jump target's output fields SHALL be a load-time error directing the author to declare `channels: [node:<id>]`. A gate jump condition SHALL reference only nodes in that formula's node set; a reference outside it SHALL be a load-time error naming the phase and the node.

#### Scenario: Condition references global-channel stream

- **WHEN** a gate jump condition references a node promoted via graph `context:`
- **THEN** validation SHALL accept the reference without a phase-level `channels` declaration

#### Scenario: Jump target referenced beyond its retryCount bound

- **WHEN** a gate jump condition mentions its own jump target in an output-field context (not a `<target> retryCount` bound)
- **THEN** validation SHALL error naming the phase, the node, and the missing `channels: [node:<id>]` declaration

#### Scenario: Jump target retryCount bound accepted

- **WHEN** a gate jump condition references `<target> retryCount < N` for its own jump target
- **THEN** validation SHALL accept the reference — the bound is snapshot data, always present at evaluation

#### Scenario: Condition out of scope errors

- **WHEN** a gate jump condition references a node outside dependsOn, phase channels, and global-context node streams (and not a jump-target retryCount bound)
- **THEN** validation SHALL error naming the phase, the node, and the missing declaration

#### Scenario: Validator and dispatch agree

- **WHEN** a graph passes load-time validation
- **THEN** dispatch SHALL inject exactly the context the validation formula admitted — one implementation, no divergence

### Requirement: Scope-hierarchy machinery removed

The following SHALL NOT exist: `mergeChannelScopes` with more than two scopes (config defaults + graph `context:`), flow-phase channels propagation to entry children (flow input interface), the additive outer-first per-phase merge, and graph-level entry validation special cases tied to the four-level hierarchy. Removal SHALL be a breaking change: graphs declaring flow-level `channels` SHALL fail loudly with a migration hint (move entries to graph `context:` or phase `channels:`).

#### Scenario: Flow channels rejected loudly

- **WHEN** a flow phase declares `channels:`
- **THEN** schema parsing SHALL fail with an error naming the flow and suggesting `context:` or phase-level `channels:`

#### Scenario: Removed machinery has no residue

- **WHEN** the graph-scheduler module loads
- **THEN** no four-scope merge, flow-propagation, or per-type channel validation code SHALL be reachable in the load, dispatch, or validation paths

#### Scenario: All built-in graphs migrate

- **WHEN** every built-in graph is loaded after the change
- **THEN** each SHALL validate with the two-scope model (config default layer + graph `context:` + phase `channels:`), no legacy declarations remaining

### Requirement: Convention layer — exact files, default-loaded, absence-tolerant

The system SHALL maintain a platform convention layer: exactly two entries — `CONTEXT.md` and `docs/domains.md` — as exact file paths (no directory-class entries, no glob entries). The convention layer SHALL be default-loaded into every phase's effective ambient context. Absence-tolerance SHALL apply: a missing convention file SHALL degrade to an empty block plus a warning — never a load failure, never a dispatch failure (mirror of prologue output degradation).

#### Scenario: Conventions present — ambient injection

- **WHEN** the project has `CONTEXT.md` and `docs/domains.md`
- **THEN** both SHALL be injected into every phase's ambient context as file blocks

#### Scenario: Convention absent — degrade, never fail

- **WHEN** a project has no `CONTEXT.md` (foreign project, fresh scaffold)
- **THEN** the run SHALL start normally, the CONTEXT.md block SHALL be empty, and a warning SHALL be emitted

#### Scenario: Directory-class and glob entries rejected

- **WHEN** a convention layer entry is not an exact file path (e.g. `docs/adr/`, `docs/adr/**`, `openspec/specs/**/*.md`)
- **THEN** the entry SHALL be rejected at configuration validation

### Requirement: Project layer — config.json context, existence-validated

`.graph-scheduler/config.json` `context:` SHALL be the project layer: project-declared layout entries (file globs and exact paths). Existence semantics SHALL be: a glob entry matching zero files SHALL warn (empty set legal — lazy document creation); an exact-file entry that does not exist SHALL be a load error (the project declared a file it does not have).

#### Scenario: Project glob matches nothing

- **WHEN** config.json declares `context: ["docs/adr/*.md"]` and no ADR records exist yet
- **THEN** the run SHALL start with a warning and an empty ADR block — lazy creation remains legal

#### Scenario: Project exact file missing

- **WHEN** config.json declares `context: ["docs/estate/index.md"]` and the file does not exist
- **THEN** graph load SHALL fail with a load error naming the missing file

### Requirement: Graph channels — node:/skill:/workflow artifacts only

File globs SHALL be banned from graph top-level `context:` and phase `channels:` in shipped graphs. Graph-declared channels SHALL be limited to `node:` stream references, `skill:` references, and workflow runtime artifact paths under `.graph-scheduler/` and `.taskflow/`. A graph-declared file glob outside those workflow namespaces SHALL be a load-time error.

#### Scenario: Workflow artifact glob legal

- **WHEN** a graph declares a channel under `.graph-scheduler/` or `.taskflow/`
- **THEN** load SHALL accept it (workflow-owned namespaces are always valid)

### Requirement: Effective merge — convention, project, graph, phase

A phase's effective ambient context SHALL be the deterministic union of the convention layer, the config project layer, the graph `context:` list, and the phase `channels:` list — deduplicated by exact string, in that order. Coverage checks (forward: skill contract Files ⊆ channels) SHALL evaluate the effective list including convention and project layers.

#### Scenario: Coverage satisfied by convention layer

- **WHEN** a skill contract declares `CONTEXT.md` in Files and the graph declares no matching channel
- **THEN** the forward coverage check SHALL pass — the convention layer covers it

#### Scenario: Coverage satisfied by project layer

- **WHEN** a skill contract declares `docs/adr/` in Files and config.json declares `docs/adr/*.md`
- **THEN** the forward coverage check SHALL pass — the project layer covers it
