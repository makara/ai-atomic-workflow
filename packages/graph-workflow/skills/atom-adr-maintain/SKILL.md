---
name: atom-adr-maintain
description: 'ADR estate alignment contract - keeps docs/adr/ consistent with decision reality: live statuses verified against actual decision effect, stale chains folded through atom-doc-lifecycle fold machinery (shared, never duplicated), index rebuilt, archive hygiene, dead citations repointed to superseding records. Use when aligning ADRs with current state, cleaning stale ADR history, or dispatching the adr-align workstream of estate-maintain. Distinct from closure (atom-doc-lifecycle close()) and from spec maintenance (atom-spec-maintain).'
argument-hint: none (contract skill - dispatched by estate-maintain adr-align node or invoked directly)
disable-model-invocation: true
user-invocable: true
version: 1.0.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load atom-doc-lifecycle before use. Fold machinery shared - never reimplemented.

# Atom-ADR-Maintain

ADR estate alignment deep module. One contract `align({ trigger })` -> `{ findings, folds, index_rebuilt, cleaned }`. Aligns the ADR estate with decision reality - statuses, folds, citations, archive. Fold machinery comes from atom-doc-lifecycle; this module never reimplements it.

## Context Requirements

### From upstream

- entry
- requirement

### Reference skills

- atom-doc-lifecycle
- atom-doc-maintain

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
align({ trigger }) -> { findings, folds, index_rebuilt, cleaned }
```

- `findings` - status/citation/count anomalies with evidence (path + claim + disk fact).
- `folds` - fold operations executed through atom-doc-lifecycle.
- `index_rebuilt` - index rebuild outcome.
- `cleaned` - archive hygiene actions.

Pipeline: verify statuses -> fold stale chains (via atom-doc-lifecycle) -> repoint dead citations -> verify counts -> rebuild index -> report.

## Status Verification

Every live ADR SHALL be checked against decision reality:

|State|Check|Action on failure|
|-|-|-|
|`accepted` live|Decision still operative - no superseding live record, no body claiming supersession|Fold or retire the record|
|`superseded`/`deprecated` live|SHALL NOT be live - supersession state lives in metadata only; live set holds accepted records|Fold (mark superseded_by + move to archive)|
|Archived|Trace complete - superseding record exists and cites it|Repoint missing edges|

Fold operations SHALL run through atom-doc-lifecycle's decision-fold procedure (validate-all -> mark -> move verbatim -> rebuild index) - shared machinery, no duplicated logic. Live set stays bounded (net zero growth from folding).

## Dead-Citation Cleanup

Any document citing an archived ADR as the live authority (index, specs, derived views) SHALL be repointed to the superseding record or the owning module. Grep targets (each read only when the corresponding channel supplies it - absent channel -> n/a line, never assumed): `docs/adr/index.md`, `openspec/specs/**/*.md` (ADR spec when present), `docs/domains.md`, CONTEXT.md (convention layer), README family.

## Count and Index Hygiene

After every pass, the following SHALL match disk facts:

- Live count / archive count / highest-number claims in `openspec/specs/**/*.md` (ADR spec when present) and `docs/domains.md` (adr row).
- `docs/adr/index.md` rows - rebuilt via atom-doc-lifecycle after any fold.
- Archive contents - complete superseded trace, no live records inside.

Drift SHALL be reported as findings - never silently patched. Every count/citation step is conditional on channel presence: `docs/adr/*.md` empty (zero-match) or ADR spec absent -> n/a line with reason, never fabricated numbers.

## Verification

1. Status scan: zero live records with superseded/deprecated status; zero live records whose body claims supersession.
2. Citation scan: zero references to archived ADRs as live authority.
3. Count scan: spec claims == `ls docs/adr/ | grep -v archive | wc -l` and archive count (n/a when `docs/adr/` absent).
4. Index: rebuilt, matches the live set.

## Output

Per align() contract: `findings`, `folds`, `index_rebuilt`, `cleaned`. Single source - no duplicate listing.
