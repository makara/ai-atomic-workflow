---
name: main-flow
description: Idea-to-ship main flow skill — guides the user through the 4-step workflow (requirements clarification → prototype validation → output conversion → closure review) for feature/change work. Called by orchestrate after idea scenario detection.
argument-hint: "[lang.conversation=zh|en] [lang.documents=zh|en] [git.policy=allowed|not-allowed]"
user-invocable: false
disable-model-invocation: true
version: "1.0.0"
last_updated: "2026-07-09"
---

# Main Flow — Idea → Ship

> **Source**: Own skill (ai-atomic-workflow). The idea scenario's 4-step main flow, split from `orchestrate`.
> **Called by**: `orchestrate` after detecting the `idea` entry scenario. Constraints (lang, git) are passed by orchestrate — this skill does NOT parse user input or inject constraints.
> **Constraint model**: See `core/constraint-layers.md` §二 and `core/language-policy.md`.

## Core Philosophy

Main-flow is the standard path for turning an idea into shipped work. It informs the user which skill to use at each of the four steps; the user explicitly triggers execution (aligned with G1: user-driven workflow).

Main-flow does NOT:
- Parse entry input or detect scenarios (that's orchestrate's job)
- Inject lang/git constraints (those are passed in by orchestrate)

## Four-Step Workflow

### Step 1: Requirements Clarification

**Goal**: Align requirements through relentless interview.

Tell the user to choose and trigger:

```
Use grilling skill [topic]       ← no codebase (pure idea refinement)
Use grilling + domain-modeling skills [topic]  ← with codebase (produces CONTEXT.md + ADRs)
```

During each interview question, judge:
- **Does this question need a prototype to answer?** — e.g. state machine logic too complex to reason on paper, or UI needs visual comparison
- Yes → record this question for Step 2

Step 1 completes when all questions reach shared understanding.

### Step 2: Prototype Validation (left blank until Step 1 completes)

**Goal**: Answer prototype needs from Step 1 with throwaway code.

After Step 1 completes:
- **If needs recorded** → list each question needing a prototype, tell the user:

```
Use prototype skill [question description]
```

User triggers prototype directly (no handoff intermediary).

- **If no needs** → "Step 1 sufficiently clarified — prototype validation skipped."

### Step 3: Output Conversion

**Goal**: Convert clarified requirements into executable deliverables.

Tell the user to invoke in order:

```
1. Use to-spec skill [feature name]        → PRD published to .scratch/<feature>/PRD.md
2. Use to-tickets skill [PRD reference]     → split into independent tracer-bullet issues
3. Use execute skill, passing PRD and specified Issue → implement → review → compress
```

#### Execute Closed Loop

```
execute (per issue)
  ├── implement    ← parent skill, implements based on PRD/issue
  ├── review       ← own skill, 3-axis review (Standards + Spec + Best-practice) + scope annotation
  └── compress     ← platform-mapped (OpenCode → dcp-compress)
```

#### After Review — User 3-Choice

| Choice | Action | compress executed? |
|--------|--------|-------------------|
| Accept | Issue complete. Output acceptance checklist + next-step suggestion. | Yes |
| Rework | Return to implement → review cycle. | No |
| Record TODO | Issue marked passed. Debt recorded to disk. Summarized at finalize. | Yes |

#### Review Rework Routing

After review, the 3-axis report annotates each Best-practice finding with a scope level:

- **scope ≤ issue** → return to bottom layer: re-execute execute (implement → review)
- **scope > issue** → return to middle layer: create new PRD → to-tickets → execute
- **TODO** → record debt (problem description + scope + impact); finalized at finalize

**Rework routing is user-decided** — AI only annotates and suggests; does not auto-execute.

### Step 4: Closure Review

**Goal**: After all issues complete, perform architecture-level 3-axis review + doc sync as final quality gate.

Tell the user:

```
Use finalize skill [change scope] [affected doc list]
```

**finalize execution**:
- Collect all issue review reports + TODO debt list
- Execute architecture-level 3-axis review (Standards architecture compliance / Spec functional completeness / Best-practice architecture optimization + 3rd-party module review)
- Produce final quality gate report — user decides accept / return for redo / create new improvement tasks
- If accepted: sync affected docs, verify completeness, archive expired outputs

## Skill Dependency Declarations

### Parent skills (mattpocock/skills) directly called

| Parent Skill | Step | When |
|-------------|------|------|
| `grilling` | Step 1 | Requirements clarification interview |
| `domain-modeling` | Step 1 | Maintain CONTEXT.md glossary + ADRs |
| `prototype` | Step 2 | Throwaway code to answer design questions |
| `to-spec` | Step 3 | Synthesize conversation into PRD |
| `to-tickets` | Step 3 | Tracer-bullet vertical slice decomposition |

> `implement`, `tdd`, and `code-review` are called by `execute` and `review` downstream, not directly by main-flow.

### Own skills called

| Own Skill | Step | Role |
|-----------|------|------|
| `execute` | Step 3 | implement → review → compress closed loop |
| `review` | execute (internal) | 3-axis review + scope annotation + rework routing |
| `finalize` | Step 4 | Architecture-level quality gate + debt summary |

## Guide File Format

Main-flow appends scenario-specific step content to the guide file written to `plans/`, below the entry metadata header written by orchestrate (scenario + language + git policy).

```
<!-- header written by orchestrate -->
# Phase Guide — <Goal>
> **Date**: YYYY-MM-DD
> **Entry scenario**: idea
> **Language**: conversation=<zh|en>, documents=<zh|en>
> **Git policy**: <allowed | not-allowed>

<!-- steps below written by main-flow -->

## Step 1: Requirements Clarification
**Status**: [ ] pending / [~] in progress / [x] done
**Skill to use**: grilling / grilling + domain-modeling
**Prototype needs**: <empty or list of marked questions>

## Step 2: Prototype Validation
**Status**: [ ] pending / [x] done / [—] skipped
**Prototype need list**: <filled by Step 1>

## Step 3: Output Conversion
**Status**: [ ] pending / [ ] partial / [x] done
**Execution loop**: execute → implement → review → compress
**Rework routing**: review scope ≤ issue → re-execute execute; scope > issue → new PRD → issues
**TODO debt**: <empty or list of recorded items>

## Step 4: Closure Review
**Status**: [ ] pending / [x] done
**Skill to use**: finalize
```

### Prohibitions

- Do NOT fill Step 2 before Step 1 completes
- Guide file body MUST be written to disk — not landing on disk = not produced

## Completion Criteria

- [ ] Guide file body (4-step status fields) appended after header written by orchestrate
- [ ] Step 1 grilling interview completed — all questions reached shared understanding
- [ ] Step 1 prototype marking judgment complete (if applicable)
- [ ] Step 2 NOT filled before Step 1 marked complete
- [ ] Step 3 PRD + issues published (to-spec → to-tickets)
- [ ] Step 3 execute loop completed per issue (implement → review → compress)
- [ ] Step 3 rework routing explained to user
- [ ] Step 4 finalize instructions provided
- [ ] Step 4 marked pending until all issues complete
- [ ] No Agent-specifying language

## Constraints

- This skill itself does NOT decide language or git policy — constraints are received from orchestrate
- All own skills are written in English; output language is determined by `lang.conversation` and `lang.documents` parameters received from orchestrate
- User-driven — AI informs steps and usage; user explicitly triggers each step
- Step 2 remains blank before Step 1 completes
- Step 4 marked pending until all issues complete
