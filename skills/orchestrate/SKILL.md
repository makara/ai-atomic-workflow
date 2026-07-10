---
name: orchestrate
description: Entry orchestration skill — detects entry scenario (idea/bug/triage), injects lang/git constraints, routes to the appropriate workflow skill (e.g. main-flow, diagnosing-bugs), and writes a guide file to disk.
argument-hint: "Use orchestrate skill\nGoals:\n- <描述>\nRules:\n- <约束>"
user-invocable: true
disable-model-invocation: true
version: "3.1.0"
last_updated: "2026-07-09"
---

# Orchestrate — Entry Orchestration

> **Source**: Own skill (ai-atomic-workflow). Replaces `phase-bootstrap-zh` and `phase-bootstrap-en`.
> **Platform**: Platform-agnostic — concrete platform mappings (e.g. compress) are defined in `standards/common/instructions.md` §十二.
> **Constraint model**: See `core/constraint-layers.md` §二 and `core/language-policy.md`.

## Core Philosophy

Orchestrate is the single entry point for all AI-assisted development work. It:
1. **Detects the entry scenario** from user input (idea / bug / triage)
2. **Injects constraints** — lang and git policy — from project standards via A+C propagation
3. **Routes to the appropriate workflow** for that scenario
4. **Produces a guide file** on disk at `plans/` — a navigation map, not an implementation plan

Orchestrate does NOT auto-advance. The AI informs the user which skill to use at each step; the user explicitly triggers execution (aligned with G1: user-driven workflow).

## Entry Scenario Detection

### Input format

```
Use orchestrate skill
Goals:
- <natural language goal 1>
- <natural language goal 2>
Rules:
- <natural language rule 1>
- <natural language rule 2>
```

- **Goals**: Natural language list. Each item can be a bug report, feature request, design change, or any mix. Multiple goals of different types in the same list are allowed — the grilling or triage process will tease them apart.
- **Rules**: Natural language list. Constraints like language (`lang=zh`, `用英文对话`, `use English for documents`), git policy (`git=not-allowed`), scope, or any special requirements. Use natural language — no strict key=value format required.

### Scenario detection

Read the Goals section and auto-suggest a scenario:

