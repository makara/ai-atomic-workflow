# Session-Based Upstream Assembly

**Session-based upstream assembly**: node outputs are session facts — produced and consumed by the executing agent in its own conversation (platform-persisted transcript). The scheduler does NOT store or deliver output content (progress only: status/retry/timing). The handler assembles `## Upstream:` blocks from the agent session: the same agent executed the upstream nodes earlier in the run; after session compaction the platform transcript (history addressing) restores full reports. `<runId>` comes from dispatch snapshot (`snapshot.runId`; handler receives `{ node, snapshot? }`). No output files exist; no dispatch payload content exists; `graph_status` returns progress only.

# Activation Output Contract

Activation facts are session facts of the activation (per-activation decisions — never echoed from a previous activation):

- `constraints` (project layer) -> session `{"constraints": ["<rule>", ...]}` (compiled-artifact protocol — per atom-graph-spec ROUTING.md §Constraint Layering; round-level freeze holds in-session). The graph layer is NOT an activation fact — it arrives per dispatch as `node.constraints` (`[graph]`-prefixed entries read by the scheduler from the loaded graph definition).

Missing/unrecallable activation facts -> degrade, never block: constraints -> empty block + warning.

# Activation Context Blocks

Every node dispatch: assemble the activation constraints block from the agent session `## Constraints` (per SKILL.md §Constraints Block Format) — the block merges the project layer (session fact, pilot-loaded at activation, zero file reads) with the graph layer (`node.constraints` dispatch facts). The block arrives regardless of node type - no graph declares it, no task text repeats it.

# Main Inline Context Assembly

Main phases execute in main agent process (no sub-agent) - context assembled inline as the consolidated 4-block set (Run Frame → Context → Constraints → Checks; adopt-scope-and-handler-blocks, ADR 0247):

1. **Resolve channels** - contract source dual-track: `node.skill` present -> resolve against that skill's `## Context Requirements` four-subsection contract; `node.skill` absent -> empty contract - every entry must be an explicit `skill:`/`node:` prefix or file glob, bare name -> error.
2. **Context block sections** - resolve the conditional sections of the single `## Context` block from the agent session:
   - `upstream:` - implicit `dependsOn` reports AND `node:` channel targets. The executing agent produced these reports earlier in the run (same session, platform-persisted); after compaction restore via platform history addressing. **Run-scope gate is scheduler-side for declarations**: the scheduler strips `node:` targets outside the run's flattened node set at dispatch - out-of-run declarations never reach the agent; the scheduler holds no content, so no stale content can leak (no files exist). **Missing report -> warn + continue, never fail** (first round of a retry loop is legal timing).
   - `reference:` - `skill:<name>` entries.
   - `file:` - < 8KB channel file entries verbatim per §Channel File Consumption; larger entries are NOT delivered - consume per the read chain (structural overviews, sliced reads, compress-after-read).
   - `decision-ui:` - main nodes only: the confirmation-point interpretation rule (per §Decision UI Block).
   - Sections absent from the node's declaration are omitted - no empty sub-headers. Compact sub-header form inside the single block: `## Context` with `- upstream:` / `- reference:` / `- file:` / `- decision-ui:` markers.
3. **Operations single-render** - declared operation classes (node `operations:` + skill `Operation classes`) render ONCE in the `## Run Frame` block (declared operations line — per SKILL.md §Run Frame Block). No separate Class block exists; no registry injection exists (HLT removed, ADR 0194); the Tool usage check rows are evidence-only. No declared classes -> the frame's operations line is omitted, no warning.
4. **Prepend in order** - `## Run Frame` (unconditional, first — runId/nodeId/type/one-line task/declared operations/input contract/advance obligation; the transcript-level run-position declaration and the SINGLE run-frame signal, per SKILL.md §Run Frame Block) -> `## Context` (conditional, second) -> `## Constraints` (unconditional, third — activation session copy per SKILL.md §Constraints Block Format) -> `## Checks` (unconditional, last — per SKILL.md §Checks Block) -> task text, then execute inline. The former 7-block order (Run Frame → Upstream → Reference → Class → File → Decision UI → Constraints) is replaced by the 4-block set; content order inside `## Context` preserves the prior order (upstream → reference → file → decision-ui).
5. **Sub-agent reference inheritance** - when the phase dispatches sub-agents (task()), forward the `## Context` reference + file sections into each sub-agent's context (task() context text or a local:// handoff file). Reference skills are resolved ONCE at the phase level and shared down the tree - sub-agents SHALL NOT self-discover reference skills the parent already received (spec skills re-read by reviewers is a defect class, e.g. a reviewer re-reading atom-graph-spec 3x). File blocks forward unchanged too - sub-agents receive the same verbatim content the phase got (restore full via read(path); compress read results > 8KB per the compress entry; never re-read originals wholesale).

Block formats (`## Context` sub-sections: upstream / reference / file / decision-ui). `node.channels` arrives via NodeDetail (built by the adapter's `buildNodeDetail`); `node.dependsOn` arrives via NodeDetail base fields.

# Decision UI Block

Main-node context assembly carries the confirmation-point interpretation rule as the `decision-ui:` sub-section of the `## Context` block (declaring the explicit-declaration mapping — card presentation = a deterministic mapping from the graph definition's explicit tokens, never a runtime prose interpretation):

```
## Context
- decision-ui:
  Approval() cards present ONLY at points the node explicitly declares
  human confirmation: "Interview:" / "confirm:" tokens or explicit
  confirmation instructions in the node task text, or
  `completion.choices` branch options. Prose confirmation wording
  ("ask the user", "check with the user", "quiz", question()-style)
  WITHOUT an explicit token does NOT trigger a card - the node executes
  self-decided (agent evaluates inline from task text, upstream, snapshot).
```

- **Scope**: main nodes only.
- **Effect**: explicit-declaration mapping - the sub-section maps the node's declared confirmation points (Interview:/confirm: tokens, completion.choices branch options) to the approval() contract: single-form card always presented - options + custom free input + recommendation marked. Prose-only confirmation wording without an explicit token is a self-decide instruction, never a card trigger - upstream skills stay untouched, no content modification.
- **Standalone**: no graph dispatch -> no block -> approval() behavior unchanged (card always).
- **Interviews**: interview turns carry no recommendation -> approval() presents a card - the sub-section does not change interview semantics.

# Channel File Consumption

Delivery rules + structural verbatim invariant per atom-graph-spec §Channel File Consumption (single source). Execution detail: the Checks block context row is estimate-only (`~N tok`; A reference / B working / C growth / L3 prune counts) — the handler surface carries no measured ledger; compression lives in the graph-fidelity-context module, not the runtime surface.
