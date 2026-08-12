---
name: atom-skill-spec
description: Reference for SKILL.md format specification - frontmatter rules, body content rules, content quality metrics (quantified norms), language constraints, reference boundaries, Context Requirements contract (four subsections incl. Operation classes). Use when writing or reviewing skills, mentions skill format, SKILL.md, skill spec, operation classes, skill quality, why/how ratio, skill length bands.
argument-hint: none (reference skill)
user-invocable: true
version: 2.0.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load skill writing-for-agents before use.

# Atom-Skill-Spec

Reference spec for SKILL.md format - frontmatter, body, quality metrics, language constraints, reference boundaries. Load `writing-for-agents` for foundation; adds quantified norms + project constraints.

**Priority**: atom-skill-spec rules > writing-for-agents rules. Conflict -> this spec wins.

## Alignment with writing-for-agents

Full mapping: (see sibling ALIGNMENT.md §Mapping).

---

# Frontmatter Format

## Mandatory

|Field|Why|
|-|-|
|`name`|Skill directory name. Missing -> unloadable|
|`description`|Trigger phrases listing invocation branches. Search index key|

## Recommended

|Field|Why|
|-|-|
|`version`|Semantic version. Traceability|
|`last_updated`|ISO date. Staleness detection|

## Invocation

|Model|Frontmatter|Meaning|
|-|-|-|
|model-invoked|Omit `disable-model-invocation`|Auto-triggers|
|user-invoked|`disable-model-invocation: true` + `user-invocable: true`|Reached only when name typed|
|injection-only (reference)|`disable-model-invocation: true` + `user-invocable: false`|Reference content, loaded by name|
|hybrid|Omit `disable-model-invocation` + `user-invocable: true`|Auto-triggers AND slash-invokable|

Default: model-invoked; user-invoked when no auto-trigger.

---

# Body Content Rules

## Mandatory

`Runtime constraints` block - first content after frontmatter. Lines prefixed with `>`. Multi-line OK - load dependencies.

```
> **Runtime constraints** — load skill <name> before use.
```

Minimum: one `>` line declaring runtime requirements.

## Entry Skill Context Requirements

Entry skills declare runtime context needs via `## Context Requirements`. Required for any graph-callable entry skill.

**Format** - per `atom-graph-spec` §Context Requirements Convention (four subsections, annotation grammar, convention-layer exemption - single source).

Without: no discovery, no phase.task contract. Stub skills exempt.

## Entry Skill Language Constraint

Skills with `## Entry` are **entry skills** - invocation triggers execution, not just loading. Entry section MUST begin with `**MUST <verb>**` - required-action declaration. Without: agent treats load as reference only.

## Prohibited

- Core philosophy, author intent, background stories - "why" narrative.
- Self-repetition - checklists, summaries duplicating body content. Each fact in one place.

Allowed: behavioral descriptions (what + how), rules, reference tables. "Why" -> ADR or domain docs.

## Structure

Organize per `writing-for-agents` hierarchy. Core decision: ladder rung (in-skill step -> in-skill reference -> disclosed reference). Push behind pointers when only some branches reach it - dual criterion: reachability + frequency (§Loading Efficiency).

---

# Content Quality Metrics

Quantified norms for skill bodies - checkable.

## Loading Efficiency (Pareto Placement)

SKILL.md = hot path. Execution-critical references, needed every dispatch, MUST live in SKILL.md body. Cold 80% (edge cases, full tables, examples) -> sibling behind `(see sibling §X)` pointer.

Rule of thumb: ~20% of content serves ~80% of activations; that 20% MUST reside in SKILL.md; pointer cost < inlined cold content.

**Priority** - Pareto placement governs skill structure; Length Bands diagnostic, secondary. Conflict -> LE wins: in-band body with hot content behind pointer fails review; bands never justify inlined cold content.

**Hot-content non-transferability** - ~20% serving ~80% of activations is non-transferable: MUST stay in SKILL.md body; sibling move = violation (pointer-cost rule applies to cold content only).

## Two Loads

Every pointer/body line spends one of two budgets: **context load** (always-loaded - description lines, AGENTS.md entries) or **cognitive load** (human memory). Model-invoked description = permanent context load; user-invoked = zero context, pays cognitive.

## Length Bands

SKILL.md body target 500-2,000 words; reference skills <=1,500; platform primitives (atom-kernel, atom-phase-handler) <=1,400. <200 = wrapper only (delegation contract required); 200-499 = thin steps; >2,000 = disclosure split to sibling.

Bands describe sizes, never placement - see §Loading Efficiency.

## Why/How Distribution

