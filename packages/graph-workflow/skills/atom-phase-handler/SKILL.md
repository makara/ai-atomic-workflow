---
name: atom-phase-handler
description: Central dispatch handler — { node, snapshot? } schema and static dispatch by node.type (main/approval base types). Use when processing graph_start/graph_advance/graph_jump response, executing phase nodes, routing by node.type.
argument-hint: none (reference + procedure skill)
user-invocable: false
version: 2.7.0
last_updated: '2026-08-02'
---

> **Runtime constraints** — load `skill://atom-kernel` for task() dispatch and question() decision UI. Graph-scheduler MCP tools are not called here — tool detection lives in atom-kernel §Graph-Scheduler Tool Detection for the entry points that do (pilot).

# Atom-Phase-Handler

Handle graph-scheduler CRUD API return data — `{ node: NodeDetail | null, snapshot?: GraphSnapshot }`. Reference section document schema. Procedure section define the dispatch flow — static dispatch by node.type: main/approval (handlerSkill constant `atom-phase-handler`).

---

# Reference — Data Schema

## NodeDetail (primary — always present)

`node` is primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete — no next node.

### Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`type`|string|yes|Phase type — determines dispatch routing: `main`, `approval`|
|`handlerSkill`|string|yes|Handler skill path to load via `skill://<name>`|
|`skill`|string?|all|Execution skill — phase `skill` field; the skill that executes this phase's work (main type)|
|`agent`|string[]?|main|Agent hints — priority-ordered sub-agent type preferences. Advisory: consumed by skills when they dispatch sub-agents (first available wins, fallback platform default). Injected as `## Agent hints:` block.|
|`retryAttempt`|number|yes|Current retry count, 0-based|
|`when`|string?|all|Natural-language skip condition — LLM-evaluated before dispatch|
|`constraints`|string[]|all|Project constraints — .graph-scheduler/constraints.md, same level as when|
|`dependsOn`|string[]?|all|Upstream node IDs — implicit context resolution|

### Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`, `approval`|Task instruction text (main — executed inline) / decision-card title (approval — YAML layer; schema removed `topic`, loud rejection)|
|`channels`|string[]?|`main`|Channel patterns — skill names, file globs, or node IDs. Resolved against the execution skill contract (deterministic — shared resolver, no fallback search)|
|`preText`|string?|`approval`|Decision-card pre-call text — displayed before question(), never channel-resolved|
|`topic`|string?|`approval`|Synthesized decision-card title — NOT a YAML-layer field; approval-handler builds it from `phase.task ?? 'Decision Required'` (approval-handler.ts). Used as question() header|
|`routingActions`|IApprovalAction[]?|`approval`|Decision routing actions — replaces deprecated `IRoute`, drives question() options and jump-target enumeration|
|`eval`|EvalCondition[]?|`approval`|Auto-decision conditions — evaluated before question(). Match → auto IApprovalDecision|

### IApprovalAction

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump'`|Routing semantics — continue never needs target; retry/jump use target to specify exact re-run node|
|`target?`|string|Target nodeId for retry or jump. **Required for both** — routing targets SHALL be explicit (atom-graph-spec §Approval Routing). Jump absent target → M2 `snapshot.nodes` runtime expansion (validate warns); retry absent → deprecated `dependsOn[0]` fallback, runtime degrades to continue.|
|`label`|string|Option label — displayed in question() options[].label|
|`description`|string|Option description — displayed in question() options[].description|

### IApprovalDecision

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump'`|Chosen routing action|
|`target?`|string|Target nodeId for retry or jump — populated from selected option target or custom override. Absent for retry → deprecated dependsOn[0] fallback, runtime degrades to continue (atom-graph-spec §Approval Routing).|
|`note?`|string|Free-text from question() custom:true text box — semantics vary by action|
|`label?`|string|Chosen routing option label — distinguishes same-action options (e.g. two continues)|

### EvalCondition

Auto-decision rule evaluated before question(). Array order — first match short-circuits. Eval failure → default false (conservative — fall through to human).

|Field|Type|Purpose|
|-|-|-|
|`when`|string|Natural-language condition — evaluated via completion(smol) against upstream output (min 1 char)|
|`action`|`'continue' \| 'retry' \| 'jump'`|Auto-routing action when condition matches|
|`target?`|string|Target nodeId for retry or jump. Absent for retry → deprecated `dependsOn[0]` fallback, runtime degrades to continue (atom-graph-spec §Approval Routing — targets SHALL be explicit).|
|`note?`|string|Auto-decision note — injected as IApprovalDecision.note|

