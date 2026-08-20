# graph-maintain Specification

## Purpose

Graph 文件维护流程图 — 维护能力需求（用户需求 2）：审查 inventory 合规、审查正文符合 inventory、在任何不符合时提议修正方案、审批后执行。镜像 graph-generate 的 maker journey 结构（audit ≈ spec、propose ≈ implement、accept ≈ accept），复用 registry/inventory 单一事实源。

## Requirements

### Requirement: Graph maintenance entry point

graph-maintain SHALL be entered through the `graph-maintain` graph — single kind (graph), single operation (maintain), zero repo-owner assumptions. The graph SHALL declare a purpose-focused `description` surfaced by the pilot. Entry SHALL confirm the target graph(s) and the maintenance intent; the target is resolved via the graph asset query surface (F1) — never guessed from file names.

#### Scenario: Target graph specified by user

- **WHEN** a user runs graph-maintain naming a registered graph
- **THEN** the entry resolves the target via the asset query surface (path + description + current problems) and confirms the maintenance scope

#### Scenario: Unknown graph name

- **WHEN** the named graph does not resolve in any registry
- **THEN** the entry reports the failure with the candidate list — never fabricates a target

### Requirement: Maintenance audit

MODIFIED: the audit step SHALL check the target graph against its inventory, registry, interaction declaration, AND flow declaration: (1) machine checks — inventory id/type consistency (type values `main` only, reusing the load-time contract pass semantics), registry description drift (mentions a non-existent phase → warning), in-graph declaration existence (comments or task-text in the graph YAML referencing fields or mechanisms that do not exist in the load pipeline or the graph shape — e.g. `jumps`, `gate`, `template: loop`, `branchTo` → finding), template declaration validity (a `template:` value outside the schema enum `startup` / `router` / `scope-entry` / `review-accept` / `adopt-scope` / `adopting` / `adopt-accept`, or a template_args discriminator shape such as `framework-chain` / `node` → stale-declaration finding, ADR 0245), graph-level constraints presence/format (top-level `constraints` SHALL be a string array of ≤10 prose entries when declared — non-array, oversized, or structural-content entries are findings), unknown phase keys (a key outside the schema surface → finding), flow edge endpoints (every edge source/target resolves to a declared phase id), non-interactive compliance (a graph declaring `interaction: none` with any own-node interaction marker → compliance finding), attached-doc absence (no attached-doc existence check runs — the two-path bundle only, ADR 0244 D3); (2) LLM checks — inventory goal vs task-text semantic drift (content drift without a machine axis, ADR 0183), flow-vs-inventory contradiction, flow condition-vocabulary governance (user-maintained vocabulary drift surfaced for user decision, never auto-applied).

#### Scenario: Graph constraints audited in maintain pass

- **WHEN** graph-maintain audits a graph whose top-level `constraints` block is malformed (non-string entry, >10 entries)
- **THEN** the audit reports a finding with the entry and the violated convention, and the fix proposal covers it

#### Scenario: Inventory/phase mismatch

- **WHEN** the audit finds an inventory entry whose id or type does not match the phase declaration
- **THEN** the audit reports it as a finding with the mismatch evidence

#### Scenario: Content drift without machine axis

- **WHEN** the LLM check finds a phase whose task text semantically diverges from its inventory description
- **THEN** the audit reports it as a finding with the diverging content cited — no machine axis is claimed (ADR 0183)

#### Scenario: In-graph declaration drift

- **WHEN** the audit finds a comment or task-text in the graph YAML referencing a field or mechanism that does not exist (e.g. a retired field such as `jumps`, a retired type such as `gate`, or a retired template such as `template: loop`)
- **THEN** the audit reports it as a machine-check finding with the stale declaration cited

#### Scenario: Template factory form audited

- **WHEN** the audit runs on any graph
- **THEN** a `template: framework-chain` declaration or a `template_args.node` discriminator SHALL be reported as a stale declaration (factory form deleted, ADR 0245)

