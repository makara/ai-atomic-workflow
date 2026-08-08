# atom-graph-spec Specification

## Purpose

Reference for the `.taskflow.yaml` format. Assets: `packages/graph-workflow/skills/atom-graph-spec/SKILL.md`.

## Requirements

### Requirement: atom-graph-spec — taskflow.yaml format reference

`atom-graph-spec` SHALL define the authoritative reference for the `.taskflow.yaml` graph format. It SHALL specify the `PhaseSchema`, topology rules (dependsOn, gate jumps, join modes), channel declarations, and approval routing configuration. Approval routing SHALL document that approval phases depend on a single review-convergence node, and that retry/jump actions declare explicit targets. The reference SHALL document the scoped-context terminology: context contract (skill `## Context Requirements`), context channels (graph `channels` field), and injected context (assembled prompt blocks) — and SHALL instruct graph authors to derive `channels` from the dispatched skill's contract. The reference SHALL NOT list the removed `preText`/`reads` fields (schema field convergence — loud rejection with migration hints). Main phases MAY declare an optional `operations:` field — closed-set members of the High-Level Tool Registry (atom-mcp-contract §HLT Registry) — overriding/complementing the dispatched skill's `Operation classes` default; unknown class names SHALL fail graph load with loud rejection; absent field SHALL mean "use the skill's default classes".

#### Scenario: Spec defines PhaseSchema fields

- **WHEN** an agent loads `atom-graph-spec`
- **THEN** it SHALL receive the complete field reference: `id`, `type`, `dependsOn`, `route`, `agent`, `skill`, `channels`, `task`, `routing`, `jumps`, `join`, `use`, `operations`
- **THEN** it SHALL receive field descriptions, types, defaults, and constraints
- **THEN** it SHALL NOT list `preText` or `reads` as declarable fields (removed — loud rejection with migration hints)
- **THEN** it SHALL document that `join` accepts only the literal `any` (absent = all; explicit `all` rejected)
- **THEN** it SHALL document that gate/approval `channels` accept only `node:` entries and that approval `task` is the full card prompt

#### Scenario: Spec defines topology rules

- **WHEN** agent references topology rules
- **THEN** `dependsOn` SHALL describe upstream phase IDs this phase waits for (scheduling only — direct dependsOn outputs auto-inject)
- **THEN** `join` SHALL define dependency resolution: absent = all (every dep), `any` (one dep sufficient — branch-route convergence only, upstreams span ≥2 routes)
- **THEN** `channels` SHALL define context delivery for all phase types — main resolved against the dispatched skill's `## Context Requirements` contract and injected into the prompt; gate/approval `node:`-only judgment context

#### Scenario: Spec defines channel declaration rules

- **WHEN** agent authors a main phase's `channels`
- **THEN** the spec SHALL instruct deriving entries from the dispatched skill's contract: From upstream node IDs (via `node:` prefix when not a direct dependency), Reference skill names (via `skill:` prefix or bare contract name), and Files globs
- **THEN** the spec SHALL state that a channel duplicating a `dependsOn` node is redundant and will warn
- **WHEN** agent authors a gate/approval phase's `channels`
- **THEN** the spec SHALL instruct `node:`-only entries (judgment context = node outputs)

#### Scenario: Spec defines approval routing config

- **WHEN** agent references approval routing
- **THEN** `routing.actions` SHALL define decision options: `action` (continue|retry|jump|end), `label`, `description`, and `target`
- **THEN** `target` SHALL be required for `retry` and `jump` actions — routing targets SHALL be explicit, never inferred from `dependsOn` order (deprecated fallback)

#### Scenario: Spec documents approval dependency rule

- **WHEN** agent authors an approval phase
- **THEN** the spec SHALL instruct that `dependsOn` contains exactly the review-convergence node, never the writer phases the review already joins over

#### Scenario: Phase declares operations

- **WHEN** a main phase declares `operations: [locate, edit, verify]`
- **THEN** the field SHALL be valid in the schema
- **AND** the dispatched NodeDetail SHALL carry the declaration for the handler