---

## GraphSnapshot (optional — progress info)

`snapshot` is optional. Present only in `graph_advance` and `graph_jump` responses. `graph_start` returns no snapshot. Use for jump navigation and progress display — never triggers execution.

|Field|Type|Purpose|
|-|-|-|
|`runId`|string|Graph run unique identifier|
|`graphName`|string|Graph name|
|`fsmState`|string|FSM state — `idle`, `running`, `completed`, `terminated`|
|`status`|string|Alias of `fsmState` — spec-compliant run status field (graph-mcp-api)|
|`currentPhaseId`|string \| null|Currently active phase node ID — `null` when none|
|`nodeCount`|number|Total node count|
|`completedCount`|number|Completed node count|
|`createdAt`|string|ISO 8601 run creation timestamp|
|`updatedAt`|string|ISO 8601 update timestamp|
|`nodes`|ISnapshotNode[]|Per-node states `{nodeId, status, retryCount, startedAt, completedAt, durationMs}` — jump-target enumeration data source (M2). Node status values: `pending` \| `active` \| `done` \| `skipped` — runtime FSM produced set; `completed` is a run-level fsmState, NOT a node status|

### fsmState Logic

|fsmState|Meaning|Action|
|-|-|-|
|`idle`|Run created, no nodes started|Wait for first node|
|`running`|Nodes executing|Normal — continue loop|
|`completed`|All nodes done|`node` = null — exit loop, build result report|
|`terminated`|Run force-ended (irreversible)|Exit loop with error report|

### Progress Fields

- `completedCount` / `nodeCount` → display progress: `[completedCount/nodeCount]`
- `currentPhaseId` → highlight which node is active in UI

---

# Procedure — Single-Node Dispatch

## Input

```
{ node: NodeDetail | null, snapshot?: GraphSnapshot }
```

## Flow

> **Note:** The flow diagram below is a summary of the dispatch path. §Dispatch Rules is the authoritative per-type procedure — when the two diverge, Dispatch Rules wins. The when-guard evaluation steps below are defined only here.

```
receive { node, snapshot? }
  │
  ├── node = null
  │     └── return { done: true, snapshot }
  │
  ├── node.when is non-empty
  │     ├── Read completed node outputs: for each completed node, read .taskflow/outputs/<nodeId>.output.txt (missing → skip, no error)
  │     ├── Issue one-shot LLM judgment: completion("Evaluate whether this node should execute: <node.when>. Context: <current state summary + completed node outputs>. Answer ONLY 'true' (execute) or 'false' (skip).", model="smol")
  │     ├── Judgment = "false" → Write skip marker: .taskflow/outputs/<nodeId>.output.txt with content "skipped: <when text> → false. Actual: <key state observation>" → then advance with skip + return { status: "skipped", skip: true }
  │     ├── Judgment = "true" → continue normal dispatch
  │     └── Completion fails / ambiguous → default "true" (conservative) → continue normal dispatch
  │
  ├── node.type = "main"
  │     ├── Assemble inline context blocks when node.channels or node.dependsOn present (per §Main Inline Context Assembly — order: upstream → reference → file → constraints → task)
  │     ├── Inject agent hints block when node.agent non-empty (per §Agent Hints)
  │     ├── Prepend project constraints block (per §Constraints Block Format) to task text when node.constraints non-empty
  │     ├── Execute task inline — full tool access, no sub-agent
  │     ├── Constraint compliance scan — output contains `Constraint check:` → count `unsatisfied` lines; > 0 → prefix `[CONSTRAINT VIOLATION: <count>]` marker
  │     ├── Write output: .taskflow/outputs/<nodeId>.output.txt
  │     ├── Measure wall-clock duration
  │     ├── collect: { status, output, durationMs }
  │     └── return
  │
  ├── node.type = "approval"
  │     ├── node.eval is non-empty
  │     │     ├── Read upstream .taskflow/outputs/<dependsOn>.output.txt
  │     │     ├── For each eval condition (array order, short-circuit):
  │     │     │     └── completion("Evaluate: <eval.when> against: <output>. Retry attempt: <node.retryAttempt>. Constraints: <node.constraints>. Answer ONLY 'true' or 'false'.", model="smol")
  │     │     ├── First "true" → IApprovalDecision { action: <eval.action>, target: <eval.target>, note: <eval.note> }
  │     │     │     ├── Persist decision: write .taskflow/outputs/<nodeId>.output.txt (eval path — label absent)
  │     │     │     └── return { status: "done", output: "<IApprovalDecision JSON>", durationMs }
  │     │     └── All "false" → fall through to normal question()
  │     ├── Map node.topic → question().header
  │     ├── Map node.routingActions → question().options (label + description)
  │     ├── If snapshot present → enumerate eligible nodes from `snapshot.nodes` (M2 — per-node states; status ∈ {done, skipped}, nodeId != currentNodeId)
  │     │     └── Expand jump actions inline: one option per eligible target
  │     ├── Add custom:true — always present for free-text input
  │     ├── Display node.preText as pre-call text (approval)
  │     ├── Prepend project constraints block (per §Constraints Block Format) to pre-call text when node.constraints non-empty
  │     ├── Surface upstream constraint violations — per dependsOn, read .taskflow/outputs/<dependsOn>.output.txt; any `[CONSTRAINT VIOLATION: N]` marker → append line `[CONSTRAINT VIOLATION: <nodeId> × N]` to pre-call text
  │     ├── Collect user choice + custom text → IApprovalDecision JSON
  │     │     └── jump + custom resolves to valid nodeId → override target
  │     │     └── else custom → note
  │     ├── Record chosen option label → IApprovalDecision.label
  │     ├── Persist decision: write .taskflow/outputs/<nodeId>.output.txt — decision JSON incl. label
  │     └── return { status: "done", output: "<IApprovalDecision JSON>", durationMs }
  │
  └── node.type = unknown
        └── return { status: "failed", output: "Unknown phase type: <node.type>", durationMs: 0 }
```

