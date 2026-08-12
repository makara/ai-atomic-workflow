# fsm Specification

## Purpose

Pure-function state machine core (START/COMPLETE/JUMP/FORCE_END). Asset: `packages/graph-scheduler/src/fsm/` (4 files).

## Requirements

### Requirement: Finite state machine lifecycle

MODIFIED: Completion determination SHALL be one of two mechanisms: **natural drain** (no active and no eligible — route-aware determination, O(1)) or **approval end action** (explicit end; the run completes directly). The COMPLETE event SHALL NOT carry `durationMs` — node completion reports `phaseId` plus optional routing fields only; duration SHALL be derived by snapshot assembly from `startedAt`/`completedAt`. FsmNodeState SHALL NOT contain a durationMs field.

#### Scenario: Same-source when guard cascades through all-join chain

- **WHEN** a gate jump resets a target inside an all-join chain
- **THEN** the reset propagates through the join (all deps pending), re-running the chain

#### Scenario: Any-join cascade unchanged

- **WHEN** a gate jump resets a target inside an any-join
- **THEN** the any-join waits for the surviving done dep; the reset dep does not block it

#### Scenario: All-join node without when guard not cascaded

- **WHEN** an all-join node has no gate in its upstream
- **THEN** it resolves purely on dependency terminality

#### Scenario: JUMP event resets target and upstream

- **WHEN** a JUMP event targets a node
- **THEN** the target and its downstream terminal nodes reset to pending, upstream kept, retryCount incremented

#### Scenario: Unreachable metrics branch removed

- **WHEN** snapshot metrics are aggregated
- **THEN** no unreachable branch exists in the aggregation path

#### Scenario: Natural drain

- **WHEN** no node is active and no node is eligible
- **THEN** the run completes via natural drain — unselected-route members stay pending forever and never block completion

#### Scenario: Approval end action

- **WHEN** an approval decision chooses end
- **THEN** `graph_advance(endRun: true)` completes the run immediately

#### Scenario: START event initializes graph execution

- **WHEN** `graph_start` dispatches START
- **THEN** all phases initialize `pending`, the run becomes `running`, first ready batch activates

#### Scenario: COMPLETE event advances graph

- **WHEN** a node completion is reported
- **THEN** the node becomes `done` with `completedAt` set — the event carries no durationMs
- **AND** next ready nodes activate per topology/route rules

#### Scenario: COMPLETE on last phase finishes graph

- **WHEN** the final phase completes (natural drain)
- **THEN** the run becomes `completed` and no further node dispatches

#### Scenario: JUMP event resets target and downstream

- **WHEN** a JUMP targets a phase
- **THEN** the target and downstream terminal nodes reset to `pending`, target retryCount increments, upstream kept

#### Scenario: FORCE_END terminates run

- **WHEN** FORCE_END is dispatched
- **THEN** unfinished nodes become `aborted`, the run becomes `terminated`

#### Scenario: Invalid state transitions rejected

- **WHEN** an event arrives for a run in a state that cannot accept it
- **THEN** the transition fails with InvalidStateTransitionError — never silently ignored

#### Scenario: Run states enumerated consistently

- **WHEN** any component reads run status
- **THEN** it SHALL read the single `fsmState` field (no status alias exists)

#### Scenario: Duration derived at snapshot time

- **WHEN** a snapshot is assembled for a node with both timestamps
- **THEN** `durationMs` equals `Date.parse(completedAt) - Date.parse(startedAt)`

### Requirement: No skip state or marker SHALL exist

MODIFIED: No skip state, no skipped marker, and no skip parameter on advance SHALL exist — unchosen branch-route nodes stay `pending` forever and never block completion.

#### Scenario: Status set

- **WHEN** a node status is read
- **THEN** it SHALL be one of `pending`, `active`, `done`, `aborted` — no `skipped` value exists
