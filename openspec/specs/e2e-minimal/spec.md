# e2e-minimal Specification

## Purpose

Minimal main→approval cycle demo. Asset: `packages/graph-scheduler/graphs/e2e-minimal.yaml`.

This domain currently has no registered behavioral-contract requirement; new contracts are added via the OpenSpec change process.

## Requirements

### Requirement: e2e-minimal graph SHALL be loadable and demo the main→approval cycle

The e2e-minimal graph SHALL be a member of the built-in graph registry, startable via graph_start; its topology SHALL demonstrate the minimal main cycle (main node executes → main confirmation node collects the decision → natural drain completes). (Requirement name retained for archive continuity; the approval node type no longer exists — the cycle is main → main confirmation.)

#### Scenario: Graph starts and completes

- **WHEN** the graph starts
- **THEN** it SHALL load successfully and dispatch the first main node
- **THEN** advancing via graph_advance through the confirmation main, the run SHALL end as completed after the user decision

### Requirement: approval-review SHALL offer direct end

The e2e-minimal `approval-review` confirmation node SHALL offer the direct-end option on its final card, demonstrating the general interview direct-end capability end-to-end. Choosing 「无内容可采纳（推荐）」 or 「结束本轮（direct end）」 SHALL end the demo run directly (`direct_end: true` → `graph_force_end`).

#### Scenario: Demo run ends directly

- **WHEN** the user chooses the direct-end option at `approval-review`
- **THEN** the run SHALL terminate via `graph_force_end` instead of draining

#### Scenario: Confirmation accepted — drain

- **WHEN** the user confirms the review at `approval-review`
- **THEN** the run SHALL drain as today — unchanged

### Requirement: Flow block with rework edge and graph-level bound

The e2e-minimal graph SHALL declare a top-level `flow` block: `approval-review -->|rework| agent-echo` (backward labeled edge — the rework path is declared structurally, not as a prose jump hint), and SHALL declare its rework bound in the top-level `constraints` prose (rework bounded by the user's acceptance decision, never automatic). The graph SHALL follow the canonical top-level key order (flow before inventory, constraints after inventory).

#### Scenario: Rework declared as a flow edge

- **WHEN** the approval-review node reports `condition: "rework"`
- **THEN** the transition table re-enters agent-echo (backward labeled edge), re-running the echo

#### Scenario: Acceptance completes the run

- **WHEN** the approval-review node reports no condition (accepted)
- **THEN** the sequence default drains the run to completion

### Requirement: Rework-edge runtime coverage in the suite

The e2e-minimal rework edge SHALL be exercised by an automated integration test in the test suite: start the graph, complete `agent-echo`, report `approval-review` with the `rework` condition, assert the transition table re-enters `agent-echo` (retryCount incremented, never zeroed), then complete the round to natural drain. The test SHALL drive the flow condition through the real runtime (graph_start → graph_advance with the condition channel) — not a static flow-content assertion.

#### Scenario: Rework condition re-enters the round body head

- **WHEN** `approval-review` is advanced with condition `rework`
- **THEN** `agent-echo` re-dispatches with retryCount incremented and the run continues to natural drain
