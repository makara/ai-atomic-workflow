---
name: atom-doc-maintain
description: 'Entry + reference skill for document estate maintenance - one maintain() contract: trigger classification (domain-change/skill-change/proactive), document taxonomy, per-class maintenance rules, consistency gate, Format Reference, Language Constraints. Use when maintaining documents, syncing docs after a domain or skill change, running a proactive consistency scan, or writing/reviewing markdown documents. Closure (archive + ADR fold) lives in atom-doc-lifecycle; CHANGELOG per §Document Types.'
argument-hint: none (contract skill - dispatched by the maintain graph or invoked directly)
disable-model-invocation: true
user-invocable: true
version: 1.0.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load `caveman` for full level language rules. Behavior contract references upstream: `clean-ddd-hexagonal` (domain partitioning), `domain-modeling` (terminology), `codebase-design` (deep-module vocabulary).

# Atom-Doc-Maintain

Document estate maintenance deep module. One contract `maintain({ trigger, scope })` -> `{ changes, validation, updated }`. Estate triggers only - closure triggers refused (see §Trigger Classification). CHANGELOG excluded - see §Document Types (single home).

## Context Requirements

### From upstream

- entry
- requirement

### Reference skills

- clean-ddd-hexagonal
- caveman
- domain-modeling
- codebase-design
- atom-domain-spec

### Operation classes

- locate
- read
- write
- verify

### Files

## Entry

**MUST EXECUTE** - dispatched by atom-phase-handler for maintain nodes, or invoked directly as the estate maintenance surface. Read upstream trigger output; execute the maintenance pipeline.

## maintain() Contract

```
maintain({ trigger, scope }) → { changes, validation, updated }
```

- `trigger` - one of `domain-change` | `skill-change` | `proactive`. Closure triggers refused - see §Trigger Classification.
- `scope` - context: affected domains, document hints (optional).
- `changes` - `{ document, action, reason }` list.
- `validation` - consistency gate results: `{ mapping, links, counts, derived }`. ADR checks live in atom-doc-lifecycle.
- `updated` - document paths touched.

Pipeline: classify trigger -> enumerate affected classes per §Document Taxonomy -> apply per-class rules -> run §Consistency Gate -> report.

## Trigger Classification

|Trigger|Meaning|Scope (document classes)|
|-|-|-|
|`domain-change`|Domain added/removed/renamed per domains.md evolution rules|index, derived-view, contract (affected domains)|
|`skill-change`|Skill assets changed (added/removed/renamed)|index, derived-view, normative (glossary)|
|`proactive`|Full consistency scan - nothing assumed in sync|all|

Classification SHALL be derived from the event - never inferred from an interview. Closure events refused: `spec-archive` and `adr-created` -> atom-doc-lifecycle.

## Document Taxonomy

|Class|Documents|Maintenance rule|
|-|-|-|
|`index`|docs/domains.md - domain standard + bidirectional asset mapping|Evolution four-step per domains.md; mapping rules per atom-domain-spec (split principles, count bound, layering, provenance, evolution, head-position Design Requirements block, linkage rule - single home)|
|`derived-view`|README.md (+ zh mirrors)|`source -> transform -> verify`: README regenerated from docs/readme-blueprint.md. CHANGELOG excluded - see §Document Types|
|`normative`|docs/ family - design, conventions, constraints, etc. + CONTEXT.md (glossary - checked per §Base Documents)|Targeted edits only - never re-derivation; terminology updates per domain-modeling (CONTEXT.md terms + _Avoid_ lists)|
|`contract`|openspec/specs/<domain>/spec.md|OpenSpec delta flow only (ADDED/MODIFIED/REMOVED) - maintenance never edits main specs directly|

Base documents (CONTEXT.md, README.md) SHALL be checked on every `domain-change` pass even when no other class is affected. CONTEXT.md + docs/domains.md arrive via the platform convention layer (default-loaded, absence-tolerant) - absent channel -> n/a line, never fabricated counts. CONTEXT.md is checked as the glossary (structure per CONTEXT-FORMAT.md + term currency), NOT as a derived view.

