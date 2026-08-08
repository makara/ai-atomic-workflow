# graph-registry Specification

## Purpose

Multi-registry merge (built-in + project). Assets: `packages/graph-scheduler/src/registry-loader.ts`.

## Requirements

### Requirement: Registry Completeness

The graph registry SHALL list exactly the built-in graphs that exist as taskflow definitions. The registry SHALL contain 9 graphs: e2e-minimal, arch-review, arch-review-loop, adopt-with-docs, graph-generate, spec-implement, openspec-apply, openspec-engineer, estate-maintain. The obsolete `implement` and `review-machinery` graphs SHALL NOT be registered. The `grill-with-docs` name SHALL NOT appear (renamed to adopt-with-docs). The deleted `artifact-workflow` and `skill-workflow` graphs SHALL NOT be registered (skeleton + thin composition deleted — ADR 0101). The `graph-workflow` name SHALL NOT appear (retired — the maker journey is `graph-generate`, ADR 0108). The deleted `doc-update` graph SHALL NOT be registered (doc-maintenance split — closure owns lifecycle, estate owns maintenance).

#### Scenario: Registry matches graph files

- **WHEN** the registry is loaded
- **THEN** every built-in graph file has an entry and every entry resolves to an existing file — 9 names each way
- **AND** estate-maintain SHALL be registered with its taskflow path
- **AND** no entry references grill-with-docs, refine, implement-loop-gate, doc-update, or two-tier language

#### Scenario: Implement graph absent

- **WHEN** the registry is scanned
- **THEN** `implement` SHALL NOT be registered — spec-implement is the implementation graph

#### Scenario: review-machinery absent

- **WHEN** the registry is scanned
- **THEN** `review-machinery` SHALL NOT be registered — the review node inlines into arch-review

#### Scenario: doc-update absent

- **WHEN** the registry is scanned
- **THEN** `doc-update` SHALL NOT be registered — post-archive closure is a single lifecycle node inside the tracks

#### Scenario: Deleted graphs absent

- **WHEN** the registry is scanned
- **THEN** skill-author, skill-delete, skill-change-workflow, graph-workflow, plan-generate, openspec-create, openspec-pipeline, arch-review-to-spec, grill-with-docs, artifact-workflow, skill-workflow, and doc-update SHALL NOT be registered

#### Scenario: artifact-workflow registered

- **WHEN** the registry is loaded
- **THEN** `artifact-workflow` SHALL NOT be present — the universal skeleton is deleted (scenario name retained for spec-sync continuity)

#### Scenario: skill-workflow registered

- **WHEN** the registry is loaded
- **THEN** `skill-workflow` SHALL NOT be present — skill production (create + edit) flows through the improver journey (arch-review-loop change mechanism; scenario name retained for spec-sync continuity)

#### Scenario: graph-workflow registered

- **WHEN** the registry is loaded
- **THEN** `graph-workflow` SHALL NOT be present — the name is retired (identity redesign, ADR 0108)
- **AND** `graph-generate` SHALL be present with its taskflow path — the concrete maker journey graph (single kind, single operation, attached doc at .graph-scheduler/docs/)

#### Scenario: arch-review-loop registered

- **WHEN** the registry is loaded
- **THEN** arch-review-loop SHALL be present with its taskflow path

#### Scenario: Entry shape consistency

- **WHEN** a consumer enumerates the registry
- **THEN** every entry SHALL carry `name`, `path`, and `description` — no extra fields

### Requirement: Registry as Source of Truth

Consumers that enumerate available graphs via the registry SHALL discover all built-in graphs without falling back to the file-name convention (`${graphName}.taskflow.yaml`). Built-in graphs SHALL use only dispatch phase types: `main`, `approval`, and the composite `flow` — the `agent` type disappears from built-in graphs, and `agent-registry.json` no longer contains agent entries.

#### Scenario: Enumeration covers all graphs

- **WHEN** a consumer enumerates available graphs via the registry
- **THEN** the result SHALL contain all current built-in graphs (including graph-generate)
- **AND** the result SHALL match the set of graph files on disk

#### Scenario: No built-in graph declares agent type

