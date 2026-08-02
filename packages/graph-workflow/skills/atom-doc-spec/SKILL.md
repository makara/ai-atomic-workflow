---
name: atom-doc-spec
description: Reference for Markdown document format specification — metadata block, heading hierarchy, link validity, document types (ADR, report). Use when writing or reviewing markdown documents, mentions doc format, document spec.
argument-hint: none (reference skill)
user-invocable: true
version: 1.0.0
last_updated: '2026-07-31'
---

> **Runtime constraints** — load `skill://caveman` for full level language rules.

# Atom-Doc-Spec

Reference specification for Markdown document format — metadata block, heading hierarchy, link validity, document type formats (ADR, report). Symmetric with atom-skill-spec (SKILL.md format) and atom-graph-spec (.taskflow.yaml format).

Intended consumers: atom-doc-writer (edit mode), code-review (audit skill).

**Priority**: atom-doc-spec rules > general markdown conventions. Conflict → atom-doc-spec wins.

---

# Metadata Block

First 3 lines after `# Title`. Block quote format with `>`. Required fields:

```
> **Date**: YYYY-MM-DD
> **Scope**: <one-line scope description>
> **Focus**: <key dimensions>
```

Optional fields: `Status`, `Decision`, `Audit`.

## Rules

1. Date = ISO format. YYYY-MM-DD.
2. Scope ≤ one line. What this doc covers.
3. Focus = key dimensions. Comma-separated or bullet sub-list.
4. Block quote line start = `> `. Trailing spaces stripped.
5. No blank lines inside block. Adjacent `>` lines = single block.

---

# Heading Hierarchy

## Mandatory

|Rule|Why|
|-|-|
|Single H1|Document title. One per file. First line after metadata block.|
|No skip levels|H1 → H2 → H3 — never H1 → H3. Reader loses context.|
|H2 = major section|Top-level logical divisions.|
|H3 = sub-section|Within H2 scope. Not standalone.|

## Prohibited

- H4+ — prohibited generally. No exceptions.
- Headings with only one child — either expand or flatten.
- Leading/trailing whitespace in heading text.

---

# Link Validity

## Allowed

|Link type|Format|Example|
|-|-|-|
|Relative file|`[text](path/to/file.md)`|`[ADR](docs/adr/0001-example.md)`|
|Skill reference|`[text](skill://name)`|`[atom-kernel](skill://atom-kernel)`|
|Internal anchor|`[text](#section-name)`|`[see below](#rules)`|

## Prohibited

|Link type|Why|
|-|-|
|Absolute paths|Breaks on different machines. `/home/user/...`|
|External URLs|Uncontrollable. May 404 or change.|
|Bare URLs|No link text. `https://...` without `[]()` wrapper.|
|Wildcard links|`[text](path/*.md)` — unresolved.|

## Validation

- Relative links → verify target exists at resolve time.
- Skill refs → verify `${name}` matches frontmatter `name` field.
- Internal anchors → verify heading exists with matching text (lowercase, spaces→hyphens).

---

# Code Blocks

## Mandatory

|Rule|Why|
|-|-|
|Language tag|Fenced block MUST specify language. \`\`\`yaml not \`\`\`|
|Consistent indent|Indent within block = 2 spaces. Tabs → spaces.|
|No trailing whitespace|Empty trailing lines OK. Trailing space on code line not OK.|

## Language Tags

Common: `yaml`, `json`, `ts`, `js`, `bash`, `markdown`, `text`.

Untagged block → `text` assumed. Validator warns.

---

# Document Types

## General Markdown

Default format. Metadata block + H2 sections. Links = relative only.

## ADR Format

File: `NNNN-slug.md`. Required sections:

```
# ADR-NNNN: <Title>

> **Date**: YYYY-MM-DD
> **Status**: proposed | accepted | deprecated | superseded

## Context
<why decision needed — problem, constraints, background>

## Decision
<what chosen — concrete action, not aspiration>

## Consequences
<what results — positive + negative + neutral>
```

Optional: `## Alternatives Considered`, `## Implementation Status`.

Rule: ADR number = sequential within `docs/adr/` directory. Next number = max existing + 1.

## Report Format

Metadata block + findings + top recommendation.

Findings = table or card:

```markdown
### Finding N: <title>

**Files**: <paths> **Problem**: <one-line> **Solution**: <one-line> **Benefits**: <one-line> **Strength**: Strong | Worth exploring | Speculative
```

End with:

```markdown
### Top Recommendation

<strongest finding + rationale + action>
```

---

# Language Constraints

Specified once in `atom-skill-spec` §Language Constraints (caveman full level via `skill://caveman`; pure English; no self-repetition). Applies to all document content unchanged — load that spec for the rules.

---

# Reference Constraints

Specified once in `atom-skill-spec` §Reference Constraints (allowed: sibling files, `skill://` refs; prohibited: external URLs, absolute paths, files outside project root). Project documents additionally may reference relative paths under the repo root (`docs/adr/`, `openspec/changes/`).
