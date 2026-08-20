# auto-decision-rationale Specification

## Purpose

Auto approval decisions are auditable — the recommendation basis persists with and is displayed alongside the decision. Assets: `packages/graph-workflow/skills/atom-phase-handler/SKILL.md`, `atom-pilot/SKILL.md`.

## Requirements

### Requirement: Auto approval decisions carry rationale

`rationale` SHALL survive only as the optional recommendation basis on the single-form approval() card — the auto-execution mechanism (Run Mode) no longer exists, so no decision is auto-executed and no rationale is mandated. When a recommendation basis is shown, the decision JSON SHALL carry the optional `rationale`; manual choices omit it. (Stale run-mode wording removed.)

#### Scenario: Auto decision persists rationale

- **WHEN** an approval() card carries a recommendation with a stated basis and the user picks it
- **THEN** the decision JSON SHALL include `rationale` summarizing the recommendation basis
- **AND** the final report SHALL show the rationale alongside the decision

#### Scenario: Manual decisions unaffected

- **WHEN** a human chooses an approval option without a basis summary
- **THEN** `rationale` SHALL be optional (absent when the choice carries no basis summary) — the field never replaces `note`/`label` semantics
