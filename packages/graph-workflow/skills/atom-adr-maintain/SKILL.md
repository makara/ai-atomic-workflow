---
name: atom-adr-maintain
description: 'ADR estate alignment contract - keeps docs/adr/ consistent with decision reality: live statuses verified against actual decision effect, stale chains folded through atom-doc-lifecycle fold machinery (shared, never duplicated), index rebuilt, archive hygiene, dead citations repointed to superseding records. Also aligns CONTEXT.md (project glossary) per domain-modeling CONTEXT-FORMAT.md - structure verified, terms cross-referenced with the ADR estate. Use when aligning ADRs with current state, cleaning stale ADR history, or dispatching the adr-align workstream of estate-maintain. Distinct from closure (atom-doc-lifecycle close()) and from spec maintenance (atom-spec-maintain).'
argument-hint: none (contract skill - dispatched by estate-maintain adr-align node or invoked directly)
disable-model-invocation: true
user-invocable: true
version: 1.1.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load atom-doc-lifecycle before use. Fold machinery shared - never reimplemented. CONTEXT.md alignment follows domain-modeling CONTEXT-FORMAT.md (the domain-modeling skill's format reference) - never a private format.

# Atom-ADR-Maintain

ADR estate alignment deep module. One contract `align({ trigger })` -> `{ findings, folds, index_rebuilt, cleaned, context_aligned }`. Aligns the ADR estate with decision reality - statuses, folds, citations, archive - plus the CONTEXT.md glossary. Fold machinery comes from atom-doc-lifecycle; this module never reimplements it.

## Context Requirements

### From upstream

- entry
- requirement

### Reference skills

- atom-doc-lifecycle
- atom-doc-maintain
- domain-modeling

### Operation classes

- run
- read
- write
- verify

### Files

- docs/adr/*.md
- docs/adr/index.md
- docs/adr/archive/**/*.md
- openspec/specs/**/*.md

## Entry

**MUST EXECUTE** - dispatched by atom-phase-handler for adr-align nodes, or invoked directly as the ADR-estate maintenance surface. Read upstream trigger output; execute the alignment pipeline.

## align() Contract

```
align({ trigger }) -> { findings, folds, index_rebuilt, cleaned, context_aligned }
```

- `findings` - status/citation/count anomalies with evidence (path + claim + disk fact); CONTEXT.md structure or term-reality anomalies included.
- `folds` - fold operations executed through atom-doc-lifecycle.
- `index_rebuilt` - index rebuild outcome.
- `cleaned` - archive hygiene actions.
- `context_aligned` - CONTEXT.md glossary alignment outcome (structure check + term-ADR cross-reference).

Pipeline: verify statuses -> fold stale chains (via atom-doc-lifecycle) -> repoint dead citations -> verify counts -> align CONTEXT.md -> rebuild index -> report.

## Status Verification

Every live ADR SHALL be checked against decision reality:

|State|Check|Action on failure|
|-|-|-|
|`accepted` live|Decision still operative - no superseding live record, no body claiming supersession|Fold or retire the record|
|`superseded`/`deprecated` live|SHALL NOT be live - supersession state lives in metadata only; live set holds accepted records|Fold via atom-doc-lifecycle §Step 3|
|Archived|Trace complete - superseding record exists and cites it|Repoint missing edges|

Fold operations SHALL run through atom-doc-lifecycle's decision-fold procedure (§Step 3) - shared machinery, no duplicated logic. Live set stays bounded (net zero growth from folding).

## Dead-Citation Cleanup

Any document citing an archived ADR as the live authority (index, specs, derived views) SHALL be repointed to the superseding record or the owning module. Grep targets (each read only when the corresponding channel supplies it - absent channel -> n/a line, never assumed): `docs/adr/index.md`, `openspec/specs/**/*.md` (ADR spec when present), `docs/domains.md`, CONTEXT.md (convention layer), README family.

## Count and Index Hygiene

After every pass, the following SHALL match disk facts:

- Live count / archive count / highest-number claims in `openspec/specs/**/*.md` (ADR spec when present) and `docs/domains.md` (adr row).
- `docs/adr/index.md` rows - rebuilt via atom-doc-lifecycle after any fold.
- Archive contents - complete superseded trace, no live records inside.

Drift SHALL be reported as findings - never silently patched. Every count/citation step is conditional on channel presence: `docs/adr/*.md` empty (zero-match) or ADR spec absent -> n/a line with reason, never fabricated numbers.

## CONTEXT.md Alignment

CONTEXT.md is the project glossary (domain-modeling CONTEXT-FORMAT.md: `# Context Name` + description + `## Language` terms with `_Avoid_`). The alignment pass SHALL:

1. **Structure check** - CONTEXT.md, when present, matches CONTEXT-FORMAT.md: `## Language` heading with bold terms + `_Avoid_` lists; no architecture-reference sections (Status/Architecture/Execution model/Constraints/Docs map - outside glossary scope). Drift -> finding.
2. **Term-ADR cross-reference** - each live ADR's decision vocabulary resolves in CONTEXT.md (or is explicitly out of scope per CONTEXT-FORMAT project-specificity rule); absent term -> finding. Each CONTEXT.md term superseded by an ADR decision -> repoint the entry (or remove when the concept is retired) -> finding + edit.
3. **Dead-citation coverage** - CONTEXT.md terms referencing archived ADRs as live authority are repointed to the superseding record, same as any other citation target.
4. **Convention-layer degrade** - CONTEXT.md absent (foreign project) -> n/a line with reason, never fabricated structure findings.

CONTEXT.md term updates never run autonomously during align(): the pass reports findings and proposed edits; applied edits follow the estate-maintain review gate (user-confirmed).

## Verification

Evidence commands - rules live at their flow sites, pointers only:

1. `grep -L '^> \*\*Status\*\*: accepted' docs/adr/*.md` -> zero live records with superseded/deprecated status; zero bodies claiming supersession (state lives in metadata per atom-doc-lifecycle §Record Format).
2. Citation scan per §Dead-Citation Cleanup grep targets -> zero references to archived ADRs as live authority.
3. `ls docs/adr/ | grep -v archive | wc -l` vs spec claims; archive count (n/a when `docs/adr/` absent).
4. Index rebuilt per atom-doc-lifecycle §Index Contract - matches the live set.
5. CONTEXT.md structure per CONTEXT-FORMAT.md (`## Language` present when file present), zero architecture-reference sections, term-ADR cross-reference closed.

## Output

Per align() contract: `findings`, `folds`, `index_rebuilt`, `cleaned`, `context_aligned`. Single source - no duplicate listing.
