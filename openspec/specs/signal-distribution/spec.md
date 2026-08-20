## Purpose

signal-distribution is the single standard for how signals enter, land, and live in the model context across platform seams — a seam map (class C1–C4 × seam × fidelity L0–L3) with the seam law, the platform native tier, and the seam-mapping clause. Graph discipline shapes agent attention through declared seams without tool denial; platform-native context mechanics are adopted, never re-implemented.

## Requirements

### Requirement: Classification lattice (seam map)

The signal distribution SHALL classify every distributed signal on a single lattice — one coordinate per signal: primary class C1 control > C2 frame > C3 instruction > C4 context (authority priority), seam (the platform event or assembly point that emits it), and fidelity tier L0 verbatim / L1 condensed / L2 mapped / L3 pruned. The seam SHALL carry the timing (pre-emission per-turn, per-call, per-request, or in-flight; post-hoc observation legal), the default position (after user message, user channel, system sections, tool-result prefix), and the rewrite capability (full message array, payload, system prompt, input text, tool call, tool result, summary) of its emission point. The seam map SHALL be the single classification standard — position-slot vocabulary (S1–S5) and axis narratives (three-axis standard, lifecycle ladder) exist only as historical references. The atomic needs R1 selection / R2 position / R3 boundary / R4 fidelity / R5 authority are the lattice's needs-basis, never a parallel coordinate system. The seam set SHALL be enumerated in the standard: assembly, before_agent_start, context, before_provider_request, input, tool_call, tool_result, session.compacting, ttsr, steer (sendMessage), frame (handler assembly), checks (handler output).

#### Scenario: every signal carries one coordinate

- **WHEN** any signal is emitted by the signal layer, the handler assembly, the fidelity planner, or a graph seam extension
- **THEN** the signal carries a class C1–C4, exactly one seam from the enumerated set, and a fidelity tier L0–L3

#### Scenario: S4 does not exist

- **WHEN** the position coordinate of a seam is enumerated
- **THEN** no tool-surface annotation slot exists — the tool surface is governed through the tool_call and tool_result seams, and the run frame is the single out-of-scope channel

#### Scenario: needs are basis, not axis

- **WHEN** the standard is referenced in a review or audit
- **THEN** R1–R5 are referenced as the lattice's needs-basis, never as an additional coordinate system

### Requirement: Seam law

Each signal class SHALL have exactly one emission seam — no dual emission of the same semantic signal through two seams. A seam SHALL be chosen per class in the seam map: C1 control via steer or input-seam marking, C2 frame via handler assembly plus per-call discipline echo (context seam), C3 instruction via the user channel, C4 context via assembly and fidelity seams.

#### Scenario: no dual emission

- **WHEN** the discipline boundary of a node is distributed
- **THEN** the handler frame carries it at dispatch, and the per-call discipline echo (context seam) renders from that frame — the echo is a derivation, not a second assembly, and no other seam emits the same boundary signal

#### Scenario: PCL single seam

- **WHEN** a PCL utterance is classified during an active run
- **THEN** it routes through the pilot contract (input seam marking is observational only when enabled) — no second classification path emits a routing signal

### Requirement: Platform native tier

The lattice SHALL adopt platform-native mechanisms as the implementation of record where they exist, without re-implementation: L3 superseded and useless pruning (`compaction.supersedeReads` default-on, `compaction.dropUseless` — label "Elide Uneventful Results"), compaction suite (auto/mid-turn/idle/remote/snapcompact), programmatic steer (`sendMessage` deliverAs steer), context accounting (`getContextUsage`). The standard SHALL declare each native mechanism as the native tier for its coordinate; graph-side code SHALL NOT re-implement a native mechanism.

#### Scenario: native supersede governs

- **WHEN** a repeated read of the same file produces a newer result on OMP
- **THEN** the platform prunes the stale result (native tier), and no graph-side fidelity code duplicates the operation

#### Scenario: native mechanisms documented

- **WHEN** the standard is read
- **THEN** it lists each native mechanism with its coordinate mapping and the setting/API that governs it

### Requirement: Node-scoped tool-call classification

REPLACED BY the classification lattice: the signal layer SHALL NOT classify tool calls after emission (no tool-call observation → classify → redirect loop); the stale call-level classification surface is removed. Discipline for out-of-scope operation classes is carried pre-emission by the handler frame (declared + out-of-scope list); no in-flight reminder rule is distributed (static TTSR rule delivery retired, ADR 0153). No tool-surface annotation exists.

