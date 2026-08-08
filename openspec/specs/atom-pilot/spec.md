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
- **THEN** after the handler completes — it SHALL call `graph_advance({ runId, nodeId, durationMs })`
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

Pilot output SHALL render as native markdown tables or single-line compact status — no box-drawing art, no free-floating prose stats. The final report SHALL be a two-column `| Metric | Value |` table (or equivalent key/value table) containing graph name, wall-clock time, retry count, context stats, tools stats, and runId. Per-node status SHALL be a single compact line (`✅ <nodeId> · <skill> · <N>ms`). Approval decisions SHALL render as a table (`nodeId | action | label | rationale?`).

#### Scenario: final report renders as table, not box

- **WHEN** the pilot reports run completion
- **THEN** the final report SHALL be a native markdown table with key/value rows
- **THEN** no line SHALL overflow its border (box-drawing removed — 42-char border vs 72-char content misalignment eliminated)

#### Scenario: per-node status is one compact line

- **WHEN** a node completes
- **THEN** the pilot SHALL print a single-line status: `✅ <nodeId> · <skill> · <N>ms` (main), `✅ <choice> · <N>ms` (approval), `🔀 <jump|pass> · <N>ms` (gate), `⚠️ <error> · <N>ms` (stub)

#### Scenario: stats fold into table

- **WHEN** the run ends
- **THEN** context stats (`📉 ctx`) and tools stats (`🔧 tools`) SHALL appear as rows in the final report table — not free-floating prose lines

#### Scenario: approval decisions are a table

- **WHEN** the pilot lists approval decisions after run completion
- **THEN** they SHALL render as a table with columns `nodeId | action | label | rationale?` (rationale present for auto-executed decisions only)

### Requirement: display format single home

Display format strings SHALL live in exactly one home — `atom-pilot/DISPLAY.md`. `atom-pilot/SKILL.md` §Result Report SHALL reference DISPLAY.md via pointer, never restate format strings.

#### Scenario: no format double-write

- **WHEN** reading atom-pilot SKILL.md §Result Report
- **THEN** it SHALL contain pointers to DISPLAY.md (see DISPLAY.md §Final Report / §Approval decisions) — no duplicated `📉 ctx:` / `🔧 tools:` format strings
