---
name: atom-graph-spec
description: Reference for .taskflow.yaml graph format specification — PhaseSchema, topology, gate rework jumps, join modes, channels, approval decision confirmation, branch routes, Run Mode. Use when writing or reviewing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.4.0
last_updated: '2026-08-04'
---

> **Runtime constraints** — load `atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference specification for `.taskflow.yaml` graph definitions. Authoritative spec for graph format — PhaseSchema fields, topology constraints, gate rework jumps, join modes, channel requirements, approval decision confirmation, branch routes, Run Mode, YAML format rules.

Intended consumers: `atom-graph-design`, `code-review`, `atom-graph-writer`.

**Priority**: atom-graph-spec rules > atom-phase-handler conventions. Conflict → atom-graph-spec wins.

---

# Graph Schema

## Top-Level Fields

|Field|Type|Required|Purpose|
|-|-|-|-|
|`name`|string|yes|Graph identifier — resolved by scheduler registry. Kebab-case.|
|`version`|number|no|Schema version. Defaults to 1 — omit.|
|`phases`|Phase[]|yes|Phase list. Declaration order cosmetic — execution order resolved exclusively by dependsOn DAG. List in dependency order for readability.|

## Phase Fields

YAML field names shown below. Scheduler resolves to internal NodeDetail fields at runtime — see `atom-phase-handler` §NodeDetail for full schema. Field names in `.taskflow.yaml` differ from NodeDetail for some fields — table maps both.

|Field (YAML)|NodeDetail|Type|Required|Purpose|
|-|-|-|-|-|
|`id`|`nodeId`|string|yes|Unique phase identifier. Kebab-case.|
|||`type`|`type`|string|yes|Phase type — closed enum: dispatch types `main`/`approval`/`gate` + composition type `flow` expanded at load time. See §Type Ownership Layers.|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
||`skill`|`skill`|string?|`main`|Execution skill — the skill that runs this phase's work; serves as the channels contract source (dual-track). Registry `skill` is the handler, never a dispatch target.|
||`agent`|`agent`|string[]?|`main`|Agent hints — priority-ordered sub-agent type preferences (e.g. `[reviewer, task]`). Advisory: skills pick the first available type when they dispatch; absent → platform default. Injected as `## Agent hints:` block by atom-phase-handler.|
|`use`|—|string|`flow` type|Referenced graph name. Static constant — merge-at-load flattens. `{...}` dynamic expression → error (Phase 2 deferred). Required for flow — the only flow field (def/with/maxDepth removed).|
|`task`|`task`|string?|`main`, `approval`|Task instruction — executed inline (main) / full card prompt (approval — first line = header ≤30 chars, remaining lines = card body; handler truncates as fallback and appends the generic "Free input overrides." sentence). Use block scalar `|` per §YAML Format Rules.|
||`channels`|`channels`|string[]?|all|Channel entries — main: derived from the dispatched skill's `## Context Requirements` contract (`skill:<name>` reference, `node:<id>` cross-level upstream, bare contract-table match, or file glob); gate/approval: `node:`-only entries (judgment context — schema-level restriction). Contract source dual-track: phase declares `skill` → that skill's contract; no `skill` → explicit `skill:`/`node:`/glob only, bare name errors. Resolved deterministically by the shared resolver (validate + runtime same implementation). Replaces legacy `context`.|
||`route`|`route`|string?|all|Route membership — declared route id. Flows propagate their id to children (flatten); absent = implicit default route (always active). See §Routes.|
||`jumps`|`jumps`|Jump[]?|`gate`|Rework jumps — `[{when, to}]`: `when` is a natural-language condition (agent-judged), `to` an explicit BACKWARD target node id (upstream terminal — validator-enforced). Required non-empty on gate; forbidden on all other types (loud rejection).|
||`routing`|`routingActions`|Route[]?|`approval`|Decision routing with nested `actions` array — declared ONLY in branch-route scenarios; each action declares `target` (node or route id) + `value` (stable machine id) + label/description. See §Approval Routing. Approval card header derives from `task`'s first line (fallback `Decision Required`) — no separate topic field.|
|`join`|`join`|`'any'` literal|any phase|`join: any` — phase fires when any upstream completes. Existence of `join` IS the any-mode declaration (`z.literal('any')`); absent = all. Explicit `join: all` → schema rejection. Validator: `join: any` requires direct upstreams spanning ≥2 routes.|

## Flow Phase Fields

`type: flow` references a saved sub-graph via `use` (inline `def`, `with` params, `maxDepth` removed). Phase 1 (merge-at-load): loader flattens flow phases at graph load time. Zero runtime overhead — flow type invisible to FSM/API/agent after load.

