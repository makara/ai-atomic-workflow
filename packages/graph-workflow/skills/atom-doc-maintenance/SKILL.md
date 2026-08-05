---
name: atom-doc-maintenance
description: 'Entry + reference skill for document maintenance — single maintain() contract covering trigger classification, document taxonomy, per-class maintenance rules, consistency gate, and the Format Reference (metadata block, heading hierarchy, link validity, document types). Replaces atom-doc-spec + atom-doc-writer. Use when maintaining documents, syncing docs after a spec archive, updating the domain index, or writing/reviewing markdown documents.'
argument-hint: none (contract skill — dispatched by doc-update graph or invoked directly)
user-invocable: true
version: 1.0.0
last_updated: '2026-08-05'
---

> **Runtime constraints** — load `caveman` for full level language rules. Behavior contract references upstream: `clean-ddd-hexagonal` (domain partitioning), OpenSpec official conventions (openspec.dev / Fission-AI OpenSpec meta-spec — external spec, not a skill), `domain-modeling` (terminology), `codebase-design` (deep-module vocabulary).

# Atom-Doc-Maintenance

Document maintenance deep module. Single contract `maintain({ trigger, scope })` → `{ changes, validation, updated }`. Replaces atom-doc-spec (format reference) and atom-doc-writer (edit entry) — no standalone format-reference or edit-mode entry points exist.

## Context Requirements

### From upstream

- doc-trigger (output: trigger classification + affected document classes + target set)

### Reference skills

- clean-ddd-hexagonal
- caveman
- domain-modeling
- codebase-design

### Files

- ./CONTEXT.md
- docs/domains.md

## Entry

**MUST EXECUTE** — dispatched by atom-phase-handler for doc-maintain phase nodes, or invoked directly as the single document-maintenance surface. Read upstream doc-trigger output; execute the maintenance pipeline.

## maintain() Contract

```
maintain({ trigger, scope }) → { changes, validation, updated }
```

- `trigger` — one of `spec-archive` | `domain-change` | `skill-change` | `adr-created` | `proactive`.
- `scope` — context: change name, affected domains, document hints (optional).
- `changes` — what was updated: list of `{ document, action, reason }`.
- `validation` — consistency gate results: `{ mapping: [...], links: [...], counts: [...], derived: [...], adr: [...] }`.
- `updated` — document paths touched.

Pipeline: classify trigger → enumerate affected document classes per §Document Taxonomy → apply per-class rules → run §Consistency Gate → report.

## Trigger Classification

|Trigger|Meaning|Scope (document classes)|
|-|-|-|
|`spec-archive`|OpenSpec change archived — delta merged into main specs|derived-view, contract, index (aggregation references)|
|`domain-change`|Domain added/removed/renamed per domains.md evolution rules|index, derived-view, contract (affected domains)|
|`skill-change`|Skill assets changed (added/removed/renamed)|index, derived-view, normative (glossary)|
|`adr-created`|ADR lifecycle record emitted with `supersedes` edges — fold + index rebuild|adr (live set + archive + index)|
|`proactive`|Full consistency scan — nothing assumed in sync|all|

Classification SHALL be derived from the event — never inferred from an interview.

## Document Taxonomy

|Class|Documents|Maintenance rule|
|-|-|-|
|`index`|docs/domains.md — domain standard + bidirectional asset mapping|Evolution four-step per domains.md; every asset maps to exactly one domain; spec dirs match domain IDs 1:1|
|`derived-view`|CONTEXT.md, README.md, CHANGELOG.md (+ zh mirrors)|`source → transform → verify`: CONTEXT from packages state (counts, names); README regenerated from docs/readme-blueprint.md; CHANGELOG from code state, never git history|
|`normative`|docs/ family — design, conventions, constraints, glossary, etc.|Targeted edits only — never re-derivation; terminology updates per domain-modeling (glossary + CONTEXT.md)|
|`contract`|openspec/specs/<domain>/spec.md|OpenSpec delta flow only (ADDED/MODIFIED/REMOVED) — maintenance never edits main specs directly|

Base documents (CONTEXT.md, README.md) SHALL be checked on every `spec-archive` and `domain-change` pass even when no other class is affected.

## ADR Lifecycle

ADR management SHALL follow the decision-fold model (ADR 0093) — ADRs are lifecycle records, not append-only files.

### State machine

