---
name: atom-pilot
description: Graph lifecycle manager - execute->advance loop. Dispatch via atom-phase-handler (skill resolution convention) - single entry point, single main dispatch (no node-type routing). Use when running workflow graphs.
argument-hint: '<graph-name> [--verbose] [--debug]'
disable-model-invocation: true
user-invocable: true
version: 3.13.0
last_updated: '2026-08-20'
---

> **Runtime constraints** - load skill atom-kernel for task() contract and approval() decision UI. load skill atom-phase-handler for {node, snapshot?} data handling, single-node dispatch, and error handling. Detect graph-scheduler MCP tools at runtime - see atom-kernel §Graph-Scheduler Tool Detection.

> **Layer**: atom - graph lifecycle manager

## Context Requirements

### From upstream

<!-- none -->

### Reference skills

<!-- none -->

### Operation classes

- graph-ops

### Files

<!-- none -->

# Atom-Pilot

Graph lifecycle manager. execute->advance loop. Dispatch via `atom-phase-handler` - single entry point, single main dispatch.

Pilot mode: start graph, execute nodes one-by-one, pause for manual commands between nodes (status, force-end, jump, list).

## Entry

**MUST EXECUTE** - when invoked with a graph name, begin graph execution immediately. No questions, no confirmation, no exceptions. Invocation IS the command.

**First-action rule** - after invocation, `graph_start` MUST be the first EXECUTION action: no read/analysis of the graph definition, report, or repository SHALL precede it (entry-program steps 1-4 excepted per the Execution flow — the resident perception-block query is catalog perception, not graph analysis).

Execution flow (contracted entry — the heavy startup steps are NOT entry steps; a graph that needs them declares a `template: startup` node, see the Startup modes note under step 7):

1. Load `atom-kernel` - task() contract
2. Load `atom-phase-handler` - node dispatch schema
3. Detect graph-scheduler MCP tools per §Graph-Scheduler Tool Detection
4. **Graph resident perception block** - query `graph_assets` once and inject the perception list into the session: one line per graph, `id + description` (mirrors the skills `<skills>` block — compact, never the full five-field payload; detail stays on demand via `graph_assets`). Query failure → omit the block, never block the run. Session fact at activation — no per-dispatch reload.
5. Call `graph_start { graphName, args? }` - return shape: see §MCP Reference (Return Shapes).
6. **Identity banner (before first node)** - display the run identity so the executed graph is explicit from the start:
   ```
   Executing <graphName> (<resolvedFrom>) — <description>
   from: <resolvedPath>
   ```
   Graph produces artifacts (maker journey, e.g. `graph-generate`) -> state two-level model: graph EXECUTED vs artifact PRODUCED (artifact name from entry scope interview - pilot never guesses it). `resolvedFrom` (`project` | `builtin` | `fallback`) makes same-name shadowing explicit - never let the agent discover the resolution source post-hoc.
7. Enter execute->advance loop per Loop Mechanics - the first dispatched node is the graph's first entry node (no activation prefix); execute it like any main node.

   **Startup modes (declared, never guessed)**: a graph whose first dispatched node carries the `template: startup` task (compiled-in startup template — constraints session load + serena `activate_project` + jcodemunch `index_folder`) runs FULL startup: execute that template node first like any main node; its session copy of `.graph-scheduler/constraints.json` feeds every downstream node's `## Constraints` block (no per-node file reads, no constraints node in the run). The banner notes the mode — `startup: full` when the first node is the template node, `startup: bare` otherwise. A graph without the template node starts bare — constraints loading, LSP activation, and indexing do NOT run at activation. The pilot never performs the heavy steps on its own — only the declared template node does.

Verbosity: `--verbose` / `--debug` set tiers - see DISPLAY.md §Verbose / §Debug; default quiet.

## Graph-Scheduler Tool Detection

Detect graph-scheduler MCP tools at runtime - the exact-name detection rules (10 names, never substring) live in atom-kernel §Graph-Scheduler Tool Detection (platform primitives, loaded with the kernel). Tool schemas, return shapes, command->tool map: see §MCP Reference.

## MCP Reference

### MCP Tool Reference

Tool names detected at runtime per §Graph-Scheduler Tool Detection. Heat split: graph_start / graph_advance / graph_jump / graph_force_end = execution-hot (every dispatch); the remaining ops are operation-cold (operator use — full params resolved on demand):

|tool|purpose|key params|
|-|-|-|
|graph_start|create run, get first node + snapshot|graphName, args?|
|graph_advance|report result + get next node|runId, nodeId, condition?, jump?, end?|
|graph_jump|jump to node (operator PCL)|runId, targetPhaseId|
|graph_force_end|force end run|runId|

