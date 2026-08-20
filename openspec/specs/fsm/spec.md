# fsm Specification

## Purpose

Pure-function state machine core (START/COMPLETE/JUMP/FORCE_END). Asset: `packages/graph-scheduler/src/fsm/` (4 files).

## Requirements

### Requirement: No skip state or marker SHALL exist

No skip state, no skipped marker, and no skip parameter on advance SHALL exist — untargeted branch nodes stay `pending` forever and never block completion.

#### Scenario: Status set

- **WHEN** a node status is read
- **THEN** it SHALL be one of `pending`, `active`, `done`, `aborted` — no `skipped` value exists

### Requirement: Transition legality SHALL be validated by a single authority

MODIFIED: the runtime SHALL validate transition legality in exactly one place — the LangGraph runtime's transition authority owns the status guards for every transition (start/advance/rework/jump/force-end). The authority SHALL own: condition-match legality (a reported condition resolving to no outgoing edge SHALL be a loud error — the missed-condition guard restored as a graph-interpretation property), jump-target legality (graph-internal jump targets ⊆ topological ancestors ∪ `__handoff` — forward jumps SHALL be rejected loudly; the ancestor closure is precomputed at compile time), run-state guards (`graph_jump` rejects `terminated`/`completed` runs and targets outside the compiled node set with InvalidStateError — guard parity with advance), and force-end guards (no-op on `completed`/`terminated`). No separate legal-event table or secondary assert helper SHALL duplicate the guards. Operator `graph_jump` (PCL) SHALL keep its external semantics: nodeIds validation + run-state guards — operator jumps remain the graph-external backward reset.

#### Scenario: Single validation authority

- **WHEN** any runtime transition dispatches
- **THEN** legality is judged by the transition authority's guards only — no parallel table exists
- **AND** deleting the secondary validation SHALL NOT change behavior (its scenarios are covered by the transition guards)

#### Scenario: Route maps precomputed once

- **WHEN** advance transitions dispatch repeatedly on the same graph
- **THEN** no route map is consulted (the route mechanism is deleted) — condition matching reads the compiled transition table; jump-target disambiguation reads the precomputed ancestor closure

#### Scenario: Jump guard parity with advance

- **WHEN** `graph_jump` is called on a run in `terminated` or `completed` state
- **THEN** the transition SHALL fail with InvalidStateError under the same authority that guards advance

#### Scenario: Force-end guard parity with advance

- **WHEN** `graph_force_end` is called on a `completed` run
- **THEN** no state change SHALL occur (the run SHALL remain `completed`)
- **WHEN** `graph_force_end` is called on a `terminated` run
- **THEN** no state change SHALL occur

#### Scenario: Missed-condition guard fires

- **WHEN** a condition matches no outgoing edge of the reported node
- **THEN** the transition authority SHALL fail the advance loudly (never silent default, never partial activation)

#### Scenario: Forward jump rejected

- **WHEN** a graph-internal jump names a non-ancestor, non-`__handoff` target
- **THEN** the authority SHALL reject loudly — structure integrity machine-guaranteed

#### Scenario: Operator jump unchanged

- **WHEN** an operator issues `graph_jump` (PCL)
- **THEN** the external backward-reset semantics SHALL hold (target + downstream terminals → pending, retryCount++, upstream kept) — PCL vocabulary unchanged

### Requirement: Run lifecycle execution

MODIFIED: Run execution SHALL be driven by the embedded LangGraph.js runtime with the pull-based advance protocol: `graph_start` = invoke to the first interrupt; `graph_advance` = resume to the next interrupt/END. Completion SHALL be natural drain only (no active and no eligible node) — no endRun parameter exists; the direct-end path (advance `end: true`) SHALL complete the run as `completed` via adapter-level completion (reported node marked done, graph not resumed — the pending interrupt becomes inert). The advance decision channel SHALL carry the reported condition value (normal advance — the transition table routes the matched edge target; no match SHALL fail loudly — missed-condition guard) or the jump target (forced rework — backward reset then goto); the `branchTo` disambiguation channel SHALL NOT exist.

#### Scenario: START event initializes graph execution

- **WHEN** `graph_start` invokes the runtime
- **THEN** all phases initialize `pending`, the run becomes `running`, first ready batch activates, and execution pauses at the first interrupt

#### Scenario: COMPLETE event advances graph

- **WHEN** a node completion is reported via `graph_advance`
- **THEN** the node becomes `done` with completedAt set — the resume carries no durationMs
- **AND** next ready nodes activate per the flow transition table (or dependency rules) until the next interrupt

#### Scenario: COMPLETE on last phase finishes graph

- **WHEN** the final phase completes (natural drain)
- **THEN** the run becomes `completed` and no further node dispatches

#### Scenario: Rework resets target and downstream

- **WHEN** an advance carries a jump target (forced rework decision)
- **THEN** the target and downstream terminal nodes reset to `pending`, target retry count increments, upstream kept

#### Scenario: End decision completes the run

- **WHEN** an advance resumes with `end: true` (direct-end report)
- **THEN** the reported node SHALL be marked `done` and the run SHALL become `completed` — the graph is not resumed, unfinished branch nodes stay `pending`

#### Scenario: FORCE_END terminates run

- **WHEN** force-end is dispatched on a non-terminal run
- **THEN** the run becomes `terminated` — unfinished node statuses SHALL NOT be annotated

#### Scenario: Invalid transitions rejected

- **WHEN** a transition arrives for a run in a state that cannot accept it
- **THEN** the transition fails with an invalid-state error — never silently ignored

#### Scenario: Run states enumerated consistently

- **WHEN** any component reads run status
- **THEN** it SHALL read the single `fsmState` field (no status alias exists)

#### Scenario: Duration derived at snapshot time

- **WHEN** a snapshot is assembled for a node with both timestamps
- **THEN** `durationMs` equals `Date.parse(completedAt) - Date.parse(startedAt)`

#### Scenario: Natural drain

- **WHEN** no node is active and no node is eligible
- **THEN** the run completes via natural drain — untargeted branch nodes stay pending forever and never block completion

#### Scenario: Condition resume routes via transition table

- **WHEN** an advance resumes with a condition value
- **THEN** the transition table lookup SHALL produce the next activation set (matched target); no match SHALL fail loudly

#### Scenario: Jump resume applies backward reset

- **WHEN** an advance resumes with a jump target
- **THEN** the target and its downstream terminal closure reset to pending with retryCount incremented (never zeroed), upstream kept, then the target activates
