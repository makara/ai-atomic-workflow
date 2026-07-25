---
name: atom-kernel
description: Platform primitives — task() dispatch with 4-field contract, question() decision UI with 8 rules. Use when dispatching sub-agents or presenting decisions.
argument-hint: none (reference skill)
user-invocable: false
version: 2.1.0
last_updated: '2026-07-28'
---

> **Runtime constraints** — load skill://writing-great-skills before use. **Layer**: atom — runtime primitives. MCP-tool agnostic — operates above scheduler layer.

# Atom-Kernel

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

## 4-Field Contract

Embed in sub-agent `task` instruction:

|Field|Required|Purpose|
|-|-|-|
|`target-skill`|required|Skill sub-agent loads via `skill://<name>`|
|`auxiliary-skills`|required|Extra skills. `[]` if none|
|`target-skill-input`|optional|What skill works on — spec, ticket, scope|
|`input-paths`|optional|Context files. `[]` if none|

## Routing Modes

**Default handoff**: verify — present `## Decision Request` as checkpoint card — user routes.

**Skip-checkpoint**: verify — return to caller. Use for: batch dispatch, cross-review. Caller MUST checkpoint later.

## Construct Rules

1. Explicit skill load — `read skill://<target-skill>`
2. Auxiliary skills — `read skill://<name>` per entry
3. Constraint propagation — embed `lang.conversation`, `lang.documents`, `git.policy`; embed `## Rules` from guide file (skip >500 chars, skip dup of lang/git)
4. Input paths — `read <path>` per entry
5. Decision Request — return `## Decision Request` section: Context, Auto-recorded debt, Blocking findings, Dispatch record, Suggested advance label

## Launch

`task({ i, context, tasks })` — capture agent ID — result via `agent://<id>`.

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

# interview() — Consensus Interview

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