#### Scenario: Operations absent uses skill default

- **WHEN** a main phase declares no `operations:`
- **THEN** the dispatched node's class set SHALL default to the skill's `Operation classes` subsection
- **AND** the phase SHALL NOT be a validation error

#### Scenario: Unknown class rejected at load

- **WHEN** a phase declares an `operations:` value outside the closed set
- **THEN** graph load SHALL fail with an error naming the phase and the unknown class

#### Scenario: Operations is main-type only

- **WHEN** a non-main phase (approval/gate/flow) declares `operations:`
- **THEN** graph load SHALL reject it — operation classes declare the phase's HLT Registry classes, a main-type execution concern

### Requirement: Task content rules (Task Content Spec)

atom-graph-spec §Language Constraints SHALL be extended with a full §Task Content Spec covering: (1) mandatory task structure — directive → phase-local invariants → `Output contract:` field list for main phases; approval tasks header + decision topic + phase-local criteria only; (2) skill dedup deletion test — task text SHALL NOT restate dispatched-skill protocol, handler-default card mechanics, or injection mechanics; (3) comment topology-intent-only rule — one-line comments stating structural purpose, no prose narration or doc references; (4) canonical output-contract spelling — exactly `Output contract:` prefix, no alternates; (5) no injection-mechanics wording — tasks name consumed fields, never files or mechanisms. The existing three task-text rules (input references covered, no `.taskflow/outputs/` hardcodes, injected wording matches channels) SHALL remain.

#### Scenario: Spec section present

- **WHEN** atom-graph-spec is loaded
- **THEN** it contains a §Task Content Spec section stating the five rules above
- **AND** the existing input-declaration hygiene rules remain intact

#### Scenario: Graph set conforms

- **WHEN** a built-in graph task is validated against the spec
- **THEN** it follows the mandatory structure, passes the dedup deletion test, and uses the canonical output-contract spelling

### Requirement: Graph top-level description field

The graph schema SHALL accept a top-level `description` free-text field. Its content SHALL focus on the graph's purpose/effect — one line stating what the graph does/produces. It SHALL be optional, non-enumerated, and carry no behavior branching: it is identity metadata for display, never a machine-consumed directive.

#### Scenario: Description field parses

- **WHEN** a graph declares `description: "Maker journey — produces .taskflow.yaml graphs"`
- **THEN** the graph SHALL load and the description SHALL be carried in graph_start responses

#### Scenario: Missing description is legal

- **WHEN** a graph omits `description`
- **THEN** the graph SHALL load normally

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

### Requirement: Output stream isolation by run

Node output streams SHALL be scoped per run: `.taskflow/outputs/<runId>/<nodeId>.output.txt`. A run's dispatches read/write within its own directory — stale outputs from other runs are invisible by construction. Cross-run output collisions SHALL NOT occur.

#### Scenario: Outputs land in run-scoped directory

- **WHEN** a node writes its output file
- **THEN** the file SHALL be at `.taskflow/outputs/<runId>/<nodeId>.output.txt`

#### Scenario: Stale outputs never inject

- **WHEN** a new run dispatches a node whose name matches an old run's node
- **THEN** the old run's output SHALL NOT be readable via the new run's output path

### Requirement: graph_init SHALL NOT be misused as graph-YAML validation

`graph_init` SHALL remain a config/DB health check — it SHALL NOT be referenced by graph tasks as a graph-YAML validator. Produced-graph validation SHALL be a real load probe: `graph_start` the produced graph, expect a node return + zero contractWarnings, then `graph_force_end` to clean up the probe run.

#### Scenario: Implement phase validates by load probe

- **WHEN** a maker-journey implement phase validates the produced graph
- **THEN** it SHALL call `graph_start` on the produced graph (expect node + 0 contractWarnings), then `graph_force_end`
- **AND** it SHALL NOT claim graph_init validates the graph YAML

#### Scenario: Probe run cleaned up

- **WHEN** the load probe completes
- **THEN** the probe run SHALL be force-ended (or cleaned via graph_clean_completed) — no probe residue in the run DB