#### Scenario: review node code-write drift

- **WHEN** the active node declares no write operation and a write/edit tool call targets an in-project code path
- **THEN** no post-hoc discipline signal is produced by the signal layer; the out-of-scope declaration arrived pre-emission in the handler frame, and no in-flight reminder rule is distributed

#### Scenario: declared operation never signals

- **WHEN** the active node declares the write operation and a write tool call targets a code path
- **THEN** no discipline signal is produced and no out-of-scope note appears on write tools

#### Scenario: text targets are not phase-scoped

- **WHEN** a tool call targets a non-code path (text/special/out-of-project)
- **THEN** no phase-scoped signal is produced

### Requirement: Signal distribution without denial

The signal distribution SHALL distribute discipline signals through platform seams without denial: the per-call discipline echo (graph-fidelity, context seam) is the platform seam; no static TTSR rule is distributed — the project rule file was DELETED (ADR 0154; previously retired per ADR 0153 — no rule asset remains in the package). Tool capability SHALL be identical with and without the distribution active. The run frame's pre-emission declaration is the single out-of-scope channel; the tool_call blocking seam exists on the platform but is NOT used (hints-not-controls philosophy — a choice, not a capability limit).

#### Scenario: drift produces a signal, never a block

- **WHEN** a discipline-relevant out-of-scope code write is attempted
- **THEN** the pre-emission declarations (handler frame + per-call echo) are the only signals — no in-band TTSR reminder is distributed — and the tool call is not blocked.

#### Scenario: tool surface unchanged functionally

- **WHEN** the distribution is active on a node that declares no write operation
- **THEN** write-capable tools remain present, callable, and functional; no tool-description annotation is produced.

#### Scenario: No project rule file remains

- **WHEN** the graph-fidelity package is inspected for rule assets
- **THEN** no `rules/` directory SHALL exist in the package — the discipline rule body was deleted, not retained

### Requirement: Per-turn frame injection (with per-call discipline echo)

The run-frame signal SHALL be assembled exactly once per dispatch by the agent-side handler (single assembly point holding dispatch facts: run id, node id, type, one-line task, declared operations). The signal layer SHALL NOT inject full run-frame content through platform seams — OMP `before_agent_start` frame messages, opencode `experimental.chat.system.transform` frame appends, and context-seam full-frame injections SHALL NOT exist. A per-call discipline echo SHALL be permitted: the context seam (OMP) and `messages.transform` (opencode) MAY insert a single discipline line rendered from the latest run frame in the outgoing message array by a pure function (per graph-fidelity) — a derivation of the handler frame, never a second assembly, carrying a `[seam]` marker and appended to the most recent user message per call.

#### Scenario: frame present after user message

- **WHEN** a run is active and a user message is sent on OMP
- **THEN** the run-frame signal the model receives is the handler dispatch assembly; the signal layer injects no full platform frame

#### Scenario: discipline echo per call

- **WHEN** a node runs multiple LLM calls and the discipline-echo seam is enabled
- **THEN** each outgoing request carries one discipline line appended to the most recent user message (S1 position), rendered from the node's frame, with a `[seam]` marker; requests without a frame in the message array carry no echo

#### Scenario: echo is derivation, not assembly

- **WHEN** the echo is compared with the handler frame
- **THEN** the echo's discipline text is a deterministic function of the frame's declared-operations line — tests pin the two sides identical, and the echo never adds facts absent from the frame

#### Scenario: no plugin frame

- **WHEN** a platform hook fires (OMP `before_agent_start`, opencode transform)
- **THEN** no run-frame message or frame append is produced by the signal layer

#### Scenario: handler frame carries discipline declaration

- **WHEN** the handler assembles the run-frame block for a main node
- **THEN** the block lists the declared operations and the undeclared discipline operations as out of scope

### Requirement: Signal lifecycle ladder

The signal distribution SHALL manage every distributed signal through a four-tier fidelity ladder — L0 verbatim (protected items, full fidelity, resident), L1 condensed (compressed via the compress adapter, retrievable by hash), L2 mapped (pointer/map-header only, full content restored on demand), L3 pruned (removed from context — superseded, consumed, stale, or orphaned signals exit entirely). Hot-content placement doctrine (every-dispatch content in SKILL.md bodies) is the L0 tier's placement rule; cold content behind pointers is the L2 tier. The ladder SHALL be the single standard for fidelity decisions — no separate compression, placement, or cleaning doctrines.

