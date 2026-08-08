# activation-prologue/constraints-json Specification

## Purpose

Compiled constraints artifact — the deterministic, user-auditable JSON form of the project constraint rules, produced by the LLM with caveman organization and cached in the project directory. File existence is the cache validity signal; deletion resets compilation.

## Requirements

### Requirement: Compiled artifact format

`.graph-scheduler/constraints.json` SHALL be a JSON object `{ "constraints": [string, ...], "compiled_at": "<ISO8601>" }` — `constraints` is the ordered array of compiled rules; `compiled_at` records the compilation timestamp (audit-only, never used for invalidation).

#### Scenario: Artifact written on compile path

- **WHEN** the load node executes the compile path
- **THEN** `.graph-scheduler/constraints.json` is written as an object containing the `constraints` array and `compiled_at`

### Requirement: Caveman compilation semantics

Compilation SHALL be performed by the LLM organizing the `## Rules` source text at caveman full level — condensing wording, merging duplicate rules, correcting expressions, unifying order; technical substance (commands, paths, parameters, references) SHALL be preserved verbatim. The artifact SHALL be user-auditable and hand-editable (JSON edits take effect at the next activation).

#### Scenario: Compiled rules are condensed

- **WHEN** the compile path executes and the source rules contain duplicates/loose wording
- **THEN** the artifact array contains the organized, refined rules with the technical substance fully preserved

### Requirement: Fast path emits artifact verbatim

When `.graph-scheduler/constraints.json` exists, the load node SHALL emit the verbatim content of its `constraints` array — without reading constraints.md, recompiling, or rewriting the artifact.

#### Scenario: Fast path zero md I/O

- **WHEN** constraints.json exists and the load node is activated
- **THEN** the output array is verbatim identical to the JSON content, and constraints.md was not read
