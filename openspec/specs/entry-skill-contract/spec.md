# entry-skill-contract Specification

## Purpose

Parameterized callee contract for graph entry skills — behavior is declared by the caller via task text, never inferred from caller identity.

## Requirements

### Requirement: Caller-declared contract

The entry skill receives its entire contract from the dispatching phase's task text: `Topics` (interview decision points), `Output fields` (exact output contract fields), and `Behavior` flags (confirm, output path, dual-name check, context). Behavior is a function of declared parameters, never of caller identity.

#### Scenario: Graph declares full contract

- **WHEN** a graph entry phase dispatches the entry skill with Topics, Output fields, and Behavior declared in its task text
- **THEN** the skill conducts the interview over the declared topics and emits exactly the declared output fields

#### Scenario: No topics declared

- **WHEN** the task text declares no Topics (classification-only phase)
- **THEN** the skill runs no interview, asks no questions, and emits only the declared output fields

### Requirement: Zero reverse references

The skill contains no caller knowledge: no graph names in the description, no per-graph output-field tables, no prose citing specific graphs.

#### Scenario: New graph adopts the skill

- **WHEN** a new graph entry phase declares the contract in its task text
- **THEN** no skill edit is required for the new graph to be served

### Requirement: Mandatory confirmation flag

`confirm: mandatory` requires at least one question per activation — user participation is required before `scope_complete: true` is emitted. `confirm: as-needed` allows interview() zero-question degradation. Absence of the flag means mandatory (the entry procedure's default).

#### Scenario: Mandatory confirm on loop re-entry

- **WHEN** a loop graph's entry phase declares `confirm: mandatory` and is re-activated by a loop jump
- **THEN** the skill asks at least one question and does not emit `scope_complete: true` without user participation

#### Scenario: As-needed confirm with complete context

- **WHEN** the task text declares `confirm: as-needed` and the context already covers all topics
- **THEN** the skill may return the consensus without questions

### Requirement: Output path rule

`output path: user_owned` — the deliverable path is a user question with a recommendation. `output path: derived` — the path is a convention the caller derives downstream; never asked.

#### Scenario: User-owned deliverable path

- **WHEN** the task text declares `output path: user_owned` (e.g. an architecture review report path)
- **THEN** the path is confirmed with the user

#### Scenario: Derived convention path

- **WHEN** the task text declares `output path: derived`
- **THEN** no path question is asked

### Requirement: Dual-name check flag

`dual-name check: <field>` verifies the confirmed produced-artifact name in the declared field differs from the executed graph's name. `none` (default) disables the check.

#### Scenario: Self-production shadowing detected

- **WHEN** the task text declares `dual-name check: graph_name` and the confirmed `graph_name` equals the executed graph's name
- **THEN** a warning is reported and the name is re-asked; equal names are never accepted silently

### Requirement: Context optionality flag

`context: required` (default) — CONTEXT.md lookup is expected; `context: optional` — CONTEXT.md absence degrades gracefully (skip domain-model lookup, interview scope directly, absence is not a failure).

#### Scenario: Foreign project without CONTEXT.md

- **WHEN** the task text declares `context: optional` and CONTEXT.md is absent
- **THEN** the skill skips the domain-model lookup and proceeds with the interview

### Requirement: Interview delegation

The entry skill delegates to interview() consensus mode per atom-kernel; it does not re-state interview rules and does not use solve mode for scope confirmation.

#### Scenario: Consensus-only procedure

- **WHEN** the skill conducts a scope confirmation
- **THEN** it uses interview() consensus mode and references atom-kernel for the interview rules

### Requirement: Skill ownership boundary

The project modifies skills only inside `packages/` (source of truth: `packages/graph-workflow/skills/`). Deployment copies (~/.claude/skills, in-project .omp/skills) are user deployment — never edited, never assumed in sync, never referenced as source of truth.

#### Scenario: Deployment copy untouched

- **WHEN** a change updates a skill
- **THEN** only the packages/ copy is modified; deployment copies are not edited
