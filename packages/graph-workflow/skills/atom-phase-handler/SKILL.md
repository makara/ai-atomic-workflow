---
name: atom-phase-handler
description: Central dispatch handler - { node, snapshot? } schema and single main dispatch by node.type (main type). Use when processing graph_start/graph_advance/graph_jump response, executing phase nodes, dispatching by node.type.
argument-hint: none (reference + procedure skill)
disable-model-invocation: true
user-invocable: false
version: 2.25.0
last_updated: '2026-08-20'
---

> **Runtime constraints** - use atom-kernel for task() dispatch and approval() decision UI + tool schemas; atom-graph-spec for schema/topology authority (§Constraint Layering in PHASESCHEMA.md). Graph-scheduler MCP tools are not called here - tool detection lives in atom-kernel §Graph-Scheduler Tool Detection for the entry points that do (pilot).

# Atom-Phase-Handler

Handle graph-scheduler CRUD API return data - `{ node: NodeDetail | null, snapshot?: GraphSnapshot }`. Schema: see NODE-SCHEMA.md. Context assembly: see CONTEXT-ASSEMBLY.md. Decision cards: see DECISION-CARDS.md.

---

# Activation Consumption

Project constraints = USER-LAYER fact from the activation boundary (pilot-loaded constraints) - `NodeDetail` has no `runMode`, no `position`, no `executionMode` (subgraph composition is deleted — every dispatched node is a root-graph phase; see NODE-SCHEMA.md); graph-level constraints ARE carried as `node.constraints` dispatch facts (`[graph]`-prefixed; project layer stays a session fact). Source, paths, degrade: see CONTEXT-ASSEMBLY.md §Activation Context Blocks (single home).

---

# Procedure - Single-Node Dispatch

## Input

```
{ node: NodeDetail | null, snapshot?: GraphSnapshot }
```

## Flow

Dispatch per §Dispatch Rules - single authority.

## Return

```
{ nodeId: string, status: "done" | "failed", output: string, durationMs: number, direct_end?: true, condition?: string, jump?: string }
```

