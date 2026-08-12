# questioning-primitives Specification

## Purpose

Declares the intended scenario for each questioning primitive — approval (decision), interview (confirmation), grilling (exploration) — and the encapsulation contract for the upstream grilling skill in graph dispatch. Single home for the scenario-separation contract.

## Requirements

### Requirement: Questioning primitives serve distinct scenarios

The system SHALL treat the three questioning primitives as scenario-distinct: `approval()` is the decision primitive (one decision point, options + recommendation, user adjudicates or delegates in auto mode); `interview()` is the confirmation primitive (candidate decisions confirmed item by item, fact lookup first, explicit participation strategy); `grilling` is the exploration primitive (design-tree frontier interrogation, whole-frontier rounds, mandatory questions). Scenario vocabulary SHALL NOT cross: grilling output SHALL be called `decisions`, never `consensus`; interview turns SHALL NOT be described as grilling; grilling SHALL NOT inherit interview-only semantics (zero-question, participation flags).

#### Scenario: Scenario separation is declared

- **WHEN** CONTEXT.md glossary and atom-kernel define the three primitives
- **THEN** each primitive SHALL carry its intended scenario (decision / confirmation / exploration)
- **THEN** no document SHALL describe grilling with interview vocabulary (`consensus`, `mandatory interview`, zero-question) — grep-verifiable zero residue

### Requirement: interview() participation is explicit

The interview() contract SHALL declare `participation: 'mandatory' | 'as-needed'` explicitly on every call. `as-needed` permits returning consensus directly when context covers all aspects of the goal (the former zero-question degradation — a strategy, never inferred). `mandatory` SHALL require at least one question round regardless of context coverage. Participation SHALL be caller-declared; absence SHALL default to `as-needed` only for confirmation scenarios and SHALL be stated in the contract, never inferred from context.

#### Scenario: As-needed participation converges

- **WHEN** interview() is called with `participation: 'as-needed'` and context already covers every aspect of the goal
- **THEN** interview SHALL return consensus directly without questions

#### Scenario: Mandatory participation never skips

- **WHEN** interview() is called with `participation: 'mandatory'`
- **THEN** at least one question round SHALL be presented regardless of context coverage
- **THEN** no implicit zero-question degradation SHALL apply

### Requirement: grilling graph-dispatch encapsulation

Graph dispatch of the upstream grilling skill (mattpocock/skills, hash-locked — body SHALL NOT be modified) SHALL carry a standardized encapsulation contract in the node task text: mandatory question rounds (whole frontier per round), never zero-question, never auto-gated, output shape `{ decisions: [...], shared_understanding: boolean }`. The contract SHALL be written into graph task text; the upstream skill body stays untouched.

#### Scenario: Graph grilling node carries the contract

- **WHEN** a graph node dispatches the grilling skill (adopting, plan-grill, requirement)
- **THEN** its task text SHALL declare: mandatory rounds (whole frontier per round), never zero-question, never auto-gated, output shape `decisions` + `shared_understanding`
- **THEN** the upstream grilling skill body SHALL be byte-identical to the locked source

#### Scenario: Grilling round is never skipped

- **WHEN** a graph grilling node executes with full context coverage
- **THEN** at least one question round SHALL still be presented — zero-question degradation never applies to grilling
