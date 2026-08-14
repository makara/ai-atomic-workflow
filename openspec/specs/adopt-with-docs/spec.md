# adopt-with-docs Specification

## Purpose

Requirement adoption graph — the adopt stage of the produce → adopt → implement pipeline: confirms produced requirements (or sharpens a raw idea), keeps the doc trace (appendix, ADR, CONTEXT terms), and materializes the adopted requirements as an OpenSpec change. Replaces the grill-with-docs domain.

## Requirements

### Requirement: adopt-with-docs graph — four-phase adoption workflow

The `adopt-with-docs` graph SHALL run as a four-phase workflow: scope confirmation (`adopt-scope` — idea/goal, doc-trace intent, input document; NO output-path question), adoption conversation (`adopting` — upstream `grilling` skill graph mode, one question per turn, mandatory interview with user participation), adoption approval (`adopt-accept` — continue / re-adopt / restart scope), and spec production (`spec-propose` — main, skill: openspec-propose, upstream — change resolution per the graph-owned contract in the spec-production requirement). The `adopting` phase SHALL run inline domain-modeling side effects (CONTEXT.md term updates, ADR decision — always asked, written only after explicit user confirmation).

#### Scenario: Spec production runs per the upstream skill

- **WHEN** `spec-propose` executes
- **THEN** the node SHALL execute the propose workflow per the upstream `openspec-propose` skill (no repo-owned copy exists)
- **AND** the change name and scope SHALL arrive from the adoption conversation (`adopting` output), never from a clarifying question round

#### Scenario: Scope interview asks only user-owned topics

- **WHEN** `adopt-scope` runs its interview
- **THEN** the interview SHALL ask `idea_goal` and `doc_trace_intent`
- **AND** the interview SHALL NOT ask where the adoption record is saved (`output_path`) — the record location is a convention owned by the `adopting` phase
- **AND** `adopt-scope` output SHALL NOT carry an `output_path` field

#### Scenario: Composed adoption of a produced report

- **WHEN** the loop's adopt stage composes adopt-with-docs with the produced report as input document (channel `node:requirement/arch-review`)
- **THEN** `adopt-scope` resolves the report path from the upstream channel and emits `input_document`
- **AND** `adopting` reads the document and challenges its claims/decisions — confirming the produced requirements
- **AND** the adoption record appends as a dated appendix section to the input document

#### Scenario: Standalone raw-idea adoption

- **WHEN** adopt-with-docs runs standalone (no input document)
- **THEN** `adopt-scope` runs the raw-idea interview (`input_document: none`)
- **AND** `adopting` derives the record path itself — `docs/adopt/<YYYY-MM-DD>-<slug>.md` (dated convention, no user question)

### Requirement: Spec production from adopted consensus

After the adoption approval (`adopt-accept` Continue), `spec-propose` SHALL generate the delta spec change via the upstream `openspec-propose` skill: change name from the adopted requirement (upstream `change_name` → `{args.changeName}` → single active openspec change → `spec_status: blocked` + candidates); re-rounds SHALL update the same change rather than create duplicates; the change SHALL be created only after adoption is confirmed (no orphan changes on rejection). Material ambiguity not resolved by the adoption conversation SHALL be recorded as reasonable assumptions in the planning artifacts per the upstream skill guardrails — the node never guesses a change name. Delta authoring SHALL follow the graph-owned discipline: before authoring `specs/<capability-path>/spec.md`, read the target main spec's requirement names (`openspec/specs/<capability-path>/spec.md`); MODIFIED MUST reference an existing requirement name from the main spec as-read — never an invented name; ADDED/REMOVED SHALL describe genuine additions/removals relative to the main spec as-read. Output: `change_name`, `domains`, `file_paths`, `validation_result`, `spec_status`, `adr_created` (echo), `decisions` (echo).

#### Scenario: Change materializes after adoption

- **WHEN** the user confirms adoption at `adopt-accept`
- **THEN** `spec-propose` SHALL create/update the OpenSpec change from the adopted consensus (proposal, delta specs, design, tasks)
- **AND** the change's decisions echo the adoption record's `adr_created` and `decisions`

