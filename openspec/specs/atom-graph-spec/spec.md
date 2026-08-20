# atom-graph-spec Specification

## Purpose

Reference for the workflow graph format (`.yaml`). Assets: `packages/graph-workflow/skills/atom-graph-spec/SKILL.md`.

## Requirements

### Requirement: atom-graph-spec — workflow graph format reference

MODIFIED: the PhaseSchema field table restores the `agent` row (peer-level advisory sub-agent type preferences on main phases — priority-ordered, fallback platform default); `execution` remains absent from the field table; the dispatch NodeDetail surface documents the restored `agent` field and still documents no `position` / `executionMode`; the composition clause documents `use` as compile-time nesting with namespaced member dispatch (no execution-mode options) and states composing phases SHALL NOT declare `agent`. PHASESCHEMA/ROUTING section content synced to the restored surface.

#### Scenario: Field table excludes removed keys

- **WHEN** the PhaseSchema field table is read
- **THEN** `execution` SHALL be absent, and the dispatch surface SHALL not document `position` / `executionMode`
- **AND** `agent` SHALL be present — documented as advisory priority-ordered sub-agent type preferences for main phases (fallback platform default)

#### Scenario: Use composition documented natively

- **WHEN** the composition clause is read
- **THEN** `use` SHALL be documented as compile-time subgraph nesting (namespaced member ids, same-loop dispatch) with no execution-mode options
- **AND** composing (`use`) phases SHALL be documented as not declaring `agent`

#### Scenario: PHASESCHEMA documents the template field

- **WHEN** the PhaseSchema field table is read
- **THEN** the `template` row SHALL be present — closed enum (`startup`), mutually exclusive with `use` and `task`, requires empty `dependsOn` (template nodes are graph entries)

#### Scenario: Startup-template usage documented

- **WHEN** a reader consults atom-graph-spec for graph startup behavior
- **THEN** the reference SHALL document that a graph declaring `template: startup` on its entry runs the heavy startup steps (constraints session load, serena activation, jcodemunch indexing) as its first node
- **AND** graphs without it start bare — the pilot never runs the heavy steps on its own (subgraph agent deletion retained)

### Requirement: Task content rules (Task Content Spec)

atom-graph-spec §Language Constraints SHALL be extended with a full §Task Content Spec covering: (1) mandatory task structure — directive → phase-local invariants → `Output contract:` field list for main phases; approval tasks header + decision topic + phase-local criteria only; (2) skill dedup deletion test — task text SHALL NOT restate dispatched-skill protocol, handler-default card mechanics, or injection mechanics; (3) comment topology-intent-only rule — one-line comments stating structural purpose, no prose narration or doc references; (4) canonical output-contract spelling — exactly `Output contract:` prefix, no alternates; (5) no injection-mechanics wording — tasks name consumed fields, never files or mechanisms. The existing three task-text rules SHALL remain in updated form: input references covered; no runtime output-path hardcodes (the `.taskflow/outputs/` rule is removed with the path itself — runtime output paths no longer exist; ordinary document paths remain legal content); injected wording matches channels.

#### Scenario: Spec section present

- **WHEN** atom-graph-spec is loaded
- **THEN** it contains a §Task Content Spec section stating the five rules above
- **AND** the existing input-declaration hygiene rules remain intact

#### Scenario: Graph set conforms

- **WHEN** a built-in graph task is validated against the spec
- **THEN** it follows the mandatory structure, passes the dedup deletion test, and uses the canonical output-contract spelling

### Requirement: Graph top-level description field

MODIFIED: the graph schema SHALL accept a top-level `description` free-text field. Its content SHALL focus on the graph's purpose/effect — one line stating what the graph does/produces; it is the catalog single source (ADR 0235). It SHALL be optional, non-enumerated, and carry no behavior branching: it is identity metadata for display, never a machine-consumed directive. The reference SHALL direct authors to keep the description to a concise intent statement — the graph topology is declared in `phases` + `flow` + `inventory`, not restated in the description (F2 self-description dedup, ADR 0244). Header comments and per-phase comments duplicating the description SHALL NOT be written.

#### Scenario: Description field parses

- **WHEN** a graph declares `description: "Maker journey — produces workflow YAML graphs"`
- **THEN** the graph SHALL load and the description SHALL be carried in graph_start responses

#### Scenario: Missing description is legal

