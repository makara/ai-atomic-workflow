# graph-flow-layout Specification

## Purpose

Canonical graph-file layout for builtin graphs — every graph declares its flow transition surface, with the top-level key order `flow` before `inventory` and `constraints` after `inventory` (user-ruled layout, round 3 of the flow-sugar review).

## Requirements

### Requirement: Canonical top-level key order

Every graph YAML file SHALL declare its top-level keys in the canonical order: `name` → `description` → `$schema` → `version` → `interaction` → `flow` → `inventory` → `constraints` → `context` → `phases`. The `flow` key SHALL appear BEFORE the `inventory` key; the `constraints` key SHALL appear AFTER the `inventory` key. The WorkflowSchema field declaration order SHALL mirror the FULL canonical key order — `interaction` declared before `flow`, `context` declared after `constraints` — so the derived JSON Schema document's property order matches the file layout positionally (single-source consistency; the snapshot test regenerates on change).

#### Scenario: Flow precedes inventory

- **WHEN** a graph YAML declares both `flow` and `inventory`
- **THEN** the `flow` block SHALL be positioned before the `inventory` block in the file

#### Scenario: Constraints follow inventory

- **WHEN** a graph YAML declares both `constraints` and `inventory`
- **THEN** the `constraints` block SHALL be positioned after the `inventory` block in the file

#### Scenario: Schema declaration order mirrors the layout

- **WHEN** WorkflowSchema declares its top-level fields
- **THEN** the declaration order SHALL match the full canonical key order — `interaction` before `flow`, `flow` before `inventory`, `constraints` after `inventory`, `context` after `constraints` (matching the file layout)

#### Scenario: Derived JSON Schema mirrors the full order

- **WHEN** the JSON Schema document is derived from WorkflowSchema
- **THEN** its property order SHALL match the canonical key order positionally (interaction, flow, inventory, constraints, context)

### Requirement: Builtin graphs SHALL declare a flow block

Every builtin graph SHALL declare a top-level `flow` block expressing its FULL transition surface — every declared phase node SHALL appear as an edge source or an edge target (full coverage; the sequence section is declared explicitly, never left to the dependsOn-derived default). Labeled edges express condition-matched routing and rework (self-edges for inline loops, backward labeled edges for in-graph rework); unlabeled edges express explicit sequence routing. The synthesized `__handoff` terminal SHALL NOT count toward phase coverage (a synthesized node, not a declared phase — `--> __handoff` edges remain legal). A graph with no conditional routing SHALL still declare the flow block with its sequence edges — flow presence is mandatory, not optional, for builtin graphs.

#### Scenario: Linear graph declares sequence edges

- **WHEN** a builtin graph has a linear chain (e.g. arch-review: explore → first-principles → present-candidates)
- **THEN** its flow block SHALL declare the chain's sequence edges (`explore --> first-principles`, `first-principles --> present-candidates`)

#### Scenario: Loop graph declares its self-edge

- **WHEN** a builtin graph has an inline bounded loop
- **THEN** its flow block SHALL declare the self-edge (e.g. `review -->|fail| implement`) and the loop bound SHALL live in the graph's top-level `constraints` prose

#### Scenario: Rework edge declared

- **WHEN** a builtin graph's node may rework an upstream phase in-run
- **THEN** the flow block SHALL declare the backward labeled edge (e.g. `approval-review -->|rework| agent-echo`), and the graph SHALL declare the rework bound in its top-level `constraints`

#### Scenario: Loop builtin graph covers both loop and sequence sections

- **WHEN** a builtin graph has an inline loop (`round-report -->|remaining| scope-entry` + `round-report -->|complete| __handoff`)
- **THEN** the loop-head's loop edges AND the sequence section (`startup --> scope-entry` … `implement --> round-report`) are all declared; no declared phase relies on the dependsOn default for its transition surface.

#### Scenario: Synthesized handoff excluded from coverage

- **WHEN** a builtin graph's flow block targets `__handoff`
- **THEN** the `__handoff` target is legal and does not create a coverage obligation (only declared phase ids count).
