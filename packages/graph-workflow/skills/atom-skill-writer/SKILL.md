---
name: atom-skill-writer
description: Reference for writing skills — format rules, language constraints, reference boundaries. Use when creating or editing skills, mentions skill writing, skill format, SKILL.md.
argument-hint: none (reference skill)
user-invocable: true
version: 1.3.0
last_updated: '2026-07-28'
---

> **Runtime constraints** — load `skill://writing-great-skills` before use.

# Atom-Skill-Writer

Reference for writing skills. Loads `writing-great-skills` for foundation — information hierarchy, pruning, leading words, failure modes. Layers additional constraints on top.

**Priority**: atom-skill-writer rules > writing-great-skills rules. Conflict → atom-skill-writer wins.

---

# Frontmatter Format

## Mandatory

|Field|Why|
|-|-|
|`name`|Platform resolves `skill://<name>` by frontmatter name match. Missing → skill unloadable|
|`description`|Trigger phrases listing branches that invoke skill. Search index key|

## Recommended

|Field|Why|
|-|-|
|`version`|Semantic version. Traceability|
|`last_updated`|ISO date. Staleness detection|

## Invocation

Two choices — per `writing-great-skills` §Invocation:

|Model|Frontmatter|Cost|
|-|-|-|
|model-invoked|Omit `disable-model-invocation`|Description in window every turn. Agent fires autonomously; other skills reach it|
|user-invoked|`disable-model-invocation: true` + `user-invocable: true`|Zero context. Loads only when user types name. Cognitive: user must remember it|

Default model-invoked. Pick user-invoked only when agent should never auto-load.

---

# Body Content Rules

## Mandatory

`Runtime constraints` block — first content after frontmatter. Lines prefixed with `>`. Multi-line OK — load dependencies, declare constraints, state preconditions. Format:

```
> **Runtime constraints** — load `skill://<name>` before use.
> Additional constraint line.
```

Minimum: one `>` line declaring runtime requirements.

## Entry Skill Context Requirements

Entry skills declare runtime context needs via `## Context Requirements` section in SKILL.md. Required for any graph-callable entry skill — graph author and handler depend on contract.

### Format

Place between `## Input` and `## Output` sections in entry skill SKILL.md:

```markdown
## Context Requirements

### Files

- <glob or path>
- <glob or path>

### Description

<natural language paragraph>
```

### Files — Deterministic

Glob patterns or paths. Handler resolves: `glob` → `read` → inject as `## File: <path>` blocks.

One path per list item. Supports glob wildcards. Each resolved file truncated to reasonable size.

Example:

```markdown
### Files

- .taskflow/outputs/lint.output.txt
- docs/CODING-STANDARDS.md
```

### Description — LLM-Driven

Natural language paragraph. Handler uses LLM to search conversation, read extra files. Injected as `## Additional Context`.

Write concrete, specific instructions. Vague Description → wrong context. Handler does NOT validate Description quality — entry skill author responsible.

Example:

```markdown
### Description

Lint results showing files with errors. Project coding standards. Search conversation for user-specified file paths or constraints.
```

### Contract

Section present → handler runs full discovery: merge node.context + Files → resolve → Description → inject. Absent → legacy fallback: node.context globs only, task forwarded verbatim.

### node.context vs Files

|Source|Author|When|Scope|
|-|-|-|-|
|node.context|Graph author|Graph definition|Project-level|
|Files|Entry skill author|Skill writing|Skill-level|

Handler merges both. No conflict.

### Mandatory

All graph-callable entry skills MUST declare `## Context Requirements` section. Without: no context discovery, no phase.task contract. Stub skills exempt.

## Entry Skill Language Constraint

Skills with `user-invocable: true` + `## Entry` section are **entry skills** — invocation triggers execution, not just context loading. Reference skills provide information only.

Entry skill Entry section MUST begin with `**MUST <verb>**` syntax — imperative declaration of required action on invocation. Example: `**MUST EXECUTE** — when user invokes /skill:atom-pilot <name>, begin graph execution immediately.`

Without: agent interprets skill load as reference only — no behavioral contract between frontmatter invocation and body action.

## Prohibited

- Core Philosophy, design philosophy, author intent, background stories — any "why" narrative.
- Self-repetition — verification checklists, summaries duplicating body content. Each fact in one place.

Allowed: behavioral descriptions (what + how), rules, reference tables. "Why" content belongs in ADR or domain docs.

## Structure

Organize by `writing-great-skills` information hierarchy. Body mixes steps and reference. Core decision: which material on which ladder rung (in-skill step → in-skill reference → external reference). Push reference behind context pointers when only some branches reach it.

---

# Language Constraints

All natural language — skill body, code comments, sibling files — MUST:

1. **Caveman full level** (load `skill://caveman` for full rules):
   - Drop articles, filler, pleasantries, hedging
   - Fragments OK. Short synonyms. Technical terms exact. Code unchanged
   - Standard acronyms OK (API, URI, JSON). No invented abbreviations
   - Pattern: `[thing] [action] [reason]. [next step].`

2. **Pure English** — no mixed-language skill files. Exception: code examples, error strings in their native language.

---

# Reference Constraints

## Allowed

- Sibling files deployed with skill — `skill://<name>/<path>`
- Skills referenced via `skill://` protocol

## Prohibited

- External docs (`docs/`, `README.md`, `CONTEXT.md`) — absent when skill deployed elsewhere
- External URLs — uncontrollable, may 404 or change
- Files outside plugin boundaries

Skills must be self-contained. Sibling files share skill lifecycle — reliable.