### Constraints

1. **use required** — flow phases SHALL declare `use`; schema rejects flow without it.
2. **Static only** — `use: "graph-name"` — no `{...}` runtime expressions (Phase 2 deferred). Dynamic expression → `FlowPhaseError`.
3. **Depth cap** — constant 5 (field removed). One flow referencing another → depth counter increments. Level 6 → error.
4. **Name collision** — child node ID prefixed with `<parentId>/`. Parent graph MUST NOT have existing `parentId/childId` nodes — detected at load time.
5. **dependsOn semantics** — parent phase downstream depends on child graph terminals (nodes with no downstream in the child graph). Loader rewrites after flatten.
6. **Registry required** — `use` name MUST exist in graph registry (`registry.json`). Unregistered graph → load error.
7. **Route propagation** — a flow declared as a route (`route: <id>`) propagates its id to children (children without their own `route` inherit the flow's). Branch-route flows MUST declare `route:` — routes are explicit, never inferred from composition. Children with their own `route` keep theirs.

### Example

```yaml
# Parent graph — skill-change-workflow.taskflow.yaml
name: skill-change-workflow
phases:
  - id: plan
    type: main
    dependsOn: []
    task: |
      Analyze requirements.
  - id: skill-ops
    type: flow
    use: skill-author
    dependsOn: [plan]
  - id: review
    type: approval
    dependsOn: [skill-ops]
    channels: [node:skill-ops/plan-parse]
    task: |
      Accept change
      Recommendation follows the plan-parse judgment.
```

After merge-at-load, `skill-ops` replaced by `skill-ops/scope-confirm` through `skill-ops/output-examples`. `review` depends on child terminals — `skill-ops/output-examples` (final child node).

Auto-supplied fields (NEVER write in YAML):

- `handlerSkill` (string) — constant `atom-phase-handler` for main/approval/gate (no registry).
- `skill` (string) — resolved from `skill` field; the execution skill for the phase's work.
- `retryAttempt` (number) — runtime counter. 0-based. The node's own jump re-execution count; gate jump bounds reference the TARGET node's `retryCount` (single counter — see §Gate Jump Conditions).

Run mode and project constraints are NOT NodeDetail fields — they arrive via the activation prologue node outputs (§Activation Prologue). `constraints`/`runMode` declared in YAML → schema rejection with migration hints.

## Routes

### Route Field (all phase types)

`route: <id>` marks phase membership in a named route. Routes are explicit route-first constructs — zero inference.

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`route`|`route`|string?|Route membership — declared route id. Absent = implicit default route (always active, never stored).|

- **Flow-as-route** — a flow phase declaring `route: <id>` IS a route: flatten propagates the id to children without their own `route`. Branch-route flows MUST declare `route:` — routes are explicit, never inferred from composition.
- **Activation** — a node activates iff its route is active AND its dependencies are satisfied (O(1) lookup, zero inference). NO vacuous satisfaction: a dependency on an unselected route is NOT satisfied — sequence through the decision node or use an `any`-join (the branch-route join pattern) so the unselected route never blocks while the chosen one completes. Unselected route members never activate — they stay `pending` forever and never block run completion (never-scheduled).
- **Approval branch-route decisions** — the ONLY written routing scenario: the approval declares options with `target` (node or route id) + `value`. Choosing one activates the node-or-route (scheduler activates the target and, for a route target, every member). See §Approval Routing.

### Approval Routing Actions (branch-route only)

YAML format uses `routing` with nested `actions` array. Each action maps to one question() option. Written actions are declared ONLY for explicit branch-route selection — the default card is Accept (AI recommendation) + free input + AI-generated contextual options.

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`action`|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Routing semantics — continue (advance; branch-route target = node or route id), retry (re-execute target), jump (go to target node), end (complete the run — `graph_advance` `endRun`).|
|`target?`|`target?`|string|Branch-route option target (`continue` — node or route id) or re-run target (`retry`/`jump` — node id). Routing targets SHALL be explicit.|
|`value`|`value`|string|Stable kebab-case machine identifier — persisted decision output carries it; gate jump conditions and AI recommendations reference `decision value`, never label text.|
|`label`|`label`|string|Option label displayed in question()|
|`description`|`description`|string|Option description displayed in question()|

No static default field exists — Run Mode auto executes the AI recommendation (agent-judged from the judgment context — direct dependsOn outputs + `channels` `node:` targets — plus snapshot + run mode), never a declared action.

---

# Topology Constraints

## DependsOn Rules

1. **Acyclic** — NO dependency cycles. `A → B → A` invalid. Cycle detection: check transitive closure.
2. **Minimal** — declare only direct dependencies. Transitive deps resolved implicitly.
3. **Redundancy check** — `dependsOn: [A, B]` where `B` depends on `A` → drop `A`. Only leaf deps needed. Judgment context is NOT a dependsOn concern — gate jump conditions and approval recommendations reference the judgment context (direct dependsOn outputs + `channels` `node:` targets), never implicit dependsOn edges (§Gate Type; dependsOn stays purely topological).
4. **Entry nodes** — exactly one phase with `dependsOn: []`. Single entry point. Exception — orchestrators with multiple entry roots (entry-rooted flows) declare several zero-in-degree phases; dispatch follows declaration order (load-bearing).

## Join Mode Rules

Phases with `dependsOn` length > 1:

|Mode|Config|Behavior|
|-|-|-|
|`all` (default)|No `join` field|Fire when ALL upstreams complete. Explicit `join: all` → schema rejection — `join` accepts only the `'any'` literal (`z.literal('any')`).|
|`any`|`join: any`|Fire when ANY upstream completes. Others stay `pending` (unactivated). `join`'s existence IS the any-mode declaration.|

### Any-join Constraints

1. **Deadlock** — when ALL upstreams of an `any` phase stay unactivated (members of unselected routes), the phase never fires. Prevent: `any`-join upstreams SHALL sit on the implicit default route or a route guaranteed to activate — an `any` join over branch-route members is legal ONLY when a preceding decision node guarantees at least one member activates (the branch-route join pattern: pipeline-done joins the chosen track's terminal while the unselected track never blocks).
2. **Partial activation** — `any` phase fires after one upstream completes. Remaining upstream nodes stay `pending` (unactivated).
3. **Downstream awareness** — `any` phase downstreams see upstreams as completed or pending; jump conditions and AI recommendations reference observable facts (output contract fields, decision values, retryCount), never node status.
4. **Route span** — `join: any` requires the direct upstream set to span ≥2 routes (validator-enforced). A join whose upstreams all sit on one route is `all`-semantics — omit `join`.

---

# Gate Jump Conditions

Natural-language rework conditions — LLM-evaluated by the agent at gate dispatch (§Gate Type). Judgment stays agent-side; the scheduler applies the jump mechanically. A hit = backward jump (target + downstream terminal nodes reset to pending, upstream kept, target retryCount incremented — never zeroed); no hit = pass through (zero forward effect).

## Writing Effective Conditions

1. **Observable facts** — reference concrete output contract fields: `review/arch-review output shows top_rec_remaining: false`
2. **Decision values** — approval decisions reference the chosen action's stable `value`, never its display label: `review-accept output shows decision value: implement` (label is pure display — reorder-safe)
3. **retryCount bounds** — bounded conditions reference the target node's `retryCount` (single counter — JUMP increments, never zeroes): `apply-change retryCount < 2` (bounded rework), `loop-entry retryCount >= 8` (bound exhausted → condition false → pass through, end recommended downstream)
4. **Scope-bounded** — reference outputs of direct `dependsOn` ∪ `channels` `node:` targets ∪ jump targets exclusively. NEVER sibling output existence (`no … output present`) or hardcoded `.taskflow/outputs/` paths.
5. **Conservative** — ambiguous judgment → no match → pass through. Do NOT fabricate a jump.

## Anti-Patterns

|Bad|Good|
|-|-|
|`"plan seems ready"`|`"scope-confirm output shows scope_complete: true"`|
|`"previous steps done"`|`"requirement-analysis output exists and has: phase_count > 0"`|
|`"user said yes"`|`"plan-accept output shows decision value: proceed"`|
|`"no sibling output present"`|`"scope-confirm output shows save_location and no skill_path"`|

Referenced outputs must sit in the gate's judgment scope (direct dependsOn / `channels` `node:` / jump targets) — a referenced node outside the scope declares `channels: [node:<id>]`.

---

# Context Requirements Convention

Main and approval phases declare context requirements in three deterministic sections. Handler assembles and injects before dispatch.

## Three-Section Format

Entry skills declare:

```markdown
## Context Requirements

### From upstream

- <nodeId>

### Reference skills

- <skill-name>

### Files

- <glob>
```

- **From upstream** — upstream phase node IDs. Handler injects their outputs as `## Upstream: <nodeId>`.
- **Reference skills** — skill names loaded by plain name. Handler resolves and injects as `## Reference: <skill-name>`.
- **Files** — project file globs. Handler resolves before dispatch. Injected as `## File: <path>`.

## YAML channels Field

Graph YAML `channels` field derives from the dispatched skill's contract — type comes from the contract tables, never guessed (main); gate/approval declare `node:`-only entries (judgment context, schema-level restriction):

|YAML channel entry|Type|Example|
|-|-|-|
|`skill:<name>` (explicit prefix)|Reference skills|`skill:atom-graph-spec`|
|`node:<id>` (explicit prefix)|From upstream — cross-level legal|`node:plan-parse`|
|bare entry in contract From upstream table|From upstream|`scope-confirm` (only when also a `dependsOn` node — else migrate to `node:` prefix)|
|bare entry in contract Reference skills table|Reference skills|`atom-graph-spec`|
|bare entry in contract Files table or glob shape (`*`, `?`, `[`, `/`)|Files|`docs/adr/*.md`|
|entry duplicating a `dependsOn` node|redundant declaration → warning|—|
|entry matching nothing|error — no fallback search|—|

Approval and gate phases declare `channels` with `node:`-only entries (judgment context). Main phases declare `channels` (inline context assembly — contract source is the `skill` field when present, else explicit `skill:`/`node:`/glob entries only). The removed `preText`/`reads` fields (schema field convergence) are rejected globally — the approval card = `task` full text (first line header) + recommendation + options + free input; cross-level judgment references migrate to `channels: [node:<id>]`.

## Constraints

1. Channel entries resolve BEFORE dispatch against the entry skill contract — unresolvable entry → phase fails (no fallback search).
2. File globs truncated to reasonable size before injection.
3. Upstream outputs injected as `## Upstream: <nodeId>` blocks into sub-agent prompt.
4. Reference skills injected as `## Reference: <skill-name>` blocks.
5. File contents injected as `## File: <path>` blocks.
6. Contract Reference skills / Files entries missing from graph channels → CLI validate error (channel deletion is never silent).
7. Skill `## Context Requirements` is the single source of truth — machine-parseable three-subsection lists, no `<configurable>` placeholders.

> **Terminology**: context contract = skill `## Context Requirements`; context channels = graph `channels` field; injected context = handler-assembled `## Upstream:` / `## Reference:` / `## File:` prompt blocks.

## Type Ownership Layers

Phase types belong to one of two layers (documented ownership model — optional layer removed with the agent type, registry mechanism removed):

|Layer|Types|Dispatch|Disability|
|-|-|-|-|
|Base|`main`, `approval`, `gate`|Static handlers resolved by type (schema-enforced enum)|Never — FSM jump protocol, decision-card flow, gate rework jumps, and run completion marking depend on them|
|Composition|`flow`|Load-time expansion (merge-at-load) — not a dispatch type|N/A — dispatch has no meaning for it|

No custom project types — `type` is a closed enum (`main`/`approval`/`gate`/`flow`); unknown types fail schema parse.

## Gate Type

Gate phase (`type: gate`) is the **pure rework node** — the machine counterpart of the `approval` (human card). Decision authority is split: the gate evaluates rework conditions (agent judgment) and reports a backward jump; the approval asks the human. Both produce the same `IApprovalDecision` protocol; a gate hit carries `action: jump`, `target: <jump to>`, `label: <jump when>` (pilot routes it via `graph_advance` `branchTo` — the scheduler applies the reset mechanically); no hit carries `action: continue` with no target — pass through, zero forward effect.

### Field Closure

Gate SHALL declare exactly: `id`, `type`, `dependsOn`, `route?`, `jumps` (required, non-empty), `channels` (`node:`-only entries), `join?`. Forbidden fields (`task`/`preText`/`routing`/`agent`/`skill`/`use`) SHALL be rejected by schema (loud rejection — superRefine pattern). `preText` and `reads` are rejected globally (removed fields — schema field convergence): approval card text lives in `task`; judgment references migrate to `channels: [node:<id>]`. `jumps` required and non-empty — a gate without rework jumps is a silent pass-through; delete the gate or declare when/to pairs.

### Jump Semantics

1. **jumps** — `[{when, to}]`: `when` is a natural-language condition (agent-judged against the judgment context — direct dependsOn outputs + `channels` `node:` targets — plus snapshot + run mode), `to` an explicit BACKWARD target node id — an upstream terminal node (validator-enforced) (§Gate Jump Conditions).
2. **Evaluation** — conditions evaluated in declaration order; the first match selects its jump — stop. No match = pass through.
3. **Hit → backward jump** — the target plus its downstream terminal nodes reset to `pending` (JUMP closure); the target's `retryCount` increments (never zeroed — bounds reference the counter); upstream nodes are KEPT (their outputs stay — the rework reuses them).
4. **No hit → pass through** — zero forward routing: the gate activates nothing, routes nothing forward, blocks nothing. Downstream readiness resolves topologically as usual.
5. **Judgment context** — direct dependsOn outputs (auto-injected, main parity) + `channels` `node:` targets; handler assembles exactly those outputs + current snapshot (per-node states incl. retryCount) + run mode for evaluation. `dependsOn` stays purely topological. Removed `reads` (schema field convergence) — cross-level references declare `channels: [node:<id>]`.

### Gate+Approval Pair Pattern

Machine rework first, human card second — a bounded auto-rework gate feeding the decision card:

```yaml
- id: change-gate
  type: gate
  dependsOn: [change-review]
  jumps:
    - when: 'change-review output shows overall: fail AND apply-change retryCount < 2'
      to: apply-change
- id: change-accept
  type: approval
  dependsOn: [change-gate]
  channels: [node:change-review]
  task: |
    Accept change
    Recommendation follows the review verdict: pass → accept; fail past the
    rework bound → escalate for human decision.
```

The jump hit re-runs the writer; no hit passes through to the paired approval — the human decides (Accept the recommendation, or override via free input). Never a silent stall, never a fabricated jump.

### Loop Router Pattern

A gate may act as a **loop router** — machine-iterating NEW artifacts instead of reworking the same one. Distinguishing shape (arch-review-loop `loop-gate`):

- The jump condition references the reviewer's **affirmative continuation signal** (`review/arch-review` output `top_rec_remaining: true`) — the loop re-runs while it affirms progress, not while it reports failure — AND the round bound (`loop-entry retryCount < 8`).
- The re-round target is the **round origin `loop-entry`** — the loop re-asks scope (user-confirmed/adjusted every round) and re-runs the whole round. Round reset is structural: `review` flow `dependsOn: [loop-entry]` + `implement` flow `dependsOn: [review-accept]` — the JUMP closure resets scope → review → accept → implement in one hop.
- **Termination is never a node** — the round-end approval recommends `end` (no Top Rec remains OR bound exhausted) or loop again (Top Rec remains AND bound not exhausted); auto mode executes the recommendation, ending automatically when end IS the recommendation. Completion is an end action or natural drain.
- The judgment context covers every output a condition references: direct dependsOn outputs + `channels` `node:` targets (the round worker's flattened id, the entry decision node) — evaluation context is explicit, never implicit.

```yaml
# arch-review-loop tail — loop-gate jump + loop-accept (decision confirmation)
- id: loop-gate
  type: gate
  dependsOn: [implement]
  channels: [node:review/arch-review]
  jumps:
    - when: 'run mode is auto AND review/arch-review output shows top_rec_remaining: true AND loop-entry retryCount < 8'
      to: loop-entry
- id: loop-accept
  type: approval
  dependsOn: [loop-gate]
  channels: [node:review/arch-review]
  task: |
    End the review loop?
    Recommendation follows the report state: Top Rec remains AND bound not
    exhausted → loop again (retry loop-entry); nothing remains → end action
    (auto mode ends automatically).
```

## Completion

A run completes by one of two mechanisms:

1. **Natural drain** — no node is `active` and no node is eligible (route active ∧ dependencies satisfied — the topological result of the DAG). Unselected-route members stay `pending` forever and never block completion.
2. **Approval `end` action** — the AI recommendation or the human choice routes the run to completion: `graph_advance` with `endRun: true` → run completed (`node: null` follows). Auto mode ends automatically when end IS the recommendation.

Neither mechanism references a node — completion is an action and a drain, never a marker phase.

## Constraint Layering

Project constraints — `.graph-scheduler/constraints.md` — inject into every node (main/approval/gate) as `## Constraints` block. The source is the built-in `$load-constraints` activation prologue node (§Activation Prologue): it reloads the file at EVERY activation (run start and entry-target resets) and its output JSON is the round's constraint snapshot — round-level freeze (the round's dispatches read the same output; a mid-round file edit never affects the in-flight round). No run-record snapshot, no process cache, no scheduler file reads — the load protocol is agent-executed (## Rules verbatim-copy contract in the built-in task). Layer order (additive floor):

platform injection < node-level task/context < skill-level `## Rules`

- Lower layer appends only — never overrides upper layer
- Same-dimension conflict (e.g. language) → keep both entries, agent judges by more specific layer
- Dedup: drop entries duplicating `lang.conversation`/`lang.documents`/`git.policy` structured fields (atom-kernel rule 3 reuse)
- Block cap 2 KB — exceed → explicit warning, never silent truncation
- The YAML `constraints` phase field was removed — project constraints are the single injection source; authors override the source by declaring their own `$load-constraints` node (reserved-id override)

---

# Approval Decision Confirmation

Approval phase (`type: approval`) is the decision-confirmation node — it accepts the AI recommendation, takes free input, and routes. The default card = **Accept** (the AI recommendation) + **system free input** (question() custom:true) + **AI-generated contextual options** (retry/jump/end/branch-route — judged at execution from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode, never written). Written routing actions exist ONLY for explicit branch-route selection (the sole system-wide scenario: openspec-pipeline minimal/detailed tracks).

## Branch-Route Actions

```yaml
routing:
  actions:
    - action: continue
      target: minimal-track
      value: minimal-track
      label: 'Minimal track — apply directly'
      description: 'No ADR created — implement the change without engineering ceremony'
    - action: continue
      target: detailed-track
      value: detailed-track
      label: 'Detailed track — engineer'
      description: 'ADR created — full spec-to-tickets engineering pipeline'
```

## Action Semantics

|Action|Routing|target field|
|-|-|-|
|`continue`|Normal advance. Branch-route: activates the target node-or-route (`graph_advance` `branchTo`). `note` logged to metadata.|Branch-route only — node or route id|
|`retry`|Retry target phase — re-execute from target (`graph_jump`). `note` injected as feedback.|Required — explicit retry target node id|
|`jump`|Jump to target phase. Resets target + downstream (`graph_jump`). `note` logged as reason.|Required|
|`end`|Complete the run immediately — `graph_advance` `endRun: true` → run completed.|Unused|

Each action MAY declare `value` (stable kebab-case machine identifier — carried in the persisted decision; gate jump conditions and AI recommendations reference `decision value`, never the display label). No static default field exists — Run Mode auto executes the AI recommendation, never a declared action.

## Default Card (no declared routing)

With no declared `routing` (the normal case), the card is assembled at execution:

- **Accept** — accept the AI recommendation (agent-judged from the judgment context + snapshot + run mode: e.g. "no Top Rec → recommend end", "review shows fail → recommend retry the writer").
- **Free input** — question() custom:true text box, always present; free text overrides the recommendation.
- **AI-generated options** — contextual retry/jump/end/branch-route options judged at execution, presented alongside Accept.

## Approval Dependency Rule

Approval phases SHALL depend on exactly the review-convergence node — never on the writer phases the review already joins over.

```yaml
# Correct — review joins both writer paths; approval waits for review conclusion
- id: review
  type: main
  dependsOn: [write-a, write-b]
  join: any
- id: accept
  type: approval
  dependsOn: [review]
```

```yaml
# Wrong — writer listed alongside review: join:any fires approval before review concludes
- id: accept
  type: approval
  dependsOn: [review, write-a, write-b]
  join: any
```

Rationale: `join: any` on an approval with writer deps makes the approval ready as soon as ANY writer completes — decoupling it from the review conclusion. Writer phases are transitive deps of the review node; listing them violates §DependsOn Rules #3 (redundancy check).

## Approval Redundancy Rule

Approval phases SHALL present a reviewable artifact or a semantic branch to the human — never re-confirm a decision already confirmed by an interactive upstream node (scope interview, grilling conversation). A card whose decision was interactively confirmed moments earlier in the same conversation and whose surface carries no artifact the human has not yet seen is redundant — SHALL NOT be declared. Redundancy removal SHALL NOT create a silent pass-through: the paired gate keeps bounded auto-rework, and the downstream generation node SHALL degrade observably (e.g. `spec_status: blocked` with candidates) when the gate retry bound is exhausted with incomplete fields.

Gate nodes SHALL NOT replace approval acceptance semantics — gate jumps express backward rework, never acceptance; acceptance decisions stay approval-only (§Gate Type).

```yaml
# Redundant — interview confirmed the scope; gate checks completeness; card has nothing new to review
- id: scope
  type: main
  skill: atom-scope-interview
- id: scope-gate
  type: gate
  dependsOn: [scope]
  jumps:
    - when: 'scope output shows scope_complete: false AND scope retryCount < 1'
      to: scope
- id: scope-accept # ✗ double confirmation — remove
  type: approval
  dependsOn: [scope-gate]
- id: generate
  type: main
  dependsOn: [scope-accept] # → dependsOn: [scope-gate]
```

```yaml
# Valid — card is the FIRST review point of an artifact the human has not seen
- id: plan
  type: main # synthesizes PRD inside the interview node
- id: plan-gate
  type: gate
  dependsOn: [plan]
  jumps:
    - when: 'plan output shows prd_complete: false AND plan retryCount < 2'
      to: plan
- id: plan-accept # ✓ first PRD artifact review — keep
  type: approval
  dependsOn: [plan-gate]
```

## Auto-Rework (gate) Rules

Gate jump conditions drive automatic rework. Auto-rework conditions SHALL satisfy all four rules — violation is a validation warning:

1. **Contract-field reference** — the condition SHALL reference observable fields of the reviewer's machine-parseable output contract (e.g. code-review `overall: fail`), never free-text phrases ("contains FAIL verdict") the LLM must guess at.
2. **Bounded** — the condition SHALL bound rework by a deterministic counter: `AND <target> retryCount < N` — the target node's retry count (JUMP maintains, never zeroes, so the bound deterministically trips). Past the bound the condition is false and the gate passes through (typically to the paired approval — human). Unbounded auto-rework risks an infinite loop.
3. **Writer target** — the jump `to` SHALL be the writer node whose output the reviewer evaluated (the node whose re-execution can change the verdict). Targeting the reviewer itself re-runs it over unchanged artifacts — same verdict, wasted cycle.
4. **Single-writer scope** — auto-rework SHALL only be used when the reviewer has exactly one writer upstream. Multi-writer reviews (a cross-review over several flows) have no single rework point — omit the jump and let the human approval choose (AI-generated retry/jump options / free input).

```yaml
# Correct — bounded, contract-field, writer target, single writer
- id: change-gate
  type: gate
  dependsOn: [change-review]
  jumps:
    - when: 'change-review output shows overall: fail AND apply-change retryCount < 2'
      to: apply-change
- id: change-accept
  type: approval
  dependsOn: [change-gate]
  task: 'Accept change'
```

```yaml
# Wrong — unbounded free-text condition targeting the reviewer
- id: gate
  type: gate
  dependsOn: [review]
  jumps:
    - when: 'review output contains FAIL verdict'
      to: review
```

---

# Activation Prologue

The activation prefix (P) is the graph-level abstract-node mechanism that carries user-layer facts (run mode, project constraints) as agent-executed nodes instead of backend run-record fields. Two reserved-id built-ins, synthesized at load, executed before every round:

|Node|Reserved id|Behavior (built-in default)|
|-|-|-|
|Run mode confirm|`$run-mode-confirm`|Emit `args.mode` when set (`{args.mode}` interpolation); otherwise question() the user (Manual recommended — absence NEVER auto). Output JSON `{"mode": "manual"\|"auto"}`. Re-decides EVERY activation — round restarts re-ask (no echo).|
|Constraints load|`$load-constraints`|Read `.graph-scheduler/constraints.md` `## Rules` verbatim-copy protocol (deterministic task contract). Output JSON `{"constraints": [...]}`. Reloads EVERY activation — round-level freeze.|

Mechanics:

- **Synthesis** — P is NOT part of the author DAG: excluded from topology, contract checks, and jump-closure math. `$load-constraints` is always synthesized; `$run-mode-confirm` only when the flattened graph contains an approval node (mode exists only where consumed — approval-less graphs get no mode question, no `## Run Mode:` block).
- **Reserved ids** — `$` prefix is reserved for the two prologue built-ins. Declaring the same id in YAML REPLACES the built-in (own task/skill — custom constraints source, forced-auto CI graph, disabled confirm); any other `$` id and any non-entry reserved declaration are schema-rejected.
- **Activation rule** — P runs at run start AND on every backward reset (gate branchTo or graph_jump) whose target is an entry node (flattened in-degree 0): round restart re-runs the prefix (constraints reload, mode re-confirmed). Mid-graph rework resets never touch P.
- **Gating** — while any P node is not terminal, ONLY P nodes are eligible; author nodes dispatch after the prefix completes. P nodes are run members (snapshot `nodes` visible).
- **Consumption** — the handler reads the P output files per dispatch and formats `## Run Mode:` / `## Constraints:` blocks (main/approval/gate alike). Missing/corrupt P output → degrade (manual mode, empty constraints) + warning — never blocks, absence never auto.

# Run Mode

Run Mode = auto-approve convention driven by the `$run-mode-confirm` activation prologue node (§Activation Prologue). Every activation (run start and round restarts) re-confirms the mode: `args.mode` short-circuits (flags/headless callers), otherwise the node asks the user (Manual recommended — absence is never silent Auto). The mode is NOT a run field, NOT a NodeDetail field — approval dispatches read the confirm node's output. Zero per-approval declarations — no static default field exists; the recommendation is agent-judged at execution.

## Mode decision (per activation)

`graph_start { graphName, args?: { mode?: 'manual' | 'auto' } }` — the mode travels as an ordinary graph input (`{args.mode}` interpolation); there is no `mode` top-level param. atom-pilot maps `--auto`/`--manual` to `args.mode` and never asks pre-start; direct MCP callers pass `args.mode` or leave it unset. Flow composition needs no plumbing — nested graphs share the same run activation, so the confirm output applies at any nesting depth.

- Graphs SHALL NOT declare a mode topic in entry task texts — the mode question lives in the built-in confirm node.
- The mode is re-decided per activation — round restarts may change it (the confirm node re-asks; no echo).

## Consumption (direct branch)

atom-phase-handler approval branch reads the `$run-mode-confirm` output:

- `'auto'` → the handler judges the AI recommendation from the judgment context (direct dependsOn outputs + `channels` `node:` targets) + snapshot + run mode. A recommendation exists → auto-execute it: `IApprovalDecision { action, target?, value, label, note: 'run mode: auto' }`, decision file persisted WITH the value + label — downstream gate jump conditions consume the decision `value` exactly as the human path. When ending IS the recommendation, auto mode ends automatically (`graph_advance` `endRun`). No recommendation (judgment fails / context insufficient) → human card even in auto — never guess an action.
- `'manual'` (or missing confirm output) → human card. No output scans, no parse/conflict fail-safe matrix — the confirm output is the single source of truth.

## Context injection

The handler injects `## Run Mode: <mode>` into every node dispatch context (main/approval/gate, same layer as `## Constraints`) — gate jump conditions may reference the mode (loop router pattern).

## Scope

Run Mode controls **approval presentation only**:

- Approval phases — auto-execute the AI recommendation when the mode is Auto.
- Main nodes (grill/scope interviews, work nodes) — never auto-decided, never bypassed by the mode. The mode never gates an interview.
- Gate jump semantics unchanged — a gate may reference the injected run-mode context in jump conditions.

## Loop Router Integration

arch-review-loop demonstrates the full pattern: `$run-mode-confirm`/`$load-constraints` (activation prefix — re-run every round restart via the entry-target reset) → `loop-entry` (scope interview — **re-confirmed every round**: the round origin, always re-run, jump-back target) → `review` flow → `review-accept` (decision confirmation — recommendation: implement when Top Rec remains, else end; auto mode executes it) → `implement` flow (plain composition — sequencing by dependsOn, end by endRun) → `loop-gate` (loop router — jump condition references `run mode is auto`, the round worker's `top_rec_remaining`, and the bound `loop-entry retryCount < 8`; hit → re-round target `loop-entry`) → `loop-accept` (decision confirmation — recommendation: loop again when Top Rec remains AND bound not exhausted, else end action; auto mode ends automatically when end IS the recommendation). …

Round reset semantics: `review` flow `dependsOn: [loop-entry]` + `implement` flow `dependsOn: [review-accept]` — a jump to `loop-entry` (entry node) resets the whole round (scope → review → accept → implement) via the JUMP closure (target + downstream) AND re-runs the activation prefix (constraints refresh, mode re-confirmed). The implement pipeline's grilling is a **mandatory interview** (graph dispatch: zero-question degradation disabled — at least one question() per grill round; auto mode exempts approval cards only, never interviews).

---

# YAML Format Rules

## Block Scalars

`task` field uses literal block scalar `|`:

```yaml
task: |
  Multi-line task instruction.
  Indent preserved — leading spaces kept.
  Blank lines OK.
```

## Flow Sequences

`dependsOn`, `channels` use flow sequence `[...]` for inline lists:

```yaml
dependsOn: [scope-confirm, requirement-analysis]
channels:
  - skill:atom-graph-spec
  - docs/standards/
```

## Comments

`#` comments document intent — jump conditions, phase purpose, routing rationale:

```yaml
- id: graph-review
  type: main # main — inline execution, review skill may dispatch axis sub-agents per hints
  dependsOn: [graph-write]
```

## File Location

Graph YAML files live in the scheduler's graphs directory. File name `<name>.taskflow.yaml` maps to graph `name` for `graph_start({ graphName })` resolution.

## Registry

Register new graphs in the scheduler's graph registry. Without registration, `graph_start` fails with unknown graph name.

---

# Language Constraints

1. **Graph YAML** — field names lowercase, values English. Phase IDs kebab-case.
2. **task content** — English instructions. References to skills use plain skill names. References to phase outputs use nodeId names (injected by main agent from upstream outputs). Declared-inputs contract:
   - **Input references covered** — every phase-output reference in task text must be covered by `dependsOn` (implicit) or `channels` (explicit `node:` entry).
   - **No hardcoded paths** — task text must not contain `.taskflow/outputs/` (validation error, mirroring the gate-condition rule).
   - **Claims match declarations** — «injected» wording must correspond to an actual declared channel or dependsOn edge (undeclared claims warn).
3. **Gate jump conditions and approval recommendation criteria** — English, referencing observable facts in phase outputs (output contract fields, approval decision values, target-node retryCount).