#### Scenario: L3 prune of superseded read

- **WHEN** a repeated same-args read produces a newer result
- **THEN** the previous result is pruned (L3), not compressed, and the newer result is kept

#### Scenario: Consumed upstream output prunes

- **WHEN** a downstream node or gate has consumed an upstream node output
- **THEN** the output's L0 copy is pruned and demoted to an L2 pointer, restorable on demand

#### Scenario: Protected items never leave L0

- **WHEN** an item is on the protection list (decisions, receipts, node outputs, write results, skill injection, task text)
- **THEN** it stays at L0 — never condensed, never mapped, never pruned while live

### Requirement: Prune laws

Four prune laws SHALL govern L3 transitions: superseded (a newer version of the same information enters), consumed (the consuming node completed), stale (unused for the documented number of turns; errored inputs immediately), orphaned (no downstream reference, no protection-list qualification). Prune decisions SHALL be documented in the context-usage ledger of the acting node (`## Checks` context line reports L3 counts). Prune is deletion — a pruned signal SHALL NOT be re-added by the same node.

#### Scenario: Stale working content prunes

- **WHEN** a working-face tool output has not been touched for the documented stale window
- **THEN** it is pruned from the session, reported as an L3 count in the node's Checks context line

#### Scenario: Orphaned content never enters

- **WHEN** a candidate context item has no downstream reference and no protection-list qualification
- **THEN** it is pruned at the gate — it never enters the context

### Requirement: Prune laws mechanized (ownership realigned)

The four prune laws (superseded, consumed, stale, orphaned) SHALL be enforced per tier: superseded and useless = platform-native on both faces (OMP `compaction.supersedeReads` default-on + `compaction.dropUseless`; opencode platform-native equivalents — no graph-side re-implementation, ADR 0170); consumed = agent discipline (Checks L3 counts; prose fallback when the plugin is absent) with platform-native residue handling; stale and orphaned = platform idle compaction plus agent discipline. No graph-fidelity context-seam elision is SHIPPED (removed, ADR 0170/0171); no session.compacting archive joins the mechanized surface — the platform owns compaction summaries and residue.

#### Scenario: Superseded signal

- **WHEN** a newer version of the same signal enters the context
- **THEN** the older version is pruned by the platform-native tier (or marked recoverable) rather than retained at full fidelity — no graph-side fidelity code duplicates the operation

#### Scenario: Consumed output elides

- **WHEN** a downstream node or gate has consumed an upstream node output and the plugin is installed
- **THEN** no graph-side elision or L2 pointer is emitted — the module ships no consumed-elision (ADR 0170); the consuming node reports the L3 discipline in its Checks context line, and platform-native residue handling applies

#### Scenario: Absence is backlog

- **WHEN** a (class, seam) coordinate has no implementation in the current deliverable
- **THEN** the mapping table marks it backlog, and no requirement text declares an absence "SHALL be a recorded deviation" or "platform capability boundary"

#### Scenario: Consumed law mechanical