- **WHEN** a graph omits `description`
- **THEN** the graph SHALL load normally

#### Scenario: Description guidance concise

- **WHEN** a graph author reads the description field documentation
- **THEN** it SHALL direct a concise intent statement (catalog single source) and state that topology restatement belongs in `phases` / `flow` / `inventory` — no duplicate self-description

### Requirement: Skill contract drives spec-channel derivation

Phases whose work consumes a spec skill SHALL declare the executing `skill:` (e.g. spec → `atom-graph-design`, implement → `atom-graph-writer`); the skill's `## Context Requirements` reference tables SHALL derive the phase's spec channels (`skill:atom-graph-spec`) deterministically. Graph-level `context:` remains the ambient fallback layer (dual-track: skill contract + graph context). Task text SHALL NOT restate protocol steps present in the skill (Skill Dedup Deletion Test) — a phase with a declared skill SHALL keep task text to Directive + output contract.

#### Scenario: Skill declaration derives spec channel

- **WHEN** a phase declares `skill: atom-graph-design` (whose contract lists `atom-graph-spec` as reference)
- **THEN** `skill:atom-graph-spec` SHALL resolve from the contract without a per-phase channel declaration

#### Scenario: Task text stays lean

- **WHEN** a main phase declares a skill
- **THEN** its task SHALL NOT repeat the skill's protocol steps (interview mechanics, spec research steps)

### Requirement: Sub-agent reference inheritance

