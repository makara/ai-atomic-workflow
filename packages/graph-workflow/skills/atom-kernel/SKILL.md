---
name: atom-kernel
description: Platform primitives — task() dispatch, question() decision UI with 8 rules, interview() consensus, solve() goal-driven loop, graph-scheduler tool detection. Use when dispatching sub-agents or presenting decisions.
argument-hint: none (reference skill)
user-invocable: false
version: 2.4.0
last_updated: '2026-08-02'
---

> **Runtime constraints** — load skill://writing-great-skills before use. **Layer**: atom — runtime primitives.

# Atom-Kernel

## Callable vs Behavior Contract

|Primitive|Type|Maps to|
|-|-|-|
|`task()`|**Callable**|`task` tool — dispatches sub-agents|
|`question()`|**Callable**|`ask` tool — single-decision UI|
|`interview()`|**Behavior Contract**|Agent-implemented — multi-turn consensus conversation|
|`solve()`|**Behavior Contract**|Agent-implemented — goal-driven loop: confirm → research → think → interview → repeat|

> **`task()` and `question()`** are tool-mapped callables — agent invokes them directly and gets a result. **`interview()` and `solve()`** are behavior contracts — agent reads rules below and implements manually using `question()` (or `ask`) one turn at a time. Attempting to call `interview({goal, context})` or `solve({goal})` as a function will fail with `ReferenceError: … is not defined`.

---

# Graph-Scheduler Tool Detection

Runtime MCP tool name detection for the graph-scheduler — 9-tool substring matching. Platform tool prefixes vary (e.g. `xd://mcp__graph_scheduler_…`); names resolve by substring, never assumed exact.

Before any graph operation, scan the available tool list for graph-scheduler MCP tools:

- Find tool with "graph_start" in name → record exact name
- Find tool with "graph_advance" in name → record exact name
- Find tool with "graph_status" in name → record exact name
- Find tool with "graph_list" in name → record exact name
- Find tool with "graph_force_end" in name → record exact name
- Find tool with "graph_jump" in name → record exact name
- Find tool with "graph_init" in name → record exact name
- Find tool with "graph_clean_completed" in name → record exact name
- Find tool with "graph_clean_all" in name → record exact name

Use detected names for all subsequent calls. Tool parameters and return values unchanged.

---

# task() — Dispatch

Dispatch sub-agents. Batch: many in `tasks[]`, shared `context`.

## Signature

```
task({ i, context, tasks })
```

- `i` — intent. Present participle. 2–6 words.
- `context` — shared constraints. Format: `# Goal`, `# Constraints`, `# Contract`.
- `tasks` — array. Each: `name` (CamelCase ≤32), `agent` (specialist type), `task` (self-contained, acceptance criteria).

## Agent Hints — Dispatch Type Selection

`task()` `agent` field accepts one concrete agent type. When the calling skill runs as a graph main phase, its context may carry a `## Agent hints: [<type-1>, <type-2>, …]` block (injected by atom-phase-handler from the phase `agent` array — priority-ordered). Consumption rule:

- Pick the **first** hint whose agent type is available in the current platform environment.
- None available → fall back to platform default (`task`).
- Hints are advisory — a skill that doesn't dispatch ignores them entirely.
- The skill chooses its own fan-out structure; hints only select the type for each dispatch.

Applies per dispatch call — a batch may mix types per task when the skill needs different capabilities (e.g. scout for read-only exploration, reviewer for review axes).

## Launch

`task({ i, context, tasks })` — capture agent ID — result via `agent://<id>`.

## Decision Request

Verify-style handoff format — returned by dispatched work to checkpoint with the user (or caller). Graph review nodes embed this contract in their task text. Sections:

- Context — current state, why the decision is needed
- Auto-recorded debt — accepted trade-offs recorded, no open debt
- Blocking findings — items that block advance
- Dispatch record — what sub-agents ran, selection evidence
- Suggested advance label — recommended next graph phase label

---

# question() — Decision UI

Single decision per call.

## Signature

```
question({ header, options, custom })
```

- `header` — noun phrase. ≤30 chars.
- `options` — `[{ label, description }]`. Label: concrete answer phrase. Description: single line.
- `custom` — mandatory `true`.

## 8 Format Rules

1. Header: noun phrase ≤30 chars. Topic, not outcome.
2. Label: concrete answer phrase. Recommended first.
3. Description: single line. May note next step.
4. Pre-call text: background + option meanings + recommendation — three parts, same message.
5. Body: forbidden.
6. Custom: mandatory `true`.
7. One question per call.
8. No control chars (`\r`, `\t`, `\n`).

## Decision Card

Card — `question()` mapping:

|Card field|Maps to|
|-|-|
|`topic`|`header`|
|`routingActions[].label`|`options[].label`|
|`routingActions[].description`|`options[].description`|
|`routingActions[].action`|decision routing|
|`pre_text`|pre-call text|

> **`custom: true` is mandatory.** Handler MUST process custom input into `IApprovalDecision.note`. Free-text semantics by action: continue → recorded remark, retry → inject into upstream context, jump → potential target override.

### Example

