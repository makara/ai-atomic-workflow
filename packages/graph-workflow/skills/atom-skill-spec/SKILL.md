---
name: atom-skill-spec
description: Reference for SKILL.md format specification — frontmatter rules, body content rules, language constraints, reference boundaries. Use when writing or reviewing skills, mentions skill format, SKILL.md, skill spec.
argument-hint: none (reference skill)
user-invocable: true
version: 1.3.0
last_updated: '2026-07-30'
---

> **Runtime constraints** — load skill writing-great-skills before use.

# Atom-Skill-Spec

Reference specification for SKILL.md format — frontmatter rules, body content rules, language constraints, reference boundaries. Load `writing-great-skills` for foundation — information hierarchy, pruning, leading words, failure modes. Layers additional constraints on top.

**Priority**: atom-skill-spec rules > writing-great-skills rules. Conflict → atom-skill-spec wins.

---

# Frontmatter Format

## Mandatory

|Field|Why|
|-|-|
|`name`|Skill directory name. Resolution rule: `<name>` → `<skillsDir>/<name>/SKILL.md` (candidate order: config `skillsDir` → `packages/graph-workflow/skills` → `~/.agents/skills`). Missing → skill unloadable|
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
> **Runtime constraints** — load skill <name> before use.
> Additional constraint line.
```

Minimum: one `>` line declaring runtime requirements.

## Entry Skill Context Requirements

Entry skills declare runtime context needs via `## Context Requirements` section in SKILL.md. Required for any graph-callable entry skill — graph author and handler depend on contract.

**Format** — the three-subsection structure (`From upstream` / `Reference skills` / `Files`) is specified once in `atom-graph-spec` §Context Requirements Convention. Placement: after frontmatter Runtime constraints block, before `## Flow` section (after `## Input` if present).

### Contract Rules (skill-side, machine-parseable)

1. Contract is the single source of truth for graph channel declarations — the load-time pass cross-checks every dispatching graph's `channels` against it (missing reference/file → error, phantom channel → warning).
2. **Placeholder entries forbidden** — `<configurable …>` style entries fail contract parsing with an error. Every entry MUST be a concrete node ID, skill name, or file glob.
3. **No hardcoded output paths in skill body** — skills MUST NOT reference `.taskflow/outputs/<id>.output.txt` directly; upstream content arrives via injected context (dependsOn implicit + `node:` channels).
4. **No self-load duplication** — content reachable via declared channels is handler-injected; the skill body MUST NOT re-load reference skills or re-read declared files as its primary mechanism (standalone-use wording allowed with "graph dispatch: handler-injected" annotation).
5. `atom-kernel` excluded from Reference skills — platform primitive, always injected via the auxiliary-skills constant, never a channel.

### Mandatory

All graph-callable entry skills MUST declare `## Context Requirements` section. Without: no context discovery, no phase.task contract. Stub skills exempt.

## Entry Skill Language Constraint

Skills with `## Entry` section are **entry skills** — invocation triggers execution, not just context loading. `user-invocable: true` entry skills additionally support direct user invocation. Reference skills provide information only.

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

1. **Caveman full level** (load skill caveman for full rules):
   - Drop articles, filler, pleasantries, hedging
   - Fragments OK. Short synonyms. Technical terms exact. Code unchanged
   - Standard acronyms OK (API, URI, JSON). No invented abbreviations
   - Pattern: `[thing] [action] [reason]. [next step].`

2. **Pure English** — no mixed-language skill files. Exception: code examples, error strings in their native language.

---

# Reference Constraints

## Allowed

- Sibling files deployed with skill — `<name>/<path>` relative to the skill's SKILL.md
- Skills referenced by plain name — `load skill <name>`

## Resolution Rule

Skill name → SKILL.md path: `<name>` → `<skillsDir>/<name>/SKILL.md`. SkillsDir candidate order (first match wins):

1. Config `skillsDir` (project `.graph-scheduler/config.json`)
2. `packages/graph-workflow/skills` (monorepo source — scheduler's `resolveSkillsDir` probe order: config → repo layout → package-sibling)
3. `~/.agents/skills` (global deployment — cross-platform shared path)

Sibling files: `<name>/<path>` resolves relative to the skill's SKILL.md. Lookup requires file tools only — no platform URI resolver.

## Prohibited

- `skill://` URI form — no URI scheme in references; plain names only
- External docs (`docs/`, `README.md`, `CONTEXT.md`) — absent when skill deployed elsewhere
- External URLs — uncontrollable, may 404 or change
- Files outside plugin boundaries

Skills must be self-contained. Sibling files share skill lifecycle — reliable.
