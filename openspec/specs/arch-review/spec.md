# arch-review Specification

## Purpose

Single-round architecture review (scope→report). Asset: `packages/graph-scheduler/graphs/arch-review.yaml`; output: `docs/reports/`.

This domain currently has no registered behavioral-contract requirement; new contracts are added via the OpenSpec change workflow.

## Requirements

### Requirement: review-machinery SHALL NOT exist

The review-machinery standalone graph SHALL be deleted — its single `arch-review` node inlines into arch-review. No graph SHALL reference review-machinery in a flow `use:`.

#### Scenario: No review-machinery reference remains

- **WHEN** a validator scans all built-in graphs for flow `use:` targets
- **THEN** review-machinery SHALL NOT appear
- **AND** the registry SHALL contain 12 graphs, review-machinery absent

### Requirement: Report-input semantics

Report-input behavior SHALL be owned by the composing framework graph's scope-entry (never re-interviewed inside the subgraph): `report_input: fresh` writes a new report at the confirmed `report_path`; `report_input: fresh` with an existing file at `report_path` (round ≥ 2) transitions to re-review; `report_input: existing` re-reads the report and updates it in place. The round marker SHALL increment. When a report already exists (`report_input: existing`, or the previous round's arch-review output shows `round >= 1`) and the user gives no explicit new scope, the framework scope-entry SHALL propose a scope that verifies the actual implementation results against the report (evidence-backed) and surfaces new problems — the prior round's scope SHALL NOT be re-proposed verbatim.

#### Scenario: Round ≥ 2 updates in place

- **WHEN** the report file already exists at report_path
- **THEN** the producer chain reads it, marks implementation progress per Top Rec item, updates it in place, and increments the round marker

#### Scenario: Existing report without new scope proposes verification

- **WHEN** a report already exists (report_input: existing, or the previous round shows round >= 1) and the user gives no explicit new scope
- **THEN** the framework scope-entry SHALL propose the verification scope — check actual implementation results against the report (evidence-backed) and surface new problems
- **AND** the prior round's scope SHALL NOT be re-proposed verbatim

### Requirement: first-principles skill resolution

The `first-principles` phase SHALL resolve its skill to the vendored built-in asset `packages/graph-workflow/skills/first-principles/SKILL.md` — never to a user-deployed external copy.

#### Scenario: Vendored skill used

- **WHEN** the first-principles phase dispatches
- **THEN** the skill reference resolves to the vendored `packages/graph-workflow/skills/first-principles/SKILL.md`

### Requirement: arch-review — non-interactive requirement production

`arch-review` SHALL be a non-interactive requirement production graph declaring `interaction: none` — the producer stage SHALL consist of THREE main phases: `explore` (skill improve-codebase-architecture Step 1, operations [locate, read], agent hints [explore, scout, task, general]), `first-principles` (skill first-principles Steps 1–4, operations [read]), `present-candidates` (skill improve-codebase-architecture Step 2, operations [write, review], writes the markdown report at the framework-provided `report_path`). Intermediate outputs travel as session streams via `node:` channels — never written to files (ADR 0143).

**Execution positions** — standalone is first-class; composition is compile-time nesting:

1. **Standalone (first-class)**: running `arch-review` as a standalone graph SHALL execute its three producer phases inline in the main agent (requirement-production journey without a composing framework). The `scope-entry` interview and `review-accept` confirmation remain hosted by the composing framework graph when composed.
2. **Composed**: composing `arch-review` via `use` (`arch-review-loop`, `first-principles-dev`) SHALL be compile-time subgraph assembly — composed members dispatch by namespaced id (`requirement/explore`, …) through the same advance loop as peer nodes. No execution-mode hint, no delegated batch, no execution-position facts exist (round-12 langgraph alignment, ADR 0233).

Report-input behavior (fresh → write; existing/round ≥ 2 → re-review update in place, round marker increment) SHALL be owned by the composing framework graph's scope-entry when composed; standalone runs SHALL use the graph's own scope-entry.

#### Scenario: Standalone requirement run

- **WHEN** arch-review runs standalone
- **THEN** the graph SHALL be independently executable as a requirement-production journey — the three producer phases run inline in the main agent, with the framework-hosted scope-entry providing the requirement input and report path

#### Scenario: Composed members dispatch namespaced

- **WHEN** arch-review composes into a framework graph (requirement stage) via a `use` phase
- **THEN** the composed members SHALL dispatch by namespaced id through the standard advance loop as peer nodes — no execution-mode hint, no delegated batch, no boundary facts (ADR 0233)

#### Scenario: Loop-again round

- **WHEN** a composing framework graph's review-accept chooses Loop again
- **THEN** the round re-enters the framework scope-entry — scope + report input re-confirmed (ADR 0075 D1 semantics preserved); the arch-review subgraph chain re-runs; the downstream adoption stage re-runs

#### Scenario: Composed loop promotion points at the producer terminal

- **WHEN** arch-review composes into arch-review-loop (requirement stage)
- **THEN** the loop's ambient report stream and gate conditions reference the producer terminal (`requirement/present-candidates`) — flow composition auto-follows the child terminal node; adopt stage activates after the producer completes
