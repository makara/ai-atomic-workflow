---
name: atom-skill-spec
description: Reference for SKILL.md format specification - frontmatter rules, body content rules, content quality metrics (quantified norms), language constraints, reference boundaries, Context Requirements contract (four subsections incl. Operation classes). Use when writing or reviewing skills, mentions skill format, SKILL.md, skill spec, operation classes, skill quality, why/how ratio, skill length bands.
argument-hint: none (reference skill)
user-invocable: true
version: 1.7.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load skill writing-great-skills before use.

# Atom-Skill-Spec

Reference spec for SKILL.md format - frontmatter, body content, quality metrics, language constraints, reference boundaries. Load `writing-great-skills` for foundation. Adds quantified norms + project constraints.

**Priority**: atom-skill-spec rules > writing-great-skills rules. Conflict -> this spec wins.

## Alignment with writing-great-skills

Every §Content Quality Metrics rule maps to a wgs concept; gap markers note supplements (norms wgs lacks) or corrections (patterns wgs misses).

|Rule|wgs concept|Gap|
|-|-|-|
|Length bands|sprawl|supplement - no bands|
|Why/how norms|no-op|supplement - no distribution norms|
|Carrier selection|hierarchy|supplement - silent on carriers|
|Completion evidence gate|completion criterion|supplement - evidence naming|
|Branch skip conditions|branching|supplement - skip formalized|
|Wrapper contract|-|supplement - wrapper pattern (wgs gap)|
|Sibling single source|single source|supplement - file homes|
|Positive-first, avoid-list|negation|supplement - avoid-list pattern|
|No-op test|no-op|supplement - enforcement shape|
|Lazy creation|pruning|supplement - file-scope discipline|
|Pointer validation|context pointer|supplement - dangling check|

---

# Frontmatter Format

## Mandatory

|Field|Why|
|-|-|
|`name`|Skill directory name. Missing -> skill unloadable|
|`description`|Trigger phrases listing branches that invoke skill. Search index key|

## Recommended

|Field|Why|
|-|-|
|`version`|Semantic version. Traceability|
|`last_updated`|ISO date. Staleness detection|

## Invocation

How the skill is reached:

|Model|Frontmatter|Meaning|
|-|-|-|
|model-invoked|Omit `disable-model-invocation`|Auto-triggers|
|user-invoked|`disable-model-invocation: true` + `user-invocable: true`|Reached only when name typed|
|injection-only (reference)|`disable-model-invocation: true` + `user-invocable: false`|Reference content, loaded by name|
|model-invoked + user-invoked|Omit `disable-model-invocation` + `user-invocable: true`|Auto-triggers AND slash-invokable (hybrid)|

Default: model-invoked; user-invoked when no auto-trigger.

---

# Body Content Rules

## Mandatory

`Runtime constraints` block - first content after frontmatter. Lines prefixed with `>`. Multi-line OK - load dependencies. Format:

```
> **Runtime constraints** — load skill <name> before use.
> Additional constraint line.
```

Minimum: one `>` line declaring runtime requirements.

## Entry Skill Context Requirements

Entry skills declare runtime context needs via `## Context Requirements`. Required for any graph-callable entry skill.

**Format** - four-subsection structure (`From upstream` / `Reference skills` / `Operation classes` / `Files`); rules once in `atom-graph-spec` §Context Requirements Convention.

### Mandatory

All graph-callable entry skills MUST declare `## Context Requirements`. Without: no discovery, no phase.task contract. Stub skills exempt.

## Entry Skill Language Constraint

Skills with `## Entry` are **entry skills** - invocation triggers execution, not just loading. `user-invocable: true` adds direct user invocation. Reference skills inform only.

Entry section MUST begin with `**MUST <verb>**` - imperative declaration of required action on invocation.

Without: agent treats load as reference only.

## Prohibited

- Core philosophy, author intent, background stories - "why" narrative.
- Self-repetition - checklists, summaries duplicating body content. Each fact in one place.

Allowed: behavioral descriptions (what + how), rules, reference tables. "Why" -> ADR or domain docs.

## Structure

Organize per `writing-great-skills` hierarchy. Core decision: ladder rung (in-skill step -> in-skill reference -> external reference). Push behind pointers when only some branches reach it - dual criterion: reachability + frequency (§Loading Efficiency).

---

# Content Quality Metrics

Quantified norms for skill bodies - checkable.

## Length Bands

SKILL.md body target 400-1,800 words. Reference skills <=1,200.

