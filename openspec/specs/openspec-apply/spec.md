# openspec-apply Specification

## Purpose

Apply change → dual-axis review → bounded rework → archive. Asset: `packages/graph-scheduler/graphs/openspec-apply.taskflow.yaml`.

## Requirements

### Requirement: Spec-skill loading per affected domain

- **WHEN** `apply-change` implements a change
- **THEN** the task SHALL declare the domain → spec-skill mapping rule (graph → atom-graph-spec, skill → atom-skill-spec, doc → atom-doc-maintain) and load + validate against each spec skill corresponding to the change's affected files, BEFORE and during writing (standards at write time, not only review time)
- **AND** the change SHALL be resolved from `{args.changeName}` → `openspec list --json` single active → blocked + candidates (never ask; unchanged)

#### Scenario: Apply loads spec skill before writing

- **WHEN** apply-change implements a change whose contextFiles include a graph definition
- **THEN** it SHALL load atom-graph-spec before writing and validate the written artifact against its rule classes

#### Scenario: Doc-only change loads atom-doc-maintain

- **WHEN** apply-change implements a change touching only documents
- **THEN** it SHALL load atom-doc-maintain (Format Reference) before writing

### Requirement: Review channels carry no hardcoded single-kind spec skill

- **WHEN** `change-review` reviews the implementation
- **THEN** it SHALL apply the same domain → spec-skill mapping rule against the change's affected files
- **AND** SHALL NOT declare a static `skill:atom-graph-spec` channel — the spec skills load dynamically per affected domain

#### Scenario: Skill-only change passes review with atom-skill-spec

- **WHEN** a change touches only SKILL.md files and reaches change-review
- **THEN** the review SHALL validate against atom-skill-spec rules

#### Scenario: No static atom-graph-spec channel

- **WHEN** a validator scans openspec-apply.taskflow.yaml
- **THEN** no phase SHALL declare `skill:atom-graph-spec` in channels

### Requirement: Pipeline Topology

The graph SHALL be ordered as `apply-change → change-review → change-accept → archive`, with dependency edges forming a unidirectional chain: change-review depends on apply-change, change-accept depends on change-review, and archive depends on change-accept. change-accept SHALL be an approval-type node depending solely on the single change-review node.

#### Scenario: Full-chain sequential execution

- **WHEN** the user starts the graph with `graph_start { graphName: "openspec-apply", args: { changeName: "<name>" } }`
- **THEN** apply-change executes first, followed by change-review, change-accept, and archive activating in sequence
- **THEN** failure of any node does not block subsequent advance; the failure state propagates along the graph until completion

#### Scenario: Graph terminates after archiving

- **WHEN** change-accept decides continue and archive finishes executing
- **THEN** the graph enters the completed state with no leftover nodes

### Requirement: Entry contract (NEVER ask)

change name resolution SHALL be fully automatic — no questions asked. Precedence: `changeName` from `graph_start` args → the unique active change from `openspec list --json` → on ambiguity, output `apply_status: blocked` with the candidate list, and never ask the user.

#### Scenario: args take precedence

- **WHEN** `graph_start` args provide `changeName`
- **THEN** apply-change uses that name directly, skipping list probing
- **THEN** the output `change_name` field echoes the change name actually used

#### Scenario: Single-choice list fallback

- **WHEN** args are missing and `openspec list --json` returns exactly one active change
- **THEN** apply-change uses that sole change
- **THEN** it outputs the `change_name` field and states "Using change: <name>"

#### Scenario: Ambiguity blocked without asking

- **WHEN** args are missing and there is more than one active change
- **THEN** apply-change outputs `apply_status: blocked` and the list of candidate change names
- **THEN** it makes no implementation changes and asks no questions

### Requirement: Structured apply output contract

apply-change SHALL output a machine-parseable structured block: `change_name`, `apply_status: complete | blocked | partial`, `changed_files` (the list of implementation-changed files), and `spec_paths` (spec/design/tasks paths from the openspec instructions contextFiles). The change-review artifact, the change-accept decision input, and the archive change name SHALL all be consumed from this single source.

#### Scenario: Output contract fields complete

