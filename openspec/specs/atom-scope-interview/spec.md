# atom-scope-interview Specification

## Purpose

TBD - created by archiving change contract-hygiene-sweep. Update Purpose after archive.

## Requirements

### Requirement: Behavior contract single-sited

The Behavior flags contract SHALL be defined once, in the Input table; Flow steps reference it.

#### Scenario: no Behavior restatement

Given packages/graph-workflow/skills/atom-scope-interview/SKILL.md When reading Flow step 3 Then it references the Input table Behavior row instead of restating the flags

### Requirement: CONTEXT.md lookup — convention semantics, absence-tolerant

The `atom-scope-interview` entry procedure SHALL treat `CONTEXT.md` lookup as convention-layer semantics: default-loaded when present, absence-tolerant when missing. `context: required` default SHALL be replaced by convention semantics — a missing CONTEXT.md SHALL degrade gracefully (skip domain lookup, proceed with direct scoping — the foreign-project path already exercised by graph-generate), never treated as a failure or interview blocker.

#### Scenario: Foreign project without CONTEXT.md

- **WHEN** the entry procedure runs in a project with no CONTEXT.md
- **THEN** it SHALL proceed with direct scoping — no domain lookup, no failure, no re-questioning

#### Scenario: CONTEXT.md present

- **WHEN** the convention layer supplies CONTEXT.md
- **THEN** the entry procedure SHALL use its vocabulary for scope proposals

### Requirement: Coined Term Defined

atom-scope-interview SHALL define `canonical spelling` locally (one line) when the term is used — a coined term with no definition site is a violation (Leading Words rule).

#### Scenario: Term defined in-skill

- **WHEN** reading the skill's §Input declaration table
- **THEN** `canonical spelling` carries a one-line local definition or a pointer to its owning spec

### Requirement: Degradation Pointerized

The `as-needed` behavior flag SHALL reference atom-kernel §interview() Zero-question degradation by pointer — no restatement of the concept.

#### Scenario: Pointer only

- **WHEN** reading the Behavior flags declaration
- **THEN** the zero-question degradation concept appears as `per atom-kernel §Zero-question degradation` — no restated mechanics

### Requirement: Direct-end entry wiring follows content-state card rule

The atom-scope-interview entry wiring SHALL follow the content-state-dependent direct-end card rule: when the entry interview's confirmed content is non-empty (scope/topics confirmed), the final confirm card SHALL offer the adoption action (e.g. "确认范围，继续") as the recommended option and the declared direct-end label as the alternative — the `nothing to adopt` option SHALL NOT appear; when the confirmed content is empty, the final card SHALL offer `nothing to adopt (recommended)` and the declared label. Choosing either direct-end option SHALL emit `direct_end: true` per the declared output contract.

#### Scenario: Entry with confirmed scope — adoption-action card

- **WHEN** an entry interview completes with confirmed scope content (non-empty)
- **THEN** the final confirm card SHALL recommend the adoption action and offer the declared direct-end label as the alternative
- **THEN** the `nothing to adopt` wording SHALL NOT appear

#### Scenario: Entry with empty scope — nothing-to-adopt card

- **WHEN** an entry interview completes with genuinely empty content
- **THEN** the final confirm card SHALL offer `nothing to adopt (recommended)` and the declared direct-end label
- **THEN** choosing either SHALL emit `direct_end: true`
