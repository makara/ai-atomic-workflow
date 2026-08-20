# Display Rules

Three verbosity tiers. `--verbose` flag enable Verbose. `--debug` flag enable Debug (implies Verbose). Default Quiet.

Platform harness auto-display raw tool I/O - beyond agent control. Agent control only own prose per tiers below.

Display tiering (display minimalism - the three laws, per CONTEXT.md `display minimalism`): while the session carries canonical `[seam]` lines (graph-fidelity live), the mechanical single echo line is the ONLY per-call feedback - the pilot prints NO per-node status lines. In the degrade baseline (no `[seam]` line), per-node status lines print (below).

## Resident perception block

At activation (Entry flow step 4, before the identity banner), one `graph_assets` query injects the graph perception list into the session - one line per graph, `id + description`, mirroring the skills `<skills>` block:

```
- <graphId>: <description>
```

Compact by contract: `id + description` only - never the full five-field payload (`run_conditions` / `source` / `problems` stay on demand via `graph_assets`). Query failure → the block is omitted entirely, no placeholder, no error prose - the run proceeds. Session fact at activation (snapshot), never re-queried per dispatch.

## Node report format

Node output reports = agent prose in the session - no code renderer produces them. Format rule single home: this document.

- Node output reports render as concise prose summaries - no JSON code fences. Full contract data stays in the session (ADR 0143 - downstream `node:` channel consumption + audit unchanged).
- Empty node output (no reportable content) renders no code block - blank fences eliminated.
- Decisions render as one line `decision: <action> (<label>)` - full IApprovalDecision JSON stays in the session for audit.
- Rule applies uniformly to all node types.
- Verbosity tiers govern status lines + MCP dumps only. Node report format = agent prose, instruction-layer governed - no config flag exists, no code path renders the blocks.

## Quiet (default)

Per-node status line (degrade baseline only - skipped while `[seam]` lines are present) + compact 3-line final report.

### Per-node status

One compact line per node - no decorations, no box-drawing, no type variants (the frontend is type-agnostic — every dispatch is a main node). Printed ONLY when no `[seam]` line is present in the session (mechanical tier: the plugin's single echo line replaces them).

- Node completes: `✅ <nodeId> · <skill> · <N>ms`
- Node fails / unhandled error: `⚠️ <error message> · <N>ms` (error fallback in prose — not a node-type variant)

### Final report (after "done")

Three compact lines - no box-drawing, no free-floating prose stats:

```
🏁 <graphName> done · ⏱ <total>ms · 🔄 ×<N> · 📉 <N> nodes · 🆔 <runId>
```

Result table (audit - kept in both tiers):

|nodeId|Skill|Status|Duration|Output summary|
|-|-|-|-|-|

Approval decisions table (decision audit - kept in both tiers): see §Approval decisions.

Status icons: ✅ = done, ⚠️ = failed.

## Verbose (--verbose)

Quiet + MCP call summaries (`>>>`/`<<<`).

## Debug (--debug)

Verbose + raw MCP JSON, `retryCount` per node, internal state changes.

```
   >>> RAW REQUEST:  <detected-tool-name>
   >>> RAW PAYLOAD:   <full JSON>
   <<< RAW RESPONSE:  <full JSON>
```

## Context stats

- **Context stats** - after "done", aggregate per-node `## Checks` block `context:` rows from node outputs (atom-phase-handler §Checks Block - single-line format) into the 📉 line. Context rows always report agent estimates (`~N tok` per atom-phase-handler §Checks Block); no compression/observability stats are accumulated here. MAY-corroborate tolerates missing data by construction.

## Tools stats

**Tools stats** - aggregate tool-usage violations across node outputs (markers per atom-phase-handler §Markers - count per node): `<V> violations` folds into the 📉 line. Compression savings never render here (the graph-fidelity-context module owns that surface). Violations list the nodes.

## Approval decisions

**Approval decisions** - list every approval() decision with its chosen action + label; when the user followed the recommendation, show the `rationale` (the recommendation basis — makes decisions auditable). Choices made against a plain card omit `rationale` (the human IS the basis).

|nodeId|action|label|rationale?|
|-|-|-|-|
|`<nodeId>`|`continue` (direct end: `end: true` — ADR 0238; no retry/branchTo node action — flow condition and forced-rework jump ride the advance channels)|`<chosen option label>`|`<rationale>` - when the recommendation was chosen|

E.g. `spec-accept` -> `continue (accept)` - rationale: design complete + user confirmed in interview.

## Feedback Channels

Feedback is classified into three channels, each mapped to an existing primitive; no new templates, no output files.

|Channel|Primitive|When|Persistence|
|-|-|-|-|
|Decision|`approval()` cards + Decision Request handoff (Context / Auto-recorded debt / Blocking findings / Dispatch record / Suggested advance label)|A decision is needed (approval() checkpoints in main nodes; direct-end decisions; decision requests at review handoffs)|Session only — IApprovalDecision JSON kept in the conversation (platform transcript); the pilot advances via `graph_advance` (continue / condition / jump / end: true); operator `graph_jump` routes operator jumps (PCL) — no `branchTo` (ADR 0238)|
|Status|Per-node status lines (degrade baseline only) + mechanical echo line (mechanical tier) + 3-line final report (this document)|Node boundaries only — never mid-node play-by-play|Session only (platform transcript); aggregate facts in the final report|
|Risk|Inline conversation reporting + structured markers (`[CONSTRAINT VIOLATION]` / `[TOOL USAGE VIOLATION]`) + rework decisions|Mid-node deviations/impacts, violations — immediate, don't wait for the node boundary|Markers ride the node report in the session; prose stays in the session|

Rules:

- Never write feedback to files — the platform transcript is the session record; the scheduler tracks progress only.
- Decision channel never hides a needed decision (no "reduce interaction rounds" omission).
- Status channel never fabricates progress — node boundary lines only; the mechanical tier never duplicates the echo line with prose status lines (law 1 - one line per call).
