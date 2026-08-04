---
name: atom-phase-handler
description: Central dispatch handler — { node, snapshot? } schema and static dispatch by node.type (main/approval/gate base types). Use when processing graph_start/graph_advance/graph_jump response, executing phase nodes, routing by node.type.
argument-hint: none (reference + procedure skill)
user-invocable: false
version: 2.11.0
last_updated: '2026-08-04'
---

> **Runtime constraints** — load skill atom-kernel for task() dispatch and question() decision UI. Graph-scheduler MCP tools are not called here — tool detection lives in atom-kernel §Graph-Scheduler Tool Detection for the entry points that do (pilot).

# Atom-Phase-Handler

Handle graph-scheduler CRUD API return data — `{ node: NodeDetail | null, snapshot?: GraphSnapshot }`. Reference section document schema. Procedure section define the dispatch flow — static dispatch by node.type: main/approval/gate (handlerSkill constant `atom-phase-handler`).

---

# Reference — Data Schema

## NodeDetail (primary — always present)

`node` is primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete — no next node.

### Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
||`type`|string|yes|Phase type — determines dispatch routing: `main`, `approval`, `gate`|
|`handlerSkill`|string|yes|Handler skill name — load skill named X per the skill-resolution convention (plain name → `<skillsDir>/X/SKILL.md`)|
|`skill`|string?|all|Execution skill — phase `skill` field; the skill that executes this phase's work (main type)|
|`agent`|string[]?|main|Agent hints — priority-ordered sub-agent type preferences. Advisory: consumed by skills when they dispatch sub-agents (first available wins, fallback platform default). Injected as `## Agent hints:` block.|
||`retryAttempt`|number|yes|Current retry count, 0-based — the node's own jump re-execution count (never zeroed). Gate jump bounds reference the TARGET node's `retryCount` from the snapshot (single counter — atom-graph-spec §Gate Jump Conditions).|
||`dependsOn`|string[]?|all|Upstream node IDs — scheduling only (topological order, JUMP closure, join resolution). Direct dependsOn outputs auto-inject as context for ALL types (main parity — gate/approval judgment context included)|

### Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`, `approval`|Task instruction text (main — executed inline) / full card prompt (approval — first line = header, rest = card body; schema removed `topic`/`preText`, loud rejection)|
|`channels`|string[]?|all|Channel patterns — main: skill names, file globs, or node IDs against the execution skill contract (deterministic — shared resolver, no fallback search); gate/approval: `node:`-only entries (judgment context)|
|`topic`|string?|`approval`|Synthesized decision-card header — NOT a YAML-layer field; approval-handler builds it from the task's first line (`phase.task?.split('\n')[0] ?? 'Decision Required'`). Used as question() header|
||`routingActions`|IApprovalAction[]?|`approval`|Decision routing actions — declared ONLY in branch-route scenarios; drives those question() options (see §IApprovalAction). Otherwise the card is Accept (AI recommendation) + free input + AI-generated contextual options|
||`jumps`|IJumpCondition[]?|`gate`|Rework jumps — `[{when, to}]`; the agent evaluates conditions, a hit → backward jump to `to`, no hit → pass through. Required non-empty — a gate without rework jumps is a silent pass-through|
||`route`|string?|all|Route membership — declared route id (absent = implicit default route, always active)|

Judgment context (gate/approval) = direct dependsOn outputs (auto-injected `## Upstream:` blocks) + `channels` `node:` targets — assembled by the same pipeline as main nodes. The `reads` field is removed (schema field convergence); cross-level references declare `channels: [node:<id>]`.

### IJumpCondition

|Field|Type|Purpose|
|-|-|-|
|`when`|string|Natural-language condition — evaluated by the agent against the judgment context (direct dependsOn outputs + node: channels) + snapshot + run mode (judgment stays agent-side). Min 1 char.|
|`to`|string|Explicit BACKWARD jump target node ID — an upstream terminal node (validator-enforced). A hit resets target + downstream terminal nodes (JUMP); upstream is kept.|

### IApprovalAction

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Routing semantics — continue (advance; branch-route target = node or route id), retry (re-execute target), jump (go to target node), end (complete the run — `graph_advance` `endRun`)|
|`target?`|string|Branch-route option target (`continue` — node or route id) or re-run target (`retry`/`jump` — node id). Routing targets SHALL be explicit (atom-graph-spec §Approval Routing).|
|`value`|string|Stable kebab-case machine identifier — carried in the persisted decision; gate jump conditions and AI recommendations reference `decision value`, never label text|
|`label`|string|Option label — displayed in question() options[].label|
|`description`|string|Option description — displayed in question() options[].description|

