# atom-pilot Specification

## Purpose

Graph lifecycle management — the execute→advance loop. Asset: `packages/graph-workflow/skills/atom-pilot/SKILL.md`.

## Requirements

### Requirement: atom-pilot — graph lifecycle manager

MODIFIED: the advance step SHALL report the node's condition value on normal advance — `graph_advance { runId, nodeId, condition? }` — the value is a flow-defined condition (a member of the edge-label vocabulary, matched by the backend transition table; the pilot never picks a next node). The loop-template driving path (sibling-run start/drive/collect for `template: loop`) SHALL NOT exist — a loop is a flow self-edge, the loop-head node executes and advances like any plain node (the frontend does not perceive whether a node is a loop). The router-template path SHALL keep the sibling-run selection+launch semantics (subgraph = node-wrapped graph launch, orthogonal to flow). The handoff consumption stays session-ized (two-element result to the session; no report file). The entry procedure SHALL NOT load project constraints at activation time and SHALL NOT run serena activation or jcodemunch indexing as unconditional steps — the heavy startup steps execute inside the graph's `template: startup` node when declared.

#### Scenario: Handoff result in session

- **WHEN** a handoff node completes
- **THEN** its two-element result SHALL be present in the session (platform-persisted)
- **AND** no report file SHALL be written by the pilot

#### Scenario: No report path derivation

- **WHEN** a graph/subgraph run completes
- **THEN** the pilot SHALL NOT derive or read a `.graph-scheduler/reports/` path

#### Scenario: Entry procedure contracts to loop + tool detect

- **WHEN** the pilot starts a graph
- **THEN** the entry SHALL be kernel skill loads + graph-scheduler tool detection + `graph_start` + identity banner + execute→advance loop
- **AND** the pilot SHALL NOT load project constraints, run serena activation, or run jcodemunch indexing as unconditional entry steps

#### Scenario: Bare graph starts without heavy steps

- **WHEN** a graph declares no `template: startup` node
- **THEN** the pilot SHALL start it bare — no constraints load, no activation, no indexing
- **AND** the identity banner SHALL note the bare startup mode

#### Scenario: Full-startup graph runs the template node

- **WHEN** a graph declares a `template: startup` entry node
- **THEN** the pilot SHALL execute that template node first (constraints session load + serena activation + jcodemunch indexing)
- **AND** the identity banner SHALL note the full startup mode

#### Scenario: Nested execution is router-sibling-only

- **WHEN** a dispatched node is a `template: router` node
- **THEN** the pilot SHALL execute the router semantics (select via auto/hard-criterion/recommendation card → `graph_start` chosen graph → drive loop → collect handoff result)
- **AND** no loop-template sibling-run driving exists — loops are flow self-edges invisible to the frontend

#### Scenario: Handoff contract wording single-sourced

- **WHEN** the pilot's skill text states the handoff result-report contract
- **THEN** it SHALL reference the task-templates single source — no re-encoded wording in atom-pilot

#### Scenario: Normal advance reports a condition

- **WHEN** a node's execution produces a condition value (e.g. a review verdict)
- **THEN** the pilot reports `graph_advance(runId, nodeId, condition)` — the backend activates the matched flow target

#### Scenario: No condition — default advance

- **WHEN** a node produces no condition value
- **THEN** the pilot advances without condition — the sequence default activates

#### Scenario: Loop head is a plain node

- **WHEN** a flow self-edge re-enters a loop-head node
- **THEN** the pilot dispatches and advances it like any node — no loop mechanism, no sibling run

### Requirement: graph_start signature single-sited

MODIFIED: the `graph_start` return shape SHALL be stated in exactly one place — §MCP Tool Reference in atom-pilot SKILL.md: `{runId, node, snapshot, resolvedFrom, resolvedPath, description?, problems?}` with the compact snapshot. The duplicate statement in atom-kernel §Graph-Scheduler Tool Detection SHALL be removed (detection keeps the exact-name tool list only).

#### Scenario: no stale signature

- **WHEN** reading packages/graph-workflow/skills/atom-pilot/SKILL.md §MCP Tool Reference graph_start row
- **THEN** the Returns column includes runId, node, snapshot, resolvedFrom, resolvedPath, description?, problems?
- **AND** no return-shape duplication exists in atom-kernel §Graph-Scheduler Tool Detection

### Requirement: native-table display rules

Pilot output SHALL render as native markdown tables, single-line compact status, or the compact 3-line final report — no box-drawing art, no free-floating prose stats. The final report SHALL be THREE compact lines — `🏁 <graphName> done · ⏱ <wall clock> · 🔄 <retries> · 📉 <context stats> · 🆔 <runId>` — followed by the result table (nodeId | skill | status | duration | output summary) and the approval decisions table (nodeId | action | label | rationale?), kept for auditability. Per-node status lines (`✅ <nodeId> · <skill> · <N>ms`) SHALL print in the degrade baseline and SHALL be skipped while a canonical `[seam]` line is present in the session (the mechanical echo line replaces them). Node output reports SHALL render as concise prose summaries.

