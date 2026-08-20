# atom-graph-writer Specification

## Purpose

TBD - created by archiving change remaining-med-sweep. Update Purpose after archive.

## Requirements

### Requirement: Task-text generation governed

Step 2 SHALL reference §Task Content Spec + §Output Contract Spelling and carry a checkable criterion.

#### Scenario: task-text criterion present

Given packages/graph-workflow/skills/atom-graph-writer/SKILL.md When reading Step 2 Then §Task Content Spec is referenced and a checkable task-text criterion exists

### Requirement: Inventory generation governed

atom-graph-writer SHALL generate the graph's top-level `inventory` when creating a graph: exactly one entry `{ id, type, goal, constraints? }` per phase. `goal` — bounded-compound intent statement per the format reference (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS, prose `and`/`or` lowercase; ordinary ≤ 5 steps; gates ≤ 3 operands; conditional ≤ 3 paths), flow entries stating "expands <use> subgraph", skill-bound main nodes naming the executing skill in verb form. `constraints` — optional draft: one-sentence prose rules (≤ 5 entries per atom), general rules preferring positive framing, explicit non-goals stated as direct negation (e.g. "does not X" / "avoids Y"), prose only — no structural keywords. Generated goals SHALL comply with the case discipline: structural keywords uppercase, prose conjunctions lowercase. No `skill` field on entries. The inventory is emitted once at creation (AI first-generation); afterwards user-maintained — the writer SHALL NOT regenerate or edit an existing inventory (no regeneration, no casing edits, no constraint edits).

#### Scenario: Writer emits inventory on creation

- **WHEN** atom-graph-writer creates a graph
- **THEN** the produced YAML carries one `{ id, type, goal, constraints? }` entry per phase with bounded-compound goals per the format reference

#### Scenario: Case discipline in generated descriptions

- **WHEN** atom-graph-writer generates inventory goals
- **THEN** structural keywords appear ALL-CAPS (AND/OR/IF/THEN/ELSE) and prose conjunctions stay lowercase

#### Scenario: Generated constraints bounded prose

- **WHEN** atom-graph-writer drafts `constraints` for an entry
- **THEN** each is a one-sentence prose rule, at most 5 per atom, non-goals stated as direct negation, with no structural keywords

#### Scenario: Existing inventory untouched