No `default` field exists — Run Mode auto executes the AI recommendation, never a declared action.

### IApprovalDecision

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Chosen routing action. Gate path: hit → `'jump'` (target carries the rework target); no hit → `'continue'` (pass through, no target).|
|`target?`|string|Target nodeId or route id. Gate hit → the matched jump's `to` — pilot passes it as `graph_advance` `branchTo` (backward reset). Approval branch-route → the chosen option's target (node or route id) — pilot passes it as `branchTo` (route activation). Approval retry/jump → selected option target — pilot routes via `graph_jump`.|
|`note?`|string|Free-text from question() custom:true text box — semantics vary by action. Run Mode auto path sets `'run mode: auto'`.|
|`label?`|string|Chosen routing option label — distinguishes same-action options. Gate path: the jump's `when` text (observability). Run Mode auto path = the recommendation's label.|
|`value?`|string|Chosen routing option `value` — stable machine identifier; downstream gate jump conditions and AI recommendations consume the decision value. Absent on gate decisions (jumps carry no value).|

---

## GraphSnapshot (optional — progress info)

`snapshot` is optional. Present in `graph_start`, `graph_advance`, `graph_jump`, `graph_force_end` responses — uniform API self-containment. Use for jump navigation and progress display — never triggers execution. Run Mode consumption does NOT use the snapshot (mode comes from the `$run-mode-confirm` prologue output file; the prologue nodes appear in `nodes` like any run member).

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
|`nodes`|ISnapshotNode[]|Per-node states `{nodeId, status, retryCount, startedAt, completedAt, durationMs}` — jump-target enumeration data source (M2). Node status values: `pending` \| `active` \| `done` \| `aborted` — runtime FSM produced set; `completed` is a run-level fsmState, NOT a node status. Unselected route members and pass-through targets stay `pending` (never activated).|

### fsmState Logic

|fsmState|Meaning|Action|
|-|-|-|
|`idle`|Run created, no nodes started|Wait for first node|
|`running`|Nodes executing|Normal — continue loop|
|`completed`|Run drained (no active, no eligible) or approval `end` action|`node` = null — exit loop, build result report|
|`terminated`|Run force-ended (irreversible)|Exit loop with error report|

### Progress Fields

- `completedCount` / `nodeCount` → display progress: `[completedCount/nodeCount]`
- `currentPhaseId` → highlight which node is active in UI

---

# Activation Prologue Consumption

Run Mode and project constraints are USER-LAYER facts decided by the activation prologue nodes (atom-graph-spec §Activation Prologue) — NOT backend run-record fields. The scheduler carries neither: `NodeDetail` has no `runMode`/`constraints` fields. Every dispatch, the handler reads the prologue output files itself and formats the familiar context blocks.

Prologue output contract (persisted like any node output):

- `$run-mode-confirm` → `.taskflow/outputs/$run-mode-confirm.output.txt` — JSON `{"mode": "manual"|"auto"}` (per-activation decision; the node emits `args.mode` when set, else asks the user — Manual default, absence NEVER auto).
- `$load-constraints` → `.taskflow/outputs/$load-constraints.output.txt` — JSON `{"constraints": ["<rule>", ...]}` (per-activation reload of the project source — round-level freeze).

Missing/corrupt prologue output → degrade, never block: mode → `manual` + warning; constraints → empty block + warning (absence never auto).

**Presence gating:** the confirm read is gated on `$run-mode-confirm` appearing in `snapshot.nodes` — an approval-less graph skips synthesis (no mode consumer), so no mode block and NO warning are emitted. The load read is unconditional (constraints are consumed by every node type). Degradation applies only to SYNTHESIZED nodes whose output was lost.

## Approval consumption (direct branch)

On approval dispatch, read the mode from `$run-mode-confirm` output:

