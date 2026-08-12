---
name: atom-pilot
description: Graph lifecycle manager - execute->advance loop. Dispatch via atom-phase-handler (skill resolution convention) - single entry point, routes by node.type internally. Use when running taskflow graphs.
argument-hint: '<graph-name> [--verbose] [--debug]'
disable-model-invocation: true
user-invocable: true
version: 3.10.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load skill atom-kernel for task() contract and approval() decision UI. load skill atom-phase-handler for {node, snapshot?} data handling, single-node dispatch, and error handling. Detect graph-scheduler MCP tools at runtime - see atom-kernel §Graph-Scheduler Tool Detection.

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

**First-action rule** - after invocation, the first tool call MUST be `graph_start`. Any read/analysis tool call before `graph_start` is a process violation - record it in the run report. Start the graph, then analyze.

Execution flow:

1. Load `atom-kernel` - task() contract
2. Load `atom-phase-handler` - node dispatch schema
3. Detect graph-scheduler MCP tools per §Graph-Scheduler Tool Detection
4. **Run Mode** (per-activation decision at the invocation boundary — the pilot asks, never the graph):
   - `--auto` flag -> `args: { mode: 'auto' }`; `--manual` flag -> `args: { mode: 'manual' }`; neither -> ASK the user before `graph_start` (Manual recommended - mode semantics: see atom-kernel §approval()). `graph_start` without a mode returns `MODE_REQUIRED` — never a silent default.
   - Direct MCP callers (no pilot) MUST pass `args.mode` explicitly.
5. **Constraints loading** (activation-time, once): read `.graph-scheduler/constraints.json` (compiled-artifact protocol — existence = validity). Cache missing -> compile `.graph-scheduler/constraints.md` `## Rules` (caveman full), write the artifact. Load the array into the session — every node's `## Constraints` block is assembled from this session copy by the handler (no per-node file reads, no constraints node in the run).
6. Call `graph_start { graphName, args? }` - return shape: see §MCP Reference (Return Shapes).
7. **Identity banner (before first node)** - display the run identity so the executed graph is explicit from the start:
   ```
   Executing <graphName> (<resolvedFrom>) — <description>
   from: <resolvedPath>
   ```
   Graph produces artifacts (maker journey, e.g. `graph-generate`) -> state two-level model: graph EXECUTED vs artifact PRODUCED (artifact name from entry scope interview - pilot never guesses it). `resolvedFrom` (`project` | `builtin` | `fallback`) makes same-name shadowing explicit - never let the agent discover the resolution source post-hoc.
8. Enter execute->advance loop per Loop Mechanics - the first dispatched node is the graph's first author entry node (no activation prefix); execute it like any main node.

Verbosity: `--verbose` / `--debug` set tiers - see DISPLAY.md §Verbose / §Debug; default quiet.

## Graph-Scheduler Tool Detection

Detect graph-scheduler MCP tools at runtime - 9-tool substring matching rules live in atom-kernel §Graph-Scheduler Tool Detection (platform primitives, loaded with the kernel). Tool schemas, return shapes, command->tool map: see §MCP Reference.

## MCP Reference

### MCP Tool Reference

Tool names detected at runtime per §Graph-Scheduler Tool Detection. Parameter schema (hot - pilot loop surface, same lifecycle, no split). Heat: graph_start/graph_advance/graph_jump/graph_force_end = execution-hot (every dispatch); graph_status/graph_list/graph_init/graph_clean_completed/graph_clean_all = operation-cold (operator use):

|tool|purpose|key params|
|-|-|-|
|graph_start|create run, get first node + snapshot|graphName, args? (args.mode REQUIRED — manual\|auto; absent → MODE_REQUIRED, no run)|
|graph_advance|report result + get next node|runId, nodeId, branchTo?, endRun?|
|graph_status|query run state|runId|
|graph_list|list all runs|-|
|graph_force_end|force end run|runId|
|graph_jump|jump to node|runId, targetPhaseId|
|graph_init|init graph config|-|
|graph_clean_completed|clean completed runs|before?|
|graph_clean_all|clean all runs|-|