- **WHEN** a consumer node completes its dispatch and the plugin is installed
- **THEN** no mechanical graph-side elision exists — the consumed law remains agent-disciplined with platform-native residue handling (the module's mechanical tier covers echo, reduction, compression, settlement, and metering only)

#### Scenario: Consumed law prose fallback

- **WHEN** the plugin is absent
- **THEN** the consumed law remains agent-disciplined (Checks self-report, L3 count)

### Requirement: Post-hoc wording refined

The classification standard states "zero post-hoc behavior-redirection classification": post-emission classification that redirects behavior is forbidden; history fidelity operations that run at emission (before the next request is fixed) are legal. Post-hoc OBSERVATION through platform events (tool_result, after_provider_response, message_end, auto_compaction_end) is legal and SHALL feed audit and reporting.

#### Scenario: Documentation

- **WHEN** the classification standard is read
- **THEN** it distinguishes behavior-redirection (forbidden) from emission-time fidelity operations and post-hoc observation (legal)

### Requirement: Reclassification law unchanged

The reclassification law (frame reclassifies user text into node data; PCL reclassifies user text into routing) is unchanged by this change. The input seam (platform `input` event) MAY mechanically detect and mark PCL vocabulary — detection only; routing execution stays pilot-owned.

#### Scenario: PCL

- **WHEN** the user sends a PCL utterance during an active run
- **THEN** it routes as process control before node-input classification

#### Scenario: input seam observational

- **WHEN** the input-seam marking is enabled and a PCL utterance is detected
- **THEN** the utterance is marked or observed, and routing still executes through the pilot contract — the seam never routes on its own

### Requirement: Seam mapping clause

The lattice SHALL map every (class, seam) coordinate to exactly one implementation: platform native, graph extension (graph-fidelity), or agent discipline. Platform capabilities SHALL be verified against the pinned npm platform package by the probe suite (drift guard); a capability absence that cannot be implemented inside the deliverable SHALL be a backlog row, and the standard SHALL NOT contain "recorded deviation" or "platform capability boundary" clauses. The OMP face has emission-side seams (context, before_provider_request) and native L3 mechanics — R4 fidelity on OMP is native tier plus graph-side errored-result reduction and class-driven compression, not agent-discipline-only.

#### Scenario: OMP face mapped

- **WHEN** the standard's mapping table is read for the R4 (fidelity) coordinate on the OMP face
- **THEN** it lists platform native (supersedeReads / dropUseless / compaction), the context seam (errored-result reduction + class-driven compression), and the probe group that verifies the seam against the npm package — no boundary clause

#### Scenario: no deviation clauses

- **WHEN** a grep runs over the standard
- **THEN** zero hits for "recorded deviation" and zero hits for "platform capability boundary"

### Requirement: Seam mapping table

The standard SHALL carry a mapping table — every (class, seam) coordinate maps to exactly one implementation owner, with its verifying probe group and backlog status. The table is the seam-mapping clause's operative form: absence of an implementation SHALL be recorded as a backlog row, never as a platform capability boundary. The table SHALL additionally carry the class–tag mapping for context management per graph-fidelity-context-classification:

|Class|Seam|Implementation owner|Probe group|Backlog|Context-management mapping|
|-|-|-|-|-|-|
|C1 control|steer / input-seam marking|platform native + pilot|—|—|**protected — leave** (static control-plane list: `mcp__graph_scheduler_*`, task/ask/approval family)|
|C2 frame|handler assembly + context-seam echo|graph-fidelity (agent-side)|—|—|**protected — leave**|
|C3 instruction|user channel|platform native|—|—|**protected — leave**|
|C4 context|assembly + fidelity seams|graph-fidelity-context|—|—|**four-dimension tag decision** (producer / processing state / usage timing / content level)|
|Observability (message_end / tool_execution_* / auto_compaction_end / ttsr_triggered)|post-hoc events|platform native + graph-fidelity (telemetry)|—|—|— (audit/telemetry only; no context-management action)|

#### Scenario: mapping table verifiable

- **WHEN** the standard's mapping table is read for any (class, seam) coordinate
- **THEN** it lists exactly one implementation owner, the verifying probe group, and backlog status — never a boundary clause

#### Scenario: class–tag mapping rows present

- **WHEN** the mapping table is read for the context-management consumption of the lattice
- **THEN** one row per class coordinate (C1–C4) states the tag-system mapping: C1/C2/C3 protected (leave), C4 tag-driven — consistent with the first-principles comparison table A

#### Scenario: observability seam covers tool execution

- **WHEN** the seam mapping table enumerates observability events
- **THEN** the observability entry includes `tool_execution_*` events in addition to `message_end`, `auto_compaction_end`, and `ttsr_triggered`

### Requirement: Deploy copy generation ownership

Deploy copies for platform-seam extensions are retired. `scripts/gen-manifests.mjs` SHALL generate manifest documents only (marketplace catalog + skills.sh groupings) with package-path references; it SHALL NOT emit platform deploy copies. Hand-written or generated repo-level extension shims are prohibited.

#### Scenario: generator emits the shim

- **WHEN** `yarn manifests` runs
- **THEN** the generator emits no deploy shim — only `.claude-plugin/marketplace.json` and `skills.sh.json` are (re)written, and no `.omp/extensions/` file is produced

#### Scenario: generator emits manifests only

- **WHEN** `yarn manifests` runs
- **THEN** only `.claude-plugin/marketplace.json` and `skills.sh.json` are (re)written, and no `.omp/extensions/` file is produced
