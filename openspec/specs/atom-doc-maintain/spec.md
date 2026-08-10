# atom-doc-maintain Specification

## Purpose

Document estate maintenance — the state-of-world consistency of the document estate: taxonomy, trigger classification, per-class rules, consistency gate, Format Reference, and language constraints. Activated by the next-phase maintain graph; CHANGELOG management is explicitly excluded (separate flow).

## Requirements

### Requirement: Estate maintenance contract

atom-doc-maintain SHALL expose one contract `maintain({ trigger, scope })` → `{ changes, validation, updated }`. Triggers SHALL be `domain-change` | `skill-change` | `proactive` only. The closure triggers `spec-archive` and `adr-created` SHALL NOT be handled — they belong to atom-doc-lifecycle.

#### Scenario: Closure triggers rejected

- **WHEN** maintain() receives spec-archive or adr-created
- **THEN** the skill SHALL refuse and route the caller to atom-doc-lifecycle

### Requirement: Document taxonomy and per-class rules

Document classes SHALL be `index` (docs/domains.md), `derived-view` (README.md + mirrors), `normative` (docs/ family incl. CONTEXT.md glossary), `contract` (openspec/specs/) with per-class maintenance rules (index — bidirectional asset mapping + Design Requirements section; derived-view — source → transform → verify; normative — targeted edits only; contract — OpenSpec delta flow only, never direct edits). The index class SHALL consult atom-domain-spec as its format reference — split principles, count bound, layering, reverse-analysis provenance, and the Design Requirements section standard come from atom-domain-spec, never re-stated inline. CONTEXT.md SHALL be maintained as a glossary per domain-modeling (normative — targeted term edits only, never derived regeneration). CHANGELOG.md and docs/CHANGELOG.zh-CN.md SHALL NOT be maintained by any class — the separate CHANGELOG flow owns them.

#### Scenario: CHANGELOG untouched

- **WHEN** a maintain() pass runs with any trigger
- **THEN** CHANGELOG.md and docs/CHANGELOG.zh-CN.md SHALL NOT be written or regenerated

#### Scenario: Index maintenance loads atom-domain-spec

- **WHEN** the index class runs (domains.md maintenance)
- **THEN** atom-domain-spec SHALL be loaded as the format reference for split principles, evolution rules, and the Design Requirements section

#### Scenario: Requirements recorded via domains-index

- **WHEN** the domains-index workstream receives confirmed requirements from the requirement node
- **THEN** the index class SHALL write them into the Design Requirements section per atom-domain-spec

#### Scenario: CONTEXT.md is normative glossary, not derived view

- **WHEN** the derived-view class is inspected
- **THEN** CONTEXT.md SHALL NOT appear in it — counts/names regeneration follows the derived-view transform (README only)

#### Scenario: Glossary terminology updates

- **WHEN** a term is resolved during maintenance
- **THEN** the update follows domain-modeling (glossary + CONTEXT.md) — targeted inline edit, never batch regeneration

### Requirement: Consistency gate

Every pass SHALL run the gate and report into `validation` — mapping (assets ↔ domains bidirectional), links (no dangling targets), counts (stated counts match directory facts), derived (derived views match source state). ADR lifecycle checks SHALL NOT live here — atom-doc-lifecycle owns them.

#### Scenario: Gate reports drift

- **WHEN** a derived view contradicts source state
- **THEN** the gate SHALL report the mismatch with paths

### Requirement: Format Reference and language ownership

The Format Reference (metadata block, heading hierarchy, link validity, code blocks, document types) and Language Constraints (pure English default; explicit-request exception; bilingual mirrors allowed) SHALL be single-sourced in atom-doc-maintain. The project constraint file's language clause SHALL agree with the skill's clause (single source, no dual-track drift).

#### Scenario: Language clause agrees with constraints

- **WHEN** the constraint file's language rule is compared with the skill's clause
- **THEN** both SHALL reference the same default and exceptions

### Requirement: Estate dispatch deferred to maintain graph

The estate-maintain graph SHALL be the only activator of atom-doc-maintain — dispatched from its domains-index node. openspec post-archive flows SHALL NOT dispatch atom-doc-maintain. Derived-view refresh for spec-archive events SHALL NOT be automatic — estate upkeep runs on estate-maintain cadence only.

#### Scenario: Estate-maintain dispatch

