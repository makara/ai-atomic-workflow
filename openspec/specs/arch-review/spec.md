# arch-review Specification

## Purpose

Single-round architecture review (scope→report). Asset: `packages/graph-scheduler/graphs/arch-review.taskflow.yaml`; output: `docs/reports/`.

This domain currently has no registered behavioral-contract requirement; new contracts are added via the OpenSpec change workflow.

## Requirements

### Requirement: arch-review — requirement generation graph

arch-review SHALL be the independently executable requirement production graph: `scope-entry` (interview input node, skill: atom-scope-interview, in-degree 0, topics: domain/feature/problem + focus + output path + report_input fresh|existing) → `arch-review` (main, skill improve-codebase-architecture — the producer, dependsOn: [scope-entry]) → `review-accept` (approval terminal: Continue → requirement ready; Loop again → retry scope-entry; End → end action). The grill flow SHALL NOT be composed into arch-review — the graph SHALL NOT declare a flow phase referencing adopt-with-docs (requirement adoption is the loop's adopt stage, ADR 0099). The graph SHALL NOT reference review-machinery (inlined, ADR 0097). References to the loop's middle stage SHALL use the name `adopt` (never `refine`).

#### Scenario: Standalone requirement run

- **WHEN** arch-review runs standalone (fresh review)
- **THEN** scope-entry interviews (scope + output path explicit confirm), arch-review writes the report, review-accept decides: requirement ready → graph completes with the report artifact — no adoption stage runs

#### Scenario: Loop-again round

- **WHEN** review-accept chooses Loop again
- **THEN** the round re-enters at scope-entry — scope and report_input re-confirmed (ADR 0075 D1 semantics preserved); in the loop composition the adopt stage re-runs as the downstream adoption stage

### Requirement: review-machinery SHALL NOT exist

The review-machinery standalone graph SHALL be deleted — its single `arch-review` node inlines into arch-review. No graph SHALL reference review-machinery in a flow `use:`.

#### Scenario: No review-machinery reference remains

- **WHEN** a validator scans all built-in graphs for flow `use:` targets
- **THEN** review-machinery SHALL NOT appear
- **AND** the registry SHALL contain 11 graphs, review-machinery absent

### Requirement: Report-input semantics

The arch-review node SHALL keep the report-input semantics: `report_input: fresh` writes a new report at the confirmed path; `report_input: fresh` with an existing file at `report_path` (round ≥ 2) transitions to re-review; `report_input: existing` re-reads the report and updates it in place. The round marker SHALL increment.

#### Scenario: Round ≥ 2 updates in place

- **WHEN** the report file already exists at report_path
- **THEN** arch-review reads it, marks implementation progress per Top Rec item, updates it in place, and increments the round marker
