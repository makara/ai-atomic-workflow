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
