# Display Rules

Three verbosity tiers. `--verbose` flag enable Verbose. `--debug` flag enable Debug (implies Verbose). Default Quiet.

Platform harness auto-display raw tool I/O - beyond agent control. Agent control only own prose per tiers below.

## Quiet (default)

Per-node status line + final result table.

### Per-node status

One compact line per node - no decorations, no box-drawing.

|Node type|Status line|
|-|-|
|main|`✅ <nodeId> · <skill> · <N>ms`|
|approval|`✅ <choice> · <N>ms` - pause: handler assembles decision card (card composition per atom-phase-handler §approval type) -> IApprovalDecision; pilot routes per §Approval Decision Processing|
|gate|`🔀 <jump target \| pass> · <N>ms` - pause-free: handler evaluates rework jumps (machine judgment per atom-phase-handler §gate type) -> IApprovalDecision {action: jump, target, label} on hit / {action: continue} on pass-through; pilot routes per §Gate Decision Routing|
|stub/unhandled|`⚠️ <error message> · <N>ms`|

### Final report (after "done")

Native key/value table - no box-drawing (box borders overflow on variable-width content; tables align at any width).

|Field|Value|
|-|-|
|🏁 Graph|`<graphName>` Complete|
|⏱ Wall clock|`<total>ms`|
|🔄 Retries|`×<N>`|
|📉 Context|`<N> nodes · <X> KB · <Y>% saved · proxy <status>`|
|🔧 Tools|`<V> violations · headroom <S>% saved · proxy <state>`|
|🆔 Run|`<runId>`|

Result table:

|nodeId|Skill|Status|Duration|Output summary|
|-|-|-|-|-|

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

**Context stats** - after "done", aggregate from `headroom_stats` (session-level compression) corroborated with Tool usage check evidence (`used:` headroom lines - bytes/savings reported there): `📉 ctx` row in the final report table - `<N> nodes · <X> KB · <Y>% saved · proxy <status>` - `<status>` reflects proxy health (`ok` / `cold` / `down`); no per-node context manifests exist; headroom_stats + Tool usage check are the sole sources.

## Tools stats

**Tools stats** - aggregate tool-usage violations across node outputs (markers per atom-phase-handler §Markers - count per node): `🔧 tools` row in the final report table - `<V> violations · headroom <S>% saved · proxy <state>` - savings from `headroom_stats`; proxy `<state>` = the three-state health gate defined in atom-kernel §Tool Schemas -> ## headroom (Health gate - `ok` / `cold` / `down` - marker strings per atom-phase-handler §Markers). Violations list the nodes.

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
|Status|Per-node status lines + final report table (this document)|Node boundaries only — never mid-node play-by-play|Session only (platform transcript); aggregate facts in the final report|
|Risk|Inline conversation reporting + structured markers (`[CONSTRAINT VIOLATION]` / `[TOOL USAGE VIOLATION]`) + gate jumps|Mid-node deviations/impacts, violations — immediate, don't wait for the node boundary|Markers ride the node report in the session; prose stays in the session|

Rules:

- Never write feedback to files — the platform transcript is the session record; the scheduler tracks progress only.
- Decision channel never hides a needed decision (no "reduce interaction rounds" omission).
- Status channel never fabricates progress — node boundary lines only.
