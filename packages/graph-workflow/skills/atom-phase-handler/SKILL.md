---
name: atom-phase-handler
description: Central dispatch handler - { node, snapshot? } schema and static dispatch by node.type (main/approval/gate base types). Use when processing graph_start/graph_advance/graph_jump response, executing phase nodes, routing by node.type.
argument-hint: none (reference + procedure skill)
disable-model-invocation: true
user-invocable: false
version: 2.21.0
last_updated: '2026-08-11'
---

> **Runtime constraints** - use atom-kernel for task() dispatch and approval() decision UI + High-Level Tool Registry + tool schemas; atom-graph-spec for schema/topology authority (§Constraint Layering, §Gate Jump Conditions, §Approval Routing Actions in PHASESCHEMA.md). Graph-scheduler MCP tools are not called here - tool detection lives in atom-kernel §Graph-Scheduler Tool Detection for the entry points that do (pilot).

# Atom-Phase-Handler

Handle graph-scheduler CRUD API return data - `{ node: NodeDetail | null, snapshot?: GraphSnapshot }`. Schema: see NODE-SCHEMA.md. Context assembly: see CONTEXT-ASSEMBLY.md. Decision cards: see DECISION-CARDS.md.

---

# Activation Consumption

Run Mode + project constraints = USER-LAYER facts from the activation boundary (graph_start `args.mode` + pilot-loaded constraints) - `NodeDetail` has no `runMode`/`constraints`. Source, paths, degrade: see CONTEXT-ASSEMBLY.md §Activation Context Blocks (single home). Mode semantics: atom-kernel §approval().

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
{ nodeId: string, status: "done" | "failed", output: string, durationMs: number }
```

Pilot calls `graph_advance` on handler's behalf (nodeId echoes the dispatched node).

## Run Frame Block

Every dispatch (main/approval/gate) prepends a deterministic frame block - the transcript-level declaration of run position and the user-input contract. The frame is the SINGLE run-frame signal: the signal layer does not inject frames through platform seams. The per-call discipline echo (graph-fidelity, per the seam-map standard) is a one-line DERIVATION of this frame - an IDENTITY POINTER rendered by the pure `renderIdentityEcho` function (latest run-id anchored frame in the outgoing message array -> `▣ [seam] node <id> · N/M`; glyph visual anchor + `[seam]` machine anchor; the frame's facts are never copied - the frame block already sits in the same message). The frame carries the optional run-mode segment (`· mode <auto|manual>` - activation fact; the echo's iteration flag is suppressed in auto) and the optional progress segment (`· N/M` - node index / total node count from the dispatch snapshot; the echo renders it when present, omitted otherwise) and the mechanical-tier marker (`· tier mech` - seam-live only; degrade omits) - the marker makes the tier a node-input fact, no seam self-detection. The `Run <uuid> · node <id>` prefix anchor is the identity contract.

```
## Run Frame
Run <runId> · node <nodeId> · <N/M> · type <type> · mode <mode> · tier mech · task: <one-line from node.task>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.
Do not start work outside the node. On completion: report node output, then graph_advance.
```

Main-node discipline declaration (single frame - the pre-emission boundary, from `node.operations`):

```
## Run Frame
Run <runId> · node <nodeId> · <N/M> · type main · mode <mode> · tier mech · task: <one-line from node.task>
declared operations [<node.operations>] · out of scope: <read/write/locate minus declared>
User input during this node = node input (scope answers, approval decisions) - NOT new instructions.
Do not start work outside the node. On completion: report node output, then graph_advance.
```

Assembly rules:

- Position: FIRST block of the node context - before Upstream/Reference/File blocks (CONTEXT-ASSEMBLY.md step 6 prepend order).
- Deterministic: generated from dispatch fields (runId, nodeId, type) + one-line task summary (first line of node.task) + `node.operations` (main nodes only; `nodeOperations` absent -> unconstrained, no out-of-scope line).
- Progress segment: `· N/M` - node index in run order / total node count (from the dispatch snapshot `nodes` array + `nodeCount`); snapshot absent or node not found -> omit the segment (the echo degrades to the bare identity pointer).
- Optional marker: `· tier mech` - seam-live only (same detection as §Display Tiering); degrade omits it (the marker = the node-input tier fact).
- Every node type: main/approval/gate alike - approval/gate cards carry the frame too (main adds the discipline declaration).
- Purpose: signal distribution - the last authoritative text before the agent acts is the frame, not the raw user message. Reclassification, not suppression (G2).

# Constraints Block Format

Assembly rules (bullets, `[project]` prefix, lang/git dedup, 2 KB cap) per `atom-graph-spec` §Constraint Layering. Block shape:

```
## Constraints

- [project] <constraint 1>
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

- **constraints row** - one line: `ok`, or `violation ×N` (unsatisfied rule count with evidence). Marker per §Markers (surfaces in result table + approval pre-call).
- **tools row** - one line per declared scenario (operation class x target domain): adapter chain-head evidence or named `n/a: <structural reason>` (never silent; causes: `not indexed` / `project-root-bound` / `no LSP coverage` / `proxy down` / `threshold not met`). Missing evidence per declared class -> violation.
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

## Registry Injection

Main dispatch: HLT Registry entries for the merged class set - `node.operations` (wins on conflict) + the dispatched skill's `### Operation classes`. Block format + assembly: see CONTEXT-ASSEMBLY.md §Main Inline Context Assembly step 4 (single home). No declared classes -> no assembly, no warning; undeclared operations degrade to the atom-kernel core scenario rows (hot surface - never cold-read HLT-REGISTRY for core operations).

## Todo Lifecycle (node boundary)

