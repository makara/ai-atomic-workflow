# atom-graph-design Specification

## Purpose

TBD - created by archiving change remaining-med-sweep. Update Purpose after archive.

## Requirements

### Requirement: Output schema covers branch routes

MODIFIED: the design output SHALL express branch-route cases as main task-text decisions with explicit `branchTo` targets (never `route:`/`routing:` fields — the route mechanism is deleted, ADR 0221) plus a task-content pointer to §Task Content Spec. Design guidance SHALL state that branch options surface at dispatch via the machine-declared `completion` block.

#### Scenario: route fields present

- **WHEN** reading atom-graph-design's Output contract for branch-route cases
- **THEN** `route:`/`routing:` fields SHALL NOT be emitted (removed, ADR 0221) — branch cases declare main task-text decisions with `branchTo` targets, and §Task Content Spec is referenced

#### Scenario: Branch options via completion

- **WHEN** atom-graph-design describes how branch options reach the user
- **THEN** it SHALL reference the machine-declared `completion` block delivered on the NodeDetail — no routing-action declaration in the designed YAML

### Requirement: Inventory draft at spec stage

The design output of the graph-spec phase SHALL include an inventory draft: one row per planned phase `{ id, type, goal, constraints? }`. `goal` — bounded-compound intent statement (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS, prose `and`/`or` lowercase; ordinary ≤ 5 steps; gates ≤ 3 operands; conditional ≤ 3 paths), flow entries stating "expands <use> subgraph", skill-bound main nodes naming the executing skill in verb form. `constraints` — optional draft rows: one-sentence prose rules (≤ 5 entries per atom), general rules preferring positive framing, explicit non-goals stated as direct negation, prose only. Draft goals SHALL comply with the case discipline: structural keywords uppercase, prose conjunctions lowercase. The draft SHALL be the basis for the writer's generated inventory — the produced table SHALL match the approved design.

#### Scenario: Design carries inventory draft

- **WHEN** atom-graph-design produces the phase list for a new graph
- **THEN** the output includes an inventory draft with one row per planned phase in the `{ id, type, goal, constraints? }` shape

#### Scenario: Case discipline in draft descriptions

- **WHEN** atom-graph-design drafts inventory goals
- **THEN** structural keywords appear ALL-CAPS (AND/OR/IF/THEN/ELSE) and prose conjunctions stay lowercase

#### Scenario: Draft constraints bounded prose

- **WHEN** atom-graph-design drafts `constraints` for a planned phase
- **THEN** each is a one-sentence prose rule, at most 5 per atom, non-goals stated as direct negation, with no structural keywords

### Requirement: Run ending semantics at design stage

The design guidance of the graph-spec phase SHALL teach how a designed run ends via atom-graph-spec §Run Completion as the single home (consult, do not restate): runs complete by natural drain (`node: null`, fsmState `completed`); `graph_force_end` is a runtime terminate tool (irreversible, pilot-command surface), never a graph-file construct; no endRun parameter exists on `graph_advance` (removed, ADR 0215). Design consequences: routing actions SHALL NOT include `end` (vocabulary: continue|retry|jump); design guidance SHALL NOT propose end phases or end routing actions for authored graphs.

#### Scenario: Designer knows how a designed run ends

- **WHEN** atom-graph-design produces the phase list for a new graph
- **THEN** the design guidance references atom-graph-spec §Run Completion for ending semantics and states that no end phase is required — the run completes by natural drain

#### Scenario: No end routing action proposed

- **WHEN** atom-graph-design drafts branch-route cases for a graph
- **THEN** routing actions stay within continue|retry|jump and no `end` action appears

#### Scenario: Force end framed as runtime terminate

- **WHEN** atom-graph-design guidance mentions run termination
- **THEN** `graph_force_end` is described as the runtime terminate tool (irreversible, pilot-command surface), not as a graph construct

### Requirement: Graph-level constraints draft at spec stage

The design output of the graph-spec phase SHALL include a graph-level `constraints` draft alongside the inventory draft: prose one-sentence rules (general boundaries + explicit non-goals), ≤10 entries (convention bound), positive framing preferred except explicit non-goals; sourced from the planned graph's actual boundaries — never fabricated. Absent boundaries SHALL yield an empty draft (optional field).

#### Scenario: Design draft includes graph constraints

- **WHEN** atom-graph-design produces a design for a graph with declarable boundaries
- **THEN** the design output carries a top-level `constraints` draft of ≤10 prose entries

#### Scenario: No boundaries yields empty draft

- **WHEN** atom-graph-design produces a design without declarable boundaries
- **THEN** the draft is empty and the produced graph omits the field
