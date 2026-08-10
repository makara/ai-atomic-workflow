> Reference sibling of `atom-graph-spec` (SKILL.md) - routing semantics, run mode, runtime mechanics, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Routes

- **Flow-as-route** - a flow phase declaring `route: <id>` IS a route: flatten propagates the id to children without their own `route`. Branch-route flows MUST declare `route:` (routes are explicit - see intro above).
- **Activation** - a node activates iff its route is active AND its dependencies are satisfied (O(1) lookup, zero inference). NO vacuous satisfaction: a dependency on an unselected route is NOT satisfied - sequence through the decision node or use an `any`-join (the branch-route join pattern) so the unselected route never blocks while the chosen one completes. Unselected route members never activate - they stay `pending` forever and never block run completion (never-scheduled).
- **Approval branch-route decisions** - the ONLY written routing scenario: the approval declares options with `target` (node or route id) + `value`. Choosing one activates the node-or-route (scheduler activates the target and, for a route target, every member). See PHASESCHEMA.md §Approval Routing Actions.

## Join Mode Rules

Phases with `dependsOn` length > 1:

|Mode|Config|Behavior|
|-|-|-|
|`all` (default)|No `join` field|Fire when ALL upstreams complete. Explicit `join: all` -> schema rejection - `join` accepts only the `'any'` literal (`z.literal('any')`).|
|`any`|`join: any`|Fire when ANY upstream completes. Others stay `pending` (unactivated). `join`'s existence IS the any-mode declaration.|

### Any-join Constraints

