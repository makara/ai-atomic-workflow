# auto-decision-rationale Specification

## Purpose

Auto approval decisions are auditable — the recommendation basis persists with and is displayed alongside the decision. Assets: `packages/graph-workflow/skills/atom-phase-handler/SKILL.md`, `atom-pilot/SKILL.md`.

## Requirements

### Requirement: Auto approval decisions carry rationale

When Run Mode auto executes an approval recommendation, the assembled `IApprovalDecision` SHALL include `rationale` — a short summary of the judgment-context basis (observable output fields / decision values that drove the recommendation). The persisted decision JSON SHALL carry `rationale`; the pilot's final report SHALL display auto decisions with their rationale.

#### Scenario: Auto decision persists rationale

- **WHEN** a Run Mode auto approval decision is persisted
- **THEN** the decision JSON SHALL include `rationale` summarizing the recommendation basis
- **AND** the final report SHALL show the rationale alongside the decision

#### Scenario: Manual decisions unaffected

- **WHEN** a human chooses an approval option
- **THEN** `rationale` SHALL be optional (absent when the choice carries no basis summary) — the field never replaces `note`/`label` semantics
