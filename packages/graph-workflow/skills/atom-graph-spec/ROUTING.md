> Reference sibling of `atom-graph-spec` (SKILL.md) - branch/rework decisions, completion, runtime mechanics, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Convergence

All dependency convergence is AND — a phase fires when EVERY predecessor completes. No `join` field exists (join deleted, syntax v2).

## Rework Decisions

Rework/loop = flow self-edges — no dedicated node type, no `jumps` field, no `branchTo`, no loop template. A phase whose rework loops back to itself declares a top-level `flow` self-edge (`A -->|fail| A`): the inline bounded loop — condition-matched re-entry, never a subgraph/task-template mechanism (graph-flow capability). The condition value is flow-defined vocabulary (zero machine validation axis — governance is the graph-maintain flow audit + user maintenance). The operator `graph_jump` is the operator-level backward reset in the system — graph-external (PCL back/jump/re-review), never declared in graph definitions; graph-internal backward rework to an ancestor rides the advance `jump` channel (see §Advance Channels).

### Self-Edge Loop Semantics

- The loop-head node dispatches as a plain main node; its task text evaluates the loop condition inline (per the flow self-edge declaration).
- NOT satisfied → the node reports the re-entry condition (e.g. `fail`); the pilot advances with `graph_advance(runId, nodeId, condition: 'fail')` — the transition table re-enters the node (missed-condition guard: a condition matching no outgoing flow edge is a loud error).
- Satisfied → the node reports the exit condition (e.g. `pass`); the advance routes downstream (labeled edge or sequence default).
- The bound lives in the loop-head node's task text / the graph's constraints prose (agent-enforced: `at most 2 rounds`), AND the engine increments the re-entered node's `retryCount` on each re-entry edge pass (never zeroed) — the machine counter the bound check observes; vocabulary governance is graph-maintain's flow audit.

### Writing Effective Conditions

1. **Flow declaration** - the condition value lives on the flow-edge label (`A -->|condition| B`); the loop-head node's task text tells the executing agent when to report it (which condition value, and the bound past which it exits).
2. **Observable facts** - reference concrete output contract fields of the node's own execution: `change-review output shows review overall: fail`
3. **Decision values** - conditions reference the chosen action's stable `value`, never its display label.
4. **Conservative** - ambiguous judgment -> no re-run -> the loop exits and the run continues. Do NOT fabricate iterations.

### Anti-Patterns

|Bad|Good|
|-|-|
|`"plan seems ready"`|`"scope-confirm output shows scope_complete: true"`|
|`"previous steps done"`|`"requirement-analysis output exists and has: phase_count > 0"`|
|`"user said yes"`|`"plan-accept output shows decision value: proceed"`|
|`"no sibling output present"`|`"scope-confirm output shows save_location and no skill_path"`|

Referenced outputs must sit in the condition's judgment scope (direct `dependsOn` / `channels` `node:` / global-context `node:` streams) - a referenced node outside the scope declares `channels: [node:<id>]`.

### Self-Loop Bounds (rules)

Flow self-loop conditions SHALL satisfy all four rules - violation is a validation warning:

1. **Contract-field reference** - the loop condition SHALL reference observable output-contract fields (e.g. `review overall: fail`), never free-text phrases the LLM must guess at.
2. **Bounded** - the loop SHALL declare a deterministic bound in the loop-head node's task text / the graph's constraints prose (e.g. `at most 2 rounds`): past the bound the node reports the exit condition (typically routing to a human decision point downstream — approval() card or direct end). Unbounded self-loops risk infinite iteration.
3. **Loop-target phase** - the self-edge SHALL target the phase whose re-execution can change the verdict (the writer+reviewer chain, e.g. `change-review`). Looping a phase that re-runs over unchanged inputs produces the same verdict — wasted cycle.
4. **Single-writer scope** - auto-iteration SHALL only be used when the looped phase's reviewer has exactly one writer upstream. Multi-writer reviews (a cross-review over several flows) have no single re-run point - omit the loop and let the human decide.

Canonical shape: bounded, contract-field, loop-target phase, single writer.

YAML: see YAML-EXAMPLES.md §Rework/Loop Pattern (flow self-edge).

## Advance Channels (graph-flow capability)

`graph_advance` carries three decision channels beyond the sequence default (none = dependency activation):

- **`condition`** - normal advance carrying the flow-defined condition value: resolved via the reported node's transition table (labeled flow edges) — no match is a loud error (missed-condition guard). Self-edge re-entry = the inline bounded loop; labeled forward edges = condition-matched routing.
- **`jump`** - graph-internal forced rework (backward reset): the target node and its downstream terminal nodes return to `pending` (upstream kept, `retryCount`++ on the reset scope, never zeroed); the target is restricted to the reported node's topological ancestors ∪ `__handoff` — forward jumps are rejected loudly (structure-integrity guard). Distinct from the operator `graph_jump` tool (PCL, graph-external, unchanged) — the advance `jump` channel is the node-decision-driven backward rework, the operator tool is the PCL backward reset.
- **`end: true`** - direct-end adapter completion (see §Completion).