- **WHEN** estate-maintain activates its domains-index node
- **THEN** atom-doc-maintain SHALL execute with the classified trigger (domain-change / skill-change / proactive)

#### Scenario: No post-archive estate dispatch

- **WHEN** openspec-apply or openspec-engineer runs its archive closure
- **THEN** neither SHALL dispatch atom-doc-maintain

### Requirement: Closure routing single-sited

The closure-refusal routing rule SHALL be defined once, in Trigger Classification; the maintain() contract bullet references it.

#### Scenario: no closure-refusal restatement

Given packages/graph-workflow/skills/atom-doc-maintain/SKILL.md When searching for the closure-refusal routing (spec-archive / adr-created → atom-doc-lifecycle) Then it appears exactly once

### Requirement: No dead references

Retired-skill lineage references SHALL NOT appear.

#### Scenario: atom-doc-maintenance absent

Given packages/graph-workflow/skills/atom-doc-maintain/SKILL.md When searching for "atom-doc-maintenance" Then zero occurrences

### Requirement: Upstream contract concrete

atom-doc-maintain SHALL declare `From upstream: entry, requirement` in its context contract — `entry` (graph trigger classification + workstream selection) and `requirement` (confirmed domain-design requirements). The contract SHALL NOT reference planned, annotated, or self-named nodes as upstream.

#### Scenario: Graph wires requirement stream

- **WHEN** the dispatching graph (estate-maintain) runs the domains-index workstream
- **THEN** the requirement node output arrives as an upstream block (direct dependency), and the graph passes load-time contract validation without warnings

#### Scenario: Missing requirement wiring

- **WHEN** a graph dispatches atom-doc-maintain without an upstream providing the requirement stream
- **THEN** load-time contract validation SHALL flag the missing reference (error, no silent pass)

### Requirement: Format-reference dependency declared

The atom-doc-maintain SKILL.md SHALL declare atom-domain-spec as the format reference for the domains-index maintenance class — consulting it for split principles, count bound, layering, provenance, evolution, the head-position Design Requirements block, and the linkage rule. The consistency gate SHALL gain a linkage check: spec/ADR associations appear only inside domain list tables of docs/domains.md.

#### Scenario: Skill names its format reference

- **WHEN** an agent loads atom-doc-maintain for index-class maintenance
- **THEN** the SKILL.md SHALL name atom-domain-spec as the format reference to consult

#### Scenario: Consistency gate aligned

- **WHEN** the index-class consistency gate runs
- **THEN** its mapping / links / counts / derived checks SHALL follow atom-domain-spec, including the linkage rule (spec/ADR associations only in domain list tables)

### Requirement: Derived-view transform targets README only

The derived-view transform SHALL target README.md (source -> transform -> verify from docs/readme-blueprint) and SHALL NOT reference any external architecture-overview file.

#### Scenario: README regenerated from blueprint

- **WHEN** a domain-change pass runs
- **THEN** README.md regenerates from docs/readme-blueprint with the source -> transform -> verify gate (counts/names match source state, diff-clean)
- **AND** CONTEXT.md is untouched by the derived-view transform

#### Scenario: No external derived target

- **WHEN** the derived-view class runs
- **THEN** it produces README only — no other derived file exists

### Requirement: Estate Rule Homes

The doc-estate family SHALL hold each shared rule at exactly one home (ADR 0141): CHANGELOG exclusion + language clause + CONTEXT.md structure check at atom-doc-maintain; 1:1 asset/domain mapping + linkage rule at atom-domain-spec; fold procedure + ADR status/live-archive semantics at atom-doc-lifecycle. Other estate skills SHALL carry evidence commands + pointers only.

#### Scenario: CHANGELOG exclusion single-sited

- **WHEN** scanning the doc-estate family for the CHANGELOG exclusion rule
- **THEN** it appears exactly once (atom-doc-maintain §Document Types) — the doc-lifecycle intro and taxonomy-row restatements are absent

#### Scenario: Mapping and linkage single-sited

- **WHEN** scanning atom-doc-maintain §Consistency Gate and atom-spec-maintain §1:1 Mapping Rule for the asset/domain mapping or linkage rules
- **THEN** each carries evidence commands + pointer to atom-domain-spec §Validation / §Linkage Rule — no restated rule text

#### Scenario: Verification sections are command-only

- **WHEN** reading any estate skill §Verification / §Validation section
- **THEN** it contains executable evidence commands (grep/validate) and pointers only — rule restatements of the skill's own body are absent
