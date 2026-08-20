# graph-flow Specification

## Purpose

flow 语法糖执行模型 — 顶层 `flow` 键（mermaid 严格子集）编译为转移表 (node × condition → target)，引擎状态机解释; 前端只报条件值、图定下一步。图 = 权威转移表（round-11 flowchart-interpreter 落地）。

## Requirements

### Requirement: Top-level flow field — mermaid transition syntax

The workflow YAML SHALL declare an optional top-level `flow` field: an array of mermaid-subset transition edges (`A -->|condition| B`), parsed by a deterministic subset grammar (mermaid flowchart LR/TD strict subset — edge arrow + optional bracketed label). Each edge SHALL name a source phase id and a target phase id; the label SHALL be an optional condition value string. An unlabeled edge SHALL be the sequence default. A self-edge (`A -->|fail| A`) SHALL be a legal bounded loop declaration. The subset grammar SHALL remain a subset of the mermaid flowchart grammar: every edge form the engine accepts SHALL parse under the real mermaid parser (compliance enforced by the regression test — see Requirement: Mermaid-format compliance check).

#### Scenario: Unlabeled edge is sequence default

- **WHEN** a flow declares `A --> B` with no label
- **THEN** the edge activates B as the sequence successor of A when no condition matches

#### Scenario: Labeled edge is condition-matched

- **WHEN** a flow declares `A -->|pass| B`
- **THEN** the edge matches only when the reported condition equals `pass`

#### Scenario: Self-edge declares a bounded loop

- **WHEN** a flow declares `review -->|fail| execute` and `execute --> review` chain
- **THEN** a `fail` condition on review routes back to execute — the loop is in-graph, never a sibling-run subgraph

#### Scenario: Engine-subset forms parse under the real mermaid parser

- **WHEN** a flow block declares unlabeled, labeled, or self edges in the engine subset form (hyphenated ids, `__handoff`, bracketed labels)
- **THEN** each edge parses under the real mermaid flowchart parser (the subset is mermaid-valid)

### Requirement: Flow compilation — transition table

The compiler SHALL compile the `flow` edges into a transition table (node × condition → target): for each source node, the labeled edges form the condition→target map and the unlabeled edges form the sequence default. Every edge source and target SHALL resolve to a declared phase id — an unresolvable endpoint SHALL fail load loudly naming the edge. A node with no outgoing flow edges SHALL keep its dependsOn-derived successor set as the sequence default (backward-syntax-equivalent, no compatibility obligation).

#### Scenario: Unresolvable edge endpoint fails load

- **WHEN** a flow edge references a phase id absent from `phases`
- **THEN** graph loading SHALL fail loudly naming the edge and the missing id

#### Scenario: Successor set derives from the transition table

- **WHEN** a node has labeled flow edges
- **THEN** the compiled next-node set for that node SHALL be the transition table entries (condition-matched) plus the sequence default

### Requirement: Condition-matched advance

`graph_advance` SHALL accept an optional `condition` value alongside runId/nodeId: the value SHALL be matched against the reported node's outgoing flow-edge labels; the matched edge's target SHALL be the next activated node. A condition that matches no outgoing edge SHALL fail loudly (missed-condition guard — the graph's interpretation authority). A node reported without a condition SHALL activate its sequence default. The engine SHALL match the value mechanically (string equality) — never interpret prose.

#### Scenario: Condition matches an edge

- **WHEN** advance reports node A with `condition: "pass"` and A has an outgoing `-->|pass| B` edge
- **THEN** B activates as the next node

#### Scenario: Condition matches no edge — loud error

- **WHEN** advance reports node A with a condition that matches no outgoing edge label
- **THEN** the advance SHALL fail loudly (missed-condition guard), never silently default

#### Scenario: No condition — sequence default

- **WHEN** advance reports node A without a condition
- **THEN** A's sequence default (unlabeled edge or dependsOn successor set) activates

### Requirement: Self-loop as inline bounded loop

A flow self-edge SHALL express an inline bounded loop: each pass through the self-edge SHALL increment the target node's retryCount (never zeroed); the loop bound SHALL be the graph's constraint prose (top-level `constraints`, zero machine axis) plus the retryCount. The frontend SHALL NOT perceive the loop — the self-edge node dispatches and advances like any plain node, with no subgraph sibling-run mechanism.

#### Scenario: Loop re-entry increments retryCount

- **WHEN** a `fail` condition routes back to the loop-head node
- **THEN** the loop-head node re-dispatches with its retryCount incremented; the bound check is prose/constraint-based

#### Scenario: Frontend sees a plain node

- **WHEN** the frontend dispatches a loop-head node
- **THEN** the dispatch carries no loop/subgraph mechanism — normal node execute→advance

### Requirement: Jump backward-only guard

A graph-internal jump channel SHALL accept a target restricted to the node's topological ancestors plus the synthesized `__handoff`: a forward jump SHALL be rejected loudly (structure can never be skipped). The jump SHALL reset the target and its downstream terminal nodes to `pending` with retryCount incremented (never zeroed), upstream kept — the graph-internal mirror of the operator `graph_jump` semantics.

#### Scenario: Backward jump accepted

- **WHEN** a jump targets a topological ancestor of the reported node
- **THEN** the ancestor and its downstream terminal closure reset to pending with retryCount incremented; the ancestor re-dispatches

#### Scenario: Forward jump rejected

- **WHEN** a jump targets a node outside the topological ancestor set and not `__handoff`
- **THEN** the jump SHALL be rejected loudly (structure integrity machine-guaranteed)

### Requirement: Condition vocabulary — zero machine validation axis

The condition-value vocabulary SHALL carry zero machine validation axis (like `inventory` `constraints`): labels are prose strings, accepted at load without a closed enum. Runtime matching SHALL be mechanical string equality; vocabulary governance SHALL be the graph-maintain flow audit plus user maintenance (LLM produces the first version, the user maintains — inventory 同轨). No load-time vocabulary enumeration exists.

#### Scenario: Unknown label accepted at load

- **WHEN** a flow edge declares a label outside any predefined set
- **THEN** load SHALL accept it (zero machine axis); governance is the flow audit + user maintenance

#### Scenario: Unmatched value at runtime

- **WHEN** advance reports a condition value that matches no outgoing edge label
- **THEN** the missed-condition guard fires (loud error) — the runtime match is mechanical, the vocabulary is not enumerated

### Requirement: Completion derivation from the flow transition table

NodeDetail `completion.choices` SHALL derive from the node's outgoing labeled flow edges (the flow-defined condition vocabulary — the transition table's condition labels) plus explicit `direct end:` declarations. Task-text backtick token extraction SHALL NOT contribute to completion choices (the backtick channel is retired — the engine reads no prose; the condition vocabulary is declared structurally in the `flow` block). A node with no labeled outgoing flow edges SHALL carry no choices (sequence default).

