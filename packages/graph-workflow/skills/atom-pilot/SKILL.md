---
name: atom-pilot
description: Graph lifecycle manager — execute→advance loop. Dispatch via skill://atom-phase-handler — single entry point, routes by node.type internally. Use when running taskflow graphs, mentions /skill:atom-pilot, graph execution, run workflow, taskflow run.
argument-hint: '<graph-name> [--verbose] [--debug]'
user-invocable: true
version: 3.3.0
last_updated: '2026-07-29'
---

> **Runtime constraints** — load `skill://atom-kernel` for task() contract and question() decision UI. Load `skill://atom-phase-handler` for {node, snapshot?} data handling, single-node dispatch, and error handling. Detect graph-scheduler MCP tools at runtime — see `skill://atom-tool-detection`.

> **Layer**: atom — graph lifecycle manager

# Atom-Pilot

Graph lifecycle manager. execute→advance loop. Dispatch via `skill://atom-phase-handler` — single entry point, routes by node.type internally.

Pilot mode: start graph, execute nodes one-by-one, pause for manual commands between nodes (status, force-end, jump, list).

---

# Entry

/skill:atom-pilot <graph-name> [--verbose] [--debug]

**MUST EXECUTE** — when user invokes /skill:atom-pilot <graph-name>, begin graph execution immediately. No questions, no confirmation, no exceptions. Invocation IS the command.

Execution flow:

1. Load `skill://atom-kernel` — task() contract + skip-checkpoint mode
2. Load `skill://atom-phase-handler` — node dispatch schema
3. Detect graph-scheduler MCP tools per §Graph-Scheduler Tool Detection — then call graph_start { graphName } → get { runId, next }
4. Enter execute→advance loop per Loop Mechanics

Verbosity: `--verbose` show MCP call summaries + eval details. `--debug` add raw MCP JSON. Default quiet.

---

# Graph-Scheduler Tool Detection

Detect graph-scheduler MCP tools at runtime — see `skill://atom-tool-detection`. Tool parameter and return value schemas unchanged (see §MCP Tool Reference).

```
graph_start { graphName } → { runId, next: NextNode }
```

Scheduler resolve graph name via merged registry. Return `runId` + first `NextNode`. Agent hold `runId` for all subsequent calls.

---

# Pilot Commands

|Command|MCP tool|
|-|-|
|`/skill:atom-pilot <name>`|`graph_start` → pilot loop|
|Status check|`graph_status`|
|Force end|`graph_force_end`|
|Jump to node|`graph_jump`|
|List history|`graph_list`|

---

# Display Rules

Three verbosity tiers. `--verbose` flag enable Verbose. `--debug` flag enable Debug (implies Verbose). Default Quiet.

Platform harness auto-display raw tool I/O — beyond agent control. Agent control only own prose per tiers below.

## Quiet (default)

Per-node status line + final result table.

### Agent node

```
── [N/M] <nodeId> · agent ──
   ✅ "<output snippet>"  ⚡<N>ms
```

### Skipped node

```
── [N/M] <nodeId> · <skill> ──
   ⏭ <when guard text>  ⚡<N>ms
```

### Approval node

```
── [N/M] <nodeId> · approval ──
   ✅ <choice>  ⚡<N>ms
```

Approval pause — handler constructs question() from routingActions (IApprovalAction[]), collects user choice via custom:true. Handler returns IApprovalDecision as output JSON. Pilot routes per §Approval Decision Processing.

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

Status icons: ✅ = agent done, ⚠️ = failed, ⏭ = skipped.

## Verbose (--verbose)

Quiet + MCP call summaries (`>>>`/`<<<`).

## Debug (--debug)

Verbose + raw MCP JSON, `retryAttempt` per node, internal state changes.

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
|graph_start|create run, get first node|graphName, args?|
|graph_advance|report result + get next node|runId, nodeId, durationMs, skip?|
|graph_status|query run state|runId|
|graph_list|list all runs|—|
|graph_force_end|force end run|runId|
|graph_jump|jump to node|runId, targetPhaseId|
|graph_init|init graph config|—|
|graph_clean_completed|clean completed runs|before?|
|graph_clean_all|clean all runs|—|

`graph_start` return `{ runId, next }`. `graph_advance` return `NextNode` or `"done"`.

---

# Loop Mechanics

Execute→advance cycle:

```
┌──────────────────────────────────────────────────┐
│  (a) Execute node — dispatch via                 │
│      skill://atom-phase-handler ({node, snapshot?})│
│      Handler routes by node.type internally       │
│                                                  │
│  (b) Collect: { status, output, durationMs, skip? } │
│                                                  │
│  (c) call graph_advance                         │
│      { runId, nodeId, durationMs, skip }           │
│      → NextNode | "done"                         │
│                                                  │
│  (d) "done" → report results → exit              │
│      NextNode → goto (a)                         │
└──────────────────────────────────────────────────┘
```

`graph_advance` merge notify + next into one call — report node result AND fetch next pending node. For approval nodes, path diverges — see §Approval Decision Processing.

> **Note:** `output` collected in (b) for display only. `graph_advance` receives `{ runId, nodeId, durationMs, skip }` — `output` stays in agent session. Exception: approval `output` (IApprovalDecision) drives routing; not passed to graph_advance.

## Node Execution

Receive `{ node, snapshot? }` from graph_advance/graph_start. Delegate to `skill://atom-phase-handler` — single-node dispatch by node.type. See `skill://atom-phase-handler` for full schema and dispatch rules.

Node types:

- `node.type = "agent"` → handler delegates to atom-phase-agent (5-step flow)
- `node.type = "main"` → handler executes inline
- `node.type = "approval"` → handler constructs question() from routingActions, returns IApprovalDecision → pilot routes per §Approval Decision Processing

Node = null → graph complete.

## Approval Decision Processing

After handler returns `{ status, output, durationMs }` for approval node, parse `output` as `IApprovalDecision { action, target?, note? }`.

|action|MCP call|note|
|-|-|-|
|`continue`|`graph_advance(runId, nodeId, durationMs)`|Log to metadata|
|`retry`|`graph_jump { runId, targetPhaseId }`|Inject as upstream context|
|`jump`|`graph_jump { runId, targetPhaseId }`|Log to jump log|

### continue

Normal advance. `note` logged to run metadata — no routing impact.

### retry

`retryTarget` inferred from current approval node's `dependsOn` in snapshot. retry re-executes upstream dependency, not approval itself. `note` injected as retry feedback to upstream context.

If `dependsOn` empty or snapshot unavailable → report error, fallback to `continue`.

### jump

Use `IApprovalDecision.target`. Must be valid nodeId in snapshot. `note` logged as jump reason.

> **After `graph_jump`**: response returns NextNode → re-enter execute loop. `graph_advance` handles normal advance flow.

## Error Handling

See `skill://atom-phase-handler` §Error Handling for handler-level errors (missing handlerSkill, unknown type, dispatch failures). Loop-level errors:

- `graph_start` fail → report error, exit
- `graph_advance` return error → report, exit loop
- Phase execution throw → `status: "failed"`, error text as output, advance

All failures: advance via `graph_advance` with `status: "failed"` — no crash, no loop break.

---

# Result Report

After loop exit, report per Display Rules. Table:

|nodeId|Skill|Status|Duration|Output summary|
|-|-|-|-|-|

Status icons: ✅ = agent done, ⚠️ = failed, ⏭ = skipped.

Also: total wall-clock time, approval decisions, retry counts.

---