|Body size|Disposition|
|-|-|
|<200 words|wrapper only - delegation contract required (§Wrapper Delegation Contract)|
|200-399 words|thin steps skill - no reference content|
|400-1,800 words|target band|
|>1,800 words|disclosure split to sibling|

## Loading Efficiency (Pareto Placement)

SKILL.md = hot path. Execution-critical references, needed every dispatch, MUST live in SKILL.md body. Cold 80% (edge cases, full tables, examples) -> sibling behind `(see sibling §X)` pointer.

Rule of thumb: ~20% of content serves ~80% of activations; that 20% MUST reside in SKILL.md. Pointer cost < inlined cold content.

Checkable: every-dispatch rule home in SKILL.md; cold content absent from body.

## Why/How Distribution

- Opens with one-sentence thesis - why the skill exists.
- Each decision rule carries <=1 line rationale.
- why/how lexical ratio target 1:5-1:40. Outside band -> review scattering/absence (directional signal).

## Carrier Selection

|Content|Carrier|
|-|-|
|fact mappings, decision matrices|table|
|ordered behavior|numbered list|
|checkable gates|checkbox list|
|diagrams, file trees, templates, code|code fence|
|terms with bans|bold + italic list (§Positive-First Phrasing)|
|narrative|prose|

No mixed carriers.

## Completion Criteria Evidence Gate

Every step ends with a checkable completion criterion. Runnable behavior -> criterion names evidence (paste command + output). Vague criteria ("extremely extensive", "fix anything...", "when answered") -> observable signals.

## Branch Skip Conditions

Every branch declares trigger + skip condition. Exploration-settled = legal skip, default. Optional steps -> make conditional.

## Wrapper Delegation Contract

Wrapper skill (delegates) SHALL declare: delegated skills, output contract, completion criterion, dependency-missing degradation. None -> fails review.

## Sibling Single Source

Rule lives in exactly one home - SKILL.md or one sibling. SKILL+sibling duplication = violation. Pointer = only legal reuse.

## Positive-First Phrasing

Prohibition paired with positive target ("X banned; do Y instead"). Vocabulary bans use avoid-list pattern (`_Avoid_:` + list). Reference skills gather misreadings in rejected-framings section.

## No-op Test

Every sentence passes no-op test - deletion changes behavior. Pep-talk deleted.

## Lazy Creation + Scope Discipline

Skill managing external files declares scope boundary ("X contains only Y"). Creation lazy - only when content exists. Never overwrite edits.

## Pointer Existence Validation

Referenced skill or file exists within the skill set at authoring time. Dangling -> delete or localize.

---

# Language Constraints

Natural language - skill body, code comments, sibling files - MUST:

1. **Caveman full level** (load skill caveman for full rules):
   - Drop articles, filler, pleasantries, hedging
   - Fragments OK. Short synonyms. Technical terms exact. Code unchanged
   - Standard acronyms OK (API, URI, JSON). No invented abbreviations
   - Pattern: `[thing] [action] [reason]. [next step].`

2. **Language** - follow the consuming project language conventions (project instructions / constraints); the skill spec does not mandate a specific language. Exception: code examples and error strings stay in their native language.

3. **Character standardization** - standard ASCII characters replace special characters where an equivalent exists: `—`/`–` -> `-`, `→` -> `->`, `≤` -> `<=`, `≥` -> `>=`, `×` -> `x`, `…` -> `...`. Literal content inside code fences/backticks exempt - code samples and display templates stay verbatim.

---

# Reference Constraints

## Resolution Rule

`<name>` -> `<skillsDir>/<name>/SKILL.md`. skillsDir candidates, order: config `skillsDir` -> `packages/graph-workflow/skills` -> `~/.agents/skills` (mirrors `resolveSkillsDir`). Sibling files resolve `<name>/<path>` relative to SKILL.md.

## Allowed

- Skills referenced by plain name - `load skill <name>` (content-dependency declaration; platform resolves it)

## Prohibited

- URI forms - references use skill names
- Project-specific file paths (any path outside the skill set, the platform convention layer, and workflow runtime artifacts) - absent when skill deployed elsewhere; no family enumeration (no `docs/`-style lists - the tier property covers every family)
- External URLs - uncontrollable, may 404 or change
- Files outside plugin boundaries

Skills self-contained. Sibling files share skill lifecycle. Convention files arrive via the platform convention layer (default-loaded, absence-tolerant); project families via channels. `### Files` contract entries SHALL be convention files, project family globs, or workflow artifacts - never a specific odd file whose existence is project-dependent.
