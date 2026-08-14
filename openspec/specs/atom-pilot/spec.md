# atom-pilot Specification

## Purpose

Graph lifecycle management — the execute→advance loop. Asset: `packages/graph-workflow/skills/atom-pilot/SKILL.md`.

## Requirements

### Requirement: atom-pilot — graph lifecycle manager

`atom-pilot` SHALL drive the full graph execution loop. It receives a graph name, starts execution via `graph_start`, then loops: receive `NextNode`, dispatch to `atom-phase-handler`, report completion via `graph_advance`, repeat until `null`. Node types SHALL be the three-type set `main`/`approval`/`gate` — no agent type exists.

#### Scenario: Pilot drives complete graph execution

- **WHEN** atom-pilot is invoked with a graph name
- **THEN** it SHALL call `graph_start({ graphName })` to create a run
- **THEN** on receiving a `NextNode` — it SHALL dispatch to `atom-phase-handler` (single entry, routes by node.type)
- **THEN** after the handler completes — it SHALL call `graph_advance({ runId, nodeId })` (duration derived from timestamps, never reported)
- **THEN** `graph_advance` SHALL return the next `NextNode` or `null` (graph complete)
- **THEN** the loop SHALL continue until `null` is received

#### Scenario: Pilot handles approval nodes

- **WHEN** `NextNode.type` is `approval`
- **THEN** atom-pilot SHALL dispatch to `atom-phase-handler` which routes to the approval handler
- **THEN** the approval decision (continue/retry/jump/end) SHALL be collected
- **THEN** for `continue` — atom-pilot SHALL call `graph_advance`
- **THEN** for `retry` — atom-pilot SHALL call `graph_advance` (retry handled by FSM internally)
- **THEN** for `jump` — atom-pilot SHALL call `graph_jump({ runId, targetPhaseId })` then continue the loop
- **THEN** for `end` — the run completes (end action, no end node)

### Requirement: graph_start signature single-sited

The `graph_start` return shape SHALL be stated identically in §MCP Tool Reference and §Graph-Scheduler Tool Detection — `{runId, node, snapshot, resolvedFrom, resolvedPath, description?}`.

#### Scenario: no stale signature

Given packages/graph-workflow/skills/atom-pilot/SKILL.md When reading §MCP Tool Reference graph_start row Then the Returns column includes resolvedFrom, resolvedPath, description? — matching §Graph-Scheduler Tool Detection

### Requirement: native-table display rules

MODIFIED: Pilot output SHALL render as native markdown tables, single-line compact status, or the compact 3-line final report — no box-drawing art, no free-floating prose stats. The final report SHALL be THREE compact lines — `🏁 <graphName> done · ⏱ <wall clock> · 🔄 <retries> · 📉 <context stats> · 🆔 <runId>` — followed by the result table (nodeId | skill | status | duration | output summary) and the approval decisions table (nodeId | action | label | rationale?), which SHALL be kept for auditability. Per-node status lines (`✅ <nodeId> · <skill> · <N>ms`) SHALL print in the degrade baseline and SHALL be skipped while a canonical `[seam]` line is present in the session (the mechanical echo line replaces them). Node output reports SHALL render as concise prose summaries — never JSON code fences; empty node outputs SHALL render no code block; approval/gate decisions SHALL render as a single line `decision: <action> (<label>)` with the full IApprovalDecision JSON retained in the session for routing and audit. Node-report format strings live in `atom-pilot/DISPLAY.md` (display format single home), uniformly across main/approval/gate node types.

#### Scenario: final report renders as table, not box

- **WHEN** the pilot reports run completion
- **THEN** the final report SHALL be three compact lines (graph/wall/retries/context/runId) plus the result and approval tables
- **THEN** no line SHALL use box-drawing (border overflow eliminated)

#### Scenario: per-node status is one compact line

- **WHEN** a node completes and no `[seam]` line is present in the session
- **THEN** the pilot SHALL print a single-line status: `✅ <nodeId> · <skill> · <N>ms` (main), `✅ <choice> · <N>ms` (approval), `🔀 <jump|pass> · <N>ms` (gate), `⚠️ <error> · <N>ms` (stub)

#### Scenario: stats fold into table

- **WHEN** the run ends
- **THEN** context stats (`📉`) and retry count (`🔄`) SHALL appear in the 3-line report — not free-floating prose lines

#### Scenario: approval decisions are a table

- **WHEN** the pilot lists approval decisions after run completion
- **THEN** they SHALL render as a table with columns `nodeId | action | label | rationale?` (rationale present for auto-executed decisions only)

#### Scenario: Plugin present — status lines skipped

- **WHEN** a run executes and the session carries canonical `[seam]` lines
- **THEN** the pilot prints no per-node status lines and the 3-line final report

#### Scenario: Degrade baseline

- **WHEN** no `[seam]` line is present in the session
- **THEN** the pilot prints per-node status lines and the 3-line final report

#### Scenario: Node reports render as prose summaries

- **WHEN** a main node completes and its output report is emitted
- **THEN** the report SHALL render as a concise prose summary — no JSON code fence; the full output-contract data stays in the agent session for downstream `node:` channel consumption and audit

#### Scenario: Empty output renders no code block