#### Scenario: Condition labels surface as choices

- **WHEN** a node has outgoing labeled flow edges (`review -->|fail| execute`, `review -->|pass| __handoff`)
- **THEN** its completion choices SHALL be the label set (`fail`, `pass`) — machine-declared from the transition table, never parsed from task text

#### Scenario: Backtick tokens never surface

- **WHEN** a node's task text quotes a phase id in backticks
- **THEN** the token SHALL NOT appear in completion choices (task text is not a completion source)

#### Scenario: No labeled edges — no choices

- **WHEN** a node has only unlabeled outgoing flow edges or no flow edges
- **THEN** its completion SHALL carry no choices (sequence default), with `direct end:` declarations retained when declared

### Requirement: Backtick-target machinery retired

The load-time backtick-target checks SHALL be removed: task-text backtick target existence validation and the jump-verb advisory warning (a rework-condition task line without an explicit backtick target) SHALL NOT produce load errors or graph-asset problems. Flow-edge endpoint validation remains the single machine axis for target resolvability.

#### Scenario: Rework prose without backtick target produces no problem

- **WHEN** a task line describes a rework path without backtick-quoting a target
- **THEN** graph loading SHALL produce no warning and `graph_assets` SHALL carry no problem for it (the rework path is declared in the flow block, not task-text quoting)

#### Scenario: Undeclared backtick target produces no load error

- **WHEN** a task text backticks a string that is not a phase id
- **THEN** the graph SHALL still load (no target-existence error from the backtick channel)

### Requirement: Mermaid-format compliance check

The mermaid-format compliance of flow blocks SHALL be verified by the real mermaid flowchart parser, on two tracks: (1) builtin graphs — the test suite SHALL parse every builtin graph's declared flow block (each edge line within a `flowchart` document) with the real mermaid parser; a parse failure SHALL fail the suite (regression guarantee — the engine subset stays mermaid-valid); (2) project graphs — the load-time contract pass SHALL parse the declared flow block with the real mermaid parser; a non-conformant block SHALL surface as a load-time problem (never a load failure — the run is not blocked), delivered through the existing problems channel to `graph_assets` so the frontend is notified for repair. The engine's deterministic subset parse SHALL remain the load authority (subset-invalid fails loudly, unchanged). The suite SHALL additionally assert full flow coverage for every builtin graph — each declared phase id SHALL appear as a flow-edge source or target (the synthesized `__handoff` excluded from the coverage assertion); a phase absent from the flow block SHALL fail the suite.

#### Scenario: Builtin graph flow block parses under real mermaid

- **WHEN** the test suite runs and a builtin graph's `flow` block contains an edge form the engine subset accepts but the real mermaid parser rejects
- **THEN** the suite fails, naming the graph and the edge (the subset has drifted out of mermaid)

#### Scenario: Project graph with a non-mermaid flow block

- **WHEN** a project graph loads whose `flow` block fails the real mermaid parser (but passes the engine subset parse)
- **THEN** the graph loads (run not blocked) and a load-time problem is recorded, surfaced in `graph_assets` `problems` for the graph

#### Scenario: Builtin graph with an uncovered phase fails the suite

- **WHEN** a builtin graph declares a phase that appears in neither the flow-edge sources nor the flow-edge targets
- **THEN** the coverage assertion SHALL fail the test suite (regression guarantee — the transition surface stays single-sourced in the flow block).

#### Scenario: Project graphs exempt from coverage assertion

- **WHEN** a project graph declares a phase relying on the dependsOn-derived default (no outgoing flow edge)
- **THEN** the coverage assertion does not apply (project graphs keep the dependsOn default; the assertion covers builtin graphs only).
