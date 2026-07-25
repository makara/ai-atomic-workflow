---
name: atom-phase-handler
description: Central dispatch handler — { node, snapshot? } schema and 3-branch routing (main/agent/approval). Use when processing graph_start/graph_advance/graph_jump response, executing phase nodes, routing by node.type.
argument-hint: none (reference + procedure skill)
user-invocable: false
version: 2.2.0
last_updated: '2026-07-27'
---

> **Runtime constraints** — load `skill://atom-kernel` for task() dispatch and question() decision UI.

# Atom-Phase-Handler

Handle graph-scheduler CRUD API return data — `{ node: NodeDetail | null, snapshot?: GraphSnapshot }`. Reference section document schema. Procedure section define 3-branch (main/agent/approval) dispatch flow.

---

# Reference — Data Schema

## NodeDetail (primary — always present)

`node` is primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete — no next node.

### Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`type`|string|yes|Phase type — determines dispatch routing: `main`, `agent`, `approval`|
|`handlerSkill`|string|yes|Handler skill path to load via `skill://<name>`|
|`entrySkill`|string|`agent` type|Target skill for sub-agent dispatch via `skill://<name>`|
|`agent`|string?|`agent` type|Agent type for task() dispatch|
|`retryAttempt`|number|yes|Current retry count, 0-based|

### Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`, `agent`|Task instruction text — executed inline (main) or passed to sub-agent (agent)|
|`context`|string?|`agent`, `approval`|Glob patterns resolved via `resolveGlobs()` for input-paths (agent); background text displayed before question() (approval)|
|`topic`|string?|`approval`|Decision Card topic — used as question() header|
|`routingActions`|IApprovalAction[]?|`approval`|Decision routing actions — replaces deprecated `IRoute`, drives question() options and jump-target enumeration|

### IApprovalAction

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump'`|Routing semantics — continue/retry never need target; jump points to a target node|
|`target?`|string|Jump target nodeId — meaningful only when action='jump'|
|`label`|string|Option label — displayed in question() options[].label|
|`description`|string|Option description — displayed in question() options[].description|

### IApprovalDecision

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump'`|Chosen routing action|
|`target?`|string|Jump target nodeId — populated from option target or custom override|
|`note?`|string|Free-text from question() custom:true text box — semantics vary by action|

---

## GraphSnapshot (optional — progress info)

`snapshot` is optional. Present only in `graph_advance` and `graph_jump` responses. `graph_start` returns no snapshot. Use for jump navigation and progress display — never triggers execution.

|Field|Type|Purpose|
|-|-|-|
|`runId`|string|Graph run unique identifier|
|`graphName`|string|Graph name|
|`fsmState`|string|FSM state — `idle`, `running`, `completed`, `failed`, `paused`|
|`currentPhaseId`|string \| null|Currently active phase node ID — `null` when none|
|`nodeCount`|number|Total node count|
|`completedCount`|number|Completed node count|
|`failedCount`|number|Failed node count|
|`updatedAt`|string|ISO 8601 update timestamp|

### fsmState Logic

|fsmState|Meaning|Action|
|-|-|-|
|`idle`|Run created, no nodes started|Wait for first node|
|`running`|Nodes executing|Normal — continue loop|
|`completed`|All nodes done|`node` = null — exit loop, build result report|
|`failed`|Run failed (unrecoverable)|Exit loop with error report|
|`paused`|Run paused (approval pending)|Await user decision — do NOT auto-advance|

### Progress Fields

- `completedCount` / `nodeCount` → display progress: `[completedCount/nodeCount]`
- `failedCount > 0` → warn: some nodes failed
- `currentPhaseId` → highlight which node is active in UI

---

# Procedure — Single-Node Dispatch

## Input

```
{ node: NodeDetail | null, snapshot?: GraphSnapshot }
```

## Flow

```
receive { node, snapshot? }
  │
  ├── node = null
  │     └── return { done: true, snapshot }
  │
  ├── node.type = "main"
  │     ├── Execute task inline — full tool access, no sub-agent
  │     ├── Write output: .taskflow/outputs/<nodeId>.output.txt
  │     ├── Measure wall-clock duration
  │     ├── collect: { status, output, durationMs }
  │     └── return
  │
  ├── node.type = "agent"
  │     ├── load skill://<node.handlerSkill>   (atom-phase-agent)
  │     ├── handler executes 5-step flow:
  │     │     1. Receive NodeDetail
  │     │     2. Discover entry skill Context Requirements
  │     │     3. Collect & Assemble context (files + LLM)
  │     │     4. Dispatch task() to entrySkill
  │     │     5. Collect & Return result
  │     ├── collect: { status, output, durationMs }
  │     └── return
  │
  ├── node.type = "approval"
  │     ├── Map node.topic → question().header
  │     ├── Map node.routingActions → question().options (label + description)
  │     ├── If snapshot present → enumerate eligible nodes (completed/failed, nodeId != currentNodeId)
  │     │     └── Expand jump actions inline: one option per eligible target
  │     ├── Add custom:true — always present for free-text input
  │     ├── Display node.context as pre-call text
  │     ├── Collect user choice + custom text → IApprovalDecision JSON
  │     │     └── jump + custom resolves to valid nodeId → override target
  │     │     └── else custom → note
  │     └── return { status: "done", output: "<IApprovalDecision JSON>", durationMs }
  │
  └── node.type = unknown
        └── return { status: "failed", output: "Unknown phase type: <node.type>", durationMs: 0 }
```

