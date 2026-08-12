# approval Specification

> **SUPERSEDED (2026-08-12, ADR 0154 — questioning-system-redesign)**: this capability is folded into `atom-kernel` — approval() semantics (mode-aware single decision, question() absorption, decision recording) have their single home in atom-kernel §approval() (ADR 0141 single-home governance). This file is retained for historical reference; no new requirements are added here. Migration: see `openspec/specs/atom-kernel/spec.md` §approval() + APPROVAL-CARDS.md.

## Purpose

The approval() decision primitive — the single mode-aware single-decision UI that absorbs question().

## Requirements

### Requirement: Mode-aware decision presentation

approval() SHALL read the run-mode context of the executing node and present or auto-execute accordingly.

#### Scenario: Manual mode presents a card

- **WHEN** approval() is called with run mode manual
- **THEN** a decision card with options and custom free-text input is presented and the user's choice is returned

#### Scenario: Auto mode with recommendation executes it

- **WHEN** approval() is called with run mode auto and a recommendation is provided
- **THEN** the recommendation is executed without a card, and the decision is recorded with note 'run mode: auto' and a rationale

#### Scenario: Auto mode without recommendation presents a card

- **WHEN** approval() is called with run mode auto and no recommendation is provided
- **THEN** a decision card is presented; no action is guessed

#### Scenario: No run-mode context behaves as manual

- **WHEN** approval() is called with no run-mode context available
- **THEN** a decision card is presented (absence never auto)

### Requirement: question() absorption

The question() primitive SHALL be removed; approval() SHALL be the only single-decision UI.

#### Scenario: No question() primitive remains

- **WHEN** the kernel primitive contract is consulted
- **THEN** question() is absent and approval() carries the single-decision UI role including the card format rules (header noun phrase, option label/description, mandatory custom input)

### Requirement: Decision recording

Every auto-executed approval() decision SHALL be recorded for observability.

#### Scenario: Auto-executed decision is observable

- **WHEN** approval() auto-executes a recommendation
- **THEN** the decision, its note, and its rationale are persisted in the node's output surface

### Requirement: Superseded by atom-kernel — single-owner fold

The approval capability SHALL be folded into `atom-kernel` (ADR 0141 single-home governance + ADR 0154): approval() semantics — mode-aware single-decision presentation (manual/absent → card; auto + recommendation → execute; auto without recommendation → card), question() absorption (ADR 0133), and decision recording (note 'run mode: auto' + rationale) — have their single home in atom-kernel §approval() + APPROVAL-CARDS.md. This spec is retained for historical reference only; no new requirements SHALL be added here.

#### Scenario: Approval semantics resolve to atom-kernel

- **WHEN** a consumer looks up approval() semantics
- **THEN** the single home is `openspec/specs/atom-kernel/spec.md` §approval() — this capability carries the fold marker only

#### Scenario: No new approval requirements here

- **WHEN** the approval capability is modified
- **THEN** changes SHALL land in atom-kernel — this spec stays a historical marker
