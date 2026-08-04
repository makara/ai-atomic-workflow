---
name: atom-kernel
description: Platform primitives — task() dispatch, question() decision UI with 8 rules, interview() consensus (single contract, consensus + solve modes), graph-scheduler tool detection. Use when dispatching sub-agents or presenting decisions.
argument-hint: none (reference skill)
user-invocable: false
version: 2.5.0
last_updated: '2026-08-03'
---

> **Runtime constraints** — **Layer**: atom — runtime primitives.

# Atom-Kernel

## Callable vs Behavior Contract

|Primitive|Type|Maps to|
|-|-|-|
|`task()`|**Callable**|platform `task` tool — dispatches sub-agents|
|`question()`|**Callable**|platform `ask` tool — single-decision UI|
|`judge()`|**Callable**|platform one-shot LLM judgment — when/eval evaluation|
|`interview()`|**Behavior Contract**|Agent-implemented — multi-turn consensus conversation, two modes (consensus / solve)|

> **`task()`, `question()`, `judge()`** are tool-mapped callables — agent invokes them directly and gets a result. Tool names in the table are OMP spellings; other platforms map their equivalents per §Platform Spellings. **`interview()`** is a behavior contract — agent reads rules below and implements manually using `question()` (or `ask`) one turn at a time. Attempting to call `interview({goal, context})` as a function will fail with `ReferenceError: … is not defined`.

## Platform Spellings

Primitive contracts are platform-neutral. Tool-name mappings vary per platform — single-sourced here, never assumed exact:

|Primitive|Contract|OMP|opencode|Other platforms|
|-|-|-|-|-|
|`task()`|Sub-agent dispatch — batch in `tasks[]`, shared `context`, agent-hint selection|`task` tool|`task` tool — built-in agents `build`/`plan`/`general`/`explore`/`scout`, default `general`|platform's sub-agent dispatch tool|
|`question()`|Single-decision UI — header/options/custom, 8 format rules|`ask` tool|`question`|platform's decision-UI tool|
|`judge()`|One-shot lightweight-model judgment — constrained answer (`'true'`/`'false'`), conservative failure|`completion(…, model="smol")`|one-shot completion primitive|platform's one-shot completion primitive|

Agent vocabulary (hint availability + platform default): OMP — platform-registered agent types (`scout`/`reviewer`/`task`/…), default `task`; opencode — built-ins per the `task()` row above; other platforms — their sub-agent types, default per platform.

Skills reference contract names only (`task()`, `question()`, `judge()`) — never platform tool spellings. Add a platform row when mapping a new platform; no skill changes needed.

---

# Graph-Scheduler Tool Detection

Runtime MCP tool name detection for the graph-scheduler — 9-tool substring matching. Platform tool prefixes and addressing vary (e.g. OMP `xd://mcp__graph_scheduler_…`, native MCP tool mounts on other platforms); names resolve by substring, never assumed exact.

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

# judge() — One-Shot Judgment

Single constrained-answer LLM judgment per call. Used for when-guard evaluation and gate eval conditions.

## Signature

```
judge({ prompt }) → 'true' | 'false'
```

- `prompt` — evaluation question. MUST demand a constrained answer: `Answer ONLY 'true' or 'false'`.
- Returns a single token answer; anything else (failure, ambiguity) → conservative default per caller context.

## Conservative Failure Semantics

|Caller|Failure default|Rationale|
|-|-|-|
|when-guard|`'true'` — execute|Never skip on uncertainty (conservative — execute node)|
|gate eval|`'false'` — no-match|Never auto-decide on uncertainty (falls through to downstream)|

## Platform Mapping

See §Platform Spellings — `judge()` maps to the platform's one-shot completion primitive (OMP: `completion(…, model="smol")`). Skills never spell the platform primitive directly.

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

- Pick the **first** hint whose agent type is available in the current platform environment — availability SHALL be judged as membership in the current platform's agent vocabulary in §Platform Spellings, never environment intuition.
- None available → fall back to the platform default agent (per §Platform Spellings — OMP `task`, opencode `general`).
- Hints are advisory — a skill that doesn't dispatch ignores them entirely.
- The skill chooses its own fan-out structure; hints only select the type for each dispatch.

Applies per dispatch call — a batch may mix types per task when the skill needs different capabilities (e.g. scout for read-only exploration, reviewer for review axes).

## Launch

`task({ i, context, tasks })` — capture agent ID — result retrieved via the platform's sub-agent artifact mechanism (OMP: `agent://<id>`).

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

Single conversation contract with two modes — **consensus mode** and **solve mode** — sharing one rule set. Every rule below MUST apply on every call, both modes.

## Signature

```
interview({ goal, context?, research?, design? }) → consensus | solution
```

- `goal` — interview goal. Drives question generation. First consensus point — must confirm shared understanding of goal before proceeding.
- `context` — background. File content, state snapshot, structured data. Provides interview context. Facts discoverable from context — look up, do not ask.
- `research?` — solve mode only. Boolean. Run research step before think. Default `true` when solve mode selected.
- `design?` — solve mode only. Marker that the goal produces a design/solution. Presence selects solve mode.
- Returns `consensus` — `{ decisions: [{ decision, rationale }] }` (consensus mode), or `solution` — `{ goal, findings?, design, consensus }` (solve mode).

## Mode Selection

- **Consensus mode** — reach shared understanding on a topic: confirm goal → decision rounds → `{ decisions }`. Default.
- **Solve mode** — produce a complete solution: confirm goal → research → think → decision rounds → reject → re-think → repeat until accepted → `{ goal, findings?, design, consensus }`. Use when `research: true` or the goal produces a design/plan (graph design, skill structure design, spec synthesis). Solve mode eliminates graph-level confirm phases — confirmation logic sinks into agent-internal loop.

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

## Solve-Mode Additions

9. **Research before think** — when `research: true` (default in solve mode), load skill research. Look up reference specs, existing patterns, constraints. Do not skip — uninformed design wastes interview rounds.
10. **Think exhaustively** — design complete solution. Cover all dimensions: structure, naming, edges, guards, edge cases. Incomplete design → extra interview rounds.
11. **Re-think on reject** — user rejects any decision → return to think step. Revise design. Re-interview affected decisions only — do not re-ask confirmed points.

## Internal Flow

```
interview({ goal, research: true, context })   ← solve mode
  ├── confirm(goal)       ← goal consensus — confirm shared understanding
  ├── research             ← skill research — look up specs, patterns, constraints
  ├── think                ← agent reasons about solution — design, analyze, decide
  ├── interview(details)   ← question() per-round — confirm each decision point
  └── repeat until done    ← human rejects → back to think/interview; human confirms → return solution
```

Loop inside agent — no graph-level retry/jump. Human rejection → agent re-thinks and re-interviews. Design + confirmation in single phase.

## Mode Comparison

|Dimension|Consensus mode|Solve mode|
|-|-|-|
|Goal|Reach consensus on topic|Produce complete solution|
|Internal steps|interview only|confirm → research → think → interview loop|
|Research|agent may research ad-hoc|explicit research step via skill research|
|Loop|single-pass consensus|multi-pass — reject → re-think → re-interview|
|Returns|`{ decisions }`|`{ goal, findings?, design, consensus }`|
|Use case|scope confirm, plan confirm|graph design, skill structure design|

## Primitives Note

```
question() — single decision (primitive)
    │
    ▼
interview() — single conversation contract (consensus + solve modes)
```

Each level builds on lower: interview() uses question() per turn. `task()` is orthogonal — dispatches sub-agents that may themselves use any primitive.