Pilot calls `graph_advance` on handler's behalf (nodeId echoes the dispatched node). Advance-channel fields: `condition` = the flow-defined condition value reported on advance (transition-table routed; the chosen decision option's stable `value` or an explicit report field); `jump` = a backward rework target (backward-only — the engine restricts it to the node's topological ancestors ∪ `__handoff`); `direct_end: true` = direct-end adapter completion. None present → plain continue (sequence default).

## Run Frame Block

Every dispatch (main) prepends a deterministic frame block - the transcript-level declaration of run position and the user-input contract. The frame is the SINGLE run-frame signal: the signal layer does not inject frames through platform seams. The per-call discipline echo (graph-fidelity, per the seam-map standard) is a one-line DERIVATION of this frame - an IDENTITY POINTER rendered by the pure `renderIdentityEcho` function (latest run-id anchored frame in the outgoing message array -> `▣ [seam] node <id> · N/M`; glyph visual anchor + `[seam]` machine anchor; the frame's facts are never copied - the frame block already sits in the same message). The frame carries the optional progress segment (`· N/M` - node index / total node count from the dispatch snapshot; the echo renders it when present, omitted otherwise) and the mechanical-tier marker (`· tier mech` - seam-live only; degrade omits) - the marker makes the tier a node-input fact, no seam self-detection. The `Run <uuid> · node <id>` prefix anchor is the identity contract.

```
## Run Frame
Run <runId> · node <nodeId> · <N/M> · type main · tier mech · task: <one-line from node.task>
declared operations [<node.operations>] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.
Do not start work outside the node. On completion: report node output, then graph_advance.
```

Assembly rules:

- Position: FIRST block of the node context - before the Context/Constraints/Checks blocks (CONTEXT-ASSEMBLY.md step 4 prepend order — the consolidated 4-block set).
- Deterministic: generated from dispatch fields (runId, nodeId, type) + one-line task summary (first line of node.task) + `node.operations` (`nodeOperations` absent -> unconstrained, no out-of-scope line). The declared operations line is the SINGLE render point for `node.operations` — no separate Class block exists (display-minimalism law 2: one render point per fact; adopt-scope-and-handler-blocks consolidation).
- Progress segment: `· N/M` - node index in run order / total node count (from the dispatch snapshot `progress` line or `nodes` array + `nodeCount`); snapshot absent or node not found -> omit the segment (the echo degrades to the bare identity pointer).
- Optional marker: `· tier mech` - seam-live only (same detection as §Display Tiering); degrade omits it (the marker = the node-input tier fact).
- Purpose: signal distribution - the last authoritative text before the agent acts is the frame, not the raw user message. Reclassification, not suppression (G2).

# Constraints Block Format

Assembly rules (bullets, source prefixes, lang/git dedup, 2 KB cap) per `atom-graph-spec` §Constraint Layering. The block merges two sources: `[graph]`-prefixed entries (dispatch facts — `node.constraints`, read by the scheduler from the loaded graph definition, unbypassable) + `[project]`-prefixed entries (activation session fact — pilot-loaded compiled artifact). Layered append, conflicts preserved (never silently dropped); cap/dedup apply to the merged block. Block shape:

```
## Constraints

- [graph] <constraint 1>
- [project] <constraint 2>

Output must satisfy constraints above. State compliance per rule before return — see Checks block.
```

# Checks Block

Every main node output closes with ONE `## Checks` block. Display tiering (seam-live detection): while the recent user messages carry a canonical `[seam]` line (graph-fidelity present), the handler SHALL NOT assemble the prose Checks block - the mechanical single line is the feedback (violation markers still prefix the node output on violation). In the degrade baseline (no `[seam]` line), the block renders as ONE line with green rows collapsed:

```
## Checks: constraints ok · tools n/a · reasoning ok · ctx A <n> · B <n> · C <n> · L3 <n> · out ~<n> tok
```

Violation rows expand with detail (one expanded segment per violated axis); the four former sections (`Constraint check:` / `Tool usage check:` / `Reasoning check:` / `Context usage check:`) do not exist as separate sections. The block is unconditional in the degrade baseline - zero-activity nodes report zero-value rows.

```
## Checks
- constraints: ok | violation ×N
- tools: <chain-head evidence per declared class> | n/a: <structural reason>
- reasoning: <carriers> | n/a
- context: A <n> · B <n> · C <n> · L3 <n> · output ~<n> tok
```

- **constraints row** - one line: `ok`, or `violation ×N` (unsatisfied rule count with evidence). Marker per §Markers (surfaces in result table + decision-card pre-call).
- **tools row** - one line per declared scenario (operation class x target domain): adapter chain-head evidence or named `n/a: <structural reason>` (never silent; causes: `not indexed` / `project-root-bound` / `no LSP coverage` / `proxy down` / `threshold not met` / `no scenario coverage` — the last when the declared class does not resolve to a scenario registry key). Missing evidence per declared class -> violation.
- **reasoning row** - one line per carrier, `n/a` with structural reason allowed, never silent (carriers: CONTEXT.md glossary terms, ADR decision, change design/report chain). Term deltas are user-confirmed at adoption (adopting node) - implementation executes them, never invents.
- **context row** - per-node estimate, one line per class: A reference (injected channels, slices read), B working (cleaning, retrievals), C growth (history estimate, summary layers), L3 prune count, plus output figure. Output figure semantics: R2 cost economy is suspended - the seam line carries no metering segment, so the row always reports the agent estimate (`~N tok`; no measured ledger exists to reference). Values factual for the executed node (as-was, auditable).

Violation semantics - markers are generated by the check, never self-issued (emission per §Markers): no Checks block -> all declared scenarios violated.

## Markers

Single emission spec - one rule per marker:

|Marker|Emission rule|
|-|-|
|`[CONSTRAINT VIOLATION: <count>]`|Checks block present, `constraints:` row violation count > 0 -> prefix output with the count.|
|`[TOOL USAGE VIOLATION: <count>]`|Checks block present with any `violated` tools line, or no Checks block (all declared classes counted as violated) -> prefix output with the count.|
|`[REASONING VIOLATION: <count>]`|Checks block missing, or `reasoning:` row carriers missing without `n/a` -> prefix output with the count.|

## Tool Usage Check Resolution

Main dispatch: declared operation classes - `node.operations` (wins on conflict) + the dispatched skill's `### Operation classes`. The Tool usage check rows are evidence-only; declared classes resolve against the scenario-keyed hint registry keys (find/read/write/verify/run/review) — an unresolved class reports `n/a: no scenario coverage` instead of silently passing. Block format + assembly: see CONTEXT-ASSEMBLY.md §Main Inline Context Assembly step 4 (single home). No declared classes -> no assembly, no warning.

## Todo Lifecycle (node boundary)

Platform todo lists = node-scoped execution scratchpads - execution-trace, never session-persistent. Handler enforces per node type:

1. **Dispatch clear** - before task execution: `todo()` clear (contract: atom-kernel §todo() - Boundary Clear).
2. **Completion clear** - after output/decision report, before return: `todo()` clear - unconditional on success/failure.
3. **Propagation** - node todo never forwarded to subagents (platform strips at spawn); subagent todos child-scoped, cleared at child yield.

---

# Dispatch Rules

Single main path - every dispatched node runs the `main` type; `node: null` completes.

### main type

`node.type = "main"` - Main execution = tool-call execution. Execution core delegates to atom-kernel §Tool Schemas + §Tool Discipline; handler supplies machinery only. Decision cards assemble from `node.completion` (choices / direct_end — machine-declared; no `rework` field, no `routing.actions` wording, no task-text parsing for card options).

0. Clear todo per §Todo Lifecycle (dispatch clear).
1. Assemble inline context blocks when `node.channels` / `node.dependsOn` present - see CONTEXT-ASSEMBLY.md §Main Inline Context Assembly (decision-UI block main-only; constraints block per §Constraints Block Format).
2. **Agent hints block** - when `node.agent` is present, append a `## Agent hints:` block (priority-ordered list — first available wins, fallback platform default) to the assembled context; the executing agent prefers those types when dispatching sub-agents via task(). Absent `node.agent` -> no block. Composing members never carry it (schema-enforced).
3. Display tiering check per §Display Tiering (seam-live detection) - determines Checks assembly below; no Context hints block is ever assembled (removed, display minimalism).
4. Execute tool calls per atom-kernel §Tool Schemas (factual parameters) — tool discipline hints (serena-remind / jcm-read-guard / edit-guard / write-reindex) are delivered by graph-fidelity on every match. Every dispatched node is a root-graph phase — subgraph composition is deleted (graph-subgraph-route-unify); nested execution is the router sibling run launched inside the node (no namespaced member dispatch, no boundary delegation, no batch assembly, no structured output package).

**Router template nodes** (`node.template_args.paths` present — machine-declared candidate graphs, graph-router-template): the node's work = selection + sibling-run launch, executed through this same main path. Selection follows DECISION-CARDS.md §Router Template Selection — auto (single candidate / satisfied hard criterion) or a recommendation card (options = `node.template_args.paths`, never task-text parsing); the chosen graph runs as a sibling run (`graph_start` → drive to completion) inside the node; the node reports `chosen_graph` / `run_id` / result fields. No `branchTo` — the path activation is the sibling run.

**Flow condition nodes (loop self-edge / labeled edge)** — loop-head nodes are plain main nodes (no template — the `loop` template is removed); the loop is a top-level `flow` self-edge (`A -->|fail| A` — inline bounded loop, condition-matched re-entry, graph-flow capability). The node's work = the normal main execution; its task text evaluates the loop condition inline (bound in the task text / the graph's constraints prose — agent-enforced; the engine increments `retryCount` on condition-matched re-entry, the machine signal the agent-side bound check observes). The node's decision output carries the condition value reported on advance — the chosen option's stable `value` (flow-defined vocabulary) or an explicit `condition` field in the node report; the pilot maps it to the `condition` param of `graph_advance` (transition-table routed; a backward rework determination rides the advance `jump` channel, backward-only).

5. Checks scan - assemble the `## Checks` block per §Checks Block (single-line in the prose tier; skipped in the mechanical tier, markers still prefix output on violation); count violations; > 0 -> prefix markers per §Markers. MUST run before output report so markers land in the node report.

6. Report the node output - keep it in the agent session (platform-persisted); the advance carries progress only (`status`, `durationMs` — no output param, no scheduler content store, no file writes). Report format: concise prose summary per atom-pilot DISPLAY.md §Node report format - never a JSON code fence; empty output (no reportable content) -> no code block.

7. Measure wall-clock duration via `Date.now()`.

8. Clear todo per §Todo Lifecycle (completion clear).

9. Collect result - map to `{ status, output, durationMs }`.

## Display Tiering (seam-live detection)

Display feedback has two tiers (display minimalism - the three laws, per CONTEXT.md `display minimalism`). Detection: scan the most recent user messages for a canonical `[seam]` line - present = graph-fidelity live; absent = degrade baseline. Tier effects:

- **Mechanical tier (seam live)**: the plugin's single echo line is the ONLY per-call feedback. The handler SHALL NOT assemble the prose Checks block (markers still prefix output on violation) and SHALL NOT assemble Context hints (removed - the frame and constraints already carry the selection and discipline facts).
- **Prose tier (degrade)**: minimal prose baseline - single-line Checks block per §Checks Block, no Context hints block. Behavior correctness is identical in both tiers (fail-open — degrade never restricts behavior); degrade is fail-safe (a broken plugin reverts to prose automatically).
- **Tier enforcement**: the `· tier mech` marker makes the tier a node-input fact - comply from the frame, no self-detection.

# Error Handling

|Scenario|Response|
|-|-|
|`node.type = "main"` with no `node.task`|`status: "failed"`, output: "Main phase requires task field"|
|Channel resolution fails / no results for `node.channels`|`status: "failed"` - "Context resolution failed: <error text>" / "No files matched channel pattern: <pattern>"|
|task() dispatch fails (skill-side)|`status: "failed"`, output: "<error text>"|

Activation degrade: handled at its flow step (§Activation Consumption) - not restated here.

### null node

Graph complete. Return `{ done: true, snapshot }`.
