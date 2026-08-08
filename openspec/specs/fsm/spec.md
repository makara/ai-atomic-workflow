# fsm Specification

## Purpose

Pure-function state machine core (START/COMPLETE/JUMP/FORCE_END). Asset: `packages/graph-scheduler/src/fsm/` (4 files).

## Requirements

### Requirement: Finite state machine lifecycle

Completion determination SHALL be one of two mechanisms: **natural drain** (no active and no eligible — route-aware determination, O(1)) or **approval end action** (explicit end; the run completes directly).

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
- **THEN** the target + downstream terminal nodes reset (upstream kept — inputs already produced); retryCount++ never zeroed

#### Scenario: Unreachable metrics branch removed

- **WHEN** a run completes
- **THEN** no unreachable-metrics accounting exists (route-first: unselected routes are declared, not inferred)

#### Scenario: Natural drain

- **WHEN** the last active node completes and no pending node is eligible (route inactive or deps unsatisfied)
- **THEN** the run transitions to completed; unselected-route nodes stay pending and never block completion

#### Scenario: Approval end action

- **WHEN** an approval (human choice or auto-executed AI recommendation) selects the `end` action
- **THEN** the run completes immediately regardless of pending nodes; no end node exists

#### Scenario: START event initializes graph execution

- **WHEN** a run starts
- **THEN** entry nodes (no deps, active routes) activate

#### Scenario: COMPLETE event advances graph

- **WHEN** a node completes
- **THEN** ready nodes activate; routing decisions apply mechanically

#### Scenario: COMPLETE on last phase finishes graph

- **WHEN** the last active node completes and nothing is eligible
- **THEN** the run transitions to completed (natural drain)

#### Scenario: JUMP event resets target and downstream

- **WHEN** a JUMP targets a node
- **THEN** the target + downstream terminal nodes reset to pending (retryCount++); upstream kept

#### Scenario: FORCE_END terminates run

- **WHEN** FORCE_END dispatches
- **THEN** pending/active nodes abort and the run terminates

#### Scenario: Invalid state transitions rejected

- **WHEN** an illegal event dispatches
- **THEN** InvalidStateTransitionError raises

#### Scenario: Run states enumerated consistently

- **WHEN** a run is queried
- **THEN** fsmState is one of idle/running/completed/terminated

### Requirement: No skip state or marker SHALL exist

No node SHALL be skippable — only 5 cases exist: an unselected route ignored as a whole (route-routing), a gate backward jump, approval auto-selecting the recommendation, approval selecting end, and a node finding no tasks by itself.

#### Scenario: Status set

- **WHEN** a run's nodes are enumerated
- **THEN** the only statuses are pending/active/done/aborted; no skipped status exists; unselected route members remain pending with an unactivated annotation
