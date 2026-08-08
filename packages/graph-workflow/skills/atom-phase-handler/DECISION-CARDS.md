# Run-Mode Auto Path

## Approval consumption (direct branch)

On approval dispatch, read the mode from `$run-mode-confirm` output:

1. **`'auto'`** - judge the AI recommendation from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode (agent judgment, NOT a declared action - no `default` field exists):
   - Recommendation exists -> auto-execute it: assemble `IApprovalDecision { action, target?, value, label, note: 'run mode: auto', rationale }`. `rationale` = one-line basis summary of the judgment context that drove the recommendation (observable output fields / decision values, e.g. `review output overall: pass; top_rec_remaining: true`) - the auditable recommendation basis (F6, arch-review round 2). `note` stays `'run mode: auto'`; `rationale` = basis, never substitute for note/label.
   - Persist decision to `the run stream` - full decision JSON incl. `value` + `label` + `rationale` (downstream gate jump conditions consume the decision `value` exactly as the human path). Write failure -> mark `[FILE MISSING: …]` in output, do not crash.
   - Clear todo per SKILL.md §Todo Lifecycle (completion clear) - unconditional on success/failure.
   - Return `{ status: "done", output: "<json>", durationMs }` - no question(), no decision card.
   - When end IS the recommendation -> `action: "end"` - pilot completes the run (`graph_advance` `endRun`).
   - No recommendation (judgment fails / context insufficient) -> fall through to the human card even in auto - card shows one line `Run mode: auto — no recommendation; decide manually`. NEVER guess an action.
2. **`'manual'`** (or missing confirm output - absence never auto - see atom-graph-spec §Activation Prologue) - present the human decision card (question()) as usual. No auto path. Manual choices omit `rationale` (the human IS the basis) - the field is optional.

Scope rule: Run Mode controls approval presentation ONLY. Main nodes (grill/scope interviews, work nodes) never auto-decided, never bypassed. Gate jump semantics unchanged - jump conditions may reference the `## Run Mode: <mode>` context block (e.g. arch-review-loop loop-gate).

# Decision Card Composition

Human decision card (question()) - field mapping:

- `node.topic` (task first line) -> `question()` header (noun phrase <=30 chars; truncate at the limit).
- Card options:
  - **Accept** - the AI recommendation (judged from the judgment context + snapshot + run mode).
  - **`node.routingActions`** - mapped to options with `label` + `description` (branch-route scenario only; empty otherwise).
  - **AI-generated contextual options** - retry/jump/end/branch-route options judged at execution from the judgment context + `snapshot.nodes` (eligible re-run targets: `status === 'done'` AND `nodeId != currentNodeId`) + run mode. One option per candidate, e.g. `"Retry <nodeId>"`, `"Jump to <nodeId>"`, `"End run"`.
  - **custom:true always present** - free-text text box for user input.
- `node.task` full text -> pre-call text - display before question(); append the generic sentence `Free input overrides.` (author text carries the card body; the boilerplate is handler-owned).
- Collect user choice + custom text -> output as `IApprovalDecision` JSON - shapes: see NODE-SCHEMA.md §IApprovalDecision JSON Shapes.

# Gate Jump Evaluation

1. Assemble jump evaluation context (main-style pipeline - judgment context):
   - Direct dependsOn outputs: read `the run stream of <dependsOnId>` -> `## Upstream: <dependsOnId>` blocks (main parity).
   - `channels` `node:` targets: read `the run stream of <nodeTarget>` -> `## Upstream: <nodeTarget>` blocks; missing -> note `<nodeTarget> has no output` in the context (node pending/unactivated; a condition referencing it evaluates false).
   - Snapshot: per-node states incl. `retryCount` - jump bounds reference the TARGET node's `retryCount` (single counter, JUMP-maintained, never zeroed; every node in the jump closure - target + downstream terminals - increments, so a gate downstream of a rework target carries a non-zero retryAttempt after rework rounds).
   - Prepend `## Run Mode: <mode>` (from `$run-mode-confirm` output) + constraints blocks (from `$load-constraints` output; same layer as main/approval).
2. Evaluate jumps in declaration order:
   - judge each condition; the first `"true"` selects its jump; stop. No hit -> pass through.
   - judge() per atom-kernel §judge() - constrained true/false answer; judgment failure -> no hit -> pass through (conservative).
3. Hit -> `IApprovalDecision { action: "jump", target: <jump.to>, label: <jump.when> }`. No hit -> `{ action: "continue" }` (no target - pass through, zero forward effect).
4. Judgment failure (ambiguous) -> treat as no hit -> pass through (conservative - never fabricate a jump).

# Persist Decision

Persist the decision to `the run stream` (run-scoped output stream - path format: see CONTEXT-ASSEMBLY.md §Run-Scoped Output Streams). Write failure -> mark `[FILE MISSING: output stream for <runId>/<nodeId>]` in output, do not crash.

- **Approval** - full decision JSON incl. `value` + `label` (auto path adds `rationale`; downstream gate jump conditions consume the decision `value` exactly as the human path).
- **Gate** - decision JSON incl. target + label.