- **WHEN** a validator scans all built-in graphs
- **THEN** every phase's `type` SHALL belong to `{main, approval, flow}`
- **AND** any `type: agent` SHALL be reported as an error

#### Scenario: agent-registry has no agent row

- **WHEN** a consumer reads `agent-registry.json`
- **THEN** entries SHALL contain only `main` and `approval` (the handler family is atom-phase-handler for both)
- **AND** an `agent` entry SHALL NOT exist

### Requirement: Agent entry handler/entry role separation

Agent registry entries SHALL encode the handler skill in their `skill` field, and that value SHALL be distinct from dispatch entry skills. Agent-type graph phases SHALL always declare their dispatch entry skill explicitly. The CLI validate command SHALL report a configuration error when an agent phase lacks an explicit `skill` (consistent with graph-phase-dispatch — the registry skill is never a valid dispatch target).

#### Scenario: Registry entry documents handler role

- **WHEN** an agent inspects the built-in agent registry entry for type `agent`
- **THEN** the entry's `skill` field SHALL identify the handler skill (`atom-phase-agent`), documented as handler — never a dispatch target

#### Scenario: Validate reports missing entry skill as error

- **WHEN** `atom-graph-config validate` inspects an agent phase without a `skill` field
- **THEN** validation SHALL report a configuration error naming the graph, the phase, and the handler fallback that would previously have been used

### Requirement: Registry description reflects current topology

The `description` of a built-in graph registry entry (`packages/graph-scheduler/graphs/registry.json`) SHALL accurately reflect that graph's current topology — covering all of its phase responsibilities, SHALL NOT reference deleted or renamed phases, and SHALL NOT omit newly added phases. The arch-review entry SHALL describe standalone requirement production (scope → report → accept); the arch-review-loop entry SHALL describe the three-phase composition (requirement → adopt → implement, single loop); the adopt-with-docs entry SHALL describe requirement adoption + spec production (adopt-scope → adopting → adopt-accept → spec-propose).

#### Scenario: graph-workflow description covers the concrete maker graph

- **WHEN** a consumer reads the graph-generate description
- **THEN** it SHALL describe the concrete maker journey (entry → spec → spec-accept → implement → review → gate → accept, single kind, single operation, attached doc at .graph-scheduler/docs/)
- **AND** it SHALL NOT reference `graph-workflow` or retired names

#### Scenario: Deleted graph descriptions absent

- **WHEN** the registry is scanned for deleted graph names
- **THEN** no description SHALL reference skill-author, graph-workflow, openspec-pipeline, implement-loop-gate, two-tier loop, artifact-workflow, or skill-workflow

#### Scenario: Restructured graph descriptions current

- **WHEN** graph_init validates the registry after the single-loop adopt pipeline
- **THEN** the arch-review / arch-review-loop / adopt-with-docs descriptions match the restructured topologies and no drift warnings fire for them

### Requirement: Description drift checkable by validate

The CLI validate (`atom-graph-config validate`) SHALL support description-to-topology consistency warnings — it outputs a warning when a registry description mentions a phase name that does not exist. This check is warning-level and SHALL NOT change the validate pass/fail result.

#### Scenario: Stale phase name warns

- **WHEN** a registry description references a phase name that does not exist in the graph file
- **THEN** validate SHALL output a warning (non-blocking) naming the stale reference

#### Scenario: Current description passes clean

- **WHEN** all registry descriptions reference only existing phase names
- **THEN** validate SHALL report no description-drift warnings

### Requirement: Registry-aware subgraph resolution

Graph-name resolution — top-level and flow subgraph alike — SHALL honor project registry entries: an explicit path entry for a subgraph name SHALL be used for loading; absent an entry, resolution falls back to taskflow-directory search. A subgraph load failure SHALL propagate the original error (fail-fast), never a silent drop.

#### Scenario: Subgraph honors registry override

- **WHEN** a flow phase references a child graph name that has an explicit path entry in the project registry
- **THEN** the entry's explicit path SHALL be used — directory search is not consulted first

#### Scenario: Subgraph load error propagates