> **Note:** handler collects `{ status, output, durationMs }` internally for display. `graph_advance` receives only `{ runId, nodeId, durationMs }` — output stays in agent session, not persisted.

## Return

```
{ status: "done" | "failed", output: string, durationMs: number }
```

Advance result via `graph_advance`:

```
write xd://mcp__graph_scheduler_graph_advance { runId, nodeId, durationMs }
```

## Dispatch Rules

### main type

1. Execute `node.task` inline — full tool access, no sub-agent delegation.
2. Write output to `.taskflow/outputs/<nodeId>.output.txt`.
3. Measure wall-clock duration via `Date.now()`.
4. Collect result — map to `{ status, output, durationMs }`.

### agent type

1. Load `skill://<node.handlerSkill>` — scheduler-resolved handler skill path (atom-phase-agent).
2. Handler receives NodeDetail and executes 5-step flow per atom-phase-agent:
   - Receive → Discover entry Context Requirements → Collect & Assemble → Dispatch task() → Collect & Return
3. The handler owns context assembly — resolveGlobs, file reads, LLM-driven description understanding.
4. Dispatch via task(): target-skill=<entrySkill>, auxiliary-skills=[atom-kernel], input-paths=resolved files, agent=<node.agent>.
5. Reference: see packages/graph-workflow/skills/atom-phase-agent/SKILL.md for full 5-step flow.

### approval type

1. `node.topic` → `question()` header (noun phrase ≤30 chars).
2. `node.routingActions` → `question()` options:
   - Each `IApprovalAction` maps to one option with `label` + `description`.
   - **custom:true always present** — free-text text box for user input.
3. **Jump-target enumeration** (when `snapshot` present):
   - From snapshot, enumerate nodes where `status ∈ {completed, failed}` AND `nodeId != currentNodeId`.
   - For each action where `action='jump'` with no explicit `target`:
     - Expand inline: one option per eligible node → label `"Jump to <nodeId>"`, description includes status.
   - `target` already specified on an action → use it directly, no expansion.
4. `node.context` → pre-call text — display before question().
5. Collect user choice + custom text → output as `IApprovalDecision` JSON:
   - continue: `{ "action": "continue", "note": "<custom text if any>" }`
   - retry: `{ "action": "retry", "note": "<custom text if any>" }`
   - jump: `{ "action": "jump", "target": "<nodeId>" }`
     - If custom text resolves to valid nodeId → override target with it, `note` unset.
     - Otherwise → custom text becomes `note`.
6. Return `{ status: "done", output: "<json>", durationMs }`.

### unknown type

Return `{ status: "failed", output: "Unknown phase type: <node.type>. Supported: main, agent, approval.", durationMs: 0 }`. Advance with failed status.

### null node

Graph complete. Return `{ done: true, snapshot }`.

---

# Error Handling

|Scenario|Response|
|-|-|
|`node.handlerSkill` missing (agent type only)|`status: "failed"`, output: "Missing handlerSkill field in node"|
|`node.handlerSkill` unknown — load fails (agent type only)|`status: "failed"`, output: "Unknown handler skill: <path>"|
|`node.type = "main"` with no `node.task`|`status: "failed"`, output: "Main phase requires task field"|
|`node.type = "agent"` with no `node.entrySkill`|`status: "failed"`, output: "Agent phase requires entrySkill field"|
|`node.type = "agent"` with no `node.task`|`status: "failed"`, output: "Agent phase requires task field"|
|`resolveGlobs()` fails for `node.context`|`status: "failed"`, output: "Context resolution failed: <error text>"|
|`resolveGlobs()` returns empty with required input|`status: "failed"`, output: "No files matched context: <glob>"|
|task() dispatch fails|`status: "failed"`, output: "<error text>"|
|Unknown `node.type`|`status: "failed"`, output: "Unknown phase type: <type>. Supported: main, agent, approval."|

All failures: advance via `graph_advance` with `status: "failed"` — no crash, no loop break.
