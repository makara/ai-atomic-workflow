# Run-Scoped Output Streams

**Run-scoped output streams** (short name: **run stream**): node outputs live at `.taskflow/outputs/<runId>/<nodeId>.output.txt` - path format defined HERE; referenced throughout this skill as "run stream". `<runId>` comes from dispatch snapshot (`snapshot.runId`; handler receives `{ node, snapshot? }`). Every read/write resolves through the run's own directory - stale outputs from other runs invisible. Missing runId (standalone dispatch without snapshot) -> un-scoped fallback `.taskflow/outputs/<nodeId>.output.txt` + warning.

# Prologue Output Contract

Prologue output contract (persisted like any node output):

- `$run-mode-confirm` -> `.taskflow/outputs/<runId>/$run-mode-confirm.output.txt` - JSON `{"mode": "manual"|"auto"}` (per-activation decision; the node emits `args.mode` when set, else asks the user - Manual default, absence never auto - see atom-graph-spec §Activation Prologue).
- `$load-constraints` -> `.taskflow/outputs/<runId>/$load-constraints.output.txt` - JSON `{"constraints": ["<rule>", ...]}` (compiled-artifact protocol - the built-in node emits the cached `.graph-scheduler/constraints.json` array verbatim when the artifact exists, else compiles `## Rules` into it; existence = validity, deletion = reset - round-level freeze holds via the output stream).

Activation order load-first: `$load-constraints` dispatches before `$run-mode-confirm`; confirm dispatch reads existing constraints block - its decision card carries `## Constraints` context; confirm-dispatch degrade path (constraints missing -> warning) no longer fires.

Missing/corrupt prologue output -> degrade, never block: mode -> `manual` + warning; constraints -> empty block + warning (absence never auto - see atom-graph-spec §Activation Prologue).

**Presence gating:** confirm read gated on `$run-mode-confirm` appearing in `snapshot.nodes` - approval-less graph skips synthesis (no mode consumer) -> no mode block, NO warning emitted. Load read unconditional (constraints consumed by every node type). Degradation applies only to SYNTHESIZED nodes whose output was lost.

# Prologue Context Blocks

Every node dispatch (main/approval/gate): read prologue outputs, prepend context blocks `## Run Mode: <mode>` (from `$run-mode-confirm` - only when node exists in `snapshot.nodes`) + `## Constraints` (from `$load-constraints`, per SKILL.md §Constraints Block Format) - same layer as before, now sourced from prologue node outputs, not NodeDetail fields. Gate jump evaluation context includes them - jump conditions can reference the mode (`run mode is auto …`). Blocks arrive regardless of node type - no graph declares them, no task text repeats them.

# Main Inline Context Assembly

Main phases execute in main agent process (no sub-agent) - context assembled inline:

1. **Resolve channels** - contract source dual-track: `node.skill` present -> resolve against that skill's `## Context Requirements` four-subsection contract; `node.skill` absent -> empty contract - every entry must be an explicit `skill:`/`node:` prefix or file glob, bare name -> error.
2. **Upstream blocks** - read implicit `dependsOn` outputs AND `node:` channel targets from `the run stream` -> `## Upstream: <nodeId>` blocks. **Run-scope gate is scheduler-side**: the scheduler strips `node:` targets outside the run's flattened node set at dispatch - out-of-run references never reach the agent, stale output files from other runs never leak in. **Missing output -> warn + continue, never fail** (first round of a retry loop is legal timing).
3. **Reference blocks** - resolve `skill:<name>` entries -> `## Reference:` blocks.
4. **Registry blocks** - assemble HLT Registry entries for the merged class set (node `operations:` + skill `Operation classes` - see SKILL.md §Registry Injection) -> `## Registry: <tool>` blocks. No declared classes -> no assembly, no warning.
5. **File blocks** - deliver < 8KB channel file entries agent-side as verbatim `## File:` blocks per §Channel File Consumption; larger entries are NOT delivered - consume per the HLT read chain (atom-kernel Entry: read - structural overviews, sliced reads, compress-after-read).
6. **Prepend in order** - upstream -> reference -> registry -> file -> run-mode block -> constraints block -> agent hints block -> task text, then execute inline. Run-mode block (`## Run Mode: <mode>`, from `$run-mode-confirm` output) and constraints block (from `$load-constraints` output) arrive for every node - main/approval/gate alike.
7. **Sub-agent reference inheritance** - when the phase dispatches sub-agents (task()), forward the `## Reference:` blocks into each sub-agent's context (task() context text or a local:// handoff file). Reference skills are resolved ONCE at the phase level and shared down the tree - sub-agents SHALL NOT self-discover reference skills the parent already received (spec skills re-read by reviewers is a defect class, e.g. a reviewer re-reading atom-graph-spec 3x). File blocks forward unchanged too - sub-agents receive the same verbatim blocks the phase got (restore full via read(path); compress read results > 8KB per the compress entry; never re-read originals wholesale).

Block formats (`## Upstream:` / `## Reference:` / `## File:`). `node.channels` arrives via NodeDetail (main handler `extendNodeDetail` passes it through); `node.dependsOn` arrives via NodeDetail base fields.

# Channel File Consumption

Delivery rules + structural verbatim invariant per atom-graph-spec §Channel File Consumption (single source). Execution detail: Tool usage check records bytes/savings/proxy state; Restore = `headroom_retrieve` (hash contract) primary.
