# adopt-with-docs Specification

## Purpose

Requirement adoption graph — the adopt stage of the produce → adopt → implement pipeline: confirms produced requirements, keeps the doc trace (appendix, ADR, CONTEXT terms), and materializes the adopted requirements as an OpenSpec change. Replaces the grill-with-docs domain.

## Requirements

### Requirement: adopt-with-docs graph — four-phase adoption workflow

`adopt-with-docs` SHALL be a non-interactive adoption subgraph declaring `interaction: none` — the interactive phases (`adopt-scope` interview, `adopting` grilling conversation, `adopt-accept` approval) are REMOVED (no scope confirmation, no adoption conversation, no adoption approval inside the graph; zero user questions at dispatch). The remaining spec-production phase (`spec-propose` — main, skill: openspec-propose) SHALL be a self-deciding pipeline consuming the adoption consensus from the composing framework graph's interactive nodes via channels (change name + scope + ADR judgment + decisions arrive from the framework's adoption scope/approval, never from a clarifying question round). Interactive adoption scope and approval SHALL be hosted by the composing framework graph's own interactive nodes. The no-content rule SHALL be preserved: when the framework's adoption scope reports nothing to adopt, the pipeline SHALL append no adoption record and produce no change — zero side effects.

#### Scenario: Spec production runs per the upstream skill

- **WHEN** `spec-propose` executes
- **THEN** the node SHALL execute the propose workflow per the upstream `openspec-propose` skill (no repo-owned copy exists)
- **AND** the change name and scope SHALL arrive from the framework-hosted adoption consensus (channel), never from a clarifying question round

#### Scenario: Scope interview asks only user-owned topics

- **WHEN** the composing framework graph's adoption scope runs its interview
- **THEN** the interview SHALL ask `idea_goal` and `doc_trace_intent`
- **AND** the interview SHALL NOT ask where the adoption record is saved (`output_path`) — the record location is a convention owned by the adoption pipeline
- **AND** the scope output SHALL NOT carry an `output_path` field

#### Scenario: Composed adoption of a produced report

- **WHEN** the loop's adopt stage composes adopt-with-docs with the produced report as input document (channel `node:requirement/present-candidates`)
- **THEN** the framework-hosted adoption scope resolves the report path from the upstream channel and emits `input_document`
- **AND** the adoption consensus (decisions + shared_understanding) SHALL flow to the subgraph via channels — the subgraph consumes it, never re-conducts the conversation
- **AND** the adoption record appends as a dated appendix section to the input document

#### Scenario: Standalone raw-idea adoption

- **WHEN** adopt-with-docs runs standalone (no input document, no framework hosting)
- **THEN** the graph SHALL NOT conduct a raw-idea adoption conversation (no interview/grilling phases exist) — raw-idea journeys route through a framework graph that hosts the interactive adoption scope and approval

### Requirement: Spec production from adopted consensus

After the composing framework graph's adoption approval confirms the adoption, `spec-propose` SHALL generate the delta spec change via the upstream `openspec-propose` skill: change name from the adopted requirement (upstream `change_name` → `{args.changeName}` → single active openspec change → `spec_status: blocked` + candidates); re-rounds SHALL update the same change rather than create duplicates; the change SHALL be created only after adoption is confirmed (no orphan changes on rejection). Material ambiguity not resolved by the framework-hosted adoption consensus SHALL be recorded as reasonable assumptions in the planning artifacts per the upstream skill guardrails — the node never guesses a change name. Delta authoring SHALL follow the graph-owned discipline: before authoring `specs/<capability-path>/spec.md`, read the target main spec's requirement names (`openspec/specs/<capability-path>/spec.md`); MODIFIED MUST reference an existing requirement name from the main spec as-read — never an invented name; ADDED/REMOVED SHALL describe genuine additions/removals relative to the main spec as-read. Output: `change_name`, `domains`, `file_paths`, `validation_result`, `spec_status`, `adr_created` (echo), `decisions` (echo).

#### Scenario: Change materializes after adoption

- **WHEN** the composing framework graph's adoption approval confirms the adoption
- **THEN** `spec-propose` SHALL create/update the OpenSpec change from the adopted consensus (proposal, delta specs, design, tasks)
- **AND** the change's decisions echo the adoption record's `adr_created` and `decisions`

#### Scenario: Ambiguity records assumptions

- **WHEN** `spec-propose` faces material ambiguity not resolved by the framework-hosted adoption consensus (e.g. capability path organization)
- **THEN** the node SHALL record the reasonable assumption in the planning artifacts per the upstream skill guardrails and continue — the flow is not interrupted for clarification the framework-hosted adoption scope already settled

#### Scenario: No change name available

- **WHEN** no upstream change name and no `{args.changeName}` and no single active openspec change exists
- **THEN** `spec-propose` SHALL output `spec_status: blocked` with the candidate list — never guess a name

#### Scenario: Delta authoring references existing requirement names

- **WHEN** `spec-propose` authors `specs/<capability-path>/spec.md`
- **THEN** the node SHALL read the target main spec's requirement names before writing
- **AND** MODIFIED SHALL reference an existing requirement name from the main spec as-read — never an invented name
- **AND** ADDED/REMOVED SHALL describe genuine additions/removals relative to the main spec as-read

### Requirement: Record output contract

The graph output SHALL carry `input_document` (path | none), `appended_to` (path | none — the input document when the appendix was appended), `record_path` (path — where the record lives; the record location is a convention owned by the adoption pipeline, no user question), alongside `decisions` (the adoption decision list echoed from the framework-hosted consensus — `consensus` wording retired) and `shared_understanding` (boolean — echoed from the framework-hosted adoption consensus, true only after the user confirmed the frontier is empty and nothing is missing).

#### Scenario: Observable attachment

- **WHEN** the adopt stage completes
- **THEN** downstream stages read `appended_to` / `record_path` to locate the confirmation trace
- **AND** the record carries `decisions` (list of confirmed choices) + `shared_understanding` (true only after the framework-hosted adoption approval confirms the frontier is empty)
