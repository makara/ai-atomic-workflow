# arch-review Specification

## Purpose

Single-round architecture review (scope→report). Asset: `packages/graph-scheduler/graphs/arch-review.taskflow.yaml`; output: `docs/reports/`.

This domain currently has no registered behavioral-contract requirement; new contracts are added via the OpenSpec change workflow.

## Requirements

### Requirement: arch-review — requirement generation graph

`arch-review` SHALL be an independently executable requirement production graph: `scope-entry` (interview input node, skill: atom-scope-interview, in-degree 0, topics: domain/feature/problem + focus + output path + report_input fresh|existing) → producer stage → `review-accept` (approval terminal: Continue → requirement ready; Loop again → retry scope-entry; End → end action).

The producer stage SHALL consist of THREE main phases (replacing the single `arch-review` producer node):

1. `explore` — skill improve-codebase-architecture (Step 1: scope-before-scan, hot-spot walk, sub-agent codebase walk, friction notes), operations [locate, read], agent hints [explore, scout, task, general]; emits `explore_digest` (friction points / candidate areas).
2. `first-principles` — skill first-principles (Steps 1–4: identify problem + current assumptions; break down to fundamental truths (law vs convention); find atomic components; reason up from fundamentals), operations [read]; consumes the explore output via `node:` stream; emits `principles_output` (assumption list / law-vs-convention table / atomic components / rebuilt solution design).
3. `present-candidates` — skill improve-codebase-architecture (Step 2: Present candidates), operations [write, review]; consumes explore + first-principles outputs via `node:` streams; Problems and Solutions SHALL be built from the first-principles output (assumption–fact gap → problems; atomic-component recombination → solutions); writes the markdown (NOT HTML) report at the confirmed `report_path`; emits the output contract (report_path, round, implemented, new_findings, top_rec, top_rec_remaining, summary).

Intermediate outputs (explore_digest, principles_output) SHALL travel as session streams via `node:` channels — never written to files (ADR 0143).

Report-input behavior (unchanged semantics, now owned by the producer stage): fresh → write markdown report at `report_path`; existing (round ≥ 2) → read report at `report_path` (single source of truth), mark implementation progress per Top Rec item (evidence-backed), update report in place, increment round marker. Round ≥ 2 entry re-confirmation and verification-scope proposal rules (previous round scope never re-proposed verbatim) preserved.

#### Scenario: Standalone requirement run

- **WHEN** arch-review runs standalone (fresh review)
- **THEN** scope-entry interviews (scope + output path explicit confirm), the producer stage runs explore → first-principles → present-candidates, report written at `report_path`, review-accept decides: requirement ready → graph completes report artifact — no adoption stage runs

#### Scenario: Loop-again round

- **WHEN** review-accept chooses Loop again
- **THEN** round re-enters at scope-entry — scope report_input re-confirmed (ADR 0075 D1 semantics preserved); in loop composition adopt stage re-runs downstream adoption stage

#### Scenario: Composed loop promotion points at the producer terminal

- **WHEN** arch-review composes into arch-review-loop (requirement stage)
- **THEN** the loop's ambient report stream and gate conditions reference the producer terminal (`requirement/present-candidates`) — flow composition auto-follows the child terminal node; adopt stage activates after the producer completes

### Requirement: review-machinery SHALL NOT exist

The review-machinery standalone graph SHALL be deleted — its single `arch-review` node inlines into arch-review. No graph SHALL reference review-machinery in a flow `use:`.

#### Scenario: No review-machinery reference remains

- **WHEN** a validator scans all built-in graphs for flow `use:` targets
- **THEN** review-machinery SHALL NOT appear
- **AND** the registry SHALL contain 10 graphs, review-machinery absent

### Requirement: Report-input semantics

The arch-review node SHALL keep the report-input semantics: `report_input: fresh` writes a new report at the confirmed path; `report_input: fresh` with an existing file at `report_path` (round ≥ 2) transitions to re-review; `report_input: existing` re-reads the report and updates it in place. The round marker SHALL increment. When a report already exists (`report_input: existing`, or the previous round's arch-review output shows `round >= 1`) and the user gives no explicit new scope, the entry SHALL propose a scope that verifies the actual implementation results against the report (evidence-backed) and surfaces new problems — the prior round's scope SHALL NOT be re-proposed verbatim.

#### Scenario: Round ≥ 2 updates in place

- **WHEN** the report file already exists at report_path
- **THEN** arch-review reads it, marks implementation progress per Top Rec item, updates it in place, and increments the round marker

#### Scenario: Existing report without new scope proposes verification

- **WHEN** a report already exists (report_input: existing, or the previous round shows round >= 1) and the user gives no explicit new scope
- **THEN** the entry SHALL propose the verification scope — check actual implementation results against the report (evidence-backed) and surface new problems
- **AND** the prior round's scope SHALL NOT be re-proposed verbatim
