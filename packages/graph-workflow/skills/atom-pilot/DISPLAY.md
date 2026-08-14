# Display Rules

Three verbosity tiers. `--verbose` flag enable Verbose. `--debug` flag enable Debug (implies Verbose). Default Quiet.

Platform harness auto-display raw tool I/O - beyond agent control. Agent control only own prose per tiers below.

Display tiering (display minimalism - the three laws, per CONTEXT.md `display minimalism`): while the session carries canonical `[seam]` lines (graph-fidelity live), the mechanical single echo line is the ONLY per-call feedback - the pilot prints NO per-node status lines. In the degrade baseline (no `[seam]` line), per-node status lines print (below).

## Node report format

Node output reports = agent prose in the session - no code renderer produces them. Format rule single home: this document.

- Node output reports render as concise prose summaries - no JSON code fences. Full contract data stays in the session (ADR 0143 - downstream `node:` channel consumption + audit unchanged).
- Empty node output (no reportable content) renders no code block - blank fences eliminated.
- Approval/gate decisions render as one line `decision: <action> (<label>)` - full IApprovalDecision JSON stays in the session for routing + audit.
- Rule applies uniformly to main/approval/gate node types.
- Verbosity tiers govern status lines + MCP dumps only. Node report format = agent prose, instruction-layer governed - no config flag exists, no code path renders the blocks.

## Quiet (default)

Per-node status line (degrade baseline only - skipped while `[seam]` lines are present) + compact 3-line final report.

### Per-node status

One compact line per node - no decorations, no box-drawing. Printed ONLY when no `[seam]` line is present in the session (mechanical tier: the plugin's single echo line replaces them).

|Node type|Status line|
|-|-|
|main|`✅ <nodeId> · <skill> · <N>ms`|
|approval|`✅ <choice> · <N>ms` - pause: handler assembles decision card (card composition per atom-phase-handler §approval type) -> IApprovalDecision; pilot routes per §Approval Decision Processing|
|gate|`🔀 <jump target \| pass> · <N>ms` - pause-free: handler evaluates rework jumps (machine judgment per atom-phase-handler §gate type) -> IApprovalDecision {action: jump, target, label} on hit / {action: continue} on pass-through; pilot routes per §Gate Decision Routing|
|stub/unhandled|`⚠️ <error message> · <N>ms`|

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

- **Context stats** - after "done", aggregate per-node `## Checks` block `context:` rows from node outputs (atom-phase-handler §Checks Block - single-line format) into the 📉 line. R2 cost economy is suspended (ADR 0175): headroom compression stats and graph-fidelity observability facts (appendEntry - requests, input/cache tokens, compaction counters, TTSR triggers) are NOT accumulated — the section consumes Checks rows only, and rows always report agent estimates (no measured ledger exists to reference). MAY-corroborate tolerates missing data by construction.

## Tools stats

**Tools stats** - aggregate tool-usage violations across node outputs (markers per atom-phase-handler §Markers - count per node): `<V> violations` folds into the 📉 line. Headroom savings + health-gate state are suspended (R2, ADR 0175) — `[HEADROOM COLD]`/`[HEADROOM DOWN]` and `[CONTEXT VIOLATION]` markers are removed (atom-phase-handler §Markers); no headroom segment renders. Violations list the nodes.

## Approval decisions

**Approval decisions** - list every approval with its chosen action + label; for auto-executed decisions, show the `rationale` (the recommendation basis — makes auto approvals auditable). Manual choices show the chosen option; `rationale` absent (the human IS the basis).

|nodeId|action|label|rationale?|
|-|-|-|-|
|`<nodeId>`|`continue` / `retry` / `jump` / `end`|`<chosen option label>`|`<rationale>` - auto only|

E.g. `spec-accept` -> `continue (accept)` - auto, rationale: design complete + user confirmed in interview.

## Feedback Channels

Feedback is classified into three channels, each mapped to an existing primitive; no new templates, no output files.

|Channel|Primitive|When|Persistence|
|-|-|-|-|
|Decision|`approval()` cards + Decision Request handoff (Context / Auto-recorded debt / Blocking findings / Dispatch record / Suggested advance label)|A routing decision is needed (approval/gate nodes; decision requests at review handoffs)|Session only — IApprovalDecision JSON kept in the conversation (platform transcript); routing via `branchTo`/`endRun`|
|Status|Per-node status lines (degrade baseline only) + mechanical echo line (mechanical tier) + 3-line final report (this document)|Node boundaries only — never mid-node play-by-play|Session only (platform transcript); aggregate facts in the final report|
|Risk|Inline conversation reporting + structured markers (`[CONSTRAINT VIOLATION]` / `[TOOL USAGE VIOLATION]`) + gate jumps|Mid-node deviations/impacts, violations — immediate, don't wait for the node boundary|Markers ride the node report in the session; prose stays in the session|

Rules:

- Never write feedback to files — the platform transcript is the session record; the scheduler tracks progress only.
- Decision channel never hides a needed decision (no "reduce interaction rounds" omission).
- Status channel never fabricates progress — node boundary lines only; the mechanical tier never duplicates the echo line with prose status lines (law 1 - one line per call).
