# arch-review-loop Specification

## Purpose

Closed-loop review + implementation (entry → review → implement → loop-gate). Assets: `packages/graph-scheduler/graphs/arch-review-loop.yaml`; output `docs/reports/`.

## Requirements

### Requirement: Report Output Convention

arch-review's scope-entry phase SHALL recommend `docs/reports/<YYYY-MM-DD>-arch-review-<topic>.md` (date-prefix naming) and enforce explicit confirmation.

#### Scenario: Date-prefix recommended and confirmed once

- **WHEN** scope-entry runs the interview
- **THEN** the recommended path uses a date prefix (not a suffix) — located under `docs/reports/`
- **AND** the output path MUST pass explicit user confirmation (the recommended value may be overridden)
- **AND** once confirmed, it is applied — the path is not asked again within the closed-loop cycle

### Requirement: Loop composition — input stage + machinery

MODIFIED: arch-review-loop SHALL be a three-stage flow with framework-hosted interactive entry/acceptance, expressed with `template: router` single-path nodes (subgraph composition via `use` is deleted — every stage graph runs as a sibling run launched by the frontend): requirement (framework-owned `startup` (main, `template: startup` — graph entry, full startup) → `scope-entry` (main, atom-scope-interview, dependsOn [startup]) → router node `template: router` with `template_args.paths: [arch-review]` (single candidate — auto-selects, launches the arch-review graph as a sibling run, passes the report path + requirement input via `graph_start` args, collects its handoff report) → the requirement accept loop is caller-declared on the same router node (`template_args.questions` — revise re-enters via the flow self-edge, accept exits the sequence) → `adopting` (main, grilling — the grilling consensus IS the adoption confirmation; the adoption goal + trace intent are confirmed in the grilling first-round frontier, absorbing the deleted adopt-scope interview, ADR 0247) → `adopt` (router `paths: [adopt-with-docs]`) → `implement` (router `paths: [spec-implement]`) → `round-report` (re-review + report fold-back) → re-entry loop (flow self-edge `round-report -->|remaining| scope-entry`, bounded). The adopt-scope phase is removed (adopt-scope-and-handler-blocks, ADR 0247): the adoption goal is the round scope + the accepted report's Top Recommendation, already confirmed by scope-entry and the requirement accept loop.

#### Scenario: Loop round re-confirms scope

- **WHEN** a backward reset targets the framework `scope-entry` (flow condition re-entry)
- **THEN** the whole input stage SHALL reset and re-acquire — constraints re-loaded, scope re-confirmed (per-round semantics, ADR 0075 D1 preserved); the arch-review sibling re-runs and the adopt stage re-runs as its downstream stage

#### Scenario: No scope-entry echo

- **WHEN** the loop's requirement stage executes
- **THEN** the framework scope-entry output SHALL feed the arch-review sibling directly (passed via `graph_start` args) — no echo node exists

#### Scenario: Grill decision stage runs serially each round

- **WHEN** arch-review-loop activates (run start or loop jump-back)
- **THEN** framework requirement/scope-entry SHALL run first, then the arch-review sibling run (report), then the requirement accept loop on the router node, then the framework adopt-stage interactive nodes (adoption conversation, serial after production) — consensus + ADR offers produced after the report
- **AND** the adoption record SHALL flow into the spec-implement sibling via the implement router's `graph_start` args

#### Scenario: Three stages run in order

- **WHEN** a loop round activates
- **THEN** requirement production completes first, the adopt stage confirms the produced report and materializes the change, and only then the implement stage activates

#### Scenario: Shared chain single-sourced

- **WHEN** the graph's shared-chain nodes are read
- **THEN** their task text SHALL reference the parameterized template content (`template: scope-entry` / `template: adopting`) — not byte-duplicated from `first-principles-dev`, and no `template: adopt-scope` declaration exists

#### Scenario: Stage activation is the sibling run

- **WHEN** a stage router node executes
- **THEN** the selected graph SHALL run as a sibling run (`graph_start` → drive to `node: null` → collect handoff result)
- **AND** the router SHALL NOT activate composing phases and SHALL NOT pass `branchTo` — every stage graph is standalone

#### Scenario: Subgraph declaration does not constrain the framework

- **WHEN** graph-maintain audits `arch-review-loop`
- **THEN** the framework's own interactive nodes (scope-entry, requirement accept loop, adopt-stage hosting) SHALL NOT be flagged — the framework is `enabled`; stage graphs are standalone siblings whose `interaction: none` declarations constrain only their own files (no declaration propagates — composition is deleted)

#### Scenario: Framework chain runs without accept nodes

- **WHEN** the arch-review-loop graph runs
- **THEN** the executed chain SHALL NOT contain review-accept / adopt-accept / adopt-scope phases; the requirement node SHALL present the accept/revise prompt and the revise choice SHALL re-enter the requirement node (flow self-edge), the accept choice SHALL proceed directly to adopting (no adopt-scope phase between)

#### Scenario: Requirement accept loop bounded

- **WHEN** the revise condition is reported on the requirement node
- **THEN** the requirement node SHALL re-enter with retryCount incremented (never zeroed); the loop bound SHALL be the graph constraints prose + retryCount (agent-enforced)

#### Scenario: Adoption goal confirmed by grilling

- **WHEN** the adopting node executes after requirement accept
- **THEN** the grilling first-round frontier SHALL include the adoption-goal topics (idea_goal + doc_trace_intent) confirmed by the user — no separate adopt-scope interview exists

### Requirement: Report-driven implementation

MODIFIED: the loop's implement stage SHALL be the spec-implement graph launched as a sibling run by the implement router node, receiving the produced change and the adoption record via `graph_start` args (change name + adr_created + decisions echo): change scope + ADR judgment — adr_created ECHOES the adoption record's decision (existence check, never re-derivation); no interview, no input-source detection, no spec generation. The adoption stage SHALL reuse the existing stage graphs via router launches: `adopt` (router `paths: [adopt-with-docs]`) then `implement` (router `paths: [spec-implement]`), activated serially after the framework-hosted adoption interaction (`adopting` — the grilling consensus IS the acceptance; adopt-scope and the accept nodes are deleted, ADR 0247). The "Auto mode advances with report scope" scenario keeps its historical name; its content confirms no auto execution (run mode is deleted, ADR 0215).

#### Scenario: Auto mode advances with report scope

- **WHEN** a round has a report Top Recommendation remaining
- **THEN** the implement stage SHALL advance — spec-extract emits scope from the produced change, with no interview and no auto-execution (run mode is deleted, ADR 0215)

#### Scenario: ADR judgment reaches the track gate

- **WHEN** the implement stage completes
- **THEN** the adr_created judgment from the adoption record SHALL reach the track gate — existence check, never re-derivation (delivered via `graph_start` args, echoed by spec-extract)

#### Scenario: Adoption activates without a separate adopt-scope node

- **WHEN** the adopting node completes with a non-empty change_name
- **THEN** the adopt router SHALL activate directly (no adopt-scope or adopt-accept phase between); the adoption consensus echo (change_name + adr_created + decisions) SHALL pass via graph_start args

### Requirement: Improver journey entry point

When a repo owner improves built-in graphs or project-owned skills, the entry point SHALL be `arch-review-loop` (requirement → adopt → implement). Skill production (create + edit) SHALL flow through the same journey via the openspec change mechanism — no standalone skill production graph exists.

#### Scenario: Improver journey resolves to arch-review-loop

- **WHEN** a repo owner improves a built-in graph or a project-owned skill
- **THEN** arch-review-loop SHALL be the entry point, and the implementation stage SHALL load spec skills per the change's affected domains

### Requirement: Open Recommendations carry-over

arch-review-loop reports SHALL maintain an Open Recommendations state block at the report tail — a pending list of un-adopted Top Recommendations, each entry referencing its round, the recommendation summary, and its status (pending | adopted | declined | implemented). The present-candidates phase SHALL update the block on every round: adopted/declined entries leave the pending list, implemented entries are marked, and a new Top Recommendation that is not immediately adopted is added as pending. The scope-entry phase SHALL read the block and fold every pending entry into the new round's verification scope — un-adopted recommendations are never silently dropped across rounds.

#### Scenario: Pending recommendation carried into the next round

- **WHEN** a new round's scope-entry runs and the report tail carries pending Open Recommendations entries
- **THEN** the round's scope covers verification of each pending entry (evidence-backed), and the report update marks each verified entry with its outcome

#### Scenario: Pending recommendation dropped by adoption

- **WHEN** a recommendation is adopted (adopt stage completes) or declined by the user
- **THEN** the block entry is removed from the pending list (marked adopted/declined), and later rounds no longer carry it forward

#### Scenario: Fresh report starts with an empty block

- **WHEN** a fresh report is created (report_input fresh, no prior round)
- **THEN** the report tail contains an empty Open Recommendations block (no pending entries), and scope-entry treats the absence of pending entries as an empty list