> **Note:** handler collects `{ status, output, durationMs, skip? }` internally for display. `graph_advance` receives `{ runId, nodeId, durationMs, skip }` — output stays in agent session, not persisted. Exception: approval decisions persist to `.taskflow/outputs/<nodeId>.output.txt` (D3 — decision observability), when-skip markers write `.taskflow/outputs/<nodeId>.output.txt`.

## Return

```
{ status: "done" | "failed" | "skipped", output: string, durationMs: number, skip?: boolean }
```

Return result to pilot. Pilot calls `graph_advance` on handler's behalf.

## Constraints Block Format

Shared format — main/approval branches inject same block. Injection rules (bullets, `[project]` prefix, lang/git dedup, 2 KB cap) specified once in `atom-graph-spec` §Constraint Layering. Block shape:

```
## Constraints

- [project] <constraint 1>
- [project] <constraint 2>

Output must satisfy constraints above. State compliance per rule before return — see Constraint check section.
```

## Constraint check

Executor must close with `Constraint check:` section — one line per constraint:

```
Constraint check:
- satisfied: <constraint>
- unsatisfied: <constraint> — <evidence>
```

Any `unsatisfied` → prefix node output with `[CONSTRAINT VIOLATION: <count>]` marker. Marker surfaces in result table + approval pre-call — decision gate sees constraint breach.

# Dispatch Rules

### main type

1. Assemble inline context blocks when `node.channels` / `node.dependsOn` present (see §Main Inline Context Assembly below), then execute `node.task` inline — full tool access, no sub-agent delegation.
2. Inject `## Agent hints:` block when `node.agent` non-empty (see §Agent Hints).
3. Write output to `.taskflow/outputs/<nodeId>.output.txt`.
4. Measure wall-clock duration via `Date.now()`.
5. Collect result — map to `{ status, output, durationMs }`.

## Main Inline Context Assembly

Main phases execute in the main agent process (no sub-agent) — context is assembled inline:

1. **Resolve channels** — contract source dual-track: `node.skill` present → resolve against that skill's `## Context Requirements` three-subsection contract; `node.skill` absent → empty contract — every entry must be an explicit `skill:`/`node:` prefix or file glob, bare name → error.
2. **Upstream blocks** — read implicit `dependsOn` outputs AND `node:` channel targets from `.taskflow/outputs/<nodeId>.output.txt` → `## Upstream: <nodeId>` blocks. **Missing output → warn + skip, never fail** (first round of a retry loop is legal timing).
3. **Reference blocks** — load `skill:<name>` entries via `skill://<name>` → `## Reference:` blocks.
4. **File blocks** — expand glob entries → read matched files → `## File:` blocks.
5. **Prepend in order** — upstream → reference → file → constraints block → agent hints block → task text, then execute inline.

Injected block formats (`## Upstream:` / `## Reference:` / `## File:`). `node.channels` arrives via NodeDetail (main handler `extendNodeDetail` passes it through); `node.dependsOn` arrives via NodeDetail base fields.

