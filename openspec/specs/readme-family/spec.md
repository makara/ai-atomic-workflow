## Purpose

Contract for the README family: blueprint-driven structure, packages-grounded facts, diagram-first workflow presentation, and user-facing roadmap — so regenerated READMEs stay consistent, verifiable, and aligned with shipped packages.

## Requirements

### Requirement: Part order — workflows first

The root README and its zh mirror open with the out-of-the-box workflows part (Part 1 — Out-of-the-Box Workflows), followed by basics and graph making (Part 2 — Basics & Graph Making). Tail sections carry no part label.

#### Scenario: Structure order

- **WHEN** the root README is generated from the blueprint
- **THEN** Part 1 (Out-of-the-Box Workflows) precedes Part 2 (Basics & Graph Making), Documentation Management sits at the end of Part 1, and the zh mirror reflects the same two-part order with translated labels

### Requirement: Workflow sections are diagram-first

Each featured built-in workflow section (arch-review-loop, estate-maintain, graph-generate) presents a skeleton mermaid diagram as the primary explanation, with short prose anchored to the diagram and a fenced command prompt example. Remaining built-in workflows appear as one-line table rows sourced from the graph registry.

#### Scenario: Featured workflow section

- **WHEN** a featured workflow section is rendered
- **THEN** it contains: the skeleton mermaid diagram (verbatim from the blueprint), at most ~8 lines of diagram-anchored prose, and a `text`-fenced prompt example following the shared prompt template

#### Scenario: Non-featured workflows

- **WHEN** a non-featured built-in workflow is listed
- **THEN** it appears as a one-line table row whose wording matches its `registry.json` description

### Requirement: Built-in graph facts come from packages

Every README literal about built-in graphs (count and names) matches `packages/graph-scheduler/graphs/registry.json` (10 graphs); skill count matches `packages/graph-workflow/skills/` (16 skills); version matches `package.json` (0.3.1). The blueprint, as regeneration source, holds the same numbers.

#### Scenario: Fact consistency

- **WHEN** a README or the blueprint states a built-in graph count, skill count, or version
- **THEN** the number equals the corresponding ground-truth source in `packages/`

### Requirement: graph-generate described in Making a Graph

The graph-generate maker journey is described in Part 2 "Making a Graph" (full journey + maker-journey diagram + prompt example). The workflows chapter carries no graph-generate section; its built-in workflows table row points to Making a Graph.

#### Scenario: Placement

- **WHEN** the root README is generated from the blueprint
- **THEN** the maker-journey description and diagram live in the Making a Graph section (Part 2), the workflows chapter (Part 1) contains no graph-generate section, and the All Built-in Workflows table row for graph-generate points to Making a Graph

#### Scenario: Diagram propagation

- **WHEN** all four READMEs are regenerated
- **THEN** the maker-journey diagram is byte-identical across blueprint + outputs (ADR 0105), positioned in Making a Graph (root/zh) and the package READMEs' Making a Graph sections

### Requirement: Roadmap is user-facing

The roadmap lists user-visible value directions — more out-of-the-box graphs, token-saving strategies, more convenient operations tooling, wider platform support — as checkbox items without time promises.

#### Scenario: Roadmap content

- **WHEN** the Status & Roadmap section is rendered
- **THEN** every roadmap item describes a user-visible capability or benefit, and no item contains a calendar commitment

### Requirement: Diagram verbatim propagation

Both mermaid diagrams (arch-review-loop concept, graph-generate maker journey) copy byte-for-byte from the blueprint into all four output READMEs at their declared positions.

#### Scenario: Propagation gate

- **WHEN** all four READMEs are regenerated
- **THEN** each contains both diagrams byte-identical to the blueprint sources (ADR 0105)

### Requirement: Canonical description slots

The canonical description ("Graph-Engineering for Real Engineers: Graphs define workflows; workflows build graphs. Based on mattpocock/skills.") appears verbatim in the root README hero, the zh mirror hero (never translated), both package README overviews, and every manifest description slot.

#### Scenario: Description check

- **WHEN** any README or manifest description slot is inspected
- **THEN** the canonical English description is present verbatim (canonical-description record)

### Requirement: Manifest skill list matches shipped package

Every package-level manifest skill list matches the `packages/graph-workflow/skills/` directory: marketplace `plugins[].skills` and skills.sh `groupings[].skills` both list all 16 skills.

#### Scenario: Marketplace completeness

- **WHEN** `.claude-plugin/marketplace.json` `plugins[].skills` is inspected
- **THEN** it contains all 16 skill names, including `release-prep-analyze` and `release-prep-apply`

### Requirement: TOC is a bullet list grouped by part

The root README and its zh mirror render the table of contents as one bullet link per heading, grouped under bold part labels — not inline `·`-separated runs.

#### Scenario: TOC format

- **WHEN** the root README or zh mirror TOC is rendered
- **THEN** each part group is a bold label line followed by one `- [text](#anchor)` line per section, and every anchor resolves to an existing heading slug
