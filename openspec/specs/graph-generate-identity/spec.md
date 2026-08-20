# graph-generate-identity Specification

## Purpose

Maker meta-graph identity made explicit — the graph name is the operation, graph top-level description, resolution source visible, pilot identity banner. Assets: `packages/graph-scheduler/graphs/graph-generate.yaml`, `atom-pilot`.

## Requirements

### Requirement: Maker graph named graph-generate

The maker journey graph SHALL be named `graph-generate` (file `graph-generate.yaml`, registry entry `graph-generate`) — the name states the operation (generate a graph). The name `graph-workflow` SHALL NOT be used for the maker graph (retired — it collides with the skills package namespace and carries no operation semantics).

#### Scenario: graph-generate resolves

- **WHEN** `graph_start({ graphName: "graph-generate" })` is called
- **THEN** the maker journey SHALL run (entry → spec → spec-accept → implement → review → gate → accept)
- **AND** no graph named `graph-workflow` SHALL be registered

#### Scenario: Skill descriptions reference graph-generate

- **WHEN** a consumer scans skill descriptions referencing the maker graph
- **THEN** they SHALL name `graph-generate` — no `graph-workflow` graph references remain in skill metadata

### Requirement: Graph top-level description field

Graph definitions SHALL accept a top-level `description` free-text field (no closed enum, no behavior branching). The description SHALL focus on the graph's purpose/effect — e.g. "Maker journey — produces .yaml workflow graphs". `graph_start` SHALL carry the description in its response; the pilot SHALL display it before the first node.

#### Scenario: Description carried in graph_start

- **WHEN** `graph_start` returns the first node for a graph with a description
- **THEN** the response SHALL include the graph's description text

#### Scenario: Pilot shows identity banner

- **WHEN** the pilot receives the first node
- **THEN** it SHALL display the run identity before execution: graph name, description, and resolution source (e.g. `Executing graph-generate (bundled) — Maker journey: produces .yaml workflow graphs`)

#### Scenario: Description optional

- **WHEN** a graph omits `description`
- **THEN** the graph SHALL load normally and the response SHALL carry no description

### Requirement: Pilot distinguishes executed graph from produced graph

When a graph produces artifacts (maker journey), the pilot SHALL state the two-level model explicitly: the graph being EXECUTED vs the artifact being PRODUCED. The scope interview SHALL confirm the produced graph name differs from the executed graph name; an equal name SHALL produce a validation warning (self-production shadowing).

#### Scenario: Entry confirms artifact name differs

- **WHEN** the maker journey's entry interview confirms the produced graph name
- **THEN** the produced name SHALL be checked against the executed graph name — equal names SHALL warn

#### Scenario: Identity visible before first node

- **WHEN** the pilot starts a maker-journey run
- **THEN** the user SHALL see the executed graph name + description before any node executes — no post-hoc discovery

### Requirement: Identity-field spec coverage verified at change archive

Changes that extend or alter the `graph_start` response surface (identity fields such as `description`, `resolvedFrom`, `resolvedPath`, `problems`) SHALL update the graph-generate-identity spec in the same change. The archive step SHALL verify identity-field spec coverage and SHALL report the gap when a changed identity field is not recorded in this spec — archiving SHALL NOT proceed silently over the gap.

#### Scenario: problems field recorded

- **WHEN** a change adds a field to the graph_start response
- **THEN** the change's delta spec for graph-generate-identity records the field and its semantics

#### Scenario: Archive blocks uncovered identity field

- **WHEN** the archive step finds a graph_start response field not recorded in graph-generate-identity
- **THEN** archiving SHALL report the gap and require the delta before proceeding