- **WHEN** a referenced child graph fails schema validation
- **THEN** loading fails fast with the original validation error
- **AND** the error is not re-reported as "not found in registry"

### Requirement: agent-registry.json SHALL be deleted

The built-in `agent-registry.json` SHALL NOT exist. Dispatch handler resolution SHALL use the constant `atom-phase-handler` for `main`/`approval` types (see dispatch-hints capability). No file SHALL serve as a type → handler registry.

#### Scenario: No agent-registry file exists

- **WHEN** a consumer lists `packages/graph-scheduler/graphs/`
- **THEN** `agent-registry.json` SHALL be absent

#### Scenario: No registry rows to enumerate

- **WHEN** validate checks dispatch handler resolution for main/approval phases
- **THEN** both SHALL resolve to `atom-phase-handler` without consulting any registry file

### Requirement: Project config SHALL NOT carry agentRegistry

`.graph-scheduler/config.json` SHALL NOT accept an `agentRegistry` field; `setup-atomic-workflow` SHALL NOT scaffold it; the three-layer registry-override model (builtin JSON < project config < phase.skill) SHALL be reduced to the single `phase.skill` override.

#### Scenario: Config with agentRegistry rejected

- **WHEN** project config validation encounters an `agentRegistry` field
- **THEN** it SHALL report a validation error
- **AND** setup output SHALL contain no such field

#### Scenario: Setup scaffolds lean config

- **WHEN** setup-atomic-workflow initializes a project
- **THEN** the generated config SHALL contain only dbPath/taskflowDir/registryPaths (or the current minimal set)
- **AND** no agentRegistry placeholder SHALL be emitted

### Requirement: Persistence SHALL drop write-only columns

`graph_runs.current_phase_id` and `node_states.type` columns SHALL NOT exist; repository code and snapshot computation SHALL not reference them. `currentPhaseId` in snapshots SHALL be computed from node states (unchanged behavior).

#### Scenario: Migration drops dead columns

- **WHEN** the database migrates to the new schema version
- **THEN** `current_phase_id` and `node_states.type` SHALL be dropped
- **AND** all existing tests exercising run/node persistence SHALL pass against the new schema

### Requirement: Dead code SHALL be removed

Unreferenced exports SHALL be removed: `defaultFileSystemLayer`, `isDebugEnabled`, `resetDebugCounters`, `deleteNodeStates`, `NodeStatus`, the `Registry` interface (and its import), and the `Taskflow` re-export from flow-flatten.

#### Scenario: No dead export remains

- **WHEN** a source scan searches for each listed symbol
- **THEN** none SHALL be defined or exported

### Requirement: Registry merge precedence — project overrides builtin

Registry resolution SHALL merge multiple registry sources with **project-first precedence**: a project registry entry SHALL override a same-named builtin entry. Merge order SHALL be `[builtin, project...]` (later entries win) or equivalent project-wins semantics. The builtin registry is the fallback layer, never an override.

#### Scenario: Project entry shadows builtin

- **WHEN** the project registry registers a graph name that also exists in the builtin registry
- **THEN** the project entry SHALL resolve — the builtin entry is shadowed
- **AND** graph_start for that name SHALL load the project's graph file

#### Scenario: Builtin resolves when project lacks entry

- **WHEN** the project registry has no entry for a name registered in the builtin registry
- **THEN** the builtin entry SHALL resolve (fallback)

### Requirement: Graph resolution source SHALL be visible

`graph_start` responses SHALL carry the resolution source of the loaded graph: `resolvedFrom: project | builtin | fallback` plus the resolved absolute path. Consumers (pilot) SHALL display the source so same-name shadowing is explicit, never mysterious.

#### Scenario: graph_start reports resolution source

- **WHEN** `graph_start` resolves a graph name
- **THEN** the response SHALL include `resolvedFrom` (project or builtin) and the absolute path of the loaded graph file

#### Scenario: Shadowing is visible to the pilot

- **WHEN** a project entry shadows a builtin entry
- **THEN** the pilot's identity banner SHALL show `resolvedFrom: project` and the path — the shadowing is explicit in the first message