```
Background: auth module needs token-refresh strategy.
Option A (Polling) — timer-based check.
Option B (On-demand) — refresh on 401.
Recommendation: Option B with eager-prefetch.

question({ header: "Token refresh strategy", options: [{ label: "Polling", description: "Timer-based expiry check" }, { label: "On-demand", description: "Refresh on 401" }], custom: true })
```

---

# interview() — Consensus Interview (Behavior Contract — NOT a callable function)

Multi-round consensus conversation. Full implementation of grilling skill behavior contract — every rule below MUST apply on every call.

## Signature

```
interview({ goal, context }) → consensus
```

- `goal` — interview goal. Drives question generation. First consensus point — must confirm shared understanding of goal before proceeding.
- `context` — background. File content, state snapshot, structured data. Provides interview context. Facts discoverable from context — look up, do not ask.
- Returns `consensus` — object `{ decisions: [{ decision, rationale }] }`. Structured summary of agreed decision points.

## Behavior Contract

1. **Comprehensive coverage** — cover every aspect of goal topic. Relentless. Skip no relevant dimension.
2. **Decision tree traversal** — walk down each branch. Exhaust all paths before stopping.
3. **Dependency resolution** — dependencies between decisions resolved one-by-one in order. Resolve prerequisite decision before dependent one.
4. **Recommendation first** — each question ships recommended answer as first option. Recommendation derived from context analysis.
5. **Single question discipline** — ask one question per turn. Wait for user response before next. Multiple questions bewildering.
6. **Fact lookup** — fact discoverable from environment (filesystem, tools) — look up. Do not ask user.
7. **Decision gate** — decisions belong to user. Each decision question submitted to user. Wait for answer.
8. **Shared understanding gate** — do not act until user confirms shared understanding reached.

**Goal consensus**: even when goal explicitly given, interview() first confirms shared understanding of goal itself. Goal interpretation must reach consensus before interview proceeds.

**Zero-question degradation**: context already covers all aspects of goal and goal needs no clarification — return consensus directly without questions. Natural consequence of rules 1-8 — not independent rule.

---

# solve() — Goal-Driven Loop (Behavior Contract — NOT a callable function)

Goal-driven solve loop. Agent researches, thinks, interviews, repeats — all inside single agent call. Eliminates graph-level confirm phases — confirmation logic sinks into agent-internal loop.

## Signature

```
solve({ goal, research?, context? }) → solution
```

- `goal` — what to solve. Drives research direction, think scope, interview questions. First consensus point — must confirm shared understanding before loop.
- `research?` — boolean. Run research step. Default `true`. Set `false` when specs already known — skip to think.
- `context?` — background. File content, existing specs, state. Facts discoverable from context — look up, do not ask.
- Returns `solution` — structured result `{ goal, findings?, design, consensus }`. `findings` present only when `research: true`.

## Internal Flow

```
solve({ goal, research: true, context })
  ├── confirm(goal)       ← interview() goal consensus — confirm shared understanding
  ├── research             ← skill://research — look up specs, patterns, constraints
  ├── think                ← agent reasons about solution — design, analyze, decide
  ├── interview(details)   ← question() per-round — confirm each decision point
  └── repeat until done    ← human rejects → back to think/interview; human confirms → return solution
```

Loop inside agent — no graph-level retry/jump. Human rejection → agent re-thinks and re-interviews. Design + confirmation in single phase.

## Behavior Contract

1. **Goal consensus first** — confirm goal with user via interview() before any work. Even explicit goal must reach shared understanding.
2. **Research before think** — when `research: true`, load `skill://research`. Look up reference specs, existing patterns, constraints. Do not skip — uninformed design wastes interview rounds.
3. **Think exhaustively** — design complete solution. Cover all dimensions: structure, naming, edges, guards, edge cases. Incomplete design → extra interview rounds.
4. **Interview one decision at a time** — present one design decision per turn via question(). Recommendation first. Wait for user response before next.
5. **Loop until confirmed** — user rejects any decision → return to think step. Revise design. Re-interview affected decisions only — do not re-ask confirmed points.
6. **Fact lookup** — fact discoverable from environment (filesystem, tools, skill://) — look up. Do not ask user.
7. **Context-driven** — `context` provides background. Facts from context → use directly. Gap in context → research step fills it.
8. **Return structured solution** — when all decisions confirmed, return `{ goal, findings?, design, consensus }`. `consensus` records every confirmed decision with rationale.

## vs interview()

|Dimension|interview()|solve()|
|-|-|-|
|Goal|Reach consensus on topic|Produce complete solution|
|Internal steps|interview only|confirm → research → think → interview loop|
|Research|agent may research ad-hoc|explicit research step via skill://research|
|Loop|single-pass consensus|multi-pass — reject → re-think → re-interview|
|Returns|`{ decisions }`|`{ goal, findings?, design, consensus }`|
|Use case|scope confirm, plan confirm|graph design, skill structure design|

## Primitives Triangle

```
question() — single decision
    │
    ▼
interview() — multi-turn consensus
    │
    ▼
solve() — goal-driven loop (research → think → interview → repeat)
```

Each level builds on lower: solve() uses interview() for goal consensus + decision rounds, uses question() per decision. interview() uses question() per turn.
