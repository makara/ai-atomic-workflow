# approval Specification

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