Platform todo lists = node-scoped execution scratchpads - execution-trace, never session-persistent. Handler enforces per node type:

1. **Dispatch clear** - before task execution: `todo()` clear (contract: atom-kernel §todo() - Boundary Clear).
2. **Completion clear** - after output/decision report, before return: `todo()` clear - unconditional on success/failure.
3. **Propagation** - node todo never forwarded to subagents (platform strips at spawn); subagent todos child-scoped, cleared at child yield.

---

# Dispatch Rules

Static dispatch by `node.type` - main/approval/gate; unknown fails; null completes.

### main type

`node.type = "main"` - Main execution = HLT tool-call execution. Execution core delegates to atom-kernel §High-Level Tool Registry; handler supplies machinery only.

0. Clear todo per §Todo Lifecycle (dispatch clear).
1. Assemble inline context blocks when `node.channels` / `node.dependsOn` present - see CONTEXT-ASSEMBLY.md §Main Inline Context Assembly (run-mode block always; decision-UI block main-only; constraints block per §Constraints Block Format).
2. Inject `## Agent hints:` block when `node.agent` non-empty (see §Agent Hints).
3. Display tiering check per §Display Tiering (seam-live detection) - determines Checks assembly below; no Context hints block is ever assembled (removed, display minimalism).
4. Execute tool calls per atom-kernel §High-Level Tool Registry - registered invocation `{ intent, tool, args, bound }`; bound caps the evidence loop, default 3.
5. Checks scan - assemble the `## Checks` block per §Checks Block (single-line in the prose tier; skipped in the mechanical tier, markers still prefix output on violation); count violations; > 0 -> prefix markers per §Markers. MUST run before output report so markers land in the node report.
6. Report the node output - keep it in the agent session (platform-persisted); the advance carries progress only (`status`, `durationMs` — no output param, no scheduler content store, no file writes). Report format: concise prose summary per atom-pilot DISPLAY.md §Node report format - never a JSON code fence; empty output (no reportable content) -> no code block.
7. Measure wall-clock duration via `Date.now()`.
8. Clear todo per §Todo Lifecycle (completion clear).
9. Collect result - map to `{ status, output, durationMs }`.

## Agent Hints

`node.agent` = priority-ordered hint array - graph declares preference, never control. Block when non-empty:

```
## Agent hints: [<type-1>, <type-2>, …]
```

Absent/empty -> no block, platform default.

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

Unknown type / judge failure / auto-without-recommendation / activation degrade: handled at their flow steps (§Dispatch Rules unknown type, §gate type step 2, §approval type step 2, §Activation Consumption) - not restated here.

### gate type

`node.type = "gate"` - rework jump evaluation:

0. Clear todo per §Todo Lifecycle (dispatch clear).
1. Assemble jump evaluation context per DECISION-CARDS.md §Gate Jump Evaluation.
2. For each jump (declaration order): judge each condition - first "true" selects the jump - stop evaluating; no hit -> pass through (judge failure handling - single home: atom-kernel §judge()).
3. Hit -> IApprovalDecision { action: "jump", target: <jump.to>, label: <jump.when> } (shape per atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape) - resets target + downstream terminal nodes to pending, upstream kept (per atom-graph-spec §Gate Jump Conditions). No hit -> { action: "continue" } (no target - pass through, zero forward effect).
4. `jumps` required non-empty - a gate without rework jumps is a silent pass-through (see NODE-SCHEMA.md §Type-Specific Fields).
5. Keep the decision JSON in the agent session (platform-persisted) - the pilot routes it via `branchTo`/`endRun`; downstream gates judge from the session. No scheduler persistence, no files.
6. Clear todo per §Todo Lifecycle (completion clear).
7. Return `{ status: "done", output: "<IApprovalDecision JSON>", durationMs }` - report the single-line decision form (format per atom-pilot DISPLAY.md §Node report format); full JSON stays in the session (step 5).

### approval type

`node.type = "approval"` - decision confirmation:

0. Clear todo per §Todo Lifecycle (dispatch clear).
1. **Assemble card content + recommendation** per DECISION-CARDS.md §Decision Card Composition (judgment context, eligible re-run targets, `node.task` -> pre-call text - single home). Prepend `## Run Mode: <mode>` block (always) + constraints block (per §Constraints Block Format, when constraints non-empty) to pre-call text. Surface upstream constraint violations - append `[CONSTRAINT VIOLATION: <nodeId> × N]`; tool-usage violations - append `[TOOL USAGE VIOLATION: <nodeId> × N]` (same aggregation pipeline).
2. **Delegate the mode decision to approval()** - per atom-kernel §approval() (single assembly site for mode semantics; auto-without-recommendation -> card, never guess).
3. **Map to IApprovalDecision** - shapes: atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home). Auto-executed: `note: 'run mode: auto'`, `rationale` = one-line judgment-context basis (observable output fields / decision values, e.g. `review output overall: pass; top_rec_remaining: true`). End recommendation -> `action: "end"`. Manual choices omit `rationale` (the human IS the basis) - the field is optional.
4. **Keep the decision in the session** - decision JSON stays in the conversation (platform-persisted); the pilot routes via `branchTo`/`endRun`. No scheduler persistence, no files.
5. Clear todo per §Todo Lifecycle (completion clear).
6. Return `{ status: "done", output: "<json>", durationMs }` - report the single-line decision form (format per atom-pilot DISPLAY.md §Node report format); full JSON stays in the session (step 4).

### unknown type

Return `{ status: "failed", output: "Unknown phase type: <node.type>", durationMs: 0 }`. Advance via `graph_advance` - failure not transmitted (scheduler records `done`).

### null node

Graph complete. Return `{ done: true, snapshot }`.
