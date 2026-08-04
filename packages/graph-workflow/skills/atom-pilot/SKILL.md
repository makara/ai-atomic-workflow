---
name: atom-pilot
description: Graph lifecycle manager — execute→advance loop. Dispatch via atom-phase-handler (skill resolution convention) — single entry point, routes by node.type internally. Use when running taskflow graphs, mentions /skill:atom-pilot, graph execution, run workflow, taskflow run.
argument-hint: '<graph-name> [--verbose] [--debug]'
user-invocable: true
version: 3.6.0
last_updated: '2026-08-04'
---

> **Runtime constraints** — load `atom-kernel` for task() contract and question() decision UI. Load `atom-phase-handler` for {node, snapshot?} data handling, single-node dispatch, and error handling. Detect graph-scheduler MCP tools at runtime — see atom-kernel §Graph-Scheduler Tool Detection.

> **Layer**: atom — graph lifecycle manager

# Atom-Pilot

Graph lifecycle manager. execute→advance loop. Dispatch via `atom-phase-handler` — single entry point, routes by node.type internally.

Pilot mode: start graph, execute nodes one-by-one, pause for manual commands between nodes (status, force-end, jump, list).

---

# Entry

## Entry

**MUST EXECUTE** — when user invokes /skill:atom-pilot <graph-name>, begin graph execution immediately. No questions, no confirmation, no exceptions. Invocation IS the command.

Execution flow:

1. Load `atom-kernel` — task() contract
2. Load `atom-phase-handler` — node dispatch schema
3. Detect graph-scheduler MCP tools per §Graph-Scheduler Tool Detection
4. **Run Mode flags** (the mode is a per-activation decision made by the built-in `$run-mode-confirm` prologue node — the pilot never asks):
   - `--auto` flag → `args: { mode: 'auto' }`; `--manual` flag → `args: { mode: 'manual' }`; neither → pass NO mode arg — the confirm node asks the user on first dispatch (Manual recommended — absence never means auto).
   - Direct MCP callers (no pilot) pass `args.mode` explicitly or leave it unset — absence never means auto.
5. Call graph_start { graphName, args? } → get { runId, node }
6. Enter execute→advance loop per Loop Mechanics — the first dispatched node is the activation prefix (`$run-mode-confirm` when the graph has approvals, `$load-constraints` always); execute it like any main node.

Verbosity: `--verbose` show MCP call summaries + judgment details. `--debug` add raw MCP JSON. Default quiet.

---

# Graph-Scheduler Tool Detection

Detect graph-scheduler MCP tools at runtime — 9-tool substring matching rules live in atom-kernel §Graph-Scheduler Tool Detection (platform primitives, loaded with the kernel). Tool parameter and return value schemas unchanged (see §MCP Tool Reference).

```
graph_start { graphName, args? } → { runId, node: NodeDetail | null, snapshot: GraphSnapshot }
```

Scheduler resolve graph name via merged registry. Return `runId` + first `node` (NodeDetail | null) + run `snapshot` (per-node states — jump navigation + progress display; the activation prefix nodes appear in `nodes` like any run member). Agent hold `runId` for all subsequent calls.

---

# Pilot Commands

|Command|MCP tool|
|-|-|
|`/skill:atom-pilot <name>`|`graph_start` → pilot loop|
|Status check|`graph_status`|
|Force end|`graph_force_end`|
|Jump to node|`graph_jump` (operator command — approval retry/jump routing also uses it, see §Approval Decision Processing)|
|List history|`graph_list`|

---

# Display Rules

Three verbosity tiers. `--verbose` flag enable Verbose. `--debug` flag enable Debug (implies Verbose). Default Quiet.

Platform harness auto-display raw tool I/O — beyond agent control. Agent control only own prose per tiers below.

## Quiet (default)

Per-node status line + final result table.

### Main node

```
── [N/M] <nodeId> · <skill> ──
   ✅ done  ⚡<N>ms
```

### Approval node

```
── [N/M] <nodeId> · approval ──
   ✅ <choice>  ⚡<N>ms
```

Approval pause — handler assembles the decision card (Accept — AI recommendation + free input + AI-generated contextual options; branch-route actions when declared), collects the user choice via custom:true. Handler returns IApprovalDecision as output JSON. Pilot routes per §Approval Decision Processing.

