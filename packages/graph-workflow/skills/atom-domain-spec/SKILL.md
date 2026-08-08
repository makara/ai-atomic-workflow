---
name: atom-domain-spec
description: 'Format reference for docs/domains.md - the single authority for domain split principles (bounded-context judgment + core/supporting/generic subdomain classification per clean-ddd-hexagonal, ubiquitous language per domain-modeling), domain count bound 10-100 with kind layering when exceeded, reverse-analysis provenance (asset -> domain, no forward design), the evolution four-step, the head-position Design Requirements block with constraints.json-equivalent standing, and the linkage rule (spec/ADR associations only in domain list tables). Use when writing, reviewing, or maintaining docs/domains.md, or when a maintain node validates domain index changes. Consumed by atom-doc-maintain (index class) and the estate-maintain graph domains-index node.'
argument-hint: none (reference skill - consulted by maintain execution)
disable-model-invocation: true
user-invocable: false
version: 2.0.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load clean-ddd-hexagonal + domain-modeling before use. Format reference - informs, never executes.

# Atom-Domain-Spec

Format reference for `docs/domains.md` - mirrors the atom-skill-spec / atom-graph-spec pattern: the standard's own reference skill. Split principles follow clean-ddd-hexagonal (bounded context / subdomain classification / dependency rules) and domain-modeling (ubiquitous language); the index itself remains the single source (`docs/domains/` directory tree forbidden).

## Consultation

When consulted for domains.md work (write, review, or maintenance pass - by atom-doc-maintain index class, the estate-maintain review node, or direct review), validate the target against every section below. Deterministic rules -> validation errors; heuristic rules -> warnings. Reference skill - informs, never executes.

## Design Requirements

User-proposed, grill-confirmed requirements on domain design. Primary constraint block - sits at the head of docs/domains.md (after the header, before Split Standard), standing equal to `.graph-scheduler/constraints.json`: a binding constraint set for domain design (split, boundary, kind, naming), read and complied with by every maintenance pass. Requirements never create domains and never substitute for asset-derived provenance (see Reverse-Analysis Provenance).

### Block Format

```
## Design Requirements

- <one simple sentence, caveman>
- <one simple sentence, caveman>
```

- Bullet list, one bullet per requirement - one simple sentence each, caveman style.
- No IDs, no status, no source, no date - metadata columns forbidden.
- Requirement no longer applies -> delete the bullet outright. No retired rows, no trace rows.

### Consumption

- estate-maintain workstream nodes (domains-index / specs-sync / adr-align) SHALL read the block before executing and SHALL comply with every requirement in their changes.
- The estate-maintain review gate's `requirements` class verifies: block at head, bullet-list format, workstream compliance. Consensus evidence comes from the requirement node output (node:requirement channel) - never in-file confirmation records.

### Relationship to Domains

A requirement SHALL NOT create or imply a domain row (no asset, no domain - provenance rule unchanged). Requirements adjust how existing/new domain design judgments are made within the index standard.

## Linkage Rule

Spec/ADR associations allowed ONLY inside the domain list tables (Overview + per-kind detail sections): the Aggregate specs column and ADR provenance annotations (e.g. `SUPERSEDED (ADR n)`). Everywhere else - header, split standard, dependency rules, reverse mapping, evolution rules, design requirements, linkages - spec/ADR associations forbidden.

- Deterministic rule -> validation error.
- Mechanical check: grep spec/ADR references; every hit lands in a domain list row.

## Split Principles

### Bounded-Context Judgment

Every domain SHALL pass bounded-context judgment per clean-ddd-hexagonal: the domain names a genuine responsibility boundary with its own rules, not a folder or a table. Splitting follows the pattern table's primary question ("How do we model this responsibility?"), never asset enumeration alone.

### Subdomain Classification

Every domain row SHALL carry a subdomain kind:

|Kind|Meaning|
|-|-|
|`core`|Competitive, differentiating responsibility - the reason the system exists|
|`supporting`|Needed for core to operate, generic in shape|
|`generic`|Off-the-shelf concern, no custom rules|

Classification SHALL be derived from actual responsibility (reverse analysis), never prescribed forward. A kind mismatch between the row and the asset's real role is a documentation defect.

### Ubiquitous Language

Terminology SHALL follow domain-modeling: domain IDs and glossary terms form one language; a new domain SHALL NOT introduce a term that collides with an existing glossary entry or CONTEXT.md term. On collision, resolve via domain-modeling before registration.

## Count Bound and Layering

- Total domain count SHALL stay within **10 and 100** (inclusive).
- Count would exceed 100 -> the index layers domains by kind: `engine-feature` (infrastructure) -> `graph` (orchestration) -> `skill` (primitive) -> pure primitive layer, per the existing dependency direction contract. Each layer SHALL stay within the bound.
- The layering split SHALL be recorded in the standard itself (new section), not left implicit.

## Reverse-Analysis Provenance

The index SHALL be derived from the actual repository state:

- Every domain row SHALL reference at least one real asset (path, file, or explicitly justified virtual row).
- No asset -> no domain. Forward-designed domains (no physical asset) are forbidden.
- Bidirectional mapping (domain -> asset, asset -> domain) SHALL be updated together - a one-way update is a defect.
- The reverse mapping section IS the provenance record: `ls`-checkable, diff-able, machine-verifiable.

## Evolution Four-Step

Add/modify/delete a domain follows the four-step procedure (intent -> boundary -> asset registration -> naming de-duplication) recorded in the index. A change that skips a step is invalid.

## Language and Format

- Domain IDs: kebab-case, strictly matching the asset name (prefix kept).
- Descriptions: follow the consuming project language conventions (project instructions / constraints) - the skill does not mandate a language.
- Tables: `Domain ID | Description | Asset | Aggregate specs | Dependencies` in detail sections; `ID | kind | Section | Status` in the overview.
- Status tags: `active` / `retired` (keeps a row for trace) / `deprecated` (annotation only, no row).

## Validation

At write or review time, run the mechanical checks:

1. Counts: total / active / retired match the overview rows and the disk facts (skills, graphs, feature points, doc families).
2. Mapping: every asset maps to exactly one domain; every domain has >= 1 asset; `openspec/specs/` dirs match domain IDs 1:1.
3. Provenance: every row's asset exists; reverse mapping agrees bidirectionally.
4. Bounds: 10 <= total <= 100; exceeded -> layering rule applies.
5. Requirements: block at head; bullet-list format; no metadata columns; workstream changes comply with each requirement; consensus evidence in requirement node output.
6. Linkage: grep spec/ADR references - every hit inside a domain list row; no association elsewhere.