#### Scenario: Unknown phase key audited

- **WHEN** graph-maintain audits a graph whose phase declares a key outside the schema surface (e.g. `routing`, `mode`, `topic`)
- **THEN** the audit reports a finding per unknown key with the key name and phase id cited, even when the graph fails schema-valid load

#### Scenario: Clean phases yield no unknown-key finding

- **WHEN** the audit finds no phase key outside the schema surface
- **THEN** no unknown-key finding is reported

#### Scenario: Non-interactive graph with interaction markers fails compliance

- **WHEN** a target graph declares `interaction: none` and any of its own nodes carries an interaction marker (task token, interaction skill, or `direct end:` declaration)
- **THEN** the audit SHALL report a non-interactive compliance finding per offending node, citing the matched marker
- **THEN** the finding SHALL enter the fix-proposal pipeline

#### Scenario: Non-interactive graph with zero markers passes compliance

- **WHEN** a target graph declares `interaction: none` and none of its nodes carries an interaction marker
- **THEN** the audit SHALL report the compliance check as clean — no finding, no fix proposal

#### Scenario: Interactive graph not compliance-scanned

- **WHEN** a target graph declares `interaction: enabled` (explicit or absent)
- **THEN** the non-interactive compliance scan SHALL NOT run — no findings, no behavior change

#### Scenario: Flow edge dangling endpoint flagged

- **WHEN** a graph's flow edges reference a phase absent from `phases`
- **THEN** the audit SHALL report a machine finding naming the edge and the missing id

#### Scenario: Flow-vs-inventory drift flagged

- **WHEN** flow edges contradict the inventory's declared goals (LLM judgment)
- **THEN** the audit SHALL report a semantic finding — proposal via the approval gate

#### Scenario: Flow vocabulary governance

- **WHEN** condition labels drift from the user-maintained vocabulary
- **THEN** the audit SHALL surface the drift as a finding for user decision — never auto-applied

#### Scenario: Attached-doc check absent

- **WHEN** the audit runs on any graph
- **THEN** no attached-doc existence check runs — the audit surface covers the two-path bundle only (graph yaml + registry entry)

### Requirement: Fix proposal with mandatory approval

MODIFIED: the audit findings SHALL be converted into concrete fix proposals (one per finding: target, change, rationale). Proposals SHALL be presented for user approval — a mandatory decision gate (maintenance executes only on approval, never autonomously). Declined proposals SHALL be recorded and skipped. Unknown-key findings convert to deletion proposals — each finding proposes removing the cited extra keys from the phase in the graph YAML; the post-execution load-probe validates the cleaned graph loads. Non-interactive compliance findings convert to compliance-fix proposals — each proposes a concrete remedy for the offending node (remove the interaction marker, remove the node, or migrate the interaction to the composing framework graph), with rationale; approved compliance fixes apply across the three-path bundle and SHALL be load-probe validated after execution.

#### Scenario: Proposals approved

- **WHEN** the audit findings convert into proposals
- **THEN** each proposal SHALL be presented for approval
- **AND** only approved proposals SHALL be applied in the execute step

#### Scenario: Proposals declined

- **WHEN** a user declines a proposal
- **THEN** the declined proposal SHALL be recorded and skipped — never applied

#### Scenario: Unknown-key deletion proposed

- **WHEN** an audit finding reports an unknown phase key
- **THEN** the proposal SHALL target the key's deletion from the graph YAML and enter the standard approval flow
- **AND** the load-probe after execution SHALL validate the cleaned graph loads

#### Scenario: Compliance violation converts to fix proposal

- **WHEN** a compliance finding exists for a node in a declared non-interactive graph
- **THEN** the proposal SHALL name the node, the matched marker, and a concrete remedy (remove marker / remove node / migrate interaction upstream)
- **THEN** approval SHALL be required before any fix executes

#### Scenario: Approved compliance fix validates after execution