1. **Deadlock** - when ALL upstreams of an `any` phase stay unactivated (members of unselected routes), the phase never fires. Prevent: `any`-join upstreams SHALL sit on the implicit default route or a route guaranteed to activate - an `any` join over branch-route members is legal ONLY when a preceding decision node guarantees at least one member activates (the branch-route join pattern - see §Routes: pipeline-done joins the chosen track's terminal while the unselected track never blocks).
2. **Partial activation** - `any` phase fires after one upstream completes. Remaining upstream nodes stay `pending` (unactivated).
3. **Downstream awareness** - `any` phase downstreams see upstreams as completed or pending; jump conditions and AI recommendations reference observable facts (output contract fields, decision values, retryCount), never node status.
4. **Route span** - `join: any` requires the direct upstream set to span >=2 routes (validator-enforced). A join whose upstreams all sit on one route is `all`-semantics - omit `join`.

## Gate Jump Conditions

Natural-language rework conditions - LLM-evaluated by the agent at gate dispatch (§Gate Type). Judgment stays agent-side; the scheduler applies the jump. A hit = backward jump (target + downstream terminal nodes reset to pending, upstream kept, target retryCount incremented - never zeroed); no hit = pass through (zero forward effect).

### Writing Effective Conditions

1. **Observable facts** - reference concrete output contract fields: `review/arch-review output shows top_rec_remaining: false`
2. **Decision values** - approval decisions reference the chosen action's stable `value`, never its display label: `review-accept output shows decision value: implement` (label is pure display - reorder-safe)
3. **retryCount bounds** - bounded conditions reference the target node's `retryCount` (single counter - see §Gate Jump Conditions): `apply-change retryCount < 2` (bounded rework), `loop-entry retryCount >= 8` (bound exhausted -> condition false -> pass through, end recommended downstream)
4. **Scope-bounded** - reference outputs of direct `dependsOn` + `channels` `node:` targets + global-context `node:` streams exclusively; jump targets are in scope for their retryCount bound only. NEVER sibling output existence (`no … output present`) or hardcoded `.taskflow/outputs/` paths.
5. **Conservative** - ambiguous judgment -> no match -> pass through. Do NOT fabricate a jump.

### Anti-Patterns

|Bad|Good|
|-|-|
|`"plan seems ready"`|`"scope-confirm output shows scope_complete: true"`|
|`"previous steps done"`|`"requirement-analysis output exists and has: phase_count > 0"`|
|`"user said yes"`|`"plan-accept output shows decision value: proceed"`|
|`"no sibling output present"`|`"scope-confirm output shows save_location and no skill_path"`|

Referenced outputs must sit in the gate's judgment scope (direct `dependsOn` / `channels` `node:` / global-context `node:` streams) - a referenced node outside the scope declares `channels: [node:<id>]`; a jump target's own outputs need a channel too (its retryCount bound is snapshot data, always in scope).

## Jump Semantics

1. **jumps** - `[{when, to}]`: `when` is a natural-language condition (agent-judged against the judgment context - defined in §Jump Semantics item 5, single definition - plus snapshot + run mode), `to` an explicit BACKWARD target node id - an upstream terminal node (validator-enforced) (§Gate Jump Conditions).
2. **Evaluation** - conditions evaluated in declaration order; the first match selects its jump - stop. No match = pass through.
3. **Hit -> backward jump** - the target plus its downstream terminal nodes reset to `pending` (JUMP closure); the target's `retryCount` increments (see §Gate Jump Conditions); upstream nodes are KEPT (their outputs stay - the rework reuses them).
4. **No hit -> pass through** - zero forward routing: the gate activates nothing, routes nothing forward, blocks nothing. Downstream readiness resolves topologically as usual.
5. **Judgment context** - direct dependsOn outputs (main parity) + effective channels (`node:` targets, reference skills, files - uniform entry kinds for every type); handler assembles exactly those outputs + current snapshot (per-node states incl. retryCount) + run mode for evaluation. `dependsOn` stays purely topological. Removed `reads` - see §Field Closure; cross-level references declare `channels: [node:<id>]`.

## Gate+Approval Pair Pattern

Machine rework first, human card second - a bounded auto-rework gate feeding the decision card:

YAML: see YAML-EXAMPLES.md §Gate+Approval Pair Pattern.

Jump hit re-runs the writer. No hit -> pass through to the paired approval - human decides (accept recommendation or override via free input). Never a silent stall, never a fabricated jump.

## Loop Router Pattern

A gate may act as a **loop router** - machine-iterating NEW artifacts instead of reworking the same one. Distinguishing shape (arch-review-loop `loop-gate`):

- The jump condition references the reviewer's **affirmative continuation signal** (`review/arch-review` output `top_rec_remaining: true`) - the loop re-runs while it affirms progress, not while it reports failure - AND the round bound (`loop-entry retryCount < 8`).
- The re-round target is the **round origin `loop-entry`** - the loop re-asks scope (user-confirmed/adjusted every round) and re-runs the whole round. Round reset is structural: `review` flow `dependsOn: [loop-entry]` + `implement` flow `dependsOn: [review-accept]` - the JUMP closure resets scope -> review -> accept -> implement in one hop.
- **Termination is never a node** - the round-end approval recommends `end` (no Top Rec remains OR bound exhausted) or loop again (Top Rec remains AND bound not exhausted); auto mode executes the recommendation, ending automatically when end IS the recommendation. Completion is an end action or natural drain.
- The judgment context covers every output a condition references (per §Jump Semantics - the round worker's flattened id, the entry decision node) - evaluation context is explicit, never implicit.

YAML: see YAML-EXAMPLES.md §Loop Router Pattern.

## Completion

A run completes by one of two mechanisms:

1. **Natural drain** - no node is `active` and no node is eligible (route active && dependencies satisfied - the topological result of the DAG). Unselected-route members stay `pending` forever and never block completion (see §Routes).
2. **Approval `end` action** - the AI recommendation or the human choice routes the run to completion: `graph_advance` with `endRun: true` -> run completed (`node: null` follows). Auto mode ends automatically when end IS the recommendation.

Neither mechanism references a node - completion is an action and a drain, never a marker phase.

## Constraint Layering

Project constraints - `.graph-scheduler/constraints.md` - arrive at every node (main/approval/gate) as `## Constraints` block. The source is the built-in `$load-constraints` activation prologue node (§Activation Prologue): it runs at EVERY activation (run start and entry-target resets) and its output JSON is the round's constraint snapshot - round-level freeze (the round's dispatches read the same output; a mid-round edit never affects the in-flight round). The built-in protocol is the compiled-artifact contract: `.graph-scheduler/constraints.json` caches the caveman-compiled rule set (existence = validity, deletion = reset, `compiled_at` audit-only) - the fast path emits the artifact verbatim with zero markdown I/O; the compile path reads `## Rules` and writes the artifact. No run-record snapshot, no process cache, no scheduler file reads - the artifact is agent-side, and the built-in task text carries the protocol. Layer order (additive floor):

platform layer < node-level task/context < skill-level `## Rules`

- Lower layer appends only - never overrides upper layer
- Same-dimension conflict (e.g. language) -> keep both entries, agent judges by more specific layer
- Dedup: drop entries duplicating `lang.conversation`/`lang.documents`/`git.policy` structured fields (atom-kernel rule 3 reuse)
- Block cap 2 KB - exceed -> explicit warning, never silent truncation
- The YAML `constraints` phase field was removed - project constraints are the single constraints source; authors override the source by declaring their own `$load-constraints` node (reserved-id override)

## Channel File Consumption

Channel file entries (globs / bare paths) consume per the HLT read chain (atom-kernel §High-Level Tool Registry Entry: read) - structural overviews first (serena `get_symbols_overview`), then sliced reads (serena `read_file` line selectors); unavoidable read results > 8KB -> `headroom_compress` before reasoning (compress entry trigger - single compression discipline). Entries aggregating < 8KB arrive verbatim agent-side as `## File:` blocks (unchanged small-file behavior).

**Structural verbatim invariant (never compressed):** `node:` streams, dependsOn direct outputs, constraints block, run-mode block, agent hints. Applies to main/approval/gate alike. No manifest, no budget, no CLI: the compress entry (§HLT Registry, atom-kernel) + Tool usage check provide the single compression discipline and its observability.

## Approval Decision Confirmation

Approval phase (`type: approval`) = decision-confirmation node. Accepts AI recommendation, takes free input, routes. The default card = **Accept** (the AI recommendation) + **system free input** (approval() custom input) + **AI-generated contextual options** (retry/jump/end/branch-route - judged at execution from the judgment context (per §Jump Semantics) + snapshot + run mode, never written). Written routing actions exist ONLY for explicit branch-route selection (the sole system-wide scenario: openspec-pipeline minimal/detailed tracks).

### Branch-Route Actions

YAML: see YAML-EXAMPLES.md §Branch-Route Actions.

### Action Semantics

|Action|Routing|target field|
|-|-|-|
|`continue`|Normal advance. Branch-route: activates the target node-or-route (`graph_advance` `branchTo`). `note` logged to metadata.|Branch-route only - node or route id|
|`retry`|Retry target phase - re-execute from target (`graph_jump`). `note` carried as retry feedback.|Required - explicit retry target node id|
|`jump`|Jump to target phase. Resets target + downstream (`graph_jump`). `note` logged as reason.|Required|
|`end`|Complete the run immediately - `graph_advance` `endRun: true` -> run completed.|Unused|

Each action MAY declare `value` (stable kebab-case machine identifier - carried in the persisted decision; gate jump conditions and AI recommendations reference `decision value`, never the display label). Run Mode auto-execution semantics: per PHASESCHEMA.md §Approval Routing Actions (single home).

### Approval Dependency Rule

Approval phases SHALL depend on exactly the review-convergence node - never on the writer phases the review already joins over.

`join: any` on an approval with writer deps fires as soon as ANY writer completes - approval SHALL depend on the review-convergence node only. Writer phases are transitive deps of the review node; listing them violates §DependsOn Rules #3 (redundancy check).

YAML (correct / wrong forms): see YAML-EXAMPLES.md §Approval Dependency Rule.

### Approval Redundancy Rule

Approval phases SHALL present a reviewable artifact or a semantic branch to the human - never re-confirm a decision already confirmed by an interactive upstream node (scope interview, grilling conversation). A card whose decision was interactively confirmed moments earlier in the same conversation and whose surface carries no artifact the human has not yet seen is redundant - SHALL NOT be declared. Redundancy removal SHALL NOT create a silent pass-through: the paired gate keeps bounded auto-rework, and the downstream generation node SHALL degrade observably (e.g. `spec_status: blocked` with candidates) when the gate retry bound is exhausted with incomplete fields.

Gate nodes SHALL NOT replace approval acceptance semantics - gate jumps express backward rework, never acceptance; acceptance decisions stay approval-only (§Gate Type).

YAML (redundant / valid forms): see YAML-EXAMPLES.md §Approval Redundancy Rule.

### Auto-Rework (gate) Rules

Gate jump conditions drive automatic rework. Auto-rework conditions SHALL satisfy all four rules - violation is a validation warning:

1. **Contract-field reference** - the condition SHALL reference observable fields of the reviewer's machine-parseable output contract (e.g. code-review `overall: fail`), never free-text phrases ("contains FAIL verdict") the LLM must guess at.
2. **Bounded** - the condition SHALL bound rework by a deterministic counter: `AND <target> retryCount < N` - the target node's retry count (see §Gate Jump Conditions; the bound deterministically trips). Past the bound the condition is false and the gate passes through (typically to the paired approval - human). Unbounded auto-rework risks an infinite loop.
3. **Writer target** - the jump `to` SHALL be the writer node whose output the reviewer evaluated (the node whose re-execution can change the verdict). Targeting the reviewer itself re-runs it over unchanged artifacts - same verdict, wasted cycle.
4. **Single-writer scope** - auto-rework SHALL only be used when the reviewer has exactly one writer upstream. Multi-writer reviews (a cross-review over several flows) have no single rework point - omit the jump and let the human approval choose (AI-generated retry/jump options / free input).

Canonical example: §Gate+Approval Pair Pattern (bounded, contract-field, writer target, single writer).

YAML anti-pattern: see YAML-EXAMPLES.md §Auto-Rework Anti-Pattern.
