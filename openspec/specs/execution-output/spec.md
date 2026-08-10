# execution-output Specification

## Purpose

Defines where execution output lives (conversation / run state / durable artifacts), how feedback reaches the user (decision / status / risk channels), and how sub-agent results return into the main context — replacing the retired run-stream file layer and the dead F1-F5 template system.

## Requirements

### Requirement: Three-tier output model

Execution output SHALL live in exactly one of two tiers: (1) conversation/session — everything the agent says and produces during a run, persisted by the platform, never written to files by the agent and never persisted by the scheduler; (2) durable artifacts — files written ONLY when the artifact outlives the run AND the graph declares a user-owned path (reports, specs, ADRs). Agent-side writes to a workflow runtime directory (`.taskflow/`) SHALL NOT occur. Ephemeral display artifacts (interactive HTML reviews) SHALL go to the OS temp directory, never the repo. There SHALL be no third "run state" content tier — scheduler state carries progress (status/retry/timing) only.

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

Feedback SHALL be classified into three channels, each mapped to an existing primitive — no new template system: (1) decision — `approval()` decision cards + Decision Request handoff (Context / Auto-recorded debt / Blocking findings / Dispatch record / Suggested advance label); (2) status — per-node status lines + final report per atom-pilot DISPLAY.md, emitted at node boundaries only; (3) risk — inline conversation reporting for mid-node deviations/impacts plus structured markers (`[CONSTRAINT VIOLATION]`, `[TOOL USAGE VIOLATION]`) and gate jumps. The legacy five-channel spec (`docs/feedback.md`) SHALL stay deleted; the classification SHALL live in atom-pilot DISPLAY.md.

#### Scenario: Decision feedback persists as run state

- **WHEN** an approval or gate decision is made
- **THEN** the decision SHALL be parsed in-session for routing (`branchTo`/`endRun`) and kept in the conversation — no file write, no scheduler persistence

#### Scenario: Risk marker without ceremony

- **WHEN** a node detects a constraint or tool-usage violation
- **THEN** the marker SHALL prefix the node output (observability), and mid-node deviation detail SHALL be reported inline in conversation

### Requirement: Sub-agent results return as compact structured receipts

Sub-agent results SHALL enter the main context once, as a compact structured receipt: status + declared output-contract fields + artifact references (`agent://<id>` / file paths), compressed, no process narrative. Sub-agents SHALL NOT write persistent files — durable artifacts are produced by the owning node from returned content. Full sub-agent transcripts SHALL remain addressable via platform artifact/history mechanisms, never re-injected wholesale.

#### Scenario: Receipt instead of full text

- **WHEN** a task() sub-agent completes
- **THEN** the main context receives the structured receipt only (status + contract fields + artifact refs)
- **AND** the full transcript SHALL be retrievable on demand via its agent reference

#### Scenario: Sub-agent never persists

- **WHEN** a sub-agent produces a deliverable-worthy result
- **THEN** the sub-agent SHALL return the content in its receipt
- **AND** the owning main node SHALL write any durable artifact
