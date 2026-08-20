# spec-implement Specification

## Purpose

Pure implementation graph — consumes an existing OpenSpec change (produced by the adopt stage or provided standalone) and implements it. No spec generation; rework is the single loop in arch-review-loop.

## Requirements

### Requirement: Implementation graph auto-loop

MODIFIED: spec-implement SHALL be an independently executable implementation graph over an EXISTING change declaring `interaction: none` — the graph is already zero-interactive; the declaration makes the non-interactive contract explicit and auditable (graph-maintain compliance-scan clean). `spec-extract` SHALL resolve the change from `{args.changeName}` — spec-implement runs standalone, launched as a sibling run by the composing framework's router node (composition is deleted; the upstream-channel resolution no longer exists). Confirm the change exists — missing → `spec_status: blocked` + candidates. Extraction SHALL never ask questions and SHALL never generate a change. The `spec-generate` node SHALL NOT exist. `adr_created` and `decisions` SHALL echo the adoption record (passed via `graph_start` args by the launching router), never re-derived.

#### Scenario: Standalone execution with args

- **WHEN** spec-implement runs standalone (launched via `graph_start` by a router node or directly)
- **THEN** spec-extract SHALL read the change at `{args.changeName}` and emit scope + ADR echo — no interview, no generation

#### Scenario: Sibling-run execution receives change name and adoption echo

- **WHEN** the loop's implement stage router launches spec-implement as a sibling run
- **THEN** the router SHALL pass the change name and the adoption echo (`adr_created`, `decisions`) via `graph_start` args
- **AND** spec-extract SHALL consume them from `{args}` — no upstream composed-member channel exists

#### Scenario: Composed execution consumes the adopted change

- **WHEN** the loop's implement stage router launches spec-implement (previously the composed execution path)
- **THEN** spec-extract SHALL resolve the change from `{args.changeName}` and echo `adr_created`/`decisions` from the adoption record passed via `graph_start` args — the composed upstream-channel resolution no longer exists (composition is deleted)

#### Scenario: Missing change never completes silently

- **WHEN** spec-extract reports spec_status: blocked (no change resolvable)
- **THEN** pipeline-done SHALL output judgment_incomplete: true and suggest graph_jump back to the entry node — never present the run as a completed implementation

#### Scenario: Auto loop until archive succeeds

- **WHEN** the pipeline runs and the archive has not succeeded (within the loop bound)
- **THEN** the arch-review-loop rework node SHALL re-enter the requirement stage (the report's top_rec_remaining stays true mid-round) — the round re-reviews implementation evidence and re-adopts/re-implements; the machinery itself has no internal re-run gate

#### Scenario: Track-owned closure

- **WHEN** a minimal-track round completes (openspec-apply archive succeeds)
- **THEN** the archive SHALL run through openspec-archive-change (plain), and spec-implement declares no doc-maintenance stage
- **AND** a detailed-track round SHALL close through atom-doc-lifecycle (reverse-validated archive + ADR fold + index)

#### Scenario: Single doc-maintenance ownership

- **WHEN** a minimal-track round completes (openspec-apply archive succeeds)
- **THEN** no doc-update (or any doc-maintenance flow) SHALL run — the plain archive is the entire post-approval closure

#### Scenario: Non-interactive compliance clean

- **WHEN** graph-maintain audits `spec-implement`
- **THEN** the non-interactive compliance scan SHALL report clean — no interaction markers found

### Requirement: Track gate on the adopted change

MODIFIED: `track-accept` SHALL depend on `[spec-extract]` and SHALL be a `template: router` node whose `template_args.paths` are `[openspec-apply, openspec-engineer]` — the two candidate graphs. The selection SHALL be self-deciding: the track criterion (`adr_created` echo) SHALL be evaluated inline by the executing agent from the upstream `spec-extract` output — a hard criterion in the router node's context (the compiled router task text instructs evaluating a hard criterion stated in the context against the candidate graphs' metadata; the `adr_created` value arrives via the upstream echo). The chosen graph SHALL be started as a sibling run (`graph_start`) and driven to completion. The gate SHALL NOT present an approval() card when the hard criterion decides, SHALL NOT declare composing (`use`) phases for the tracks, and SHALL NOT route via `branchTo` — the unselected graph is simply never started.

#### Scenario: ADR judgment reaches the track gate

- **WHEN** the adoption record carries adr_created: true
- **THEN** spec-extract SHALL echo it and the track gate SHALL select the detailed track (`openspec-engineer`)

#### Scenario: Track gate self-decides on adr_created

- **WHEN** `spec-extract` outputs `adr_created: false`
- **THEN** `track-accept` evaluates the criterion inline and starts `openspec-apply` (minimal track) without presenting a card
- **WHEN** `spec-extract` outputs `adr_created: true`
- **THEN** `track-accept` starts `openspec-engineer` (detailed track) without presenting a card

#### Scenario: Track gate never drops branchTo

- **WHEN** `track-accept` completes
- **THEN** the decision output ALWAYS carries the chosen track (the graph name — `openspec-apply` or `openspec-engineer`) as the launched sibling run — the gate SHALL NOT complete without a chosen track, and the unselected graph is never started (no branchTo target exists — the path activation is the sibling run)

#### Scenario: Track router needs no composing phases

- **WHEN** spec-implement is loaded
- **THEN** `minimal-track` / `detailed-track` composing phases SHALL NOT exist — the paths are the two graphs in `template_args.paths`, activated as sibling runs

### Requirement: Pipeline terminal without auto-loop

MODIFIED: `pipeline-done` SHALL be the implement stage terminal — it SHALL depend on `[track-accept]` (the router — no any-join over track terminals; the chosen path's result arrives via the router's report) and SHALL echo track (chosen_graph), adr_created, change_name, archive_succeeded (from the chosen run's report), and decisions; when the change could not be resolved it SHALL output `judgment_incomplete: true` and suggest a jump back to the entry. The `implement-loop-gate` node SHALL NOT exist.

#### Scenario: Terminal reads router result

- **WHEN** `pipeline-done` executes after the router's chosen graph run completes
- **THEN** it SHALL read the result via the `node:track-accept` channel (chosen_graph / run_id / archive_succeeded / outputs)
- **AND** it SHALL NOT depend on or read any track composing-phase terminal

#### Scenario: Missing change never completes silently

- **WHEN** spec-extract reports spec_status: blocked (no change resolvable)
- **THEN** pipeline-done SHALL output judgment_incomplete: true and suggest graph_jump back to the entry node — never present the run as a completed implementation
