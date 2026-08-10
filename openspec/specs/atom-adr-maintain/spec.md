# atom-adr-maintain Specification

## Purpose

ADR estate alignment contract — keeps docs/adr/ consistent with decision reality: statuses verified, stale chains folded, dead references repointed, archive clean. Reuses atom-doc-lifecycle fold machinery — no duplicated fold logic. Distinct from closure (atom-doc-lifecycle close()) and from spec maintenance (atom-spec-maintain).

## Requirements

### Requirement: Status verification

The maintainer SHALL verify each live ADR's status against decision reality — a record whose decision is superseded or no longer operative SHALL be folded or retired, never left live.

#### Scenario: Stale live record

- **WHEN** a live ADR's decision is superseded by a newer record or no longer operative
- **THEN** the maintainer SHALL fold it (or mark retired) and move it to the archive

#### Scenario: Live set bounded

- **WHEN** a fold happens
- **THEN** the live set SHALL stay bounded — net zero growth from folding

### Requirement: Fold machinery reuse

Folding SHALL run through atom-doc-lifecycle's decision-fold procedure and index rebuild — atom-adr-maintain SHALL NOT reimplement fold logic.

#### Scenario: Fold via lifecycle

- **WHEN** a fold is executed
- **THEN** it SHALL use atom-doc-lifecycle fold + index rebuild and report the index delta

### Requirement: Stale reference cleanup

References to archived ADRs SHALL be repointed to the superseding record (or the owning module) wherever they appear — index, specs, derived views.

#### Scenario: Dead citation

- **WHEN** a document cites an archived ADR as the live authority
- **THEN** the citation SHALL be repointed to the superseding record or the owning contract

### Requirement: Archive hygiene

The archive SHALL hold the complete superseded trace; index and count claims SHALL match disk facts after every pass.

#### Scenario: Counts verified

- **WHEN** a maintenance pass completes
- **THEN** live count, archive count, and highest-number claims SHALL match directory facts

### Requirement: ADR estate contract via convention/project layers

The `atom-adr-maintain` skill SHALL reference ADR estate through the tiered channel model: Files contract entries SHALL be `docs/adr/*.md` (project layer family, absent-tolerant — zero-match warns, never fails) and convention files; the specific `openspec/specs/adr/spec.md` path SHALL NOT appear in Files or body. Count-scan and dead-citation steps SHALL be conditional on channel presence: absent channel -> n/a line with reason, never fabricated counts or hardcoded grep targets.

#### Scenario: No ADR estate — graceful n/a

- **WHEN** a project has no `docs/adr/` files and no `openspec/specs/adr/spec.md`
- **THEN** the skill SHALL report n/a for ADR counts and citation scans — no fabricated numbers, no failure

#### Scenario: ADR estate present — full scan

- **WHEN** the project layer supplies `docs/adr/*.md` and `openspec/specs/**/*.md`
- **THEN** the skill SHALL run the full estate alignment against those channels

### Requirement: CONTEXT.md alignment

The maintainer SHALL align CONTEXT.md as part of the ADR estate pass — CONTEXT.md is the project glossary (per domain-modeling CONTEXT-FORMAT.md: `# Context Name` + description + `## Language` terms with `_Avoid_`), and its alignment SHALL verify structure and term-reality consistency alongside the ADR estate.

#### Scenario: CONTEXT.md in Files contract

- **WHEN** the skill's Files contract is read
- **THEN** `./CONTEXT.md` SHALL be present (convention layer — absence-tolerant, zero-match degrades to n/a)

#### Scenario: CONTEXT-FORMAT structure verified

- **WHEN** CONTEXT.md exists and is aligned
- **THEN** it SHALL match CONTEXT-FORMAT.md structure (`## Language` heading with bold terms + `_Avoid_` lists) and SHALL NOT contain architecture-reference sections (Status/Architecture/Execution model/Constraints/Docs map)

#### Scenario: Term-ADR cross-reference

- **WHEN** a live ADR introduces a domain term
- **THEN** the term SHALL be resolvable in CONTEXT.md (or explicitly out of scope per CONTEXT-FORMAT project-specificity rule), and the finding SHALL be reported when absent

#### Scenario: Dead-citation repoint covers CONTEXT.md terms

- **WHEN** a CONTEXT.md term is superseded by an ADR decision
- **THEN** the repoint SHALL update the CONTEXT.md term entry (or remove it when the concept is retired) and the finding SHALL be reported

### Requirement: Upstream contract concrete

atom-adr-maintain SHALL declare `From upstream: entry, requirement` in its context contract — `entry` (graph trigger classification + workstream selection) and `requirement` (confirmed domain-design requirements). The contract SHALL NOT reference planned, annotated, or self-named nodes as upstream.

#### Scenario: Workstream receives requirements by topology

- **WHEN** the dispatching graph (estate-maintain) runs the adr-align workstream
- **THEN** the requirement node output arrives as an upstream block via dependsOn (topology guarantee, no timing race), and the compliance duty reads the confirmed requirements before any change

#### Scenario: Trigger scope preserved

- **WHEN** the workstream node depends on requirement instead of entry
- **THEN** the entry output (trigger, workstreams) still arrives via an explicit channel read edge, never silently dropped