- **WHEN** a node completes with an empty output
- **THEN** no code block SHALL be rendered — blank fences are eliminated

#### Scenario: Decisions render as a single line

- **WHEN** an approval or gate decision is reported
- **THEN** it SHALL render as one line `decision: <action> (<label>)`
- **AND** the full IApprovalDecision JSON SHALL remain in the session for routing and audit

### Requirement: display format single home

Display format strings SHALL live in exactly one home — `atom-pilot/DISPLAY.md`. `atom-pilot/SKILL.md` §Result Report SHALL reference DISPLAY.md via pointer, never restate format strings.

#### Scenario: no format double-write

- **WHEN** reading atom-pilot SKILL.md §Result Report
- **THEN** it SHALL contain pointers to DISPLAY.md (see DISPLAY.md §Final Report / §Approval decisions) — no duplicated `📉 ctx:` / `🔧 tools:` format strings

### Requirement: Single home for MCP tool contract

The graph-scheduler MCP tool contract (params, return shapes, pilot commands) SHALL live inside atom-pilot SKILL.md; a separate MCP-REFERENCE.md file SHALL NOT exist.

#### Scenario: Pilot loads tool contract

- **WHEN** a pilot invocation needs graph-scheduler tool parameters or return shapes
- **THEN** they resolve within atom-pilot SKILL.md §MCP Reference, with no MCP-REFERENCE.md file present

### Requirement: Marker aggregation references emission spec

Display aggregation of `[CONSTRAINT VIOLATION]` / `[TOOL USAGE VIOLATION]` markers SHALL reference the emission spec in atom-phase-handler SKILL.md rather than re-listing marker strings.

#### Scenario: Marker list maintained once

- **WHEN** a marker string changes
- **THEN** only the emission spec in atom-phase-handler SKILL.md is edited; atom-pilot DISPLAY references it

### Requirement: Pilot Routing Pointerization

atom-pilot SKILL §Approval Decision Processing / §Gate Decision Routing / §Node Execution SHALL carry action-to-MCP-call routing as a summary table with pointers to the shape single home (atom-kernel APPROVAL-CARDS.md) and the handler dispatch rules (atom-phase-handler) — no restated IApprovalDecision field lists, no restated mode semantics, no restated dispatch bullets.

#### Scenario: No shape restatement in pilot

- **WHEN** reading atom-pilot SKILL §Approval Decision Processing
- **THEN** the IApprovalDecision action rows reference the canonical shape home by pointer — no field enumeration

#### Scenario: Node execution pointerized

- **WHEN** reading atom-pilot SKILL §Node Execution
- **THEN** the three type bullets (main/approval/gate) are a pointer to atom-phase-handler §Dispatch Rules, with only the handlerSkill constant stated locally

#### Scenario: Run-mode tail pointerized

- **WHEN** reading atom-pilot SKILL §Run Mode flags
- **THEN** the "absence never auto" tail is a pointer to the canonical mode sites — no restatement

### Requirement: Run Frame Protocol

Every dispatched node carries a frame block declaring the run position and the input contract for the user.

#### Scenario: Frame block on every dispatch

- **WHEN** a node (main/approval/gate) is dispatched with an active run
- **THEN** the assembled node context starts with a `## Run Frame` block containing runId, nodeId, node type, a one-line task summary, the statement that user input during the node is node input (scope answers, approval decisions) rather than new instructions, and the obligation to report then advance via `graph_advance`

#### Scenario: First-action rule

- **WHEN** the pilot is invoked with a graph name
- **THEN** the first tool call must be `graph_start`; any read/analysis tool call before it is a process violation recorded in the node report

### Requirement: Process-Control Language (PCL) routing

User utterances that match the English PCL vocabulary execute as graph routing actions, never as node input. The vocabulary is English-only: back/return (→ `graph_jump`), jump to X (→ `graph_jump`), re-review/re-run (→ `graph_jump`), end/finish (→ endRun), terminate/abort (→ `graph_force_end`), skip (→ continue), status/progress (→ `graph_status`), history (→ `graph_list`). the previous zh utterance forms are removed from the vocabulary and examples.

#### Scenario: Jump-back command

- **WHEN** the user sends a PCL jump-back utterance (e.g. "back to X phase re-review") during an active run
- **THEN** the pilot routes it via `graph_jump` to the resolved target phase and records the routing in the session; the utterance is not treated as node input

#### Scenario: End command

- **WHEN** the user sends a PCL end utterance (e.g. "end") during an active run
- **THEN** the pilot completes the run via `graph_advance` with `endRun: true`

#### Scenario: Status command

- **WHEN** the user sends a PCL status utterance (e.g. "status")
- **THEN** the pilot reports run state via `graph_status` and continues the loop

#### Scenario: Explicit vocabulary

- **WHEN** a PCL term is used
- **THEN** its mapping (term → routing action → target resolution rule) comes from an explicit on-disk vocabulary, not model improvisation

### Requirement: Advance obligation clause

The pilot loop states that a node boundary is not a stopping point.

#### Scenario: Node boundary continues the loop

- **WHEN** a node completes and the run is not complete
- **THEN** the pilot reports the node and advances to the next node without treating the boundary as a yield point