## Agent Hints

`node.agent` is a priority-ordered hint array — graph declares preference, never control. When non-empty, handler injects a deterministic block positioned between the assembled context blocks and the task text:

```
## Agent hints: [<type-1>, <type-2>, …]
```

Absent/empty `node.agent` → no block injected, platform default applies. Consumption semantics (first-available selection, fallback, advisory-only) specified once in `atom-kernel` §Agent Hints — Dispatch Type Selection.

### approval type

0. **Eval pre-check** — before question():
   - `node.eval` is non-empty array → for each EvalCondition (in order):
     - Read upstream output from `.taskflow/outputs/<dependsOn>.output.txt`.
     - Issue `completion("Evaluate: <eval.when> against: <output>. Retry attempt: <node.retryAttempt>. Constraints: <node.constraints>. Answer ONLY 'true' or 'false'.", model="smol")` — retryAttempt is the current node's jump re-execution count (FSM JUMP increments, never zeroes; bounds auto-rework loops).
     - First `"true"` → assemble `IApprovalDecision { action, target?, note? }` from condition.
     - Persist decision to `.taskflow/outputs/<nodeId>.output.txt` — eval path, label absent.
     - Return `{ status: "done", output: "<IApprovalDecision JSON>", durationMs }` — skip question().
   - All `"false"` or completion fails → fall through to step 1 (normal question()).
   - `node.eval` absent/empty → skip eval, proceed to step 1.
1. `node.topic` → `question()` header (noun phrase ≤30 chars).
2. `node.routingActions` → `question()` options:
   - Each `IApprovalAction` maps to one option with `label` + `description`.
   - **custom:true always present** — free-text text box for user input.
3. **Jump-target enumeration** (when `snapshot` present):
   - From `snapshot.nodes`, enumerate nodes where `status ∈ {done, skipped}` AND `nodeId != currentNodeId`.
   - For each action where `action='jump'` with no explicit `target`:
     - Expand inline: one option per eligible node → label `"Jump to <nodeId>"`, description includes status.
   - `target` already specified on action → use it directly, no expansion.
4. `node.preText` → pre-call text — display before question().
5. Collect user choice + custom text → output as `IApprovalDecision` JSON:
   - continue: `{ "action": "continue", "note": "<custom text if any>", "label": "<chosen option label>" }`
   - retry: `{ "action": "retry", "target": "<from option target if present>", "note": "<custom text if any>", "label": "<chosen option label>" }`
   - jump: `{ "action": "jump", "target": "<nodeId>", "label": "<chosen option label>" }`
     - If custom text resolves to valid nodeId → override target with it, `note` unset.
     - Otherwise → custom text becomes `note`.
6. Persist decision to `.taskflow/outputs/<nodeId>.output.txt` — full decision JSON incl. `label`. Write failure → mark `[FILE MISSING: .taskflow/outputs/<nodeId>.output.txt]` in output, do not crash.
7. Return `{ status: "done", output: "<json>", durationMs }`.

### unknown type

Return `{ status: "failed", output: "Unknown phase type: <node.type>", durationMs: 0 }`. Advance via `graph_advance` — failure status is not transmitted (scheduler records the node as `done`). The registered type list is carried by load/dispatch errors (GraphDefinitionError / DispatchConfigError) — the execution side stays generic.

### null node

Graph complete. Return `{ done: true, snapshot }`.

---

# Error Handling

|Scenario|Response|
|-|-|
|`node.type = "main"` with no `node.task`|`status: "failed"`, output: "Main phase requires task field"|
||Channel resolution fails for `node.channels`|`status: "failed"`, output: "Context resolution failed: <error text>"|
||Channel resolution returns no results for `node.channels`|`status: "failed"`, output: "No files matched channel pattern: <pattern>"|
|task() dispatch fails (skill-side)|`status: "failed"`, output: "<error text>"|
||Unknown `node.type`|`status: "failed"`, output: "Unknown phase type: <type>" (registered list comes from the scheduler error, not the execution side)|
|Completion fails or judgment ambiguous (when guard)|Default to "true" (conservative — execute node). Do NOT skip.|
|Completion fails or judgment ambiguous (eval)|Default to "false" (conservative — fall through to human question()). Do NOT auto-decide.|

All failures: return `{ status: "failed" }` to the pilot and advance via `graph_advance` — failure status is NOT transmitted (graph_advance accepts no status parameter); the scheduler records the node as `done`. Failure semantics live in the agent session and output files only.
