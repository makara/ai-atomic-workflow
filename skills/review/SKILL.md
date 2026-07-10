---
name: review
description: 3-axis code review (Standards + Spec + Best-practice) with scope annotation and rework routing. Extends parent code-review (2-axis) with a third Best-practice axis.
argument-hint: "[review scope: diff range or file paths]"
user-invocable: true
disable-model-invocation: false
version: "1.0.0"
last_updated: "2026-07-09"
---

# Review — 3-Axis Code Review + Rework Routing

> **Source**: Own skill (ai-atomic-workflow). Replaces `requesting-code-review-zh` and `requesting-code-review-en`.
> **Base**: mattpocock/skills `code-review` — 2-axis review (Standards + Spec) with parallel sub-agents + Fowler code smell baseline.
> **Constraint model**: Inherits `lang.conversation`, `lang.documents`, and `git.policy` from the calling context. See `core/constraint-layers.md` §2.1–2.3.

## Core Philosophy

Review extends the parent `code-review` skill's 2-axis review (Standards + Spec) with:
1. A **third axis** — Best-practice (5 dimensions, non-pass/fail)
2. **Scope annotation** — each Best-practice finding tagged ≤issue or >issue
3. **Rework routing** — directional guidance back to the appropriate workflow layer
4. **TODO debt records** — format for deferred improvements

Review does NOT auto-advance — the user decides whether to accept, rework, or record TODO (aligned with G1: user-driven workflow).

## 3-Axis Review Framework

### Axis 1: Standards (Compliance · pass/fail)

Does the code follow the repo's documented coding standards?

**Review scope**:
- Project coding standards files (`CODING-STANDARDS.md`, `CONTRIBUTING.md`, etc.)
- Fowler code smell baseline (built into code-review: mysterious name, duplicated code, feature envy, data clumps, primitive obsession, repeated switches, shotgun surgery, divergent change, speculative generality, message chains, middle man, refused bequest) — all are judgment heuristics, not hard violations

**Rules**:
- Project standards take priority over the smell baseline
- Skip rules already enforced by tooling (linters, formatters)

### Axis 2: Spec (Coverage · pass/fail)

Does the code faithfully implement what the originating issue / PRD / spec asked for?

**Review scope**:
- Spec-required features that are missing or incomplete
- Behavior the spec did NOT ask for (scope creep)
- Spec items that appear implemented but may be implemented incorrectly

### Axis 3: Best-practice (Optimization Suggestions · NOT pass/fail)

Review optimization opportunities in the code. Does NOT block pass — NOT required to fix.

**Five review dimensions**:

| Dimension | Focus |
|-----------|-------|
| **Code Quality** | Readability, conciseness, DRY violations, complexity (cyclomatic/cognitive) |
| **Architecture** | Module boundary clarity, interface contract soundness, dependency direction, design pattern usage |
| **Performance** | Unnecessary allocations, N+1 queries, algorithmic complexity issues, I/O efficiency |
| **Robustness** | Error handling completeness, boundary condition coverage, null safety, input validation |
| **Testability** | Code testability, test coverage gaps, coupling that hinders testing |

**Output format**:

```
[Dimension] File:line — Problem description → Optimization suggestion (scope: ≤issue | >issue)
```

Each suggestion is an independent entry. If multiple suggestions share the same root cause, merge into one and annotate "same root cause".

## Execution Flow

### Step 1: Determine Review Baseline

Confirm the diff range and fixed point (commit / branch / tag / file path). Ensure the diff is non-empty.

If `git.policy = not-allowed`, use file-based comparison instead of git diff/log/rev-parse. If `git.policy = allowed`, use the parent `code-review`'s git-based diff methods.

### Step 2: Identify Review Sources

- **Spec source**: commit message → issue reference → issue file → user-provided path → PRD/spec file → ask user
- **Standards source**: project coding standards files

### Step 3: Parallel Sub-Agent Review

Launch **three** parallel sub-agents simultaneously (using general-purpose subagent):

| Sub-agent | Review Axis | Input |
|-----------|-------------|-------|
| Standards agent | Compliance | diff + coding standards files + smell baseline |
| Spec agent | Coverage | diff + spec files |
| Best-practice agent | Optimization | diff + five-dimension review framework |

**Standards agent prompt key points**: Report per file/hunk — cite specific standard (filename + rule name); flag smells — name and cite code; distinguish hard violations from judgment suggestions; skip tool-enforced rules.

**Spec agent prompt key points**: Report missing/incomplete requirements, scope creep, suspected wrong implementations — cite spec source lines.

