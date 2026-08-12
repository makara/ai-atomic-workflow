# estate-maintain/user-request Specification

## Purpose

User-proposed domain design requirements in estate-maintain — a first-class trigger and confirmation path: the user proposes special requirements for domain design, grilling analyzes and confirms them (like adopting, but no ADR), domains-index records them into docs/domains.md, and subsequent workstream steps comply.

## Requirements

### Requirement: User-request trigger classification

The entry phase SHALL classify a `user-request` trigger when the user proposes special requirements for domain design (the proposal event is the trigger — event-derived, never interview-derived, same contract as the other triggers).

#### Scenario: User-request classified

- **WHEN** the user proposes domain-design requirements at entry
- **THEN** the trigger SHALL be classified as user-request and the requirement node SHALL run

#### Scenario: Other triggers unaffected

- **WHEN** the trigger is domain-change, skill-change, or proactive
- **THEN** the requirement node SHALL report a no-op scope (zero requirements) and workstreams SHALL run per the existing contract

### Requirement: Requirement grilling node

A requirement node SHALL run after entry on user-request triggers, dispatching grilling in graph mode under the encapsulation contract (mandatory question rounds — never zero-question, never auto-gated; recommendation-first; closing question) to analyze and confirm the proposed requirements. The node task SHALL declare that no ADR decision applies to the requirement flow (user scope — requirements record into domains.md, not ADRs) and that record-keeping is not this node's responsibility — confirmed requirements are emitted as node output with shape `decisions` + `shared_understanding` (consensus wording retired).

#### Scenario: Requirements confirmed

- **WHEN** the user-request grilling reaches shared understanding
- **THEN** the node SHALL output the confirmed requirements (id, statement, status) and `decisions` + `shared_understanding` — never `consensus` wording

#### Scenario: No ADR emitted

- **WHEN** the requirement grilling completes
- **THEN** no ADR SHALL be created and no ADR decision SHALL be asked (graph task text overrides grilling's default ADR question)

#### Scenario: Grilling round never skipped

- **WHEN** the requirement node dispatches with full context coverage
- **THEN** at least one question round SHALL be presented — zero-question degradation never applies to grilling

### Requirement: Domains-index records requirements

The domains-index workstream node SHALL consume the requirement node output (channel node:requirement) and SHALL write confirmed requirements into the docs/domains.md Design Requirements section, formatted per atom-domain-spec §Design Requirements.

#### Scenario: Requirements recorded

- **WHEN** the domains-index node runs after a user-request pass
- **THEN** confirmed requirements SHALL be written into the Design Requirements section with status and grill confirmation source

#### Scenario: No-op on other triggers

- **WHEN** the trigger is not user-request
- **THEN** the domains-index node SHALL not touch the Design Requirements section

### Requirement: Workstreams comply with recorded requirements

Workstream nodes SHALL read the docs/domains.md Design Requirements section before executing and SHALL comply with every active requirement in their changes.

#### Scenario: Compliance in workstream output

- **WHEN** a workstream node executes with active requirements present
- **THEN** its changes SHALL comply with the requirements and SHALL note compliance per requirement

### Requirement: Review gate requirements class

The review node's consistency gate SHALL include a `requirements` class — every active requirement has a record with grill confirmation evidence, workstream changes comply with each requirement, and the section format is valid per atom-domain-spec.

#### Scenario: Requirements gate failure surfaced

- **WHEN** a requirement lacks a confirmation record or a workstream change violates an active requirement
- **THEN** the gate SHALL report the failure per requirement with evidence and SHALL block accept until resolved or explicitly waived