- **WHEN** atom-graph-writer processes a graph whose inventory already exists
- **THEN** the inventory is left untouched — no regeneration, no casing edits, no constraint edits (user-hand-written entries keep their author's content)

### Requirement: Maintenance write mode governed

MODIFIED: atom-graph-writer SHALL support a maintenance write mode in addition to creation: given approved fix proposals, it SHALL apply each proposal across the **two-path bundle** (graph YAML + registry entry) in one pass — never a partial bundle update. Creation mode (maker journey) SHALL remain unchanged: inventory first-generation, load-probe, spec-first confirmation — with the two-path bundle (no attached doc, ADR 0244 D3).

#### Scenario: Approved fix applied across the bundle

- **WHEN** the maintenance flow hands approved proposals to the writer
- **THEN** the writer applies them to the graph YAML and registry entry in one pass and reports per-path changes — no attached-doc write occurs

#### Scenario: Creation mode unaffected

- **WHEN** the writer runs in maker-journey creation mode
- **THEN** its behavior is unchanged (inventory generation, two-path bundle creation, load-probe validation)

### Requirement: Audit checks governed

MODIFIED: the writer's maintenance contract SHALL include the audit checks it can mechanize: inventory id/type vs phases (per load-pass semantics), registry description drift (mention of a non-existent phase), in-graph declaration existence (comments or task-text references to fields or mechanisms are checked against the load pipeline and the graph shape; a reference to a non-existent field or mechanism is a finding), graph-level constraints presence/format (a declared top-level `constraints` block SHALL be a string array of ≤10 prose entries — non-array, oversized, or structural-content entries are findings; content semantics remain LLM-judged, zero machine axis), unknown-phase-key tolerance (schema-unknown phase keys audited per phase, cited, non-blocking — runs even when the graph fails schema validation), non-interactive compliance (a graph declaring `interaction: none` SHALL pass the machine scanner per node — task-text interaction tokens, interaction skills, `direct end:` declarations are findings). **The attached-doc existence/coverage check is REMOVED** — the bundle is two-path (graph yaml + registry entry), no attached doc exists (ADR 0244 D3).

#### Scenario: Graph constraints audited

- **WHEN** the maintain audit runs on a graph whose top-level `constraints` contains a non-string entry or exceeds 10 entries
- **THEN** the audit reports a finding naming the entry and the violated convention

#### Scenario: Semantic drift flagged as LLM judgment

- **WHEN** the audit compares phase task content against inventory descriptions
- **THEN** divergence is reported as an LLM-judged finding with the diverging content cited — no machine axis claimed (ADR 0183)

#### Scenario: In-graph declaration references absent mechanism

- **WHEN** the audit scans a graph whose comment references a field that does not exist in the load pipeline
- **THEN** the audit reports a machine finding citing the stale declaration

#### Scenario: Mermaid-non-conformant flow surfaces a finding

- **WHEN** the maintain audit runs on a graph whose `flow` block fails the real mermaid parser (per the load-time check result)
- **THEN** the audit reports a finding with a fix proposal rewording the edge into a mermaid-valid subset form

#### Scenario: Attached-doc check absent

- **WHEN** the maintain audit runs on any graph
- **THEN** no attached-doc existence or coverage check runs — the audit covers the two-path bundle only

### Requirement: Graph-level constraints generation governed

atom-graph-writer SHALL generate the graph's top-level `constraints` draft when creating a graph: prose one-sentence rules (general boundaries + explicit non-goals — "does not X" / "avoids Y"), ≤10 entries (convention bound), positive framing preferred except explicit non-goals; sourced from the graph's actual boundaries (task-text NEVER lines, skill Boundary steps, spec SHALL NOT clauses — never fabricated). Absent boundaries SHALL yield an empty draft (optional field). The creation output SHALL include the draft for user confirmation with the inventory draft.

#### Scenario: Generated graph constraints bounded prose

- **WHEN** atom-graph-writer creates a graph with declarable boundaries
- **THEN** the produced YAML carries a top-level `constraints` array of ≤10 prose entries reflecting real boundaries

#### Scenario: No boundaries yields empty field

- **WHEN** atom-graph-writer creates a graph without declarable boundaries
- **THEN** the produced YAML omits top-level `constraints` (empty set — optional field, no fabrication)

### Requirement: Run ending semantics for authored graphs

The writer guidance SHALL teach how an authored graph's run ends via atom-graph-spec §Run Completion as the single home (consult, do not restate): the graph completes by natural drain (`node: null`, fsmState `completed`) — no end phase needed in the authored YAML; no endRun parameter exists (removed, ADR 0215). Writer consequences: authored graph files SHALL NOT declare end phases or end routing actions; `graph_force_end` is the runtime terminate tool for validation/abort contexts (load-probe cleanup), not a normal completion path.

#### Scenario: Writer teaches natural drain completion

- **WHEN** atom-graph-writer writes or maintains a graph
- **THEN** the guidance references atom-graph-spec §Run Completion for ending semantics and states that the authored graph's run completes by natural drain without an end phase

#### Scenario: Force end scoped to validation cleanup

- **WHEN** atom-graph-writer guidance references graph_force_end
- **THEN** it is described as the runtime terminate/abort tool (load-probe cleanup), never as the graph's completion mechanism

#### Scenario: Authored YAML has no end construct

- **WHEN** atom-graph-writer produces a graph file
- **THEN** the YAML contains no end phase and no `end` routing action

### Requirement: Canonical layout on create and maintain writes

atom-graph-writer SHALL emit the canonical top-level key order on both create and maintenance writes: `name → description → $schema → version → interaction → flow → inventory → constraints → context → phases` (flow before inventory, constraints after inventory). Create mode SHALL generate the graph's flow block (sequence/rework edges per the design's flow draft) and maintain mode SHALL preserve/reposition keys to the canonical order when applying approved proposals. The generated flow block SHALL cover every declared phase — each phase appears as a flow-edge source or target (the synthesized `__handoff` excluded; sequence edges explicit, never left to the dependsOn-derived default).

#### Scenario: Create emits the canonical order

- **WHEN** atom-graph-writer creates a graph YAML
- **THEN** the emitted file SHALL declare `flow` before `inventory` and `constraints` after `inventory`

#### Scenario: Maintain repositions keys

- **WHEN** a maintenance proposal reorders keys to the canonical layout
- **THEN** the writer SHALL emit the repositioned block order in the applied graph YAML

#### Scenario: Create mode generates full-coverage flow

- **WHEN** atom-graph-writer creates a graph
- **THEN** the generated flow block covers every declared phase (each phase appears as an edge source or target), with sequence edges declared explicitly.

#### Scenario: Maintain mode repairs coverage gaps

- **WHEN** a maintenance proposal adds a phase to a graph
- **THEN** the writer's flow block includes the new phase's edges (source or target), keeping full coverage.
