# Approval() Delegation

## Approval consumption (direct branch)

On approval dispatch, the handler assembles the card content + the AI-judged recommendation, then delegates the mode decision to `approval()` (atom-kernel §approval() - single assembly site for mode semantics; mode source per CONTEXT-ASSEMBLY.md §Prologue Context Blocks):

1. **`'auto'`** - the recommendation is judged from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode (agent judgment, NOT a declared action - no `default` field exists):
   - Recommendation exists -> approval() auto-executes it: the handler assembles the decision per atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (`note: 'run mode: auto'`, `rationale` = one-line basis from observable output fields / decision values, e.g. `review output overall: pass; top_rec_remaining: true` - the auditable recommendation basis).
   - No recommendation (judgment fails / context insufficient) -> approval() falls through to the human card even in auto (card line + never-guess rule per atom-kernel §approval()).
2. **`'manual'`** (mode semantics per atom-kernel §approval() + CONTEXT-ASSEMBLY.md §Prologue Context Blocks) - approval() presents the human decision card as usual. Manual choices omit `rationale` (the human IS the basis) - the field is optional.

Scope rule: Run Mode controls decision presentation - approval nodes AND approval() checkpoints inside main nodes. Interviews are never auto-gated - structurally, approval() without a recommendation always presents a card. Gate jump semantics unchanged - jump conditions may reference the `## Run Mode: <mode>` context block (e.g. arch-review-loop loop-gate).

# Decision Card Composition

Human decision card (approval() manual/absent branch) - field mapping:

- `node.topic` (task first line) -> `approval()` header (noun phrase <=30 chars; truncate at the limit).
- Card options:
  - **Accept** - the AI recommendation (judged from the judgment context + snapshot + run mode).
  - **`node.routingActions`** - mapped to options with `label` + `description` (branch-route scenario only; empty otherwise).
  - **AI-generated contextual options** - retry/jump/end/branch-route options judged at execution from the judgment context + `snapshot.nodes` (eligible re-run targets: `status === 'done'` AND `nodeId != currentNodeId`) + run mode. One option per candidate, e.g. `"Retry <nodeId>"`, `"Jump to <nodeId>"`, `"End run"`.
  - **custom:true always present** - free-text text box for user input.
- `node.task` full text -> pre-call text - display before the card; append the generic sentence `Free input overrides.` (author text carries the card body; the boilerplate is handler-owned).
- Collect the approval() decision (choice + custom text) -> output as `IApprovalDecision` JSON - shapes: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home).

# Gate Jump Evaluation

1. Assemble jump evaluation context (main-style pipeline - judgment context):
   - Direct dependsOn reports: assemble `## Upstream: <dependsOnId>` blocks from the agent session (the executing agent produced them; platform history recovery after compaction) (main parity).
   - `channels` `node:` targets: assemble `## Upstream: <nodeTarget>` blocks from the agent session; missing -> note `<nodeTarget> has no output` in the context (node pending/unactivated; a condition referencing it evaluates false).
   - Snapshot: per-node states incl. `retryCount` - jump bounds reference the TARGET node's `retryCount` (single counter, JUMP-maintained, never zeroed; every node in the jump closure - target + downstream terminals - increments, so a gate downstream of a rework target carries a non-zero retryCount after rework rounds).
   - Prepend `## Run Mode: <mode>` (from `$run-mode-confirm` session fact) + constraints blocks (from `$load-constraints` session fact; same layer as main/approval).
2. Evaluate jumps in declaration order:
   - judge each condition; the first `"true"` selects its jump; stop. No hit -> pass through.
   - judge() per atom-kernel §judge() - constrained true/false answer; judgment failure -> no hit -> pass through (conservative).
3. Hit -> `IApprovalDecision { action: "jump", target: <jump.to>, label: <jump.when> }` (shape per atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape). No hit -> `{ action: "continue" }` (no target - pass through, zero forward effect).
4. Judgment failure (ambiguous) -> treat as no hit -> pass through (conservative rule - single home: atom-kernel §judge()).

# Keep Decision In-Session

The decision lives in the agent session (platform-persisted) — no scheduler persistence, no files. The pilot routes it via `graph_advance` `branchTo`/`endRun`; downstream gates judge the decision from the session (the judging agent executed the decision node earlier in the run).

- **Approval** - full decision JSON (shape + field semantics: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape - single home); auto path adds `rationale`; downstream gate jump conditions consume the decision `value` exactly as the human path.
- **Gate** - decision JSON incl. target + label.