### Requirement: Duplicate YAML example single-sited

The Gate+Approval YAML example SHALL exist exactly once, in §Gate+Approval Pair Pattern.

#### Scenario: single YAML example

Given the atom-graph-spec skill file When a reviewer searches for the Gate+Approval YAML example Then it appears exactly once, in §Gate+Approval Pair Pattern, and §Auto-Rework rules reference it by pointer

### Requirement: Loop-router sections merged

The arch-review-loop description SHALL appear exactly once, in §Loop Router Pattern; the §Loop Router Integration section content is folded in.

#### Scenario: single loop-router description

Given the atom-graph-spec skill file When a reviewer searches for the arch-review-loop loop-router description Then it appears exactly once, in §Loop Router Pattern

### Requirement: No why-narrative rationales

Spec prose SHALL NOT contain author-intent Rationale passages — why-content belongs in ADRs.

#### Scenario: rationales normative or gone

Given packages/graph-workflow/skills/atom-graph-spec/SKILL.md When searching for "Rationale:" prose passages outside code blocks Then none remain (converted to normative rules or deleted)

### Requirement: body thesis sentence

The atom-graph-spec SKILL.md body SHALL open with a one-sentence thesis after the `# Atom-Graph-Spec` heading, before consumer/priority/invocation content. The thesis states the skill's purpose — reference for the .taskflow.yaml graph format (PhaseSchema, topology, gates, joins, channels, approval routing, run mode).

#### Scenario: graph-spec opens with thesis

- **WHEN** reading atom-graph-spec SKILL.md after the frontmatter
- **THEN** the body SHALL contain exactly one thesis sentence in the opening (why the skill exists)
- **THEN** the thesis SHALL appear before the Intended-consumers / Priority / Invocation / Reference-layout blocks

#### Scenario: no length-band regression

- **WHEN** the thesis sentence is added
- **THEN** the atom-graph-spec SKILL.md body word count SHALL stay ≤1,500 (reference band ≤1,000 when applied)

### Requirement: Language Convention Deferral

atom-graph-spec §Language Constraints SHALL NOT mandate a specific language for graph YAML values, task content, or gate jump conditions / approval recommendation criteria. Language choice SHALL defer to the consuming project's language conventions (project instructions / constraints). Structural rules remain in force: lowercase field names, kebab-case phase IDs, plain skill names, no hardcoded output paths, references to observable facts.

#### Scenario: No language mandate

- **WHEN** an agent consults graph-spec language constraints
- **THEN** no specific language is mandated - the consuming project's conventions decide

#### Scenario: Structural rules retained

- **WHEN** writing graph YAML or task text
- **THEN** lowercase field names, kebab-case phase IDs, plain skill names, no hardcoded paths, and observable-fact references remain required

### Requirement: Channel declaration tiers — graph file globs restricted

The `atom-graph-spec` format reference SHALL state the three-tier channel declaration rule: graph top-level `context:` and phase `channels:` SHALL carry `node:` stream references, `skill:` references, and file globs under workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`) only. Convention files (`CONTEXT.md`, `docs/domains.md`) are supplied by the platform convention layer (default-loaded, absence-tolerant) — graphs SHALL NOT declare them. Project-owned file globs (`docs/adr/*.md`, `openspec/specs/**`, `openspec/changes/**`, `docs/domains.md`, `CONTEXT.md` when the project declares it) SHALL be declared in `.graph-scheduler/config.json` `context:` (project layer), never in shipped graphs. The format reference SHALL document the tier rule and the config-layer escape hatch so graph authors declare project layout where it belongs.

#### Scenario: Format reference documents tiers

- **WHEN** a graph author reads the channel field documentation
- **THEN** it SHALL state: shipped graphs declare no project file globs; conventions arrive automatically; project layout goes to config.json

#### Scenario: Convention channel not hand-declared

- **WHEN** a graph author considers adding `./CONTEXT.md` to graph context
- **THEN** the reference SHALL direct them to the convention layer (no declaration needed)