Status SHALL be one of `proposed` | `accepted` | `superseded` | `deprecated`. Transitions: `proposed` → `accepted` → `superseded` | `deprecated`. Root `docs/adr/` SHALL hold only live records (proposed + accepted); `docs/adr/archive/` SHALL hold superseded/deprecated records moved verbatim — provenance only, never read as current state.

### Record format

Metadata block: `id`, `title`, `date`, `status`, `domain`, `decision` (one line), `supersedes: [ids]`, `superseded_by: [ids] | none`, `related: [ids]`. Body: Context / Decision / Consequences. Pure English. One decision per record. Accepted records immutable — a revision requires a new record declaring `supersedes`.

### Fold procedure (trigger `adr-created`)

When a new record declares `supersedes` edges, the fold SHALL run in the same maintenance pass: validate-all (targets exist + accepted + same domain; supersedes graph acyclic; no live duplicate per (domain, decision-topic); whole-record granularity — partial supersession forbidden) → mark targets (`superseded_by` += new id, status → superseded) → move targets verbatim to archive → rebuild index. Any validation failure SHALL abort before writes — no partial folds. Re-applying an already-folded edge SHALL be an idempotent no-op.

### Index contract

`docs/adr/index.md` SHALL be the generated live decision table — per domain rows (id | decision | date | supersedes). Rebuilt by every fold and by every proactive pass. Consumers (arch-review reuse checks, openspec-create emission, architecture reviews) SHALL read the index, never the flat directory.

## Consistency Gate

Every pass SHALL run the gate and report into `validation` — never silently patch:

- **Mapping** — assets ↔ domains bidirectional agreement: every asset maps to exactly one domain; every domain has ≥1 asset; openspec/specs dirs match domain IDs 1:1.
- **Links** — relative file/skill/anchor references resolve (no dangling targets).
- **Counts** — stated counts (ADR/reports/skills/graphs) match directory facts.
- **Derived** — derived views match source state (counts, names, paths).
- **ADR lifecycle** — index ↔ directory counts agree; no accepted live record claiming in-body that it is superseded or deprecated (supersession STATE lives in the metadata block only — historical narrative of what the record superseded is not a violation); no dangling `supersedes`/`superseded_by` edges; supersedes graph acyclic; format compliance (complete metadata block, valid status values).

## Format Reference

Applies to every document written or reviewed. Rules translated from the retired atom-doc-spec — zero additions.

### Metadata Block

First 3 lines after `# Title`, block-quote format. Required: `> **Date**: YYYY-MM-DD`, `> **Scope**: <one line>`, `> **Focus**: <key dimensions>`. Optional: Status, Decision, Audit. No blank lines inside the block.

### Heading Hierarchy

- Single H1 per file (document title).
- No skipped levels (H1 → H2 → H3, never H1 → H3).
- H2 = major section; H3 = sub-section within H2.
- H4+ prohibited; headings with one child either expand or flatten.

### Link Validity

- Allowed: relative file `[text](path/file.md)`, skill reference `[text](name)` (matches frontmatter name), internal anchor `[text](#section)`.
- Prohibited: absolute paths, external URLs, bare URLs, wildcard links.
- Validation at write time: target exists, skill name matches, anchor resolves.

### Code Blocks

- Fenced blocks MUST specify a language tag (`yaml`, `json`, `ts`, `bash`, `markdown`, `text`, ...).
- Indent within block = 2 spaces; no trailing whitespace on code lines.

### Document Types

- **General** — metadata block + H2 sections, relative links only.
- **ADR** — `NNNN-slug.md`; sections Context / Decision / Consequences (optional Alternatives Considered, Implementation Status); number = max existing + 1.
- **Report** — metadata block + finding cards (`### Finding N: <title>` with Files/Problem/Solution/Benefits/Strength) + `### Top Recommendation`.

## Language Constraints

Documents following this specification SHALL be written in pure English. Exception: a document SHALL use another language when a specific language or a multilingual version is explicitly required (e.g. `README.zh-CN.md` / `CHANGELOG.zh-CN.md` bilingual mirrors, or a document explicitly requested in a target language — the explicit request is recorded in scope, never silently assumed). The clause SHALL agree with the project constraint file (`.graph-scheduler/constraints.md` language rule) — no dual-track drift. Natural-language output additionally follows caveman full level per `caveman` (loaded reference); no self-repetition. Applies to all document content unchanged.

## Output

Per maintain() contract: `changes` (list of document actions with reasons), `validation` (gate results per class), `updated` (paths). Single source — no duplicate listing.