- **WHEN** apply-change finishes (in any of the complete/partial/blocked states)
- **THEN** the output contains the four fields `change_name`, `apply_status`, `changed_files`, and `spec_paths`
- **THEN** downstream nodes (review/gate/archive) read that output instead of parsing the openspec CLI themselves

#### Scenario: partial state carries a reason

- **WHEN** task implementation hits a blocker midway (design flaw, missing environment)
- **THEN** apply_status is partial and the output includes a `blocked_reason` field describing the blocking point
- **THEN** the review node executes as usual, and the review result of the partial artifact drives the gate decision

### Requirement: Bounded automatic rework gate

change-accept SHALL decide automatically via an eval condition: `when: 'change-review output shows overall: fail AND retryAttempt < 2'` → retry to apply-change; when the condition does not match (DEBT, no issues, or retryAttempt at the bound) it SHALL fall through to the human approval() card. The automatic rework condition SHALL reference the atom-dual-review output contract field `overall: fail` and set an upper bound on retryAttempt — it SHALL NOT use non-contract wording such as "FAIL verdict" and SHALL NOT loop unboundedly.

#### Scenario: FAIL automatic rework

- **WHEN** change-review outputs `overall: fail` and the current apply-change retryAttempt < 2
- **THEN** change-accept automatically produces a retry decision targeting apply-change without showing the decision UI
- **THEN** the retry annotation carries a summary of the change-review findings and is injected into the apply-change context with the jump

#### Scenario: At the bound, fall through to human

- **WHEN** change-review outputs `overall: fail` but retryAttempt has reached the upper bound (≥2)
- **THEN** the automatic decision does not trigger and the decision UI is presented to the user (continue/retry/jump options)
- **THEN** the user can manually choose continue, retry, or jump; the graph does not hang

#### Scenario: DEBT or no issues go to human approval

- **WHEN** change-review outputs `overall: pass` (with or without warnings)
- **THEN** no eval condition matches and the decision UI is presented to the user
- **THEN** after the user approves (continue), the run proceeds to archive; warnings do not trigger automatic rework

### Requirement: Rework feedback injection

apply-change SHALL declare a `node:change-review` channel to consume review findings; on the first round, a missing output on that channel SHALL be treated as a legitimate sequence (warn + skip injection), and on re-run rounds it SHALL fix each change-review finding before continuing to implement the unfinished tasks.

#### Scenario: No review output on the first round

- **WHEN** apply-change executes for the first time and change-review has not yet run (its output file is missing)
- **THEN** the `node:change-review` channel resolves to warn + skip without blocking apply-change execution
- **THEN** apply-change implements all tasks normally per the change spec

#### Scenario: Re-run consumes findings

- **WHEN** apply-change re-runs after change-accept's automatic retry
- **THEN** the channel injects the previous round's change-review output
- **THEN** apply-change first fixes the issues listed in the findings, then continues implementing the unfinished tasks

### Requirement: Archive chain

minimal-track archiving SHALL use the original `openspec-archive-change` (pure archiving, no reverse validation): the archive node SHALL read the change name and status via the `node:apply-change` channel and execute the openspec-archive-change flow only when apply_status is complete or partial (implemented portions); change name resolution SHALL ask no questions and SHALL not depend on plan-parse. A post-archive doc-maintenance flow SHALL NOT exist — the minimal track has no ADR and no fold; derived view refresh belongs to the next-stage maintain graph.

#### Scenario: Archive reads apply metadata

- **WHEN** the archive node activates
- **THEN** it parses `change_name` from the apply-change output as the `openspec archive` target
- **THEN** it archives per the openspec-archive-change flow (no Step 0 reverse validation)

#### Scenario: Archive not blocked by missing evidence

- **WHEN** unverified tasks exist at archive time
- **THEN** archive still completes per the openspec-archive-change contract (the minimal path bears no reverse-validation responsibility)

#### Scenario: Pre-archive drift blocking

- **WHEN** reverse validation is triggered in the minimal track
- **THEN** it does not execute — the minimal path has no reverse-validation responsibility; drift blocking exists only in atom-doc-lifecycle close() of the detailed track (`archive_status: blocked` + evidence gap list)