## Router Template (template: router)

A `template: router` phase is a **path-selection node** (graph-router-template) — the one-shot SELECTION declaration, the sole nested-execution declaration (no loop template exists):

- **Declaration** - `template: router` + `template_args.paths` (graph names; see PHASESCHEMA.md §Router Template). No `task`, no `branchTo` (the use field no longer exists); router = sole nested-execution declaration.
- **Selection routing** - the compiled task text makes the executing agent decide: single candidate or satisfied hard criterion → self-decide (zero card, no `branchTo`); ambiguity → approval() card (options = machine-declared `template_args.paths`, recommendation marked).
- **Activation = sibling run** - the chosen graph starts via `graph_start` with the required args (report path / change name / adoption echo) from the node's context and is driven to completion; the node reports `chosen_graph` / `run_id` / result fields. Downstream depends on the router node and reads via `channels: [node:<router>]` — no any-join over track terminals (the unselected graph never runs).
- **Completion** - the run completes by natural drain as usual; the router's sibling run is an execution detail of the node, not a graph branch.

## Completion

The run completes by natural drain: no node is `active` and no node is eligible (dependencies satisfied - the topological result of the dependency edges). `graph_advance` returns `node: null` (`fsmState` `completed`). Completion is a drain, never a marker phase.

- **force_end** - `graph_force_end` terminates a run (`fsmState` `terminated`, irreversible). Pilot-command surface, never a graph-file construct.
- **No endRun** - `graph_advance` has no endRun param (removed, ADR 0215); the direct-end replacement is the `end: true` resume param — the direct-end decision (`completion` `direct_end` label / `direct end:` declaration) completes the run as `completed` via adapter-level completion (reported node marked done, run completes without resuming the graph — unfinished nodes stay pending; never `terminated`; `graph_force_end` serves abnormal termination only).

## Acceptance Dependency Rule

Acceptance main phases SHALL depend on exactly the review-convergence node - never on the writer phases the review already converges over. Writer phases are transitive deps of the review node; listing them alongside review violates §DependsOn Rules #3 (redundancy check).

YAML (correct / wrong forms): see YAML-EXAMPLES.md §Acceptance Dependency Rule.

## Acceptance Redundancy Rule

Acceptance main phases SHALL present a reviewable artifact or a semantic branch to the human - never re-confirm a decision already confirmed by an interactive upstream node (scope interview, grilling conversation). A card whose decision was interactively confirmed moments earlier in the same conversation and whose surface carries no artifact the human has not yet seen is redundant - SHALL NOT be declared. Redundancy removal SHALL NOT create a silent pass-through: the paired rework decision keeps bounded auto-rework, and the downstream generation node SHALL degrade observably (e.g. `spec_status: blocked` with candidates) when the rework retry bound is exhausted with incomplete fields.

YAML (redundant / valid forms): see YAML-EXAMPLES.md §Acceptance Redundancy Rule.

## Constraint Layering

Three layers, two injected sources. **Project layer** - `.graph-scheduler/constraints.md` - arrives at every node (main) as `[project]`-prefixed block entries. The source is the activation load (§Activation): the pilot loads once per activation (compiled-artifact contract: `.graph-scheduler/constraints.json` caches the caveman-compiled rule set — existence = validity, deletion = reset, `compiled_at` audit-only — fast path emits the artifact verbatim with zero markdown I/O; compile path reads `## Rules` and writes the artifact) and holds the round's constraint snapshot in the session — round-level freeze (the round's dispatches read the same session copy; a mid-round edit never affects the in-flight round). No run-record snapshot, no process cache, no scheduler file reads.

Layering precedence (lower appends only):

platform layer < project layer (`[project]`) < graph layer (`[graph]`) < node-level task/context < skill-level `## Rules`

- Lower layer appends only - never overrides upper layer
- Same-dimension conflict (e.g. language) -> keep both entries, agent judges by more specific layer
- Dedup: drop entries duplicating `lang.conversation`/`lang.documents`/`git.policy` structured fields (atom-kernel rule 3 reuse); applies to the merged block
- Block cap 2 KB - exceed -> explicit warning, never silent truncation
- The YAML phase-level `constraints` field was removed - graph-level rules go to the top-level `constraints` field; project discipline stays in `.graph-scheduler/constraints.md` (compiled artifact); `$`-prefixed ids are schema-rejected (the activation prologue was removed)

## Channel File Consumption

Channel file entries (globs / bare paths) consume per the read chain (atom-kernel tool discipline) - structural overviews first (serena `get_symbols_overview`), then sliced reads (serena `read_file` line selectors). Entries aggregating < 8KB arrive verbatim agent-side as `## File:` blocks (unchanged small-file behavior).

**Structural verbatim invariant (never compressed):** `node:` streams, dependsOn direct outputs, constraints block. Applies to main (the only dispatch type). The Tool usage check remains.