`graph_advance` / `graph_jump` return `{ snapshot, node }` — `node: null` = graph complete (`fsmState` `completed`). Hot-path snapshots are compact: `progress` (single-line) + `changed` (delta rows); the full `nodes` enumeration is served by `graph_status` only.

Cold ops (operator use — full params resolved on demand): graph_status {runId}, graph_list, graph_init, graph_clean_completed {before?}, graph_clean_all.

`graph_assets` — the resident perception-block data source: one query at activation injects the graph list (one line per graph, `id` + `description`) per the Entry flow step 4; full five-field detail (`run_conditions`, `source`, `problems`) stays on demand via the same tool.

### Return Shapes

```
graph_start { graphName, args? } → { runId, node: NodeDetail | null, snapshot: GraphSnapshot, resolvedFrom: project|builtin|fallback, resolvedPath: string, description?: string, problems?: string[] }
```

Scheduler resolves the graph name via merged registry - project entries override builtin (project-first). Return `runId` + first `node` (NodeDetail | null) + compact `snapshot` (`progress` + `changed`; full `nodes` via `graph_status`) + resolution identity (`resolvedFrom` + `resolvedPath` + graph `description`). `problems` = load-time machine warning array (inventory consistency, description drift; empty when clean; absent on older servers — degrade silently). NodeDetail carries channel declarations (dependsOn + `node:` entries) + the `completion` block (default / choices / direct_end — machine-declared, see atom-phase-handler NODE-SCHEMA.md) — upstream content is assembled from the agent session, never delivered in the payload. Agent holds `runId` for all subsequent calls.

## Process-Control Language (PCL)

User utterances during an active run are classified BEFORE interpretation: PCL (process control) vs node input (domain data). PCL executes as graph control - never as node input, never as a feature request. Vocabulary (explicit on disk - CONTEXT.md glossary term `PCL`):