1. **`'auto'`** — judge the AI recommendation from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode (agent judgment, NOT a declared action — no `default` field exists):
   - Recommendation exists → auto-execute it: assemble `IApprovalDecision { action, target?, value, label, note: 'run mode: auto' }`.
   - Persist decision to `.taskflow/outputs/<nodeId>.output.txt` — full decision JSON incl. `value` + `label` (downstream gate jump conditions consume the decision `value` exactly as the human path). Write failure → mark `[FILE MISSING: …]` in output, do not crash.
   - Return `{ status: "done", output: "<json>", durationMs }` — no question(), no decision card.
   - When end IS the recommendation → `action: "end"` — pilot completes the run (`graph_advance` `endRun`).
   - No recommendation (judgment fails / context insufficient) → fall through to the human card even in auto — card shows one line `Run mode: auto — no recommendation; decide manually`. NEVER guess an action.
2. **`'manual'`** (or missing confirm output) — present the human decision card (question()) as usual. No auto path.

Scope rule: Run Mode controls approval presentation ONLY. Main nodes (grill/scope interviews, work nodes) are never auto-decided, never bypassed by the mode. Gate jump semantics unchanged — jump conditions may reference the injected `## Run Mode: <mode>` context block (e.g. arch-review-loop loop-gate).

## Prologue context injection

For every node dispatch (main/approval/gate), read the prologue outputs and prepend the context blocks `## Run Mode: <mode>` (from `$run-mode-confirm` — only when the node exists in `snapshot.nodes`) and `## Constraints` (from `$load-constraints`, per §Constraints Block Format) — same layer as before, now sourced from the prologue node outputs instead of NodeDetail fields. Gate jump evaluation context includes them, so jump conditions can reference the mode (`run mode is auto …`). The blocks are injected regardless of node type — no graph declares them, no task text repeats them.

---

# Procedure — Single-Node Dispatch

## Input

```
{ node: NodeDetail | null, snapshot?: GraphSnapshot }
```

## Flow

> **Note:** The flow diagram below is a summary of the dispatch path. §Dispatch Rules is the authoritative per-type procedure — when the two diverge, Dispatch Rules wins.

```
receive { node, snapshot? }
  │
  ├── node = null
  │     └── return { done: true, snapshot }
  │
  ├── Load activation prologue outputs — $run-mode-confirm + $load-constraints
  │     (missing → degrade: manual + empty constraints + warning; never block)
  │
  ├── node.type = "main"
  │     ├── Assemble inline context blocks when node.channels or node.dependsOn present (per §Main Inline Context Assembly — order: upstream → reference → file → run-mode → constraints → task)
  │     ├── Inject agent hints block when node.agent non-empty (per §Agent Hints)
  │     ├── Prepend `## Run Mode: <mode>` block (always) + constraints block (per §Constraints Block Format, when constraints non-empty) to task text
  │     ├── Execute task inline — full tool access, no sub-agent
  │     ├── Constraint compliance scan — output contains `Constraint check:` → count `unsatisfied` lines; > 0 → prefix `[CONSTRAINT VIOLATION: <count>]` marker
  │     ├── Write output: .taskflow/outputs/<nodeId>.output.txt
  │     ├── Measure wall-clock duration
  │     ├── collect: { status, output, durationMs }
  │     └── return
  │
  ├── node.type = "gate"
  │     ├── Assemble jump evaluation context: direct dependsOn upstream blocks (`## Upstream:` — main parity) + resolved `channels` `node:` outputs + current snapshot (per-node states incl. retryCount) + `## Run Mode: <mode>` + constraints blocks
  │     ├── For each jump (declaration order):
  │     │     └── judge("Evaluate: <jump.when> against: <judgment context>. Snapshot: <node states incl. retryCount>. Run Mode: <mode>. Constraints: <constraints>. Answer ONLY 'true' or 'false'.")
  │     │           └── first "true" selects the jump — stop evaluating; no hit → pass through
  │     ├── Hit → IApprovalDecision { action: "jump", target: <jump.to>, label: <jump.when> }
  │     │     └── no hit → IApprovalDecision { action: "continue" } (no target — pass through)
  │     ├── Persist decision: write .taskflow/outputs/<nodeId>.output.txt (gate path — decision JSON incl. target + label)
  │     └── return { status: "done", output: "<IApprovalDecision JSON>", durationMs }
  │
  ├── node.type = "approval"
  │     ├── Run Mode direct branch (per §Activation Prologue Consumption) — confirm output mode === 'auto' → judge the AI recommendation from the judgment context; recommendation exists → auto-execute + persist (incl. value + label, note 'run mode: auto') + return (no card); no recommendation → card with one-line auto note
  │     ├── Map node.topic (task first line) → question().header
  │     ├── Card options — Accept (AI recommendation) + node.routingActions (branch-route scenario only) + AI-generated contextual options (retry/jump/end — judged from the judgment context + snapshot + run mode)
  │     ├── Add custom:true — always present for free-text input
  │     ├── Display node.task full text as pre-call text (approval card prompt) + append generic "Free input overrides." sentence
  │     ├── Prepend `## Run Mode: <mode>` block (always) + constraints block (per §Constraints Block Format, when constraints non-empty) to pre-call text
  │     ├── Surface upstream constraint violations — per dependsOn, read .taskflow/outputs/<dependsOn>.output.txt; any `[CONSTRAINT VIOLATION: N]` marker → append line `[CONSTRAINT VIOLATION: <nodeId> × N]` to pre-call text
  │     ├── Collect user choice + custom text → IApprovalDecision JSON (incl. chosen action `value`)
  │     │     └── jump/retry + custom resolves to valid nodeId → override target
  │     │     └── else custom → note
  │     ├── Record chosen option label + value → IApprovalDecision.label / .value
  │     ├── Persist decision: write .taskflow/outputs/<nodeId>.output.txt — decision JSON incl. value + label
  │     └── return { status: "done", output: "<IApprovalDecision JSON>", durationMs }
  │
  └── node.type = unknown
        └── return { status: "failed", output: "Unknown phase type: <node.type>", durationMs: 0 }