#### Scenario: Ambiguity records assumptions

- **WHEN** `spec-propose` faces material ambiguity not resolved by the adoption conversation (e.g. capability path organization)
- **THEN** the node SHALL record the reasonable assumption in the planning artifacts per the upstream skill guardrails and continue — the flow is not interrupted for clarification the adoption conversation already settled

#### Scenario: No change name available

- **WHEN** no upstream change name and no `{args.changeName}` and no single active openspec change exists
- **THEN** `spec-propose` SHALL output `spec_status: blocked` with the candidate list — never guess a name

#### Scenario: Delta authoring references existing requirement names

- **WHEN** `spec-propose` authors `specs/<capability-path>/spec.md`
- **THEN** the node SHALL read the target main spec's requirement names before writing
- **AND** MODIFIED SHALL reference an existing requirement name from the main spec as-read — never an invented name
- **AND** ADDED/REMOVED SHALL describe genuine additions/removals relative to the main spec as-read

### Requirement: Record output contract

The graph output SHALL carry `input_document` (path | none), `appended_to` (path | none — the input document when the appendix was appended), `record_path` (path — where the record lives, grilling-derived), alongside `decisions` (the grilling decision list — `consensus` wording retired) and `shared_understanding` (boolean — user confirmed the frontier is empty and nothing is missing).

#### Scenario: Observable attachment

- **WHEN** the adopt stage completes
- **THEN** downstream stages read `appended_to` / `record_path` to locate the confirmation trace
- **AND** the record carries `decisions` (list of confirmed choices) + `shared_understanding` (true only after the user confirms the frontier is empty)

### Requirement: ADR decision always user-confirmed

The `adopting` phase SHALL always put the ADR decision to the user as a question — never silently skip. The three-condition test shapes the agent's recommendation (which may be yes or no); the question is asked regardless of the recommendation.

#### Scenario: ADR judged unnecessary — still asked

- **WHEN** the three-condition test fails (agent judges no ADR warranted)
- **THEN** `adopting` SHALL still ask the user whether to record an ADR
- **AND** the recommendation may be "no", but the decision is the user's — no silent skip path exists

#### Scenario: ADR judged warranted — recommended and confirmed

- **WHEN** the three-condition test passes
- **THEN** `adopting` SHALL recommend recording the ADR and ask for confirmation before creating it

### Requirement: Adoption interview ends with explicit close

The `adopting` phase grilling session SHALL end with a mandatory closing question — "Anything to add?" — after the frontier is exhausted. Shared understanding SHALL be declared only after the user confirms nothing is missing. The closing question SHALL NOT be skipped in auto mode (exploration conversations are never auto-gated) and SHALL NOT be zero-questioned: at least one question round is mandatory per graph dispatch (encapsulation contract — upstream grilling skill body untouched).

#### Scenario: Closing question always asked

- **WHEN** the grilling frontier exhausts its branches
- **THEN** the agent SHALL ask "Anything to add?" (recommended: no/complete)
- **AND** only after the user confirms SHALL shared understanding be declared and the adoption record written

#### Scenario: Grilling round never skipped

- **WHEN** the adopting node dispatches with full context coverage
- **THEN** at least one question round SHALL still be presented — zero-question degradation never applies to grilling (encapsulation contract)

### Requirement: No-content adoption defense layer

When `adopt-scope` reports nothing to adopt, the adoption conversation SHALL append no adoption record (no appendix section, empty `change_name`), and `adopt-accept` SHALL recommend `end` (auto mode executes endRun; manual mode confirms once).

#### Scenario: Confirmed empty adoption ends the run

- **WHEN** the user confirms no new adoption at `adopt-scope` (idea_goal: none)
- **THEN** `adopting` SHALL write no appendix record and emit empty `change_name`
- **AND** `adopt-accept` SHALL recommend `end` — the run completes with zero side-effect nodes

#### Scenario: Content adoption proceeds unchanged

- **WHEN** adopt-scope confirms adoption content
- **THEN** `adopting` appends the dated appendix as today, `spec-propose` materializes the change