`graph_start` returns `{ runId, node, snapshot, resolvedFrom, resolvedPath, description? }`. `graph_advance` / `graph_jump` return `{ snapshot, node }` - `node: null` = graph complete (`fsmState` `completed`). The snapshot accompanies every dispatch in delta form — `nodes` = one-line rows (`nodeId`, `status`, `retryCount`, jump-target enumeration) + `changed` = full-field rows for nodes whose state changed since the last dispatch. Run mode comes from the activation (graph_start args.mode) - no output scans, no echo scans, no backend field.

### Return Shapes

```
graph_start { graphName, args? } → { runId, node: NodeDetail | null, snapshot: GraphSnapshot, resolvedFrom: project|builtin|fallback, resolvedPath: string, description?: string }
```

Scheduler resolve graph name via merged registry - project entries override builtin (project-first). Return `runId` + first `node` (NodeDetail | null) + run `snapshot` (delta form — one-line node rows + changed rows; jump navigation + progress display) + resolution identity (`resolvedFrom` + `resolvedPath` + graph `description`). NodeDetail carries channel declarations (dependsOn + `node:` entries) — upstream content is assembled from the agent session, never delivered in the payload. Agent hold `runId` for all subsequent calls.

### Pilot Commands

|Command|MCP tool|
|-|-|
|invoke pilot with `<graph-name>`|`graph_start` -> pilot loop|
|Status check|`graph_status`|
|Force end|`graph_force_end`|
|Jump to node|`graph_jump` (operator command - approval retry/jump routing also uses it, see §Approval Decision Processing)|
|List history|`graph_list`|

## Process-Control Language (PCL)

User utterances during an active run are classified BEFORE interpretation: PCL (process control) vs node input (domain data). PCL executes as graph routing - never as node input, never as a feature request. Vocabulary (explicit on disk - CONTEXT.md glossary term `PCL`):

|Utterance (en)|Routing action|Target resolution|
|-|-|-|
|back / return to X|`graph_jump`|X = phase path or nodeId (`arch-review` -> `requirement/arch-review`)|
|jump to X|`graph_jump`|same|
|re-review / re-run|`graph_jump`|named phase; default current phase chain head|
|end / finish this round|`graph_advance` `endRun: true`|run completes|
|terminate / abort run|`graph_force_end`|run terminates|
|skip|`graph_advance` (continue)|no branchTo|
|status / progress|`graph_status`|report, continue loop|
|history|`graph_list`|report, continue loop|

Classification rules:

1. Run-active user input -> PCL check first (match any vocabulary row).
2. Hit -> execute routing action immediately, record in session (observability), do NOT enter node input slot.
3. Miss -> node input (scope answers, approval decisions, node data).
4. Vocabulary explicit -> classification auditable; never model improvisation (P2).

Empirical acceptance: "back to X phase re-review" -> `graph_jump` (run `2fc43e1e-d9b8-4da1-a911-f4f0c793214b`).

## Loop Mechanics

Execute->advance cycle:

```
(a) execute ({node, snapshot?} → atom-phase-handler, routes by type) → (b) collect {status, output, durationMs} → (c) graph_advance {runId, nodeId, branchTo?, endRun?} → {snapshot, node} → (d) complete → report → exit; else goto (a)
```

`graph_advance` merges notify + next into one call - report node result AND fetch next pending node. Gate jump hits pass the rework target as `branchTo`; approval branch-route decisions pass the node-or-route target as `branchTo`; the approval `end` action passes `endRun: true` (run completes - §Run Completion). Approval retry/jump path diverges - see §Approval Decision Processing.

**Advance obligation** - a node boundary is NOT a stopping point. After reporting a node, always `graph_advance` and execute the next node; the loop continues until `node: null` or an approval `end`/user `force_end`. Never yield mid-loop with work remaining.

> **Note:** `output` collected in (b) for display only; `durationMs` is the handler-measured wall clock for the node report (session display only). `graph_advance` receives `{ runId, nodeId, branchTo?, endRun? }` - no output param, no duration param; the scheduler persists progress only (duration derived from timestamps). Node content and approval/gate decisions stay in the agent session (platform-persisted) — downstream gates judge from the session.

## Node Execution