## Consistency Gate

Every pass SHALL run the gate and report into `validation` - never silently patch. Evidence per check (command -> expected):

- **Mapping** - rule per atom-domain-spec §Validation (single home: 1:1 asset/domain + spec-dir matching); Evidence: `find docs/ -name "*.md"` vs `docs/domains.md` asset list; `ls openspec/specs/` vs domain IDs.
- **Links** - relative file/skill/anchor references resolve (no dangling targets). Evidence: `grep -rEo '(docs|packages)/[a-z0-9/._-]+\.md' docs/` -> each target exists.
- **Counts** - stated counts (ADR/reports/skills/graphs) match directory facts. Evidence: `ls docs/adr/ | wc -l` vs stated ADR count; `ls packages/graph-workflow/skills/ | wc -l` vs stated skill count.
- **Derived** - derived views match source state (counts, names, paths). Evidence: `diff <(grep -oE '\[[^]]+\]\([^)]+\)' README.md) <(grep -oE '\[[^]]+\]\([^)]+\)' docs/readme-blueprint.md)` -> empty (derived README matches blueprint); CONTEXT.md excluded from the derived check (glossary - checked via §Base Documents).
- **Linkage** - rule per atom-domain-spec §Linkage Rule (single home: spec/ADR associations appear only inside domain list tables). Evidence: `grep -nE 'ADR [0-9]{4}|openspec/specs' docs/domains.md` -> every hit lands in Overview or a detail table row.
- **Contract alignment** - every graph channel declaration is checked against the dispatched skill's `## Context Requirements` contract (reference skills / Files entries covered by declared channels); entry skills declaring graph-callable requirements with zero dispatching graph phase are flagged as orphans. Agent-side home of the removed engine load-time pass — the engine holds no contract machinery. Evidence: read `packages/graph-scheduler/graphs/*.taskflow.yaml` channels vs `packages/graph-workflow/skills/<skill>/SKILL.md` contract; dispatch scan across graph phases.

ADR lifecycle invariants SHALL NOT be checked here - atom-doc-lifecycle owns them.

## Format Reference

Applies to every document written or reviewed. Legacy format rules translated verbatim - zero additions.

### Metadata Block

First 3 lines after `# Title`, block-quote format. Required: `> **Date**: YYYY-MM-DD`, `> **Scope**: <one line>`, `> **Focus**: <key dimensions>`. Optional: Status, Decision, Audit. No blank lines inside the block.

### Heading Hierarchy

- Single H1 per file (document title).
- No skipped levels (H1 -> H2 -> H3, never H1 -> H3).
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

- **General** - metadata block + H2 sections, relative links only.
- **ADR** - `NNNN-slug.md`; body sections + metadata contract per atom-doc-lifecycle §Record Format; number = max existing + 1.
- **Report** - metadata block + finding cards (`### Finding N: <title>` with Files/Problem/Solution/Benefits/Strength) + `### Top Recommendation`.
- **CHANGELOG** - SHALL NOT be maintained - separate flow (single home; taxonomy `derived-view` row + description/intro point here).

## Language Constraints

Documents following this specification SHALL be written in pure English. Exception: a document SHALL use another language when a specific language or a multilingual version is explicitly required (e.g. `README.zh-CN.md` / `CHANGELOG.zh-CN.md` bilingual mirrors, or a document explicitly requested in a target language - the explicit request is recorded in scope, never silently assumed). The clause SHALL agree with the project constraint file (`.graph-scheduler/constraints.md` language rule) - no dual-track drift. Natural-language output additionally follows caveman full level per `caveman` (loaded reference); no self-repetition. Applies to all document content unchanged.

## Output

Per maintain() contract: `changes` (list of document actions with reasons), `validation` (gate results per class), `updated` (paths). Single source - no duplicate listing.
