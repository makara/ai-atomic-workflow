# branch-route-enforcement Specification

## Purpose

Engine-side enforcement of branch-route activation — a branch-route approval's decision MUST NOT depend on the caller re-passing it; a missed branchTo MUST fail loudly, never drain silently.

## Requirements

### Requirement: Branch-Route Approval Requires branchTo

The graphAdvance SHALL reject completing a branch-route approval (a phase of type `approval` whose declaration carries `routing.actions`) when `branchTo` is absent — a loud `InvalidStateTransitionError` naming the phase, never a silent natural drain with the chosen route dormant.

#### Scenario: Missed branchTo errors loudly

- **WHEN** a pilot advances a branch-route approval without `branchTo`
- **THEN** graphAdvance SHALL fail with an InvalidStateTransitionError naming the approval phase
- **AND** the run SHALL NOT drain — no node is marked done, the caller retries with branchTo

#### Scenario: branchTo present advances normally

- **WHEN** a pilot advances a branch-route approval with `branchTo` set to a declared route or node id
- **THEN** the route SHALL activate exactly as before — no behavior change for correct callers

#### Scenario: Non-branch approvals unaffected

- **WHEN** a pilot advances a plain approval (no `routing.actions` declared) without `branchTo`
- **THEN** the advance SHALL succeed — branchTo is required only for declared branch-route approvals

### Requirement: Silent Drain Prevention

No mechanism SHALL allow a branch-route approval's decision to be discarded silently. The natural-drain completion rule stays for genuinely unselected routes, but a branch-route approval whose decision was never transmitted SHALL be an error, not a completion.

#### Scenario: Missed selection never completes the run

- **WHEN** a run's only eligible node is a branch-route approval and its advance omitted branchTo
- **THEN** the run SHALL remain running with an error raised — completed state is unreachable via the missed-selection path
