---
name: atom-pilot
description: Graph lifecycle manager - execute->advance loop. Dispatch via atom-phase-handler (skill resolution convention) - single entry point, routes by node.type internally. Use when running taskflow graphs.
argument-hint: '<graph-name> [--verbose] [--debug]'
disable-model-invocation: true
user-invocable: true
version: 3.9.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load `atom-kernel` for task() contract and approval() decision UI. Load `atom-phase-handler` for {node, snapshot?} data handling, single-node dispatch, and error handling. Detect graph-scheduler MCP tools at runtime - see atom-kernel §Graph-Scheduler Tool Detection.

> **Layer**: atom - graph lifecycle manager

## Context Requirements

### From upstream

<!-- none - pilot starts runs itself; no phase dispatches it -->

### Reference skills

<!-- atom-kernel excluded - platform primitives, always available -->

### Operation classes

- graph-ops

### Files

<!-- none -->

# Atom-Pilot

Graph lifecycle manager. execute->advance loop. Dispatch via `atom-phase-handler` - single entry point, routes by node.type internally.

Pilot mode: start graph, execute nodes one-by-one, pause for manual commands between nodes (status, force-end, jump, list).

## Entry

**MUST EXECUTE** - when invoked with a graph name, begin graph execution immediately. No questions, no confirmation, no exceptions. Invocation IS the command.

Execution flow:

1. Load `atom-kernel` - task() contract
2. Load `atom-phase-handler` - node dispatch schema
3. Detect graph-scheduler MCP tools per §Graph-Scheduler Tool Detection
4. **Run Mode flags** (the mode is a per-activation decision made by the built-in `$run-mode-confirm` prologue node - the pilot never asks):
   - `--auto` flag -> `args: { mode: 'auto' }`; `--manual` flag -> `args: { mode: 'manual' }`; neither -> pass NO mode arg - the confirm node asks the user on first dispatch (Manual recommended - absence never means auto, per atom-graph-spec §Activation Prologue).
   - Direct MCP callers (no pilot) pass `args.mode` explicitly or leave it unset.
5. Call `graph_start { graphName, args? }` - return shape: see MCP-REFERENCE.md §Return Shapes.
6. **Identity banner (before first node)** - display the run identity so the executed graph is explicit from the start:
   ```
   Executing <graphName> (<resolvedFrom>) — <description>
   from: <resolvedPath>
   ```
   Graph produces artifacts (maker journey, e.g. `graph-generate`) -> state two-level model: graph EXECUTED vs artifact PRODUCED (artifact name from entry scope interview - pilot never guesses it). `resolvedFrom` (`project` | `builtin` | `fallback`) makes same-name shadowing explicit - never let the agent discover the resolution source post-hoc.
7. Enter execute->advance loop per Loop Mechanics - the first dispatched node is the activation prefix (`$load-constraints` always, then `$run-mode-confirm` when the graph has approvals - load-first order puts the constraints block on the confirm card); execute it like any main node.

Verbosity: `--verbose` / `--debug` set tiers - see DISPLAY.md §Verbose / §Debug; default quiet.

## Graph-Scheduler Tool Detection

Detect graph-scheduler MCP tools at runtime - 9-tool substring matching rules live in atom-kernel §Graph-Scheduler Tool Detection (platform primitives, loaded with the kernel). Tool schemas, return shapes, command->tool map: see MCP-REFERENCE.md.

## Loop Mechanics

Execute->advance cycle:

```
(a) execute ({node, snapshot?} → atom-phase-handler, routes by type) → (b) collect {status, output, durationMs} → (c) graph_advance {runId, nodeId, durationMs, branchTo?, endRun?} → {snapshot, node} → (d) complete → report → exit; else goto (a)
```

`graph_advance` merges notify + next into one call - report node result AND fetch next pending node. Gate jump hits pass the rework target as `branchTo`; approval branch-route decisions pass the node-or-route target as `branchTo`; the approval `end` action passes `endRun: true` (run completes - §Run Completion). Approval retry/jump path diverges - see §Approval Decision Processing.

> **Note:** `output` collected in (b) for display only. `graph_advance` receives `{ runId, nodeId, durationMs, branchTo?, endRun? }` - `output` stays in agent session. Exception: approval/gate `output` (IApprovalDecision) drives routing; not passed to graph_advance.

## Node Execution

Receive `{ node, snapshot? }` from graph_advance/graph_start. Delegate to `atom-phase-handler` - single-node dispatch by node.type. See `atom-phase-handler` for full schema and dispatch rules.

