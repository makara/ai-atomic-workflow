# branch-route-enforcement Specification

## Purpose

Engine-side enforcement of branch-route activation — a branch-route approval's decision MUST NOT depend on the caller re-passing it; a missed branchTo MUST fail loudly, never drain silently.

## Requirements

### Requirement: Branch-Route Approval Requires branchTo

The graphAdvance SHALL reject completing a branch-route main (a phase whose declaration carries `routing.actions` with a `continue` action) when `branchTo` is absent — a loud `InvalidStateTransitionError` naming the phase, never a silent natural drain with the chosen route dormant. (Requirement name retained for archive continuity; the approval type no longer exists — the guard applies to branch-route main nodes.)

#### Scenario: Missed branchTo errors loudly

- **WHEN** a pilot advances a branch-route main without `branchTo`
- **THEN** graphAdvance SHALL fail with an InvalidStateTransitionError naming the main phase
- **AND** the run SHALL NOT drain — no node is marked done, the caller retries with branchTo

#### Scenario: branchTo present advances normally

- **WHEN** a pilot advances a branch-route main with `branchTo` set to a declared route or node id
- **THEN** the route SHALL activate exactly as before — no behavior change for correct callers

#### Scenario: Non-branch approvals unaffected

- **WHEN** a pilot advances a plain main (no `routing.actions` declared) without `branchTo`
- **THEN** the advance SHALL succeed — branchTo is required only for declared branch-route mains

### Requirement: Silent Drain Prevention

MODIFIED: no mechanism SHALL allow a branch-route main's decision to be discarded silently OR to leak: the natural-drain completion rule stays for genuinely unselected routes, but a branch-route main whose decision was never transmitted SHALL be an error, not a completion, and a transmitted decision SHALL activate exactly its target — static successors SHALL NOT silently add to the activated set on resume.

#### Scenario: Missed selection never completes the run

- **WHEN** a run's only eligible node is a branch-route main and its advance omitted branchTo
- **THEN** the run SHALL remain running with an error raised — completed state is unreachable via the missed-selection path

#### Scenario: Transmitted decision activates exactly the target

- **WHEN** a branch decision is transmitted with `branchTo` for one of two dependency-derived successors
- **THEN** exactly that target SHALL activate
- **THEN** the unselected successor SHALL stay `pending` — no static-successor activation, no silent leakage

### Requirement: Unselected branches SHALL stay pending under resume

The compile output SHALL wire no static incoming edges to branch-target nodes in the general case (composing and non-composing alike): branch activation happens ONLY through the deciding node's explicit `Command({goto})` on resume. The test suite SHALL assert the unselected-branch-pending invariant for a NON-composing branch target (decide node with two dependency-derived successors, choose one → the other stays `pending` and is never interrupted), in addition to the existing composing-target assertion.

#### Scenario: Non-composing branch target assertion

- **WHEN** a decide node with dependency-derived successors alpha and beta is resumed with a branch decision for `alpha`
- **THEN** interrupts SHALL be `[alpha]` — never `[alpha, beta]`
- **THEN** `beta` SHALL stay `pending` with zero activation