|Utterance (en)|Action|Target resolution|
|-|-|-|
|start graph|`graph_start` (contracted entry: load atom-kernel + atom-phase-handler skills, detect graph tools, query `graph_assets` once for the resident perception block — no unconditional `index_folder` / `activate_project`; those run inside the graph's `template: startup` node when declared)|graph name -> run starts|
|back / return to X|`graph_jump`|X = phase path or nodeId (e.g. `requirement` — plain node id; composition is deleted, no namespaced targets)|
|jump to X|`graph_jump`|same|
|re-review / re-run|`graph_jump`|named phase; default current phase chain head|
|end / finish this round|`graph_advance` (continue the loop) — run drains (per §Run Completion)|report completion at `node: null`|
|terminate / abort run|`graph_force_end`|run terminates|
|skip|`graph_advance` (continue)|no branch|
|status / progress|`graph_status`|report, continue loop|
|history|`graph_list`|report, continue loop|

Classification rules:

1. Run-active user input -> PCL check first (match any vocabulary row).
2. Hit -> execute the action immediately, record in session (observability), do NOT enter node input slot.
3. Miss -> node input (scope answers, approval decisions, node data).
4. Vocabulary explicit -> classification auditable; never model improvisation (P2).

Jump-target enumeration: the hot-path snapshot carries only `progress` + `changed` — for `back`/`jump`/`re-review` commands, query `graph_status` for the full `nodes` array before presenting jump targets.

Empirical acceptance: "back to X phase re-review" -> `graph_jump` (run `2fc43e1e-d9b8-4da1-a911-f4f0c793214b`).

## Loop Mechanics

Execute->advance cycle:

```
(a) execute ({node, snapshot?} → atom-phase-handler, single main dispatch) → (b) collect {status, output, durationMs} → (c) graph_advance {runId, nodeId, condition?, jump?, end?} → {snapshot, node} → (d) complete → report → exit; else goto (a)
```

`graph_advance` merges notify + next into one call - report node result AND fetch next pending node. The advance decision is dual-channel (graph-flow capability): `condition` = normal advance carrying the flow-defined condition value (transition-table routed — no match is a loud error, the missed-condition guard); `jump` = graph-internal forced rework (backward reset — target restricted to the reported node's topological ancestors ∪ `__handoff`, forward jumps rejected loudly); `end: true` = direct-end adapter completion. No condition/jump/end = sequence default (dependency activation). Loop/rework semantics are flow self-edges (`A -->|fail| A` — inline bounded loops, condition-matched re-entry); branch semantics are the router sibling run — `template: router` (one-shot subgraph selection) — never in-run transitions (see §Main Decision Routing).

**Advance obligation** - a node boundary is NOT a stopping point. After reporting a node, always `graph_advance` and execute the next node; the loop continues until `node: null` (per §Run Completion) or user `force_end`. Never yield mid-loop with work remaining.

> **Note:** `output` collected in (b) for display only; `durationMs` is the handler-measured wall clock for the node report (session display only). `graph_advance` receives `{ runId, nodeId, condition?, jump?, end? }` - no output param, no duration param; the scheduler persists progress only (duration derived from timestamps). Node content and decisions stay in the agent session (platform-persisted) — downstream decisions judge from the session.

## Problems Consumption (F3)

At run start, `graph_start` may return `problems` (load-time machine warnings: inventory consistency, description drift). Handling:

1. Non-empty `problems` → report each problem (evidence-cited, one line each) in the identity banner context; then propose running `graph-maintain` on the resolved graph — **naming the target graph** (the resolved graph name that carried the problems, plus `resolvedPath` / `resolvedFrom`) as a repair option. Proposal only — never execute, never auto-start a maintenance run; the user decides (approval()).
2. Empty / absent `problems` → zero extra output; proceed with the loop.
3. Problems NEVER block the run — warnings are non-blocking by contract; the loop continues unless the user redirects (PCL or node input).

The repair proposal is the graph-file maintenance entry (graph-maintain audit → propose → approval → execute) — the pilot never fixes graph files inline.

## Node Execution

Receive `{ node, snapshot? }` from graph_advance/graph_start. Delegate to `atom-phase-handler` - single main dispatch (handlerSkill constant `atom-phase-handler`); every dispatched node is a root-graph phase — subgraph composition is deleted (graph-subgraph-route-unify), so no composed members dispatch by namespaced id. Nested execution is sibling-run-only: a `template: router` node launches the chosen graph as a sibling run once (see §Main Decision Routing). Loops are flow self-edges — a loop-head node dispatches as a plain main node; the loop is the transition-table re-entry driven by the condition value on advance (see §Main Decision Routing). Dispatch rules: see `atom-phase-handler` §Dispatch Rules (main). The pilot routes the node's decision output per §Main Decision Routing.

## Handoff Result Report

Every graph gains a single root `__handoff` main terminal at compile time (graph-handoff-result-report; subgraph composition is deleted — no per-level `<composing>/__handoff` exists). The node produces the unified two-element result report (`tasks_done` / `outputs`) and returns it to the session — no report file is written, no path is derived (content/accounting separation per R9; the scheduler persists progress only). The result-report wording is single-sourced in `task-templates/handoff.ts` — this skill references it, never re-encodes it (debt Card 15/23). Consumption:

- **inline execution** — the handoff node runs through the normal dispatch; its output contract declares the report fields; the two elements stay in the agent session (platform-persisted), assembled into downstream `## Upstream` content when a downstream node declares the channel.
- **drain** — the handoff is the subgraph/root terminal: runs complete one advance after the last source node (handoff executes → natural drain). Operator jumps include the handoff in the reset scope (downstream terminal); unfinished nodes stay pending.

## Main Decision Routing

Main nodes execute inline. The pilot presents an approval() card ONLY at points the node explicitly declares human confirmation — `Interview:` / `confirm:` tokens, explicit confirmation instructions in the node task text, or `completion.choices` branch options (branch choice = user decision, per DECISION-CARDS.md). Card options render from `NodeDetail.completion` (choices / direct_end — machine-declared); options are NEVER parsed from task text. Nodes declaring no confirmation point advance with zero questions — prose that merely describes a condition is not a confirmation point.

**Router template nodes** (`NodeDetail.template_args.paths` present — `template: router`, machine-declared candidate graphs) follow dedicated selection semantics (graph-router-template): the executing agent SHALL (1) evaluate the candidate count and the hard criterion stated in the node's task text/context (e.g. an echoed adoption judgment) against the candidate graphs' metadata (`graph_assets` — `description` + `run_conditions`, on demand); (2) select automatically — zero card — when exactly one candidate exists OR a hard criterion is satisfied; (3) otherwise present an approval() card whose options ARE the candidate graphs (`template_args.paths`, machine-declared — never task-text parsing) with the recommended option marked; (4) start the chosen graph as a sibling run (`graph_start`), drive its loop to completion (`graph_advance` until `node: null`), and collect its result; (5) report the router node with `chosen_graph` / `run_id` / result fields. The path activation is the sibling run itself — router nodes NEVER route via `branchTo`.

**Flow condition nodes (loop self-edge / labeled edge)** — loop-head nodes dispatch as plain main nodes; the loop is a top-level `flow` self-edge (`A -->|fail| A` — inline bounded loop, condition-matched re-entry; graph-flow capability). The executing agent evaluates the loop condition inline per the node's task text and reports the condition value: NOT satisfied → the node report carries the re-entry condition (e.g. `fail`) and the pilot advances with `graph_advance(runId, nodeId, condition)` — the transition table re-enters the node; satisfied → the node report carries the exit condition (e.g. `pass`) routing downstream. The loop bound lives in the node's task text / the graph's constraints prose (agent-enforced — the engine increments `retryCount` on condition-matched re-entry, the machine signal the agent-side bound check observes; the operator `graph_jump` stays the operator-level backward reset).

The node's decision output (IApprovalDecision shape: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape) carries `action` (`continue`) and the direct-end path — `branchTo` is removed (no `retry` action, no in-run branch targets); the chosen option's stable `value` carries the flow condition reported on advance (flow-defined vocabulary); loop/rework semantics are flow self-edges (backward rework rides the advance `jump` channel):

|case|MCP call|
|-|-|
|direct-end decision (`completion.direct_end` declared; node report carries `direct_end: true`)|`graph_advance(runId, nodeId, end: true)` - adapter-level completion: the reported node is marked `done` and the run completes as `completed` without resuming the graph (unfinished nodes stay pending); never `graph_force_end` - that tool serves abnormal termination only (PCL terminate / operator abort / stuck runs)|
|flow condition advance (node decision reports a flow-defined condition value — loop re-entry or labeled-edge routing)|`graph_advance(runId, nodeId, condition: <value>)` - normal advance, transition-table routed: the condition resolves via the reported node's flow edges (no match → loud error — the missed-condition guard); self-edge re-entry = the inline bounded loop (bound in the node task text / constraints prose — the engine increments `retryCount` on condition re-entry, the machine signal the agent-side bound check observes)|
|forced rework (node decision declares a backward rework of an upstream phase)|`graph_advance(runId, nodeId, jump: <target>)` - graph-internal backward reset: the target node and its downstream terminal nodes return to `pending` (upstream kept, `retryCount`++ on the reset scope); target restricted to the reported node's topological ancestors ∪ `__handoff` (forward jumps rejected loudly — structure-integrity guard); never `graph_jump` - that tool serves operator PCL jumps only|
|router template node (`NodeDetail.template_args.paths` present — selection happened inside the node: auto or recommendation card, then the chosen graph ran as a sibling run)|`graph_advance(runId, nodeId)` - normal advance, nothing activates; the path activation was the sibling run the node itself started and drove (no `branchTo` — router paths are graphs, never in-run branch targets)|
|no branch / plain confirmation (`action: continue`)|`graph_advance(runId, nodeId)` - normal advance, nothing activates (sequence default)|

The direct-end flag arrives in the node report output contract (`direct_end` field, declared by the executing node's output contract - entry interviews per atom-scope-interview §Input `direct end` flag, any main confirmation node per atom-kernel §interview() §Direct end); the pilot detects it on the node report before `graph_advance` and advances with `end: true` — the node's decision output still carries the interview consensus (`action: continue`) for the record, but the run completes as `completed` (adapter-level completion, graph not resumed) instead of continuing the loop. The decision JSON stays in the agent session (platform-persisted); downstream decisions judge from the session.

> **After `graph_jump`** (operator PCL jump — the operator-level backward reset, graph-external, never declared in graph definitions; distinct from the advance `jump` channel, which is the node-decision-driven graph-internal backward rework): response returns `{ snapshot, node }` -> re-enter execute loop. `graph_advance` handles normal advance flow.

## Run Completion

Runs complete by natural drain — see atom-graph-spec ROUTING §Completion.

## Error Handling

See `atom-phase-handler` §Error Handling for handler-level errors (dispatch failures). Loop-level errors:

- `graph_start` fail -> report error, exit
- `graph_advance` return error -> report, exit loop
- Phase execution throw -> handler returns `{ status: "failed", output: <error text>, durationMs }`, then advance

All failures: advance via `graph_advance(runId, nodeId)` - the scheduler records the node as `done` (no status/failure parameter exists — strict schema; failure semantics live in the agent session). No crash, no loop break.

## Result Report

After loop exit, report per DISPLAY.md §Display Rules - per-node status lines, final report table (wall-clock, retries, ctx/tools stats, runId), result table, approval decisions. Format strings live in DISPLAY.md only - see DISPLAY.md §Final report / §Context stats / §Tools stats / §Approval decisions.