### Gate node

```
── [N/M] <nodeId> · gate ──
   🔀 <jump target | pass>  ⚡<N>ms
```

Gate pause-free — handler evaluates rework jumps (machine judgment), returns IApprovalDecision {action: jump, target, label} on hit / {action: continue} on pass-through. Pilot routes per §Gate Decision Routing.

### Stub/unhandled node

```
── [N/M] <nodeId> · <skill> ──
   ⚠️ <error message>  ⚡<N>ms
```

### Final report (after "done")

```
╔══════════════════════════════════════════╗
║  🏁 <graphName> Complete                  ║
║  ⏱ <total>ms  ·  🔄×<N>                 ║
║  runId: <runId>                         ║
╚══════════════════════════════════════════╝
```

Result table:

|nodeId|Skill|Status|Duration|Output summary|
|-|-|-|-|-|

Status icons: ✅ = done, ⚠️ = failed.

## Verbose (--verbose)

Quiet + MCP call summaries (`>>>`/`<<<`).

## Debug (--debug)

Verbose + raw MCP JSON, `retryCount` per node, internal state changes.

```
   >>> RAW REQUEST:  <detected-tool-name>
   >>> RAW PAYLOAD:   <full JSON>
   <<< RAW RESPONSE:  <full JSON>
```

---

# MCP Tool Reference

Tool names detected at runtime per §Graph-Scheduler Tool Detection. Parameter schema:

|tool|purpose|key params|
|-|-|-|
|graph_start|create run, get first node + snapshot|graphName, args? (args.mode short-circuits $run-mode-confirm)|
|graph_advance|report result + get next node|runId, nodeId, durationMs, branchTo?, endRun?|
|graph_status|query run state|runId|
|graph_list|list all runs|—|
|graph_force_end|force end run|runId|
|graph_jump|jump to node|runId, targetPhaseId|
|graph_init|init graph config|—|
|graph_clean_completed|clean completed runs|before?|
|graph_clean_all|clean all runs|—|

`graph_start` returns `{ runId, node, snapshot }`. `graph_advance` / `graph_jump` return `{ snapshot, node }` — `node: null` = graph complete (`fsmState` `completed`). The snapshot (per-node states) accompanies every dispatch — jump navigation + progress display. Run mode comes from the `$run-mode-confirm` prologue output — no output scans, no echo scans, no backend field.

---

# Loop Mechanics

Execute→advance cycle:

```
┌──────────────────────────────────────────────────────┐
│  (a) Execute node — dispatch via                     │
│      atom-phase-handler ({node, snapshot?})          │
│      Handler routes by node.type internally          │
│                                                      │
│  (b) Collect: { status, output, durationMs }          │
│                                                      │
│  (c) call graph_advance                              │
│      { runId, nodeId, durationMs, branchTo?, endRun? }│
│      → { snapshot, node } — node null = done         │
│                                                      │
│  (d) node null → report results → exit               │
│      node present → goto (a)                         │
└──────────────────────────────────────────────────────┘
```

`graph_advance` merge notify + next into one call — report node result AND fetch next pending node. Gate jump hits pass the rework target as `branchTo`; approval branch-route decisions pass the node-or-route target as `branchTo`; the approval `end` action passes `endRun: true` (run completes). Approval retry/jump path diverges — see §Approval Decision Processing.

> **Note:** `output` collected in (b) for display only. `graph_advance` receives `{ runId, nodeId, durationMs, branchTo?, endRun? }` — `output` stays in agent session. Exception: approval/gate `output` (IApprovalDecision) drives routing; not passed to graph_advance.

## Node Execution

Receive `{ node, snapshot? }` from graph_advance/graph_start. Delegate to `atom-phase-handler` — single-node dispatch by node.type. See `atom-phase-handler` for full schema and dispatch rules.

Node types — dispatched by type (main/approval/gate; handlerSkill constant `atom-phase-handler`):