| Goals Content | Detected Scenario |
|---------------|-------------------|
| Single goal, reads like a bug (broken, error, crash, doesn't work, 修复) | `bug` |
| Single goal, reads like a feature/change (build, add, create, refactor, 构建, 新增) | `idea` |
| Multiple goals of any type (mixed bugs + features allowed) | `idea` — grilling interview naturally teases them apart |
| Large batch (>5 items) of raw, unclassified requests | `triage` |

Auto-detection is a suggestion — **always confirm** with the user before routing. If ambiguous, ask: "Is this a feature/change, a bug fix, or a batch of items to process?"

Rules do NOT affect scenario detection — they only constrain execution.

### Natural language fallback

If the user provides unstructured input without the `Use orchestrate skill` / `Goals:` / `Rules:` format:

- Treat the entire input as Goals (natural language)
- Parse and present the interpreted Goals back to the user for confirmation
- If intent is ambiguous, ask clarifying questions before routing

### Scenario routing

| Scenario | Trigger | Routed To |
|----------|---------|-----------|
| **idea** | New feature, design change, or architecture improvement | `main-flow` skill — 4-step workflow (grilling → prototype → to-spec/to-tickets → execute → finalize) |
| **bug** | A single bug report with reproducible symptoms | `diagnosing-bugs` skill — complete 6-phase debugging flow (feedback loop → reproduce → hypothesize → instrument → fix + regression test → post-mortem); followed by execute + finalize |
| **triage** | A batch of unclassified issues or requests | Not yet supported — inform user and skip |
| **interrupt** | Bug discovered during execute or review | [F3] alert → user decides: diagnosing-bugs fix / new issue / record TODO |

## Constraint Injection

Orchestrate reads constraints from project standards and injects them into the workflow via two redundant paths:

| Path | Mechanism | Source |
|------|-----------|--------|
| **A (explicit)** | Pass `lang.conversation`, `lang.documents`, `git.policy` as parameters to sub-skills | Orchestrate itself |
| **C (context)** | Project standards (`instructions.md`, `AGENTS.md`) are loaded into context; sub-skills read from there | Project files |

A and C are mutually redundant — either path alone ensures constraints are enforced.

### Language

**`lang.conversation`** — resolved as follows:
1. **Auto-detect** from the language of the Goals text — if Goals are in Chinese → `zh`; if in English → `en`
2. If auto-detection is inconclusive (mixed-language Goals), check Rules section for explicit lang directives
3. Explicit Rules directive (highest manual override, e.g. `lang=zh`, `use English`)
4. Project `AGENTS.md` or `instructions.md` declaration
5. Global default: `zh`

**`lang.documents`** — resolved as follows:
1. Rules section directive (e.g. `lang.documents=en`, `文档用英文`)
2. Project `AGENTS.md` or `instructions.md` declaration
3. Global default: `zh`

See `core/language-policy.md` for per-scenario resolution.

### Git policy

Read `git.policy` from:
1. Rules section directive (e.g. `git=not-allowed`, `git=allowed`)
2. Project `AGENTS.md` declaration
3. Global default: `allowed`

## Compress Platform Mapping

Compress platform mapping is defined in `standards/common/instructions.md` §十二. Execute and other skills read the mapping from that single source of truth.

> This skill does NOT maintain a copy of the mapping table — delegating avoids duplication and keeps the mapping in one authoritative location.

## Scenario Workflows

Detailed workflow for each scenario is defined in the respective skill:

- **idea**: `skills/main-flow/SKILL.md` — 4-step workflow (requirements clarification → prototype validation → output conversion → closure review)
- **bug**: `diagnosing-bugs` (parent skill, mattpocock/skills) — 6-phase debugging flow; not yet wrapped in an own path skill

Orchestrate only routes to the correct workflow skill and produces the guide file. It does NOT define workflow steps itself.

### Interrupt Scenario (mid-flow)

When execute or review discovers a bug:

```
In current execute/review
  → [F3] Alert: bug discovered + suggested path
  → User decides:
      ├── diagnosing-bugs → fix → resume current execute
      ├── New issue → add to issue list → continue current execute
      └── Record TODO → continue current execute → finalize summary
```

## Skill Dependency Declarations

This skill orchestrates 12 parent skills from mattpocock/skills. They must be available in the user's skill installation.

| Parent Skill | Called By | When |
|-------------|-----------|------|
| `grilling` | main-flow (step 1) | Requirements clarification interview |
| `domain-modeling` | main-flow (step 1) | Maintain CONTEXT.md glossary + ADRs |
| `prototype` | main-flow (step 2) | Throwaway code to answer design questions |
| `to-spec` | main-flow (step 3) | Synthesize conversation into PRD |
| `to-tickets` | main-flow (step 3) | Tracer-bullet vertical slice decomposition |
| `implement` | execute (step 1) | Implement based on PRD/issue |
| `tdd` | implement (internal) | Test-driven development |
| `code-review` | review (internal, as 2-axis base) | Standards + Spec review |
| `diagnosing-bugs` | orchestrate (bug scenario) | 6-phase debugging flow |
| `improve-codebase-architecture` | diagnosing-bugs (post-mortem) | Deepening opportunity scan |
| `codebase-design` | improve-codebase-architecture | Deep module design vocabulary |
| `triage` | orchestrate (triage scenario) | Classify → verify → grill → agent-ready brief |

> `setup-matt-pocock-skills` is a one-time repo configuration tool, not counted as a runtime skill.

### Own skills called by this workflow

| Own Skill | Called By | Role |
|-----------|-----------|------|
| `main-flow` | orchestrate (idea scenario) | 4-step workflow for idea→ship |
| `execute` | main-flow/orchestrate (step 3) | implement → review → compress closed loop |
| `review` | execute (step 2) | 3-axis review + scope annotation + rework routing |
| `finalize` | orchestrate (final step) | Architecture-level quality gate + debt summary |

## Entry Metadata Header

Orchestrate writes a 3-line metadata header to the guide file at `plans/`. The workflow skill (e.g. `main-flow`) appends scenario-specific step content below this header.

```
# Phase Guide — <Goal>
> **Date**: YYYY-MM-DD
> **Entry scenario**: <idea | bug | interrupt>
> **Language**: conversation=<zh|en>, documents=<zh|en>
> **Git policy**: <allowed | not-allowed>

<!-- steps below written by the workflow skill -->
```

The header is written once when orchestrate routes to a workflow skill. The body is written and updated by the workflow skill as each step completes.

## Completion Criteria

- [ ] Goals parsed and confirmed with user
- [ ] Entry scenario detected (or user confirmed)
- [ ] `lang.conversation` auto-detected from Goals text language (or user confirmed if inconclusive)
- [ ] `lang.documents` resolved
- [ ] `git.policy` resolved
- [ ] Scenario routed to the correct workflow skill
- [ ] Entry metadata header (scenario + language + git policy) written to guide file at `plans/`
- [ ] Constraints passed to workflow skill
- [ ] No Agent-specifying language

## Constraints

- This skill itself does NOT decide language or git policy — it reads from project standards and passes through
- All own skills are written in English; output language is determined by the `lang.conversation` and `lang.documents` parameters
- User-driven — AI informs steps and usage; user explicitly triggers each step
