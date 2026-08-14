# arch-review-loop Specification

## Purpose

Closed-loop review + implementation (entry → review → implement → loop-gate). Assets: `packages/graph-scheduler/graphs/arch-review-loop.taskflow.yaml`; output `docs/reports/`.

## Requirements

### Requirement: Report Output Convention

arch-review's scope-entry phase SHALL recommend `docs/reports/<YYYY-MM-DD>-arch-review-<topic>.md` (date-prefix naming) and enforce explicit confirmation.

#### Scenario: Date-prefix recommended and confirmed once

- **WHEN** scope-entry runs the interview
- **THEN** the recommended path uses a date prefix (not a suffix) — located under `docs/reports/`
- **AND** the output path MUST pass explicit user confirmation (the recommended value may be overridden)
- **AND** once confirmed, it is applied — the path is not asked again within the closed-loop cycle

### Requirement: Loop composition — input stage + machinery

arch-review-loop SHALL be a three-stage composition: requirement (flow arch-review, dependsOn [] — the requirement production chain: scope-entry → arch-review report → review-accept) → adopt (flow adopt-with-docs, dependsOn [requirement], channels node:requirement/arch-review — the report is the adopt stage's input document) → implement (flow spec-implement, dependsOn [adopt], channels node:adopt/spec-propose + node:adopt/adopting — the produced change and the adoption record) → loop-gate → loop-accept. The top-level grill flow SHALL NOT exist; the top-level review flow id SHALL NOT exist; grill-inside-arch-review composition SHALL NOT exist (ADR 0099). The top-level loop-entry id SHALL NOT exist — its role merges into requirement/scope-entry (the requirement stage's input node). The stage id `refine` SHALL NOT exist (renamed `adopt`).

#### Scenario: Loop round re-confirms scope

- **WHEN** a backward reset targets requirement/scope-entry (loop-gate branchTo)
- **THEN** the whole input stage SHALL reset and re-acquire — mode re-confirmed, constraints re-loaded, scope re-confirmed (per-round semantics, ADR 0075 D1 preserved as the general rule's corollary); the producer re-runs and the adopt stage re-runs as its downstream stage

#### Scenario: No scope-entry echo

- **WHEN** the loop's requirement stage executes
- **THEN** the arch-review node SHALL read the entry output directly — no echo node exists

#### Scenario: Grill decision stage runs serially each round

- **WHEN** arch-review-loop activates (run start or loop jump-back)
- **THEN** requirement/scope-entry SHALL run first, then the producer (arch-review report), then adopt/adopting (adoption conversation, serial after production) — consensus + ADR offers produced after the report
- **AND** the adoption record SHALL flow into spec-extract via the implement flow's channels (node:adopt/spec-propose + node:adopt/adopting)

#### Scenario: Three stages run in order

- **WHEN** a loop round activates
- **THEN** requirement production completes first, the adopt stage confirms the produced report and materializes the change, and only then the implement stage activates

### Requirement: Report-driven implementation

The loop's implement stage SHALL be the spec-implement flow reading the produced change and the adoption record (channels node:adopt/spec-propose + node:adopt/adopting): change scope + ADR judgment — adr_created ECHOES the adoption record's decision (existence check, never re-derivation); no interview, no input-source detection, no spec generation.

#### Scenario: Auto mode advances with report scope

- **WHEN** the loop runs in auto mode with a report Top Rec remaining
- **THEN** the implement stage SHALL advance without any interview — spec-extract emits scope from the produced change, approvals auto-execute

#### Scenario: ADR judgment reaches the track gate

- **WHEN** the adoption record carries adr_created: true
- **THEN** spec-extract SHALL echo it and the pipeline-accept recommendation SHALL select the detailed track
- **AND** an implementation SHALL NOT reach the minimal track while a decision was recorded and not yet archived as an ADR

### Requirement: Single-loop semantics

arch-review-loop SHALL implement exactly ONE loop: after the implement flow completes, `loop-gate` re-enters the requirement stage — jump condition `run mode is auto AND requirement/arch-review output shows top_rec_remaining: true AND requirement/scope-entry retryCount < 8` → `requirement/scope-entry` (input-stage reset: mode re-confirmed, constraints re-loaded, scope re-confirmed; the round re-reviews implementation evidence and re-runs adopt + implement). A failed implementation is covered by the same condition (the report's top_rec_remaining is untouched mid-round). The `implement-loop-gate` node SHALL NOT exist in the pipeline; no inner/outer tier language SHALL appear in graph comments or task text. Ending the loop is always a human decision (loop-accept; auto mode ends when no Top Rec remains or the bound is exhausted).

#### Scenario: Loop re-enters after failed implementation

- **WHEN** the implement stage completes with archive not succeeded and the report still shows top_rec_remaining: true (auto mode, bound not exhausted)
- **THEN** loop-gate SHALL jump to requirement/scope-entry — the round re-reviews implementation evidence, re-adopts, re-proposes, re-implements

#### Scenario: Loop closes

- **WHEN** the round bound is exhausted (requirement/scope-entry retryCount ≥ 8) or a content round completes with no re-loop
- **THEN** loop-accept SHALL present the round-end decision (Loop again / Complete); auto mode ends automatically when ending is the recommendation
- **AND** the no-Top-Rec case is NOT this scenario — it ends at the round-continue content gate (see Empty-round short-circuit)

#### Scenario: Closed-loop invocation with existing report

- **WHEN** arch-review-loop or arch-review starts with report_input: existing
- **THEN** the entry SHALL confirm the report path exists, read its Top Rec, and never re-confirm the path afterwards — per-round scope confirmation applies to the review topic only

### Requirement: Empty-round short-circuit via round-continue content gate

`arch-review-loop` SHALL gate the adopt and implement stages behind a `round-continue` approval that declares branch-route routing — `continue` (target: `proceed` route) and `end` (declared action). The `adopt` and `implement` flows SHALL declare `route: proceed`; unselected-route members SHALL never activate.

#### Scenario: Empty round ends at the content gate

- **WHEN** the review report shows no remaining Top Recommendation (top_rec_remaining: false)
- **THEN** `round-continue` SHALL recommend `end` (auto mode executes; manual mode confirms once)
- **AND** adopt/implement route members SHALL remain pending — never activated

#### Scenario: Content round proceeds via route

- **WHEN** the review report shows a remaining Top Recommendation (top_rec_remaining: true)
- **THEN** `round-continue` continue SHALL branchTo the `proceed` route, activating adopt + implement
- **AND** child-declared routes (minimal-track / detailed-track) SHALL coexist with `proceed` (child route wins over flow propagation)

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
