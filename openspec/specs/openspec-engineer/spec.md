# openspec-engineer Specification

## Purpose

Detailed implementation (spec synthesis → tickets → tdd → dual review → archive). Assets: `packages/graph-scheduler/graphs/openspec-engineer.taskflow.yaml`.

## Requirements

### Requirement: openspec-engineer pipeline — detailed track full closure

The `openspec-engineer` graph SHALL run the detailed implementation track for a change with a recorded ADR decision: spec synthesis, ticket splitting, tdd implementation, dual-axis review, bounded auto-rework gate, human acceptance, and lifecycle closure — in that order. Change resolution SHALL follow the same NEVER-ask rule as openspec-apply: `{args.changeName}` → single active change via `openspec list --json` → `blocked` with candidate list (no guess). The closure (`openspec-archive` node) SHALL dispatch atom-doc-lifecycle — reverse-validated archive + ADR decision-fold + index rebuild in one unit. The post-archive doc-maintenance flow SHALL NOT exist.

#### Scenario: Detailed track executes end to end

- **WHEN** the graph is started with a change name or a single active change exists and the change has a recorded ADR
- **THEN** the graph SHALL produce a spec (to-spec), split it into tickets (to-tickets), implement tickets with tdd discipline (implement), review the implementation dual-axis against spec + tickets + ADR (implement-review), gate on `overall: fail` with bounded rework (implement-gate), present the human acceptance card (implement-accept), and close the change through atom-doc-lifecycle (openspec-archive)
- **THEN** the change SHALL be archived only after reverse-validation passes (task ledger evidence matched by code evidence)
- **AND** when the change created an ADR, the fold SHALL run in the same closure pass

#### Scenario: Spec synthesis reads the recorded ADR

- **WHEN** to-spec synthesizes the spec for a change with a recorded ADR
- **THEN** it SHALL read the change's delta specs (`openspec/changes/<change_name>/`) and the ADR referencing the change (`docs/adr/` — most recent)
- **THEN** the spec SHALL honor the ADR decision and the output SHALL include `adr_path` for downstream review consumption

#### Scenario: Review honors ADR + spec + tickets contract

- **WHEN** implement-review audits the implementation
- **THEN** it SHALL check ticket acceptance criteria, spec commitments, and ADR decision conformance — `overall: fail` output triggers the bounded gate rework (retry implement, `retryAttempt < 2`), never silent pass

#### Scenario: Blocked change resolution never asks

- **WHEN** the graph is started with no change name in args and zero or multiple active changes exist
- **THEN** the graph SHALL output `spec_status: blocked` with the candidate list and SHALL NOT prompt the user

### Requirement: openspec-engineer channel locality — zero cross-level channels

All channel references inside `openspec-engineer` SHALL resolve within the track itself (flatten-prefixed legal targets): `node:implement-review` (implement ↔ review feedback), `node:to-spec` / `node:to-tickets` (archive/review consumption). Spec standards arrive per affected domain via the declared mapping rule — no static single-kind `skill:` channel. No channel SHALL reference nodes outside the track — independent runs and composed runs SHALL carry the same contract, keeping the graph fleet at zero validate warnings.

#### Scenario: Independent and composed runs share the contract

- **WHEN** `openspec-engineer` runs standalone (graph_start) or composed inside `arch-review-loop` (flow use)
- **THEN** every `node:` channel resolves in both forms — no ghost channels, no fleet warning regression

#### Scenario: Retry and jump targets stay in-track

- **WHEN** implement-gate eval retries or implement-accept jumps
- **THEN** targets SHALL be explicit and resolve to in-track nodes only (implement / to-spec) — cross-track re-routing is expressed via pilot `graph_jump`, never in-graph edges

### Requirement: openspec-engineer naming family consistency

System documentation and skill descriptions SHALL reference the graph as `openspec-engineer` (never `openspec-detail` or `dev-pipeline`). Project registry files SHALL register `openspec-engineer` with the graph definition file `openspec-engineer.taskflow.yaml`.

#### Scenario: Docs and registry reference the settled name

- **WHEN** CONTEXT.md, README, and registry.json mention the detailed track graph
- **THEN** they SHALL use `openspec-engineer` — zero `dev-pipeline` / `openspec-detail` occurrences in non-historical documents

### Requirement: openspec-engineer human acceptance — rework semantics disclosed

The `implement-accept` decision card SHALL disclose the rework semantics of the Revise route: the rework re-runs `to-spec` and `to-tickets` before `implement` (JUMP resets the upstream closure — seam confirmation and granularity quiz are re-asked), and prior review feedback is injected into `implement` via the `node:implement-review` channel.

#### Scenario: Revise route states full re-run scope

- **WHEN** `implement-accept` presents the Revise implementation option
- **THEN** the card text SHALL state that the rework re-runs `to-spec` and `to-tickets` (both confirmations re-asked) before re-running `implement`
- **THEN** the card text SHALL state that prior review feedback is injected into `implement` via the `node:implement-review` channel

#### Scenario: Accept and archive route unchanged

- **WHEN** `implement-accept` presents the Accept and archive option
- **THEN** the route SHALL advance to `openspec-archive` unchanged — no additional interaction introduced

### Requirement: Spec-skill loading per affected domain

- **WHEN** `implement` implements a change
- **THEN** the task SHALL declare the domain → spec-skill mapping rule (graph → atom-graph-spec, skill → atom-skill-spec, doc → atom-doc-maintain) and load + validate against each spec skill corresponding to the change's affected files, BEFORE and during writing
- **AND** the change SHALL be resolved from the upstream channel when composed or `{args.changeName}` → single active → blocked + candidates (never ask; unchanged)

#### Scenario: Apply loads spec skill before writing

- **WHEN** implement writes a graph definition
- **THEN** it SHALL load atom-graph-spec before writing and validate the written artifact against its rule classes

#### Scenario: Implement loads spec skill before writing

- **WHEN** implement writes a graph definition or SKILL.md
- **THEN** it SHALL load the corresponding spec skill (atom-graph-spec / atom-skill-spec / atom-doc-maintain) before writing

#### Scenario: Doc-only change loads atom-doc-maintain

- **WHEN** implement writes documents
- **THEN** it SHALL load atom-doc-maintain (Format Reference) before writing

### Requirement: Review channels carry no hardcoded single-kind spec skill

- **WHEN** `implement-review` reviews the implementation
- **THEN** it SHALL apply the same domain → spec-skill mapping rule against the change's affected files
- **AND** SHALL NOT declare a static `skill:atom-graph-spec` channel — the spec skills load dynamically per affected domain

#### Scenario: Skill-only change passes review with atom-skill-spec

- **WHEN** a change touches only SKILL.md files and reaches implement-review
- **THEN** the review SHALL validate against atom-skill-spec rules

#### Scenario: No static atom-graph-spec channel

- **WHEN** a validator scans openspec-engineer.taskflow.yaml
- **THEN** no phase SHALL declare `skill:atom-graph-spec` in channels

### Requirement: Archive phase reads verification.md via node: stream field

The `openspec-engineer` archive phase SHALL NOT declare a file glob for the change's verification document. Upstream phases (to-spec / to-tickets / implement) SHALL emit the change name and verification document path as output fields; the archive phase SHALL consume them via `node:` stream channels — tasks name consumed FIELDS, never files or mechanisms.

#### Scenario: Verification path travels as a field

- **WHEN** the implement phase completes and emits `change_name` + `verification_path` fields
- **THEN** the archive phase SHALL read the verification document at the emitted path via the `node:` channel — no `openspec/changes/**/verification.md` glob in graph channels