- **WHEN** a compliance fix is approved and executed
- **THEN** the post-execution load-probe SHALL run (graph_start → expect node → graph_force_end) and SHALL validate the cleaned graph loads

### Requirement: Maintenance execute keeps the three-path bundle consistent

MODIFIED: the execute step SHALL apply approved fixes across the **two-path bundle** (graph YAML + registry entry) in one pass — a registry description update accompanies a graph phase change. No attached doc exists to update (ADR 0244 D3). Load-probe validation SHALL run after execution (graph_start → expect node → graph_force_end), mirroring the maker journey's produce-time validation. The residual "three-path bundle" wording SHALL be gone — the two-path form is the only bundle.

#### Scenario: Phase change with registry description impact

- **WHEN** an approved fix changes a phase in the graph YAML
- **THEN** the registry entry is updated in the same pass and a load probe validates the result — no attached-doc write occurs

### Requirement: Maintenance review and accept

The maintenance pass SHALL end with a review of the executed changes and an accept decision (Continue = accept the pass; rework routes back to audit/propose; End completes the run). Unselected rework routes SHALL stay pending forever and never block completion.

#### Scenario: Review failure routes rework

- **WHEN** the review finds the executed changes inconsistent with the approved proposals
- **THEN** the run routes back to the audit step (bounded rework) instead of accepting

### Requirement: approval SHALL offer direct end for no-fix completion

MODIFIED: the `approval` confirmation node SHALL offer the direct-end option on its final card. When the maintenance audit produced no fixes to apply (or the user declines all fixes), choosing 「无内容可采纳（推荐）」 or 「结束本轮（direct end）」 SHALL complete the run directly (`direct_end: true` → `graph_force_end`) — no graph-external PCL end/finish reliance. The residual "three-path bundle execute" wording SHALL be gone — the two-path form is the only bundle (ADR 0244 D3).

#### Scenario: No-fix maintenance ends directly

- **WHEN** the maintenance audit produces no fixes or the user confirms nothing to apply at `approval`
- **THEN** the final card SHALL present 「无内容可采纳（推荐）」 and 「结束本轮（direct end）」
- **AND** choosing either SHALL terminate the run via `graph_force_end` with no fixes applied

#### Scenario: Fixes confirmed — execution proceeds

- **WHEN** fixes are confirmed at `approval`
- **THEN** the two-path bundle execute SHALL proceed — unchanged (no three-path bundle wording)

### Requirement: Maintenance audit — flow presence and layout

The maintenance audit SHALL check the target graph's flow declaration and layout: (1) machine check — a builtin graph SHALL declare a top-level `flow` block; absence SHALL surface as a problem/finding; (2) LLM check — the top-level key order SHALL follow the canonical layout (`flow` before `inventory`, `constraints` after `inventory`); a layout violation SHALL surface as a finding with a reposition proposal; (3) mermaid compliance — the audit SHALL verify the target graph's flow blocks parse under the real mermaid flowchart grammar: builtin graphs are covered by the suite regression test (dev axis), project graphs by the load-time compliance check results; a non-conformant flow block SHALL surface as a finding with a fix proposal (reword/requote the edge into a mermaid-valid subset form). The checks reuse the audit problem-surfacing channel (findings → fix proposals → approval gate).

#### Scenario: Builtin graph without flow surfaces a finding

- **WHEN** the audit targets a builtin graph that declares no `flow` block
- **THEN** the audit SHALL surface a finding proposing the flow block (sequence/rework edges per the graph's topology)

#### Scenario: Layout violation surfaces a finding

- **WHEN** a graph declares `flow` after `inventory` or `constraints` before `inventory`
- **THEN** the audit SHALL surface a finding proposing the canonical key reposition

#### Scenario: Mermaid-non-conformant flow surfaces a finding

- **WHEN** the audit targets a graph whose `flow` block fails the real mermaid parser (per the load-time check result or suite regression)
- **THEN** the audit SHALL surface a finding with a fix proposal rewording the edge into a mermaid-valid subset form
