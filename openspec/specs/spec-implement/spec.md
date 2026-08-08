# spec-implement Specification

## Purpose

Pure implementation graph — consumes an existing OpenSpec change (produced by the adopt stage or provided standalone) and implements it. No spec generation; rework is the single loop in arch-review-loop.

## Requirements

### Requirement: Implementation graph auto-loop

spec-implement SHALL be an independently executable implementation graph over an EXISTING change: `spec-extract` SHALL resolve the change from the upstream channel when composed (the adopt stage's produced change) or from `{args.changeName}` when run standalone (confirm the change exists — missing → `spec_status: blocked` + candidates). Extraction SHALL never ask questions and SHALL never generate a change. The `spec-generate` node SHALL NOT exist. `adr_created` and `decisions` SHALL echo the adoption record (injected), never re-derived. The pipeline-level doc-maintenance stage SHALL NOT exist — the track graphs own their post-archive closure (detailed: atom-doc-lifecycle; minimal: plain openspec-archive-change). The `implement-loop-gate` node SHALL NOT exist — rework is owned by arch-review-loop's single loop-gate.

#### Scenario: Standalone execution with args

- **WHEN** spec-implement runs standalone (not composed)
- **THEN** spec-extract SHALL read the change at `{args.changeName}` and emit scope + ADR echo — no interview, no generation

#### Scenario: Composed execution consumes the adopted change

- **WHEN** the loop's implement stage composes spec-implement
- **THEN** spec-extract SHALL resolve the change from the upstream channel (node:adopt/spec-propose) and echo adr_created/decisions from the adoption record (node:adopt/adopting)

#### Scenario: Missing change never completes silently

- **WHEN** spec-extract reports spec_status: blocked (no change resolvable)
- **THEN** pipeline-done SHALL output judgment_incomplete: true and suggest graph_jump back to the entry node — never present the run as a completed implementation

#### Scenario: Auto loop until archive succeeds

- **WHEN** the pipeline runs in auto mode and the archive has not succeeded (within the loop bound)
- **THEN** the arch-review-loop loop-gate SHALL re-enter the requirement stage (the report's top_rec_remaining stays true mid-round) — the round re-reviews implementation evidence and re-adopts/re-implements; the machinery itself has no internal re-run gate

#### Scenario: Track-owned closure

- **WHEN** a minimal-track round completes (openspec-apply archive succeeds)
- **THEN** the archive SHALL run through openspec-archive-change (plain), and spec-implement declares no doc-maintenance stage
- **AND** a detailed-track round SHALL close through atom-doc-lifecycle (reverse-validated archive + ADR fold + index)

#### Scenario: Single doc-maintenance ownership

- **WHEN** a minimal-track round completes (openspec-apply archive succeeds)
- **THEN** no doc-update (or any doc-maintenance flow) SHALL run — the plain archive is the entire post-approval closure (scenario name retained for spec-sync continuity)

### Requirement: Track gate on the adopted change

`pipeline-accept` SHALL depend on `[spec-extract]` and gate the implementation track on the echoed ADR judgment: no ADR → minimal track (openspec-apply); ADR created → detailed track (openspec-engineer). Branch-route enforcement unchanged (a branch-route approval SHALL NOT complete without branchTo).

#### Scenario: ADR judgment reaches the track gate

- **WHEN** the adoption record carries adr_created: true
- **THEN** spec-extract SHALL echo it and the pipeline-accept recommendation SHALL select the detailed track

### Requirement: Pipeline terminal without auto-loop

`pipeline-done` (any-join over the two tracks) SHALL be the implement stage terminal — it echoes track, adr_created, change_name, archive_succeeded (from either track's archive), and decisions; when the change could not be resolved it SHALL output `judgment_incomplete: true` and suggest a jump back to the entry. The `implement-loop-gate` node SHALL NOT exist.

#### Scenario: Missing change never completes silently

- **WHEN** spec-extract reports spec_status: blocked (no change resolvable)
- **THEN** pipeline-done SHALL output judgment_incomplete: true and suggest graph_jump back to the entry node — never present the run as a completed implementation