Receive `{ node, snapshot? }` from graph_advance/graph_start. Delegate to `atom-phase-handler` - single-node dispatch by node.type (handlerSkill constant `atom-phase-handler`). Dispatch rules: see `atom-phase-handler` §Dispatch Rules (main/approval/gate). Approval/gate nodes return IApprovalDecision (shape: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape) -> pilot routes per §Approval Decision Processing / §Gate Decision Routing.

## Approval Decision Processing

After handler returns `{ status, output, durationMs }` for an approval node, parse `output` as `IApprovalDecision` (shape + fields: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape - single home) - `label`/`value` record the chosen option (observability - downstream gate jump conditions and AI recommendations consume `value`), unused by pilot routing.

|action|MCP call|note|
|-|-|-|
|`continue`|`graph_advance(runId, nodeId)` - branch-route decisions add `branchTo=<target>` (node or route id)|Log to metadata. Branch-route target activates the node-or-route.|
|`retry`|`graph_jump { runId, targetPhaseId }`|Inject as upstream context|
|`jump`|`graph_jump { runId, targetPhaseId }`|Log to jump log|
|`end`|`graph_advance(runId, nodeId, undefined, true)` (`endRun`)|Run completes|

### continue

Normal advance. A branch-route decision passes `branchTo=<target>` (node or route id) - the scheduler activates the target node-or-route. `note` logged to run metadata - no routing impact.

### retry

`target` from `IApprovalDecision.target` when present. Routing targets SHALL be explicit - the `dependsOn[0]` fallback is deprecated and emits a validate warning; the snapshot carries no `dependsOn`, so a target-less retry degrades to `continue` (per PHASESCHEMA.md §Approval Routing Actions). retry re-executes target node instead of approval itself. `note` carried as retry feedback to upstream context.

If `IApprovalDecision.target` absent -> report error, fallback to `continue`.

### jump

Use `IApprovalDecision.target`. Must be valid nodeId in snapshot. `note` logged as jump reason.

### end

The AI recommendation or the human choice completes the run: `graph_advance(runId, nodeId, undefined, true)` - `endRun` completes the run immediately. End is an action, never a node.

> **After `graph_jump`**: response returns `{ snapshot, node }` -> re-enter execute loop. `graph_advance` handles normal advance flow.

## Gate Decision Routing

After handler returns `{ status, output, durationMs }` for a gate node, parse `output` as `IApprovalDecision` (shape: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape):

- Hit -> `action: "jump"`, `target` = the matched jump's `to` (an upstream terminal node), `label` = the jump's `when` text (display/observability).
- No hit -> `action: "continue"`, no target - pass through, zero forward effect.

|case|MCP call|
|-|-|
|gate hit (`action: jump` with `target`)|`graph_advance(runId, nodeId, branchTo=<target>)` - the scheduler applies the backward reset: target + downstream terminal nodes -> pending, target retryCount++, upstream kept. The pilot never decides the mechanism - no `graph_jump` for gates.|
|gate pass-through (`action: continue`, no target)|`graph_advance(runId, nodeId)` - no `branchTo`, nothing activates|

`label` is logged for observability only.

## Run Completion

Run completes by two mechanisms (atom-graph-spec §Completion):

- **Natural drain** - no node is `active` and no node is eligible; `graph_advance` returns `node: null` (`fsmState` `completed`). Unselected-route members stay `pending` forever and never block completion.
- **Approval `end` action** - the pilot passes `endRun: true` to `graph_advance` (see §Approval Decision Processing); the run completes immediately.

## Error Handling

See `atom-phase-handler` §Error Handling for handler-level errors (unknown type, dispatch failures). Loop-level errors:

- `graph_start` fail -> report error, exit
- `graph_advance` return error -> report, exit loop
- Phase execution throw -> handler returns `{ status: "failed", output: <error text>, durationMs }`, then advance

All failures: advance via `graph_advance(runId, nodeId)` - the scheduler records the node as `done` (no status/failure parameter exists — strict schema; failure semantics live in the agent session). No crash, no loop break.

## Result Report

After loop exit, report per DISPLAY.md §Display Rules - per-node status lines, final report table (wall-clock, retries, ctx/tools stats, runId), result table, approval decisions. Format strings live in DISPLAY.md only - see DISPLAY.md §Final report / §Context stats / §Tools stats / §Approval decisions.