Opens with one-sentence thesis. Each decision rule carries <=1 line rationale. why/how lexical ratio 1:5-1:40; outside -> review scattering/absence.

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

Every step ends with a checkable completion criterion. Runnable behavior -> criterion names evidence. Vague criteria ("extremely extensive", "fix anything...") -> observable signals.

**Demand**: criterion demands legwork - "every modified model accounted for" beats "produce a change list". Criterion checkable AND exhaustive.

**Premature completion defense**: sharpen the bound first (local, cheap); only if irreducibly fuzzy AND rush observed, hide post-completion steps by splitting the sequence - only across a real context boundary (hand-off, subagent dispatch). Inline split clears nothing.

## Branch Skip Conditions

Every branch declares trigger + skip condition. Exploration-settled = legal skip, default. Optional steps -> make conditional.

## Wrapper Delegation Contract

Wrapper skill (delegates) SHALL declare: delegated skills, output contract, completion criterion, dependency-missing degradation. None -> fails review. See `writing-for-agents` router-skills pattern.

## Sibling Single Source

Rule lives in exactly one home - SKILL.md or one sibling. Duplication = violation. Pointer = only legal reuse. Every atom execution skill follows band-limited structure: SKILL.md = contracts + pointers, reference files = cold detail. Cold-detail distribution uniform across primitives. Each concept has exactly one authoritative definition site; other files reference by name, never restate. Restatement = defect.

## Co-location

A concept's definition, rules, caveats under one heading - never scattered. Scattering fragments one meaning across many.

## Positive-First Phrasing

Prohibition paired with positive target ("X banned; do Y instead"). Vocabulary bans use avoid-list pattern (`_Avoid_:` + list). Reference skills gather misreadings in rejected-framings section.

## No-op Test

Every sentence passes no-op test - deletion changes behavior. Pep-talk deleted. Model-relative: disagreement settles by running the document, not debate.

## Lazy Creation + Scope Discipline

Skill managing external files declares scope boundary ("X contains only Y"). Creation lazy - only when content exists. Never overwrite edits.

**Sediment**: stale layers settle when adding feels safe, removing risky. Prune line by line: relevance test, environment-lookup test.

## Environment as Source of Truth

Environment (package.json scripts, config, layout, --help) is truth. Document restating it = cache - earns load only when lookup expensive. Cache only unwritten convention, reason, gotcha.

## Leading Words

Pretrained compact concept repeated as token (_tight_ loop, go _red_). Recruits priors free; coined words pay definition tokens - prefer existing. Checkable: triad at three sites collapses to one token; negation banned - state positive target.

## Pointer Existence Validation

Referenced skill or file exists within the skill set at authoring time. Dangling -> delete or localize.

---

# Language Constraints

Natural language - skill body, code comments, sibling files - MUST:

1. **Caveman full level** (load skill caveman): drop articles/filler/hedging; fragments OK, short synonyms, technical terms exact; standard acronyms OK, no invented abbreviations; pattern `[thing] [action] [reason]. [next step].`

2. **Language** - follow the consuming project language conventions; the spec does not mandate a language. Exception: code examples and error strings stay native.

3. **Character standardization** - ASCII replaces special characters where equivalent exists: `—`/`–` -> `-`, `→` -> `->`, `≤` -> `<=`, `≥` -> `>=`, `×` -> `x`, `…` -> `...`. Code fences/backticks exempt - samples stay verbatim. `§` allowed as section-pointer marker (`§X`) - family convention, never substituted.

---

# Reference Constraints

## Resolution Rule

`<name>` -> `<skillsDir>/<name>/SKILL.md`. skillsDir candidates, order: `packages/graph-workflow/skills` -> `~/.agents/skills`. Sibling files resolve `<name>/<path>` relative to SKILL.md. Skill resolution is agent-side — the engine never probes the skills package.

## Context Declaration

External-reference freedom is the wfa document-layer principle (any document may point anywhere). The skill-dependency layer resolves within the skillsDir per project constraints - the freedom does not extend to skill-internal references. Project constraints win (Priority rule).

## Allowed

- Skills referenced by plain name - `load skill <name>` (content-dependency declaration; platform resolves it)

## Prohibited

- URI forms - references use skill names
- Project-specific file paths (any path outside the skill set, the platform convention layer, and workflow runtime artifacts) - absent when skill deployed elsewhere; no family enumeration (no `docs/`-style lists - the tier property covers every family)
- External URLs - uncontrollable, may 404 or change
- Files outside plugin boundaries

Skills self-contained. Sibling files share skill lifecycle. Convention files arrive via the platform convention layer; project families via channels. `### Files` entries SHALL be convention files, project family globs, or workflow artifacts.