#### Scenario: final report renders as table, not box

- **WHEN** the pilot reports run completion
- **THEN** the final report SHALL be three compact lines (graph/wall/retries/context/runId) plus the result and approval tables
- **THEN** no line SHALL use box-drawing (border overflow eliminated)

#### Scenario: per-node status is one compact line

- **WHEN** a node completes and no `[seam]` line is present in the session
- **THEN** the pilot SHALL print a single-line status: `✅ <nodeId> · <skill> · <N>ms` — no type-variant forms

#### Scenario: stats fold into table

- **WHEN** the run ends
- **THEN** context stats (`📉`) and retry count (`🔄`) SHALL appear in the 3-line report — not free-floating prose lines

#### Scenario: approval decisions are a table

- **WHEN** the pilot lists approval decisions after run completion
- **THEN** they SHALL render as a table with columns `nodeId | action | label | rationale?` (rationale present when a recommendation basis was stated)

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

- **WHEN** a decision is reported
- **THEN** it SHALL render as one line `decision: <action> (<label>)`
- **AND** the full decision JSON SHALL remain in the session for routing and audit

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

§Node Execution SHALL carry an action-to-MCP-call routing summary (pointer to atom-kernel APPROVAL-CARDS.md and atom-phase-handler dispatch rules) — no restated field lists, no mode semantics, no gate sections. §Gate Decision Routing does not exist.

#### Scenario: No shape restatement in pilot

- **WHEN** reading atom-pilot SKILL §Branch Routing
- **THEN** routing rows reference the canonical shape homes by pointer — no field enumeration

#### Scenario: Node execution pointerized

- **WHEN** reading atom-pilot SKILL §Node Execution
- **THEN** the node-execution bullets are pointers to atom-phase-handler §Dispatch Rules — the single main path needs no type bullets

#### Scenario: Run-mode tail pointerized

- **WHEN** reading atom-pilot SKILL (run-mode related sections)
- **THEN** no run-mode tail exists to pointerize — the run-mode concept is removed (sections deleted)

### Requirement: Run Frame Protocol

Every dispatched node carries a frame block declaring the run position and the input contract for the user. The frame SHALL contain runId, nodeId, a one-line task summary, the user-input contract statement, and the report-then-advance obligation — it SHALL NOT carry a node-type concept.

#### Scenario: Frame block on every dispatch

- **WHEN** a node is dispatched with an active run
- **THEN** the assembled node context starts with a `## Run Frame` block containing runId, nodeId, a one-line task summary, the statement that user input during the node is node input (scope answers, approval decisions) rather than new instructions, and the obligation to report then advance via `graph_advance` — no node type is named

#### Scenario: First-action rule

- **WHEN** the pilot is invoked with a graph name
- **THEN** `graph_start` SHALL be the first EXECUTION action; entry-program steps (loading the kernel and phase-handler skills, tool detection) SHALL precede `graph_start` per the §Entry ordering and SHALL NOT be treated as analysis calls

### Requirement: Process-Control Language (PCL) routing

MODIFIED：PCL 词表保留；`end/finish` 映射从 endRun 改为自然排空 + 提示（`graph_advance` 无 endRun——用户确认后 run 经自然排空完成，或 pilot 提示 graph_force_end/cleanup 收尾）。其余映射不变（back/jump → graph_jump；terminate → graph_force_end；skip → continue；status/history → graph_status/graph_list）。`start graph` 步骤收缩：不再无条件运行 jcodemunch index_folder 与 serena activate_project——入口 = kernel skill 加载 + 图工具探测 + `graph_start`（模板节点声明时全量启动在模板内执行；缺省 bare）。

#### Scenario: Start-graph step declared

- **WHEN** pilot 下启动图 run
- **THEN** PCL 词表声明 start-graph 步骤（load skills + graph tool detection → graph_start）——无 run-mode 步骤、无无条件 index/activate

#### Scenario: Jump-back command

- **WHEN** 用户发 PCL jump-back 话语（如 "back to X phase re-review"）
- **THEN** pilot 经 `graph_jump` 路由到目标 phase 并记录——话语不作节点输入

#### Scenario: End command

- **WHEN** 用户发 PCL end 话语（如 "end"）
- **THEN** pilot 报告 run 将经自然排空完成（graph_advance 无 endRun）；如需立即终止提示 graph_force_end + clean

#### Scenario: Status command

- **WHEN** 用户发 PCL status 话语（如 "status"）
- **THEN** pilot 经 `graph_status` 报告 run 状态并继续循环

#### Scenario: Explicit vocabulary

- **WHEN** 使用 PCL 术语
- **THEN** 其映射（term → routing action → target resolution rule）来自显式磁盘词表，非模型即兴

### Requirement: Advance obligation clause

The pilot loop states that a node boundary is not a stopping point.

#### Scenario: Node boundary continues the loop