**Best-practice agent prompt key points**: Report optimization opportunities across 5 dimensions — each with file line number, problem description, optimization suggestion, and scope annotation (≤issue / >issue); only report findings with substantive improvement room; do not report findings that duplicate Standards axis findings.

### Step 4: Aggregate

Present under three headers: `## Standards`, `## Spec`, `## Best-practice`. Do NOT merge or reorder across axes.

At the end, provide a summary line: total findings per axis + most severe finding per axis (if any).

### Step 5: Rework Route Annotation

Annotate each Best-practice finding with a **scope level**:

| Scope | Meaning | Example Scenario |
|-------|---------|-----------------|
| **≤ issue** | Fixable within the current issue scope, no new requirements needed | Extract duplicated code, optimize single-function complexity |
| **> issue** | Exceeds current issue scope, needs independent PRD decomposition | Cross-module architecture refactor, performance architecture adjustment |

AI aggregates annotations and provides **routing direction suggestions**:
- If ≤issue findings exist → suggest "return to bottom layer: re-execute implement for current issue"
- If >issue findings exist → suggest "return to middle layer: new PRD → to-tickets → implement"
- Can suggest both directions simultaneously (if both scopes exist)

**User makes the final decision** on routing:
- **≤ issue** → re-execute implement (return to bottom layer for current issue)
- **> issue** → new PRD → issue(s) (return to middle layer decomposition)
- **Accept as-is** → no rework, mark as known improvement item
- **Record TODO** → no rework, write debt record for later tracking

## Rework Routing Diagram

```
3-axis review completed (review report)
        │
        ▼
AI annotates scope + suggests routing direction
        │
        ▼
User decides
   ├─ ≤ issue ──→ re-execute implement (bottom layer)
   ├─ > issue ──→ new PRD → to-tickets → implement (middle → bottom)
   ├─ Accept ────→ no rework, issue complete
   └─ Record TODO → write debt record, issue marked passed
```

## TODO Debt Record Format

When the user chooses "Record TODO" for a finding, write the debt record with this format:

```
## TODO — <finding summary>
- **Scope**: ≤issue | >issue
- **Dimension**: code quality | architecture | performance | robustness | testability
- **Description**: <detailed description of the improvement>
- **Impact**: <why it matters, what is affected>
```

Write to `.scratch/<feature>/DEBT.md` (feature-level) or the issue file itself.

The `finalize` skill collects and summarizes all TODO debt records across issues.

## Parent Skill Dependency

| Parent Skill | Relationship |
|-------------|-------------|
| `code-review` | Base — 2-axis review (Standards + Spec) with parallel sub-agents + Fowler smell baseline. `review` extends it with Best-practice 3rd axis, scope annotation, and rework routing. |

If mattpocock/skills `code-review` is not installed, `review`'s 3-axis framework and rework routing still take effect independently — the Standards and Spec axes use inline review logic instead of the parent's sub-agent dispatch.

## Constraint Inheritance

Review does NOT decide language or git policy — it inherits them from the calling context (execute or orchestrate).

| Parameter | Source | Fallback |
|-----------|--------|----------|
| `lang.conversation` | calling context | project AGENTS.md → global default `zh` |
| `lang.documents` | calling context | project AGENTS.md → global default `zh` |
| `git.policy` | calling context | project AGENTS.md → global default `allowed` |

If constraints are missing from context (e.g. review is invoked standalone), read them from the project's `AGENTS.md` or `instructions.md` as fallback.

- `lang.conversation` determines the language of the review report presented to the user
- `lang.documents` determines the language of any review artifacts written to disk
- `git.policy` determines whether review uses git-based diffs or file-based comparison

## Completion Criteria

- [ ] Review baseline confirmed (diff range / file paths)
- [ ] Review sources identified (spec + standards files)
- [ ] 3 parallel sub-agent reviews executed (Standards + Spec + Best-practice)
- [ ] Aggregated report presented under 3 headers
- [ ] Summary line with per-axis finding counts included
- [ ] Best-practice findings annotated with scope (≤issue / >issue)
- [ ] Rework routing direction suggested to user
- [ ] No Agent-specifying language

## Constraints

- This skill does NOT decide language or git policy — all constraints are inherited from the calling context
- Written in English; output language is determined by `lang.conversation` and `lang.documents` from context
- User-driven — AI executes Steps 1–4, user decides at Step 5 (rework routing)
- Platform-agnostic — concrete platform commands are referenced from `standards/common/instructions.md`