```

> **Note:** handler collects `{ status, output, durationMs }` internally for display. `graph_advance` receives `{ runId, nodeId, durationMs, branchTo?, endRun? }` — output stays in agent session, not persisted. Exception: approval/gate decisions persist to `.taskflow/outputs/<nodeId>.output.txt` (D3 — decision observability).

## Return

```
{ status: "done" | "failed", output: string, durationMs: number }
```

Return result to pilot. Pilot calls `graph_advance` on handler's behalf.

## Constraints Block Format

Shared format — main/approval/gate paths inject the same block. Injection rules (bullets, `[project]` prefix, lang/git dedup, 2 KB cap) specified once in `atom-graph-spec` §Constraint Layering. Block shape:

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
2. **Upstream blocks** — read implicit `dependsOn` outputs AND `node:` channel targets from `.taskflow/outputs/<nodeId>.output.txt` → `## Upstream: <nodeId>` blocks. **Run-scope gate is scheduler-side**: the scheduler strips `node:` targets outside the run's flattened node set at dispatch — out-of-run references never reach the agent, stale output files from other runs never inject. **Missing output → warn + continue, never fail** (first round of a retry loop is legal timing).
3. **Reference blocks** — load `skill:<name>` entries by plain name per the resolution convention → `## Reference:` blocks.
4. **File blocks** — expand glob entries → read matched files → `## File:` blocks.
5. **Prepend in order** — upstream → reference → file → run-mode block → constraints block → agent hints block → task text, then execute inline. Run-mode block (`## Run Mode: <mode>`, from `$run-mode-confirm` output) and constraints block (from `$load-constraints` output) are injected for every node — main/approval/gate alike.

Injected block formats (`## Upstream:` / `## Reference:` / `## File:`). `node.channels` arrives via NodeDetail (main handler `extendNodeDetail` passes it through); `node.dependsOn` arrives via NodeDetail base fields.

## Agent Hints

`node.agent` is a priority-ordered hint array — graph declares preference, never control. When non-empty, handler injects a deterministic block positioned between the assembled context blocks and the task text:

```
## Agent hints: [<type-1>, <type-2>, …]
```

Absent/empty `node.agent` → no block injected, platform default applies. Consumption semantics (first-available selection, fallback, advisory-only) specified once in `atom-kernel` §Agent Hints — Dispatch Type Selection.

### gate type

0. Assemble jump evaluation context (main-style pipeline — judgment context):
   - Direct dependsOn outputs: read `.taskflow/outputs/<dependsOnId>.output.txt` → `## Upstream: <dependsOnId>` blocks (main parity — auto-injected).
   - `channels` `node:` targets: read `.taskflow/outputs/<nodeTarget>.output.txt` → `## Upstream: <nodeTarget>` blocks; missing → note `<nodeTarget> has no output` in the context (node pending/unactivated; a condition referencing it evaluates false).
   - Snapshot: per-node states incl. `retryCount` — jump bounds reference the TARGET node's `retryCount` (single counter, JUMP-maintained, never zeroed; every node in the jump closure — target + downstream terminals — increments, so a gate downstream of a rework target carries a non-zero retryAttempt after rework rounds).
   - Prepend `## Run Mode: <mode>` (from `$run-mode-confirm` output) + constraints blocks (from `$load-constraints` output; same layer as main/approval).