When a main phase dispatches sub-agents (e.g. code-review axis agents), the injected `## Reference:` blocks SHALL be forwarded into the sub-agent context (task() context or a local:// handoff file) — sub-agents SHALL NOT self-discover reference skills that the parent phase already received. Spec skills are resolved once, shared down the tree.

#### Scenario: Reviewer sub-agents receive the spec

- **WHEN** a review phase (channel `skill:atom-graph-spec`) dispatches review sub-agents
- **THEN** each sub-agent's context SHALL include the spec content (forwarded reference)
- **AND** no sub-agent SHALL read the spec skill file from disk

### Requirement: graph_init SHALL NOT be misused as graph-YAML validation

`graph_init` SHALL remain a config/DB health check — it SHALL NOT be referenced by graph tasks as a graph-YAML validator. Produced-graph validation SHALL be a real load probe: `graph_start` the produced graph, expect a node return (engine machine validation passes), then `graph_force_end` to clean up the probe run.

#### Scenario: Implement phase validates by load probe

- **WHEN** a maker-journey implement phase validates the produced graph
- **THEN** it SHALL call `graph_start` on the produced graph (expect a node return — machine validation), then `graph_force_end`
- **AND** it SHALL NOT claim graph_init validates the graph YAML

#### Scenario: Probe run cleaned up

- **WHEN** the load probe completes
- **THEN** the probe run SHALL be force-ended (or cleaned via graph_clean_completed) — no probe residue in the run DB

### Requirement: Duplicate YAML example single-sited

The gate/approval YAML example no longer exists — both node types were removed (ADR 0215/0216). YAML examples cover main/flow phases and decision nodes only; each example SHALL exist exactly once.

#### Scenario: single YAML example

- **WHEN** a reviewer searches for a YAML example in the atom-graph-spec skill file
- **THEN** each example appears exactly once, in its single home section, and other sections reference it by pointer

### Requirement: Loop-router sections merged

The arch-review-loop description SHALL appear exactly once, in §Loop Router Pattern; the §Loop Router Integration section content is folded in.

#### Scenario: single loop-router description

Given the atom-graph-spec skill file When a reviewer searches for the arch-review-loop loop-router description Then it appears exactly once, in §Loop Router Pattern

### Requirement: No why-narrative rationales

Spec prose SHALL NOT contain author-intent Rationale passages — why-content belongs in ADRs.

#### Scenario: rationales normative or gone

Given packages/graph-workflow/skills/atom-graph-spec/SKILL.md When searching for "Rationale:" prose passages outside code blocks Then none remain (converted to normative rules or deleted)

### Requirement: body thesis sentence

The atom-graph-spec SKILL.md body SHALL open with a one-sentence thesis after the `# Atom-Graph-Spec` heading, before consumer/priority/invocation content. The thesis states the skill's purpose — reference for the workflow YAML graph format (PhaseSchema, topology, joins, channels, `$schema`/`version` self-description headers, main/flow phase types — gate/approval/run-mode removed, ADR 0215/0216).

#### Scenario: graph-spec opens with thesis

- **WHEN** reading atom-graph-spec SKILL.md after the frontmatter
- **THEN** the body SHALL contain exactly one thesis sentence in the opening (why the skill exists)
- **THEN** the thesis SHALL appear before the Intended-consumers / Priority / Invocation / Reference-layout blocks

#### Scenario: no length-band regression

- **WHEN** the thesis sentence is adjusted
- **THEN** the atom-graph-spec SKILL.md body word count SHALL stay within the reference band

### Requirement: Language Convention Deferral

atom-graph-spec §Language Constraints SHALL NOT mandate a specific language for graph YAML values, task content, or rework condition criteria (the gate jump conditions / approval recommendation criteria wording is removed — gate/approval types are deleted, ADR 0215/0216). Language choice SHALL defer to the consuming project's language conventions (project instructions / constraints). Structural rules remain in force: lowercase field names, kebab-case phase IDs, plain skill names, no hardcoded output paths, references to observable facts.

#### Scenario: No language mandate

- **WHEN** a graph YAML or task content uses a language different from English
- **THEN** atom-graph-spec SHALL NOT reject it — language choice defers to the project's conventions

#### Scenario: Structural rules retained

- **WHEN** any graph YAML is authored
- **THEN** structural rules remain in force (lowercase field names, kebab-case phase IDs, plain skill names, no hardcoded output paths) regardless of language

### Requirement: Channel declaration tiers — graph file globs restricted

MODIFIED: the `atom-graph-spec` format reference SHALL state the three-tier channel declaration rule: graph top-level `context:` and phase `channels:` SHALL carry `node:` stream references, `skill:` references, and file globs under workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`) only. Convention files (`CONTEXT.md`, `docs/domains.md`) are supplied by the platform convention layer (default-loaded, absence-tolerant) — graphs SHALL NOT declare them. Project-owned file globs (`docs/adr/*.md`, `openspec/specs/**`, `openspec/changes/**`, `docs/domains.md`, `CONTEXT.md` when the project declares it) SHALL be declared in `.graph-scheduler/config.json` `context:` (project layer), never in shipped graphs. **The workflow-artifact glob example in the PHASESCHEMA Files contract table updates from `.graph-scheduler/docs/x.md` to a two-path surface (e.g. `.graph-scheduler/graphs/x.yaml`)** — the attached-doc mechanism is deleted (ADR 0244 D3), `.graph-scheduler/docs/` no longer exists; the glob namespace rule itself is unchanged (`.graph-scheduler/` remains a valid workflow-artifact root).

#### Scenario: Format reference documents tiers

- **WHEN** a graph author reads the channel field documentation
- **THEN** it SHALL state: shipped graphs declare no project file globs; conventions arrive automatically; project layout goes to config.json

#### Scenario: Convention channel not hand-declared

- **WHEN** a graph author considers adding `./CONTEXT.md` to graph context
- **THEN** the reference SHALL direct them to the convention layer (no declaration needed)

#### Scenario: Workflow-artifact glob example two-path

- **WHEN** the PHASESCHEMA Files contract table is read
- **THEN** the workflow-artifact glob example SHALL reference a two-path surface (e.g. `.graph-scheduler/graphs/x.yaml`) — no `.graph-scheduler/docs/` example remains

### Requirement: PHASESCHEMA holds declaration content only

PHASESCHEMA.md SHALL define YAML schema fields, YAML rules, task content spec, and channel declarations; it SHALL NOT restate runtime path conventions or sub-agent reference inheritance (owned by atom-phase-handler CONTEXT-ASSEMBLY.md).

#### Scenario: Runtime convention located once

- **WHEN** a consumer needs the run stream path or reference inheritance rules
- **THEN** they resolve to CONTEXT-ASSEMBLY.md; PHASESCHEMA.md holds no duplicate wording

### Requirement: ROUTING holds semantics without user-layer restatements

ROUTING.md SHALL define topology, rework decisions, completion, routes, and decision policy; it SHALL NOT restate run-mode semantics (removed, ADR 0215) or default decision-card composition (owned by atom-phase-handler DECISION-CARDS.md).

#### Scenario: Run mode defined at two fixed sites

- **WHEN** a consumer reads ROUTING.md for run-mode semantics
- **THEN** it finds none — run mode is removed (ADR 0215); no site defines run-mode semantics, and ROUTING SHALL NOT restate them

### Requirement: retryCount single counter name

The node retry counter SHALL be named `retryCount` throughout the schema (auto-supplied field, jump rules, rework conditions); `retryAttempt` SHALL NOT be used as a second name for the same counter.

#### Scenario: Counter name consistent

- **WHEN** scanning NODE-SCHEMA.md §Base Fields and atom-graph-spec for the field
- **THEN** every site names `retryCount` (snapshot `retryCount` remains the rework-bound counter)

### Requirement: Contract entry annotation grammar documented

The Context Requirements Convention SHALL document the list-entry annotation grammar: entries in `### From upstream` / `### Reference skills` / `### Files` MAY carry a trailing parenthetical annotation (`- <value> ( <annotation> )`); the annotation is prose, stripped at parse, never part of the matched value. Graph authors deriving `channels` from a skill contract SHALL derive from the stripped value.

#### Scenario: Annotation grammar in the reference

- **WHEN** a graph author reads the Context Requirements Convention section
- **THEN** it SHALL state that parenthetical annotations on contract entries are prose — stripped at parse, excluded from matching

#### Scenario: Channel derivation uses stripped value

- **WHEN** a skill contract entry reads `- ./CONTEXT.md (project glossary)`
- **THEN** channel derivation SHALL match the stripped value `./CONTEXT.md`, not the annotated string

### Requirement: Convention layer is implicit coverage, never an obligation

The Context Requirements Convention SHALL state that convention-layer files (`DEFAULT_CONVENTIONS`: `./CONTEXT.md`, `docs/domains.md`) are platform-shipped, default-loaded into every phase, and absence-tolerant — they are implicit coverage, not per-skill contract obligations. Skills MAY declare them, omit them, or annotate them; graphs SHALL NOT declare them (convention layer supplies them).

#### Scenario: Convention files exempt from obligation

- **WHEN** a graph author checks whether a skill must declare `./CONTEXT.md` in `### Files`
- **THEN** the reference SHALL state it is not required — the convention layer guarantees delivery

#### Scenario: Graphs never declare conventions

- **WHEN** a graph author considers a `./CONTEXT.md` channel
- **THEN** the reference SHALL direct them to the convention layer (no declaration needed)

### Requirement: Family Rule Single Homes

The graph-spec family SHALL hold each shared rule at exactly one authoritative site, all other files pointerize (ADR 0141): default-card composition at ROUTING.md §Approval Decision Confirmation; join-mode rejection at ROUTING.md §Join Mode Rules; three-tier channel model at PHASESCHEMA.md §YAML channels Field; removed-field history at PHASESCHEMA §Gate Type.

#### Scenario: Card composition single-sited

- **WHEN** scanning atom-graph-spec SKILL.md §Routing Rules Summary and PHASESCHEMA §Approval Routing Actions for the default-card definition
- **THEN** each carries only a pointer to ROUTING.md §Approval Decision Confirmation — no restated card composition

#### Scenario: Join rejection single-sited

- **WHEN** scanning atom-graph-spec SKILL.md §Join Mode and PHASESCHEMA §Phase Fields join row
- **THEN** each points to ROUTING.md §Join Mode Rules — the `z.literal('any')` + schema-rejection detail lives once

#### Scenario: Three-tier model single-sited

- **WHEN** scanning setup-atomic-workflow SKILL.md §Three-tier channel model
- **THEN** it carries a 2-3 line user-facing summary + pointer to PHASESCHEMA.md §YAML channels Field — no re-derived tier mechanics

#### Scenario: Removed-field history single-sited

- **WHEN** scanning PHASESCHEMA for the removed preText/reads note
- **THEN** it appears once (at §Gate Type) — the §YAML channels Field duplicate is absent

### Requirement: Upstream delivery by run state

Upstream reports (direct dependsOn + `node:` channels) SHALL be delivered to the executing agent via its own session — the agent produced them earlier in the run (platform-persisted; platform history addressing restores after compaction). The scheduler SHALL NOT store or deliver output content — dispatch carries channel declarations only. PHASESCHEMA SHALL document the delivery form (session assembly, `## Upstream:` blocks) and SHALL NOT carry any `.taskflow/outputs/` path format. Channel resolution on a run-scope gate is scheduler-side for declarations: out-of-run channel targets are stripped at dispatch (the scheduler never holds content, so no stale content can leak).

#### Scenario: Dispatch carries upstream outputs

- **WHEN** a node is dispatched with completed upstreams
- **THEN** the dispatch SHALL carry the channel/dependsOn declarations
- **AND** the handler SHALL assemble `## Upstream:` blocks from the agent session — no payload content, no file reads

### Requirement: Inventory field in format reference

The workflow graph format reference (atom-graph-spec) SHALL document the top-level `inventory` field: the dedicated schema key for the node overview table (the term "atom" SHALL NOT name the key), the entry shape `{ id, type, goal, constraints? }` (no `skill` field — the phase-level `skill` field is the single source; a legacy `skill` key is ignored), the bounded-compound goal syntax (connectors AND / THEN / IF-ELSE / OR — structural keywords SHALL be ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), distinct from ordinary prose `and`/`or`; conditional phrases use IF; ordinary nodes ≤ 5 steps; gates ≤ 3 AND/OR operands, retryCount bound not counted; conditional paths ≤ 3; bounds are convention, user-calibratable) with **mechanism-in-goal** guidance (skill-bound main nodes name the executing skill in verb form, flow entries state "expands <use> subgraph", approval/gate entries carry decision semantics), the optional `constraints` array (one-sentence prose rules; ≤ 5 entries per atom, convention bound; general rules prefer positive framing, explicit non-goals state the negation directly; prose only — no structural keywords, no new word-list members), the zero-validation-axis clause for `goal`/`constraints` content, validation-warning semantics (id-exists + type-match only), flow rule, and ownership rule.

#### Scenario: Format reference covers inventory

- **WHEN** a reader consults the format reference for the `inventory` key
- **THEN** entry shape `{ id, type, goal, constraints? }`, bound syntax, case discipline, mechanism-in-goal guidance, constraints semantics (rules + explicit non-goals, ≤ 5 bound, prose-only), validation-warning semantics, flow rule, and ownership rule are all documented

#### Scenario: No skill field documented

- **WHEN** a reader consults the format reference for the inventory entry fields
- **THEN** the `skill` field is not documented as an entry field; the phase-level `skill` field is named as the single source and a legacy `skill` key is stated as ignored

#### Scenario: Structural keywords ALL-CAPS

- **WHEN** the format reference states the bounded-compound goal syntax
- **THEN** structural keywords are written ALL-CAPS (AND / OR / IF / THEN / ELSE), conditional phrases use IF, and prose `and`/`or` are distinguished as lowercase; the LLM-produced compliance obligation and the user-hand-written exemption are stated

#### Scenario: Constraints documented as prose

- **WHEN** the format reference documents the `constraints` array
- **THEN** it states one-sentence prose rules, the ≤ 5 entry bound, positive framing preference, direct negation for explicit non-goals, and that no structural keyword or machine validation applies

### Requirement: Graph-level constraints in format reference

The workflow graph format reference (atom-graph-spec) SHALL document the top-level `constraints` field: optional string array at the same level as `inventory`, prose one-sentence rules (general boundaries + explicit non-goals), ≤10 entries per graph (convention bound, calibratable), zero machine validation axis. PHASESCHEMA SHALL carry the field row; ROUTING §Constraint Layering SHALL state the three-layer constraint chain (project `[project]` environment layer / graph `[graph]` content layer — both injected, merged block format with 2 KB cap and lang/git dedup / inventory entry-level doc-only, never injected) as the single home for the layering semantics; the phase-level removed-field wording SHALL name both graph-level and project-level sources.

#### Scenario: PHASESCHEMA documents the field

- **WHEN** a graph author reads PHASESCHEMA for the top-level field set
- **THEN** `constraints` appears with its shape, bound convention, and zero-axis clause

#### Scenario: ROUTING single home for layering

- **WHEN** a reader consults ROUTING §Constraint Layering
- **THEN** the three-layer chain (project/graph/entry-level) with prefixes, merged block format, cap, dedup, and conflict preservation is stated there — and handler-side docs only pointer to it

### Requirement: Constraint Layering composition and snapshot clauses

atom-graph-spec ROUTING §Constraint Layering SHALL state two clauses (single home — the format reference is the canonical rule owner):

1. **Composition clause** — the graph layer covers the composed surface: subgraph top-level constraints union into the composed graph's graph layer (symmetric with the inventory use-chain union, ADR 0183); root entries first, subgraph entries in composition order, all `[graph]`-prefixed.
2. **Dispatch-time snapshot clause** — graph-layer constraints are read from the current graph definition at each dispatch; mid-run graph-file edits change subsequent dispatches' `[graph]` entries; the project layer is frozen at activation. No run-record freezing exists.

#### Scenario: Format reference states the composition clause

- **WHEN** a graph author reads ROUTING §Constraint Layering
- **THEN** the section states that composed subgraphs' top-level constraints join the graph layer as a union with the root's entries

#### Scenario: Format reference states the snapshot semantics

- **WHEN** a graph author reads ROUTING §Constraint Layering
- **THEN** the section states the dispatch-time snapshot semantics for graph-layer constraints and the activation-frozen semantics for the project layer — no hidden consistency assumption remains

### Requirement: PHASESCHEMA documents the top-level constraints field row

atom-graph-spec PHASESCHEMA SHALL carry the top-level `constraints` field row (shape `z.array(z.string()).optional()`, ≤10 entries per graph convention bound, zero machine validation axis, `[graph]`-prefixed machine injection) alongside the `inventory` row — the field is a declared schema member, never silently passthrough-ignored.

#### Scenario: Field row present in PHASESCHEMA

- **WHEN** a graph author reads PHASESCHEMA's top-level field table
- **THEN** the `constraints` row is present with shape, bound, validation axis, and injection semantics

#### Scenario: Existing graphs without the field stay valid

- **WHEN** a graph declares no top-level `constraints`
- **THEN** the field row documents the absent-field behavior (empty set — no warning, no error)

### Requirement: Run completion rule in format reference body

The atom-graph-spec main body SHALL state the run completion rule directly (not only via ROUTING.md delegation): runs complete by natural drain — `graph_advance` returns `node: null` with fsmState `completed`; completion is a drain, never a marker phase; `graph_force_end` terminates a run (`terminated`, unfinished nodes aborted); no endRun parameter exists on `graph_advance` (removed, ADR 0215); routing actions SHALL NOT include `end`. ROUTING.md keeps the detailed semantics; the main body carries the one-line rule.

#### Scenario: Completion rule visible in main body

- **WHEN** a consumer reads atom-graph-spec/SKILL.md main body
- **THEN** the natural-drain completion rule (node: null → completed; force_end → terminated; no endRun) is stated directly without following the ROUTING.md pointer

#### Scenario: ROUTING keeps detail home

- **WHEN** a consumer needs the full completion semantics
- **THEN** ROUTING.md remains the detailed home and the main body references it

### Requirement: Canonical top-level key order documented

The atom-graph-spec format reference (PHASESCHEMA.md §Top-Level Fields) SHALL document the canonical top-level key order: `flow` SHALL be declared before `inventory`, `constraints` SHALL be declared after `inventory` (canonical: `name → description → $schema → version → interaction → flow → inventory → constraints → context → phases`). The field table SHALL note the layout so authored graphs follow it.

#### Scenario: Format reference documents the layout

- **WHEN** an author consults PHASESCHEMA.md §Top-Level Fields
- **THEN** the section SHALL state that `flow` precedes `inventory` and `constraints` follows `inventory`

### Requirement: Flow compliance documented in the format reference

The atom-graph-spec format reference (PHASESCHEMA §Flow Transitions) SHALL document: (1) the compliance guarantee — the flow subset grammar is a strict subset of the mermaid flowchart grammar, every edge form the engine accepts parses under the real mermaid parser; (2) the compliance check — builtin graphs are verified by the suite regression test (real mermaid parser, dev axis), project graphs are verified at load time with a non-conformant block surfacing as a load-time problem (never a load failure); (3) authoring guidance — flow edges SHALL be written in mermaid-valid subset form (`A --> B` unlabeled, `A -->|label| B` labeled, self-edges for loops; chained edges are mermaid-valid but outside the engine subset and SHALL NOT be authored).

#### Scenario: Authoring guidance states the subset boundary

- **WHEN** an author reads PHASESCHEMA §Flow Transitions to write a flow block
- **THEN** the reference states the compliance guarantee, the two-track check, and the authoring rule (subset forms only — chained edges SHALL NOT be authored)
