# graph-fidelity/deliverable-docs-alignment Specification

## Purpose

Deliverable documentation (README) and requirement sources must describe the implemented seams, not superseded ones.

## Requirements

### Requirement: README describes implemented metering seam

The graph-fidelity README SHALL describe the OMP usage metering seam as `message_end` (the completed assistant message carries the populated camelCase usage facts) and SHALL NOT claim `message_update` accumulates usage.

#### Scenario: README metering claim matches implementation

- **WHEN** a reader checks the README metering description and the OMP Faces table
- **THEN** both name `message_end` as the metering event, never `message_update`

### Requirement: README describes implemented settle seam

The graph-fidelity README SHALL describe node-boundary settlement as delivering immediately through the platform notification surface (`ctx.ui.notify` on OMP, `client.tui.showToast` on opencode) at context-seam frame-change detection, with `session_stop` as the idempotent drain and the transcript echo-class append as the declared fallback (REVISED 2026-08-14 by change `graph-fidelity-round8-spec-residue-sweep` — the former "synchronous `sendMessage` through the followUp queue" wording described the deleted channel).

#### Scenario: README settle claim matches implementation

- **WHEN** a reader checks the README settlement description
- **THEN** it states the platform notify surface as the settle channel (immediate delivery), `session_stop` as the drain/fallback, and never narrates the removed sendMessage injection as the primary mechanism

### Requirement: Requirement sources carry no stale toast claim

The first-principles requirement document SHALL present the opencode notification capability truthfully: `client.tui.showToast` is SDK-reachable from server plugins, so no active `ui.toast` ABSENT annotation may remain — the former ABSENT claim was false, corrected by change `graph-fidelity-round5cd-notify-classification` (REVISED 2026-08-14 by change `graph-fidelity-round8-spec-residue-sweep` — this requirement previously MANDATED ABSENT annotations).

#### Scenario: Toast rows annotated

- **WHEN** a reader scans the requirement tables for opencode notification capabilities
- **THEN** no active `ui.toast` ABSENT claim remains unannotated — the row states `client.tui.showToast` with the transcript fallback annotation

### Requirement: Superseded seam claims cross-referenced

A decision record whose seam claims were corrected by a later revision SHALL carry an inline cross-reference to the correcting record so the record and the index are not misread as current state.

#### Scenario: ADR 0170 points to the 0171 revision

- **WHEN** a reader opens ADR 0170 decision 2 or its index row
- **THEN** an inline note names ADR 0171 as the correcting record