- `node.type = "main"` → handler executes inline (with inline context assembly when channels present)
- `node.type = "approval"` → handler assembles the decision card (Accept — AI recommendation + free input + AI-generated contextual options), returns IApprovalDecision → pilot routes per §Approval Decision Processing
- `node.type = "gate"` → handler evaluates rework jumps against the judgment context (direct dependsOn outputs + node: channels) + snapshot + run mode (from the `$run-mode-confirm` output), returns IApprovalDecision (hit: action: jump, target; no hit: action: continue) → pilot routes per §Gate Decision Routing — no question(), no pause
- Node = null → graph complete.

## Approval Decision Processing

After handler returns `{ status, output, durationMs }` for an approval node, parse `output` as `IApprovalDecision { action, target?, note?, value?, label? }` — `label`/`value` record the chosen option (observability — downstream gate jump conditions and AI recommendations consume `value`), unused by pilot routing.

|action|MCP call|note|
|-|-|-|
|`continue`|`graph_advance(runId, nodeId, durationMs)` — branch-route decisions add `branchTo=<target>` (node or route id)|Log to metadata. Branch-route target activates the node-or-route.|
|`retry`|`graph_jump { runId, targetPhaseId }`|Inject as upstream context|
|`jump`|`graph_jump { runId, targetPhaseId }`|Log to jump log|
|`end`|`graph_advance(runId, nodeId, durationMs, undefined, true)` (`endRun`)|Run completes — `node: null` follows|

### continue

Normal advance. A branch-route decision passes `branchTo=<target>` (node or route id) — the scheduler activates the target node-or-route. `note` logged to run metadata — no routing impact.

### retry

`target` from `IApprovalDecision.target` when present. Routing targets SHALL be explicit — the `dependsOn[0]` fallback is deprecated and emits a validate warning; the snapshot carries no `dependsOn`, so a target-less retry degrades to `continue` (per atom-graph-spec §Approval Routing). retry re-executes target node instead of approval itself. `note` injected as retry feedback to upstream context.

If `IApprovalDecision.target` absent → report error, fallback to `continue`.

### jump

Use `IApprovalDecision.target`. Must be valid nodeId in snapshot. `note` logged as jump reason.

### end

The AI recommendation or the human choice completes the run: `graph_advance(runId, nodeId, durationMs, undefined, true)` — `endRun` completes the run immediately (`node: null`, `fsmState` `completed`). End is an action, never a node.

> **After `graph_jump`**: response returns `{ snapshot, node }` → re-enter execute loop. `graph_advance` handles normal advance flow.

## Gate Decision Routing

After handler returns `{ status, output, durationMs }` for a gate node, parse `output` as `IApprovalDecision { action, target?, label? }`:

- Hit → `action: "jump"`, `target` = the matched jump's `to` (an upstream terminal node), `label` = the jump's `when` text (display/observability).
- No hit → `action: "continue"`, no target — pass through, zero forward effect.

|case|MCP call|
|-|-|
|gate hit (`action: jump` with `target`)|`graph_advance(runId, nodeId, durationMs, branchTo=<target>)` — the scheduler applies the backward reset mechanically: target + downstream terminal nodes → pending, target retryCount++, upstream kept. The pilot never decides the mechanism — no `graph_jump` for gates.|
|gate pass-through (`action: continue`, no target)|`graph_advance(runId, nodeId, durationMs)` — no `branchTo`, nothing activates|

`label` is logged for observability only.

## Run Completion

A run completes by two mechanisms (atom-graph-spec §Completion):

- **Natural drain** — no node is `active` and no node is eligible; `graph_advance` returns `node: null` (`fsmState` `completed`). Unselected-route members stay `pending` forever and never block completion.
- **Approval `end` action** — the pilot passes `endRun: true` to `graph_advance` (see §Approval Decision Processing); the run completes immediately, `node: null` follows.

## Error Handling

See `atom-phase-handler` §Error Handling for handler-level errors (missing handlerSkill, unknown type, dispatch failures). Loop-level errors:

- `graph_start` fail → report error, exit
- `graph_advance` return error → report, exit loop
- Phase execution throw → `status: "failed"`, error text as output, advance

All failures: advance via `graph_advance` with `status: "failed"` — no crash, no loop break.

---

# Result Report

After loop exit, report per Display Rules. Table:

|nodeId|Skill|Status|Duration|Output summary|
|-|-|-|-|-|

Status icons: ✅ = done, ⚠️ = failed.

Also: total wall-clock time, approval decisions, retry counts.

---