Node types - dispatched by type (main/approval/gate; handlerSkill constant `atom-phase-handler`):

- `node.type = "main"` -> handler executes inline (with inline context assembly when channels present)
- `node.type = "approval"` -> handler assembles the decision card (per atom-phase-handler §approval type) and returns IApprovalDecision -> pilot routes per §Approval Decision Processing
- `node.type = "gate"` -> handler evaluates rework jumps (per atom-phase-handler §gate type) and returns IApprovalDecision -> pilot routes per §Gate Decision Routing - no approval(), no pause

## Approval Decision Processing

After handler returns `{ status, output, durationMs }` for an approval node, parse `output` as `IApprovalDecision { action, target?, note?, value?, label? }` - `label`/`value` record the chosen option (observability - downstream gate jump conditions and AI recommendations consume `value`), unused by pilot routing.

|action|MCP call|note|
|-|-|-|
|`continue`|`graph_advance(runId, nodeId, durationMs)` - branch-route decisions add `branchTo=<target>` (node or route id)|Log to metadata. Branch-route target activates the node-or-route.|
|`retry`|`graph_jump { runId, targetPhaseId }`|Inject as upstream context|
|`jump`|`graph_jump { runId, targetPhaseId }`|Log to jump log|
|`end`|`graph_advance(runId, nodeId, durationMs, undefined, true)` (`endRun`)|Run completes|

### continue

Normal advance. A branch-route decision passes `branchTo=<target>` (node or route id) - the scheduler activates the target node-or-route. `note` logged to run metadata - no routing impact.

### retry

`target` from `IApprovalDecision.target` when present. Routing targets SHALL be explicit - the `dependsOn[0]` fallback is deprecated and emits a validate warning; the snapshot carries no `dependsOn`, so a target-less retry degrades to `continue` (per PHASESCHEMA.md §Approval Routing Actions). retry re-executes target node instead of approval itself. `note` carried as retry feedback to upstream context.

If `IApprovalDecision.target` absent -> report error, fallback to `continue`.

### jump

Use `IApprovalDecision.target`. Must be valid nodeId in snapshot. `note` logged as jump reason.

### end

The AI recommendation or the human choice completes the run: `graph_advance(runId, nodeId, durationMs, undefined, true)` - `endRun` completes the run immediately. End is an action, never a node.

> **After `graph_jump`**: response returns `{ snapshot, node }` -> re-enter execute loop. `graph_advance` handles normal advance flow.

## Gate Decision Routing

After handler returns `{ status, output, durationMs }` for a gate node, parse `output` as `IApprovalDecision { action, target?, label? }`:

- Hit -> `action: "jump"`, `target` = the matched jump's `to` (an upstream terminal node), `label` = the jump's `when` text (display/observability).
- No hit -> `action: "continue"`, no target - pass through, zero forward effect.

|case|MCP call|
|-|-|
|gate hit (`action: jump` with `target`)|`graph_advance(runId, nodeId, durationMs, branchTo=<target>)` - the scheduler applies the backward reset: target + downstream terminal nodes -> pending, target retryCount++, upstream kept. The pilot never decides the mechanism - no `graph_jump` for gates.|
|gate pass-through (`action: continue`, no target)|`graph_advance(runId, nodeId, durationMs)` - no `branchTo`, nothing activates|

`label` is logged for observability only.

## Run Completion

Run completes by two mechanisms (atom-graph-spec §Completion):

- **Natural drain** - no node is `active` and no node is eligible; `graph_advance` returns `node: null` (`fsmState` `completed`). Unselected-route members stay `pending` forever and never block completion.
- **Approval `end` action** - the pilot passes `endRun: true` to `graph_advance` (see §Approval Decision Processing); the run completes immediately.

## Error Handling

See `atom-phase-handler` §Error Handling for handler-level errors (missing handlerSkill, unknown type, dispatch failures). Loop-level errors:

- `graph_start` fail -> report error, exit
- `graph_advance` return error -> report, exit loop
- Phase execution throw -> `status: "failed"`, error text as output, advance

All failures: advance via `graph_advance` with `status: "failed"` - no crash, no loop break.

## Result Report

After loop exit, report per DISPLAY.md §Display Rules - per-node status lines, final report table (wall-clock, retries, ctx/tools stats, runId), result table, approval decisions. Format strings live in DISPLAY.md only - see DISPLAY.md §Final report / §Context stats / §Tools stats / §Approval decisions.
