# execution-output Specification

## Purpose

Defines where execution output lives (conversation / run state / durable artifacts), how feedback reaches the user (decision / status / risk channels), and how sub-agent results return into the main context — replacing the retired run-stream file layer and the dead F1-F5 template system.

## Requirements

### Requirement: Two-tier output model

MODIFIED: execution output SHALL live in exactly one of two tiers: (1) conversation/session — everything the agent says and produces during a run, persisted by the platform, never written to files by the agent and never persisted by the scheduler; (2) durable artifacts — files written for artifacts that outlive the run: user-owned paths declared in a node's output contract (reports, specs, ADRs). The engine-derived deterministic handoff report path is removed — handoff results live in the session (graph-handoff-result-report). Agent-side writes to a workflow runtime directory (`.taskflow/`) SHALL NOT occur. There SHALL be no third "run state" content tier — scheduler state carries progress only.

#### Scenario: Node output lands in run state, not a file

- **WHEN** a main node completes and reports its output
- **THEN** the output SHALL live in the agent session (platform-persisted)
- **AND** no file SHALL be written under `.taskflow/` (or any workflow runtime directory)
- **AND** the scheduler SHALL NOT persist the output text

#### Scenario: Durable artifact only on declared path

- **WHEN** a node produces a deliverable (e.g. architecture review report)
- **THEN** a file SHALL be written only at the user-confirmed path declared in the node's output contract
- **AND** the path SHALL be a repo document location (`docs/…`), never a workflow runtime directory

#### Scenario: Conversation output never persisted by the agent

- **WHEN** the agent reports progress, explains findings, or answers questions
- **THEN** the agent SHALL NOT write any file for that content — the platform session transcript is its persistence

#### Scenario: Handoff result returns to the session

- **WHEN** a graph/subgraph run completes its members and the synthesized handoff node executes
- **THEN** the two-element result (`tasks_done` / `outputs`) SHALL be returned to the session — no report file SHALL be written and no `.graph-scheduler/reports/` path exists
- **AND** the scheduler persists progress only

#### Scenario: Handoff result not in scheduler state

- **WHEN** a handoff node produces its result
- **THEN** the result SHALL NOT be stored in scheduler run state (R9 content/accounting separation holds)
- **AND** the session is its persistence — no cross-run carrier file exists

### Requirement: Run state is scheduler-owned and delivered with dispatch

Node outputs SHALL NOT be stored by the scheduler — scheduler state carries progress only (status/retry/timing). Upstream context (direct dependsOn + `node:` channel targets) SHALL be assembled by the executing agent from its own session — the same agent produced those outputs earlier in the run (platform-persisted; after session compaction the platform transcript remains retrievable). Channels SHALL remain the declaration contract (which upstream outputs a node consumes); the scheduler SHALL NOT store or deliver output content. `graph_status` SHALL return progress only. No truncation exists (no content store).

#### Scenario: Upstream context from payload

- **WHEN** a node is dispatched whose dependsOn or `node:` channels have completed upstreams
- **THEN** the handler SHALL assemble `## Upstream:` blocks from the agent session (outputs the agent itself produced, or platform history recovery after compaction)
- **AND** no payload content and no filesystem read are involved

#### Scenario: Oversized output truncated

- **WHEN** a node produces an output larger than any cap
- **THEN** the full output SHALL remain in the agent session — no truncation marker exists (no scheduler content store)

#### Scenario: Output survives compaction

- **WHEN** the agent session is compacted mid-run
- **THEN** upstream outputs SHALL be recoverable from the platform transcript (platform history addressing) — the scheduler is not a content backup

### Requirement: Feedback channels map to primitives

Feedback SHALL be classified into three channels, each mapped to an existing primitive — no new template system: (1) decision — `approval()` decision cards + Decision Request handoff (Context / Auto-recorded debt / Blocking findings / Dispatch record / Suggested advance label); (2) status — per-node status lines + final report per atom-pilot DISPLAY.md, emitted at node boundaries only; (3) risk — inline conversation reporting for mid-node deviations/impacts plus structured markers.

#### Scenario: Decision feedback persists as run state

- **WHEN** a main node produces a decision (routing or rework)
- **THEN** the decision SHALL be kept in the conversation and routed via `branchTo` (no file write, no scheduler persistence, no endRun — removed, ADR 0215)

#### Scenario: Risk marker without ceremony

- **WHEN** a node detects a constraint or tool-usage violation
- **THEN** the marker SHALL prefix the node output (observability), and mid-node deviation detail SHALL be reported inline in conversation

### Requirement: Sub-agent results return as compact structured receipts

MODIFIED: sub-agent results SHALL enter the main context once, as a compact structured receipt: status + declared output-contract fields + artifact references (`agent://<id>` / file paths), compressed, no process narrative. The receipt's output-pointer field SHALL follow the typed-pointer contract (file path for durable artifacts / platform pointers for same-session). Sub-agents SHALL NOT write persistent files — durable artifacts are produced by the owning node from returned content. Full sub-agent transcripts SHALL remain addressable via platform artifact/history mechanisms, never re-injected wholesale.

#### Scenario: Receipt instead of full text

- **WHEN** a task() sub-agent completes
- **THEN** the main context receives the structured receipt only (status + contract fields + artifact refs)
- **AND** the full transcript SHALL be retrievable on demand via its agent reference

#### Scenario: Sub-agent never persists

- **WHEN** a sub-agent produces a deliverable-worthy result
- **THEN** the sub-agent SHALL return the content in its receipt
- **AND** the owning main node SHALL write any durable artifact

#### Scenario: Receipt pointer follows the typed-pointer contract

- **WHEN** a sub-agent receipt declares an output location
- **THEN** the location SHALL be a typed pointer — file path (durable artifact) or `agent://`/`artifact://`/`history://` (same-session)
- **AND** plain-text location descriptions SHALL NOT be used