- **WHEN** a node completes and the run is not complete
- **THEN** the pilot reports the node and advances to the next node without treating the boundary as a yield point

### Requirement: Problems consumption and repair proposal

`atom-pilot` SHALL consume the `problems` array from `graph_start` responses: on a run start, when problems are non-empty, the pilot SHALL report them (per-problem, evidence-cited) and propose running the `graph-maintain` flow to fix the target graph — a proposal only, never autonomous execution; the user decides. The repair proposal SHALL name the target graph (the resolved graph that carried the problems) so the user knows which graph the maintenance run addresses. The pilot SHALL NOT block the run on problems (warnings never block).

#### Scenario: Start with problems proposes repair

- **WHEN** graph_start returns a non-empty problems array
- **THEN** the pilot reports each problem and offers to run graph-maintain on the resolved graph — naming the target graph in the proposal — then continues the run unless the user redirects

#### Scenario: Clean start unchanged

- **WHEN** graph_start returns an empty problems array
- **THEN** the pilot proceeds with the normal execute→advance loop — zero extra output

### Requirement: No-ask default for undisclosed nodes

Any graph node whose task text declares no human confirmation (no `Interview:` / `confirm:` / explicit confirmation instruction / `routing.actions` branch) SHALL execute with zero user questions — the agent decides on its own from the task text, upstream outputs, and snapshot. The pilot SHALL NOT synthesize a confirmation point from prose that merely describes a decision (e.g. "the node decides", "rework re-runs X") — prose decision descriptions are self-decide instructions, not confirmation declarations.

#### Scenario: Prose decision description does not trigger card

- **WHEN** a node task text describes a machine-evaluable decision in prose (e.g. "Confirmation: accept when lorem_text is a valid Lorem Ipsum passage; rework re-runs lorem-output") without an explicit `Interview:`/`confirm:` token or `routing.actions`
- **THEN** the node evaluates the criterion inline and self-decides (accept → advance; fail → rework branchTo)
- **THEN** no approval() card is presented.

#### Scenario: No declaration anywhere yields zero questions

- **WHEN** a node declares no confirmation token and no routing actions
- **THEN** the node executes its task and advances with zero questions to the user.

### Requirement: Pilot SHALL NOT consume execution position or mode hint

MODIFIED: the pilot SHALL NOT consume execution position, mode hints, or subgraph boundary enumerations — the boundary delegation section is removed from the pilot contract. Composition is a compile-time server fact: composed members dispatch by namespaced id through the same execute→advance loop as peer nodes. The pilot's concept surface at any composition is the node id only. The pilot SHALL NOT reason about membership, execution modes, or report paths.

#### Scenario: Composed member executes inline

- **WHEN** a composed subgraph member node dispatches
- **THEN** the pilot SHALL execute it through the standard loop — no batch delegation, no boundary reasoning

#### Scenario: No boundary facts in the frame

- **WHEN** any node dispatches
- **THEN** the run frame SHALL NOT carry position / executionMode / subgraph facts

### Requirement: Graph resident perception block at activation

The pilot SHALL inject a graph resident perception block into the agent session at activation (after graph-scheduler tool detection, before the identity banner): one query of `graph_assets`, then one line per graph — `id` + `description` — mirroring the skills `<skills>` block. The block SHALL be compact (never the full five-field payload). Full detail (run_conditions, source, problems) SHALL remain on demand via `graph_assets`. A failed catalog query SHALL degrade gracefully — the block is omitted, never a run blocker. The block SHALL be a session fact (activation-time snapshot), not a per-dispatch reload.

#### Scenario: activation injects the resident block

- **WHEN** the pilot starts a graph run and graph-scheduler tools are detected
- **THEN** the session receives one line per graph (`id` + `description`) before the identity banner

#### Scenario: catalog query failure degrades without blocking

- **WHEN** the `graph_assets` query fails at activation
- **THEN** the pilot omits the resident block and proceeds with the run (no error, no retry loop)

#### Scenario: detail stays on demand

- **WHEN** the pilot needs run conditions or problems for a graph during the run
- **THEN** it queries `graph_assets` rather than reading the resident block

### Requirement: Main Decision Routing — loop row removed

MODIFIED: the action-to-MCP-call routing summary SHALL contain the condition-advance row (normal advance with `condition` → `graph_advance(runId, nodeId, condition)`), the jump row (graph-internal forced rework → `graph_advance(runId, nodeId, jump)`), the direct-end row (`end: true`), and the router row (sibling run → normal advance). The loop-template row SHALL NOT exist — loops are flow self-edges, never template-driven sibling runs.

#### Scenario: No loop-template routing row

- **WHEN** the pilot routing summary is consulted
- **THEN** no `template: loop` row exists — loop is invisible to the frontend

#### Scenario: Condition row present

- **WHEN** the pilot advances a node whose execution produced a condition
- **THEN** the routing summary maps the report to `graph_advance(runId, nodeId, condition)`
