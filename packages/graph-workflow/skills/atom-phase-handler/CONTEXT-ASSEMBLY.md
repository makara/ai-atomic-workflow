# Session-Based Upstream Assembly

**Session-based upstream assembly**: node outputs are session facts — produced and consumed by the executing agent in its own conversation (platform-persisted transcript). The scheduler does NOT store or deliver output content (progress only: status/retry/timing). The handler assembles `## Upstream:` blocks from the agent session: the same agent executed the upstream nodes earlier in the run; after session compaction the platform transcript (history addressing) restores full reports. `<runId>` comes from dispatch snapshot (`snapshot.runId`; handler receives `{ node, snapshot? }`). No output files exist; no dispatch payload content exists; `graph_status` returns progress only.

# Prologue Output Contract

Prologue outputs are session facts of the activation (per-activation decisions — never echoed from a previous activation):

- `$run-mode-confirm` -> session `{"mode": "manual"|"auto"}` (the node emits `args.mode` when set, else presents the approval() card - no mode block exists yet, so approval() takes its manual branch - Manual default, absence never auto - see atom-graph-spec §Activation Prologue). Every activation re-confirms.
- `$load-constraints` -> session `{"constraints": ["<rule>", ...]}` (compiled-artifact protocol - the built-in node emits the cached `.graph-scheduler/constraints.json` array verbatim when the artifact exists, else compiles `## Rules` into it; existence = validity, deletion = reset - round-level freeze holds in-session).

Activation order load-first: `$load-constraints` dispatches before `$run-mode-confirm`; confirm dispatch reads existing constraints block - its decision card carries `## Constraints` context; confirm-dispatch degrade path (constraints missing -> warning) no longer fires.

Missing/unrecallable prologue facts -> degrade, never block: mode -> `manual` + warning; constraints -> empty block + warning (absence never auto - see atom-graph-spec §Activation Prologue).

**Presence gating:** confirm read gated on `$run-mode-confirm` appearing in `snapshot.nodes` - approval-less graph skips synthesis (no mode consumer) -> no mode block, NO warning emitted. Load read unconditional (constraints consumed by every node type). Degradation applies only to SYNTHESIZED nodes whose output was lost.

# Prologue Context Blocks

Every node dispatch (main/approval/gate): assemble prologue blocks from the agent session `## Run Mode: <mode>` (from `$run-mode-confirm` - only when node exists in `snapshot.nodes`) + `## Constraints` (from `$load-constraints`, per SKILL.md §Constraints Block Format) - same layer as before, now sourced from the session (the agent executed the prologue nodes this activation). Gate jump evaluation context includes them - jump conditions can reference the mode (`run mode is auto …`). Blocks arrive regardless of node type - no graph declares them, no task text repeats them. The `## Run Mode:` block is ALSO the mode source for approval() (atom-kernel §approval()) - absent block -> manual branch (absence never auto).

# Main Inline Context Assembly

Main phases execute in main agent process (no sub-agent) - context assembled inline:

1. **Resolve channels** - contract source dual-track: `node.skill` present -> resolve against that skill's `## Context Requirements` four-subsection contract; `node.skill` absent -> empty contract - every entry must be an explicit `skill:`/`node:` prefix or file glob, bare name -> error.
2. **Upstream blocks** - assemble implicit `dependsOn` reports AND `node:` channel targets from the agent session -> `## Upstream: <nodeId>` blocks. The executing agent produced these reports earlier in the run (same session, platform-persisted); after compaction restore via platform history addressing. **Run-scope gate is scheduler-side for declarations**: the scheduler strips `node:` targets outside the run's flattened node set at dispatch - out-of-run declarations never reach the agent; the scheduler holds no content, so no stale content can leak (no files exist). **Missing report -> warn + continue, never fail** (first round of a retry loop is legal timing).
3. **Reference blocks** - resolve `skill:<name>` entries -> `## Reference:` blocks.
4. **Registry blocks** - assemble HLT Registry entries for the merged class set (node `operations:` + skill `Operation classes` - see SKILL.md §Registry Injection) -> `## Registry: <tool> — scenario: <domain> x <operation> -> <adapter>` blocks (scenario key carries the adapter assignment). No declared classes -> no assembly, no warning.
5. **File blocks** - deliver < 8KB channel file entries agent-side as verbatim `## File:` blocks per §Channel File Consumption; larger entries are NOT delivered - consume per the HLT read chain (atom-kernel Entry: read - structural overviews, sliced reads, compress-after-read).
6. **Prepend in order** - upstream -> reference -> registry -> file -> run-mode block -> decision-UI block -> constraints block -> agent hints block -> task text, then execute inline. Run-mode block (`## Run Mode: <mode>`, from `$run-mode-confirm` output), decision-UI block (main nodes only - the confirmation-point interpretation rule, per §Decision UI Block), and constraints block (from `$load-constraints` output) arrive for every node - main/approval/gate alike (decision-UI block: main only).
7. **Sub-agent reference inheritance** - when the phase dispatches sub-agents (task()), forward the `## Reference:` blocks into each sub-agent's context (task() context text or a local:// handoff file). Reference skills are resolved ONCE at the phase level and shared down the tree - sub-agents SHALL NOT self-discover reference skills the parent already received (spec skills re-read by reviewers is a defect class, e.g. a reviewer re-reading atom-graph-spec 3x). File blocks forward unchanged too - sub-agents receive the same verbatim blocks the phase got (restore full via read(path); compress read results > 8KB per the compress entry; never re-read originals wholesale).

Block formats (`## Upstream:` / `## Reference:` / `## File:`). `node.channels` arrives via NodeDetail (main handler `extendNodeDetail` passes it through); `node.dependsOn` arrives via NodeDetail base fields.

# Decision UI Block

Main-node context assembly prepends a `## Decision UI` block (after the run-mode block, before constraints) declaring the confirmation-point interpretation rule for the node's execution - the semantic injection layer (round 4: upstream skills stay untouched, the atom layer interprets their prose confirmation points):

```
## Decision UI
Every user-confirmation point in this node's execution ("ask the user",
"check with the user", "quiz", question()-style instructions) executes per
the approval() contract: mode from ## Run Mode (absent -> manual);
recommendation present + auto -> execute it; no recommendation -> card.
```

- **Scope**: main nodes only (approval/gate nodes have their own machinery - approval nodes delegate to approval() per SKILL.md §approval type; gates use judge()).
- **Effect**: skills with prose confirmation instructions (e.g. to-spec "Check with the user", to-tickets "Quiz the user") get mode-aware behavior without content modification - the executing agent interprets those points per the block.
- **Standalone**: no graph dispatch -> no block, no run-mode block -> manual behavior unchanged (absence never auto).
- **Interviews**: interview turns carry no recommendation -> approval() presents a card in any mode - the block does not change interview semantics.

# Channel File Consumption

Delivery rules + structural verbatim invariant per atom-graph-spec §Channel File Consumption (single source). Execution detail: Tool usage check records bytes/savings/proxy state; Restore = `headroom_retrieve` (hash contract) primary.
