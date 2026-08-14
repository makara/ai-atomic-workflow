# graph-fidelity/decision-record-alignment Specification

## Purpose

Decision records for the graph-fidelity platform seams must match the implemented reality so future reviews judge against facts, not stale warnings.

## Requirements

### Requirement: Decision record alignment with implemented seams

The graph-fidelity decision records SHALL describe the settle and metering seams exactly as implemented: settlement executes at context-seam frame-change detection with a `session_stop` idempotent fallback; usage metering anchors on `message_end` only.

#### Scenario: ADR 0171 revision reflects implemented settle seam

- **WHEN** a reviewer reads ADR 0171's OMP settle seam decision
- **THEN** it states context-seam frame-change settle with session_stop fallback, not session_stop as the settle point

#### Scenario: Anti-resuggestion warning scoped to the actual defect shape

- **WHEN** ADR 0171 warns against re-attaching management work to message_end
- **THEN** the warning is scoped to the awaited-inline drain shape only, so a future review does not treat the current synchronous frame-change settle as a violation

#### Scenario: Empirical anchor recorded

- **WHEN** the decision record mentions message_update
- **THEN** it records the empirical anchor (message_update streaming snapshots carry all-zero usage; message_end carries the populated usage)

### Requirement: Wording accuracy for platform hook existence

Decision records SHALL reference only hooks that exist on the target platform face.

#### Scenario: session.idle clarified

- **WHEN** ADR 0168 decision 4 mentions an approval turn-end idle window
- **THEN** the wording names `session_stop` as the OMP turn-end seam and does not imply a `session.idle` hook that does not exist on OMP
