# questioning-primitives Specification

## Purpose

Declares the intended scenario for each questioning primitive — approval (decision), interview (confirmation), grilling (exploration) — and the encapsulation contract for the upstream grilling skill in graph dispatch. Single home for the scenario-separation contract.

## Requirements

### Requirement: Questioning primitives serve distinct scenarios

The system SHALL treat the three questioning primitives as scenario-distinct: `approval()` is the decision primitive (one decision point, options + recommendation, user adjudicates); `interview()` is the confirmation primitive (candidate decisions confirmed item by item, fact lookup first, explicit participation strategy); `grilling` is the exploration primitive (design-tree frontier interrogation, whole-frontier rounds, mandatory questions). The "delegates in auto mode" wording is removed (run mode is deleted, ADR 0215). Scenario vocabulary SHALL NOT cross: grilling output SHALL be called `decisions`, never `consensus`; interview turns SHALL NOT be described as grilling; grilling SHALL NOT inherit interview-only semantics (zero-question, participation flags).

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

### Requirement: interview() direct-end option

The interview() confirmation contract SHALL offer a direct-end option when the gated content can be empty (nothing to adopt, accept, confirm, or review). The final confirmation card SHALL present both 「无内容可采纳（推荐）」and 「结束本轮（direct end）」; choosing either option SHALL end the round directly — the node report carries `direct_end: true` and the pilot terminates the run via `graph_force_end` (never a normal advance). The two options SHALL share one semantics: directly end. The direct-end option SHALL NOT replace a mandatory turn — it is an extra choice on the final card.

#### Scenario: No-content interview ends directly

- **WHEN** an interview's gated content is empty (e.g. nothing to adopt, no fixes applied, no candidates remain) and the interview declares the direct-end option
- **THEN** the final confirmation card SHALL present 「无内容可采纳（推荐）」 and 「结束本轮（direct end）」
- **AND** choosing either SHALL record `direct_end: true` and terminate the run via `graph_force_end` — no graph-external PCL end/finish and no natural-drain reliance

#### Scenario: Content interviews keep the end option available

- **WHEN** an interview has content to confirm but the user wants to end the round early
- **THEN** the final confirmation card SHALL still offer 「结束本轮（direct end）」 — the end option is not gated on emptiness

#### Scenario: Direct end never replaces a mandatory turn

- **WHEN** the interview declares `participation: 'mandatory'`
- **THEN** the direct-end option SHALL appear only as an extra choice on the final card — the mandatory question rounds still happen
