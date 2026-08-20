# graph-perception-list Specification

## Purpose

System-level graph perception list — the frontend-facing catalog of graphs (content, form, and lifecycle) mirroring the skills perception system: what the frontend knows about every graph without reading graph files.

## Requirements

### Requirement: Graph perception list content — five-field asset shape

Every graph in the catalog SHALL expose exactly five fields: `id` (graph name — identity), `description` (purpose — catalog single source from the graph definition top-level), `run_conditions` (interaction value `none|enabled` + constraints presence — projected from the graph definition, never a new fact source), `source` (`builtin | project | fallback` — merged from the former registered/resolvedFrom pair), and `problems` (load-time warnings). The list SHALL NOT carry `version`, `args`, `tags`, `registered`, or `resolvedFrom` as separate fields — field count is the consumption-requirement lower bound (L3), every field SHALL have a consumer.

#### Scenario: catalog exposes exactly five fields per graph

- **WHEN** a frontend queries the graph catalog
- **THEN** each graph entry exposes exactly `id`, `description`, `run_conditions`, `source`, `problems`

#### Scenario: run_conditions is a projection, not a new fact source

- **WHEN** a graph defines `interaction: none` and top-level `constraints`
- **THEN** the catalog entry's `run_conditions` carries the interaction value `none` and the constraints-presence fact, both derived from the graph definition

#### Scenario: version and args are not perception fields

- **WHEN** a graph declares a `version` and a run is started with args
- **THEN** neither the version nor any args shape appears in the catalog payload

### Requirement: Graph perception list lifecycle

The perception list SHALL have a declared lifecycle: **produce** — the catalog is a single-source projection from the merged registries (project-first) plus graph definitions read from disk at query time (no in-memory cache, no dual-write source); **load** — the resident perception block (id + description per graph) is injected into the agent session once at pilot activation, and detail (full five-field entries) is fetched on demand via the catalog query; **use** — the frontend consumes the list for graph selection, PCL start target confirmation, run-condition awareness (interactive vs non-interactive, constraints presence), and problem surfacing (problems → graph-maintain repair proposal). The list SHALL never be written by the frontend (L-DRY — single source).

#### Scenario: list freshness reflects definition changes

- **WHEN** a graph definition's description or interaction changes on disk
- **THEN** the next catalog query reflects the new values (no cached projection)

#### Scenario: frontend never writes the list

- **WHEN** the frontend uses the perception list
- **THEN** no tool writes list content back into the registry or graph definitions

### Requirement: Perception fields mirror skills discoverability

The catalog SHALL be discoverable through the same perception pattern as skills: a lightweight resident block (id + description per graph, one line each) present in the agent session at activation, with full detail on demand — never a full-payload dump in the resident block.

#### Scenario: resident block is compact

- **WHEN** the agent session is activated for a graph run
- **THEN** the resident perception block contains one line per graph (`id` + `description`), never the full five-field payload

#### Scenario: full detail is on demand

- **WHEN** the frontend needs run conditions or problems for a graph
- **THEN** it fetches the five-field entry via the catalog query rather than reading the resident block