1. Evaluate jumps in declaration order:
   - judge each condition; the first `"true"` selects its jump; stop. No hit → pass through.
   - judge("Evaluate: <jump.when> against: <judgment context>. Snapshot: <node states incl. retryCount>. Run Mode: <mode>. Constraints: <constraints>. Answer ONLY 'true' or 'false'.")
2. Hit → `IApprovalDecision { action: "jump", target: <jump.to>, label: <jump.when> }`. No hit → `{ action: "continue" }` (no target — pass through, zero forward effect).
3. Judgment failure (ambiguous) → treat as no hit → pass through (conservative — never fabricate a jump).
4. Persist decision: write `.taskflow/outputs/<nodeId>.output.txt` — gate path, decision JSON incl. target + label. Write failure → mark `[FILE MISSING: .taskflow/outputs/<nodeId>.output.txt]` in output, do not crash.
5. Return `{ status: "done", output: "<IApprovalDecision JSON>", durationMs }` — no question(), no decision card.

### approval type

0. **Run Mode direct branch** (per §Activation Prologue Consumption): confirm output mode === `'auto'`:
   - Judge the AI recommendation from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode (agent judgment — no declared action, no `default` field). Recommendation exists → auto-execute it: assemble `IApprovalDecision { action, target?, value, label, note: 'run mode: auto' }`, persist decision file (value + label included — downstream gate jump conditions consume the decision `value` exactly as the human path), return `{ status: "done", output: "<json>", durationMs }` — no question(), no card. When end IS the recommendation → `action: "end"` (pilot completes the run via `graph_advance` `endRun`).
   - No recommendation → fall through to the human card below even in auto, card shows `Run mode: auto — no recommendation; decide manually`. NEVER guess an action.
   - `'manual'` (or missing confirm output — absence never auto) → continue to the human card below. No scan, no parse, no fail-safe matrix — the confirm output is the single source of truth.
1. `node.topic` (task first line) → `question()` header (noun phrase ≤30 chars; truncate at the limit).
2. Card options:
   - **Accept** — the AI recommendation (judged from the judgment context + snapshot + run mode).
   - **`node.routingActions`** — mapped to options with `label` + `description` (branch-route scenario only; empty otherwise).
   - **AI-generated contextual options** — retry/jump/end/branch-route options judged at execution from the judgment context + `snapshot.nodes` (eligible re-run targets: `status === 'done'` AND `nodeId != currentNodeId`) + run mode. One option per candidate, e.g. `"Retry <nodeId>"`, `"Jump to <nodeId>"`, `"End run"`.
   - **custom:true always present** — free-text text box for user input.
3. `node.task` full text → pre-call text — display before question(); append the generic sentence `Free input overrides.` (author text carries the card body; the boilerplate is handler-owned).
4. Collect user choice + custom text → output as `IApprovalDecision` JSON (incl. chosen action `value`):
   - continue: `{ "action": "continue", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }` (branch-route may add `"target": "<node-or-route id>"`)
   - retry: `{ "action": "retry", "target": "<from option target if present>", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
   - jump: `{ "action": "jump", "target": "<nodeId>", "value": "<chosen value>", "label": "<chosen option label>" }`
   - end: `{ "action": "end", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
     - If custom text resolves to valid nodeId → override target with it, `note` unset.
     - Otherwise → custom text becomes `note`.
5. Persist decision to `.taskflow/outputs/<nodeId>.output.txt` — full decision JSON incl. `value` + `label`. Write failure → mark `[FILE MISSING: .taskflow/outputs/<nodeId>.output.txt]` in output, do not crash.
6. Return `{ status: "done", output: "<json>", durationMs }`.

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
|Judge fails or judgment ambiguous (gate jump)|Treat as no hit — pass through (conservative — never fabricate a jump).|
|Run Mode auto with no AI recommendation|Human card even in auto (nothing to auto-execute) — card notes `Run mode: auto — no recommendation; decide manually`. NEVER guess an action.|
|Prologue output missing/corrupt (`$run-mode-confirm` / `$load-constraints`)|Degrade, never block — mode → `manual` + warning; constraints → empty block + warning (absence never auto).|
