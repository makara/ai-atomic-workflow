# graph-generate Specification

## Purpose

Graph production — the maker journey. An end user (no repo-owner assumptions) produces a NEW .taskflow.yaml graph via the graph-generate graph: single kind (graph), single operation (create); artifacts land in the project's `.graph-scheduler/` with one attached usage doc.

## Requirements

### Requirement: Maker journey entry point

The maker journey SHALL be entered through the `graph-generate` graph — concrete, single kind (graph), single operation (create), zero repo-owner assumptions (no CONTEXT.md / docs/adr/ / openspec dependency). The graph SHALL declare a purpose-focused `description` (e.g. "Maker journey — produces .taskflow.yaml graphs") surfaced by the pilot before execution. Skill co-production SHALL NOT be supported by the maker journey (user decision — no kind switch, no operation enum).

#### Scenario: Maker journey resolves to graph-generate

- **WHEN** an end user in a foreign project (no CONTEXT.md, no docs/adr/) wants to produce a graph artifact
- **THEN** graph-generate SHALL run without repo-owner assumptions — scope interview proceeds directly, artifact + registry entry + attached doc land under the project's `.graph-scheduler/`
- **AND** the pilot SHALL show the graph-generate description + resolution source before the first node

### Requirement: Attached-doc home for the maker journey

When graph-generate produces a graph artifact it SHALL write the graph file to the project's `.graph-scheduler/graphs/<name>.taskflow.yaml`, a registry entry to `.graph-scheduler/graphs/registry.json`, and ONE attached usage doc to `.graph-scheduler/docs/<name>.md`. The `.graph-scheduler/docs/` directory SHALL be scaffolded by setup-atomic-workflow.

#### Scenario: Producer writes the three-path bundle

- **WHEN** graph-generate's implement phase completes
- **THEN** the graph file exists at `.graph-scheduler/graphs/<name>.taskflow.yaml`, the registry entry exists at `.graph-scheduler/graphs/registry.json`, and exactly one attached doc exists at `.graph-scheduler/docs/<name>.md`
