---
name: atom-graph-spec
description: Reference for .taskflow.yaml graph format specification — PhaseSchema, topology, when guards, join modes, channels, approval/gate routing, Run Mode. Use when writing or reviewing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.3.0
last_updated: '2026-08-03'
---

> **Runtime constraints** — load `skill://atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference specification for `.taskflow.yaml` graph definitions. Authoritative spec for graph format — PhaseSchema fields, topology constraints, when guards, join modes, channel requirements, approval routing, Run Mode, YAML format rules.

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

YAML field names shown below. Scheduler resolves to internal NodeDetail fields at runtime — see `skill://atom-phase-handler` §NodeDetail for full schema. Field names in `.taskflow.yaml` differ from NodeDetail for some fields — table maps both.

|Field (YAML)|NodeDetail|Type|Required|Purpose|
|-|-|-|-|-|
|`id`|`nodeId`|string|yes|Unique phase identifier. Kebab-case.|
||`type`|`type`|string|yes|Phase type — closed enum: base dispatch types `main`/`approval`/`gate` (static handlers) + composition type `flow` expanded at load time. See §Type Ownership Layers.|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
||`skill`|`skill`|string?|`main`|Execution skill — the skill that runs this phase's work; serves as the channels contract source (dual-track). Registry `skill` is the handler, never a dispatch target.|
||`agent`|`agent`|string[]?|`main`|Agent hints — priority-ordered sub-agent type preferences (e.g. `[reviewer, task]`). Advisory: skills pick the first available type when they dispatch; absent → platform default. Injected as `## Agent hints:` block by atom-phase-handler.|
|`use`|—|string|`flow` type|Referenced graph name. Static constant — merge-at-load flattens. `{...}` dynamic expression → error (Phase 2 deferred). Required for flow — the only flow field (def/with/maxDepth removed).|
|`task`|`task`|string?|`main`|Task instruction — executed inline (main) / decision-card topic (approval — approval topic derives from `task`, fallback `Decision Required`). Use block scalar `|` per §YAML Format Rules.|
||`channels`|`channels`|string[]?|`main`|Channel entries — derived from the dispatched skill's `## Context Requirements` contract: `skill:<name>` (reference), `node:<id>` (cross-level upstream), bare contract-table match, or file glob. Contract source dual-track: phase declares `skill` → that skill's contract; no `skill` → explicit `skill:`/`node:`/glob only, bare name errors. Resolved deterministically by the shared resolver (validate + runtime same implementation). Replaces legacy `context`.|
|`preText`|`preText`|string?|`approval`|Decision-card pre-call text — displayed before question(), never channel-resolved. Replaces legacy `context`.|
|`when`|`when`|string?|all|Natural-language skip condition — LLM-evaluated. See §When Guard Rules.|
|`eval`|`eval`|EvalCondition[]?|`gate`|Auto-decision conditions — machine judgment, evaluated by the agent. First match short-circuits. Actions closed to `retry`/`jump` — `continue` rejected (silent gate bypass unexpressible). Required on gate; forbidden on all other types (loud rejection).|
|`routing`|`routingActions`|Route[]?|`approval`|Decision routing with nested `actions` array. See §Approval Routing. Approval card topic derives from `task` (fallback `Decision Required`) — no separate topic field.|
|`join`|`join`|string?|`any` phase|`"any"` — phase fires when any upstream completes. Default: all upstreams.|

## Flow Phase Fields

`type: flow` references a saved sub-graph via `use` (inline `def`, `with` params, `maxDepth` removed). Phase 1 (merge-at-load): loader flattens flow phases at graph load time. Zero runtime overhead — flow type invisible to FSM/API/agent after load.

### Constraints

1. **use required** — flow phases SHALL declare `use`; schema rejects flow without it.
2. **Static only** — `use: "graph-name"` — no `{...}` runtime expressions (Phase 2 deferred). Dynamic expression → `FlowPhaseError`.
3. **Depth cap** — constant 5 (field removed). One flow referencing another → depth counter increments. Level 6 → error.
4. **Name collision** — child node ID prefixed with `<parentId>/`. Parent graph MUST NOT have existing `parentId/childId` nodes — detected at load time.
5. **dependsOn semantics** — parent phase downstream depends on child graph terminals (nodes with no downstream in child). Loader rewrites after flatten.
6. **Registry required** — `use` name MUST exist in graph registry (`registry.json`). Unregistered graph → load error.

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
    task: 'Accept change'
    routing:
      actions:
        - action: continue
          label: Accept
        - action: retry
          label: Revise
```

After merge-at-load, `skill-ops` replaced by `skill-ops/scope-confirm` through `skill-ops/output-examples`. `review` depends on child terminals — `skill-ops/output-examples` (final child node).

Auto-supplied fields (NEVER write in YAML):

- `handlerSkill` (string) — constant `atom-phase-handler` for main/approval/gate (no registry).
- `skill` (string) — resolved from `skill` field; the execution skill for the phase's work.
- `retryAttempt` (number) — runtime counter. 0-based.

## Route Fields (approval type)

YAML format uses `routing` with nested `actions` array. Each action maps to one question() option.

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`target?`|`target?`|string|Target phase `id` — **required** for `retry` and `jump`. Routing targets SHALL be explicit; the `dependsOn[0]` fallback is deprecated.|
|`label`|`label`|string|Option label displayed in question()|
|`description`|`description`|string|Option description displayed in question()|

---

# Topology Constraints

## DependsOn Rules

1. **Acyclic** — NO dependency cycles. `A → B → A` invalid. Cycle detection: check transitive closure.
2. **Minimal** — declare only direct dependencies. Transitive deps resolved implicitly.
3. **Redundancy check** — `dependsOn: [A, B]` where `B` depends on `A` → drop `A`. Only leaf deps needed. **Exception — gate eval-context deps**: gates declare the outputs their eval conditions read (e.g. a loop router reading the entry decision) as direct dependsOn — ordering redundancy is not context redundancy (enforcement exempts gates).
4. **Entry nodes** — exactly one phase with `dependsOn: []`. Single entry point. Exception — orchestrators with parallel entry segments (e.g. arch-review-loop: `loop-entry` + entry-rooted flows) declare multiple zero-in-degree roots; `findActiveNode` declaration order dispatches them (declaration order is load-bearing).

## Join Mode Rules

Phases with `dependsOn` length > 1:

|Mode|Config|Behavior|
|-|-|-|
|`all` (default)|No `join` field OR `join: all`|Fire when ALL upstreams complete.|
|`any`|`join: any`|Fire when ANY upstream completes. Others become dead branches.|

### Any-join Constraints

1. **All-skip deadlock** — when ALL upstreams of an `any` phase skip, phase never fires. Prevent: ensure at least one upstream path has no `when` guard OR design catch-all path.
2. **Partial skip** — `any` phase fires after one upstream completes. Remaining upstream nodes auto-receive `skipped` status.
3. **Downstream awareness** — `any` phase downstreams see all upstreams as completed (some skipped). `when` guards on downstream nodes check observable facts, not skip status.

---

# When Guard Rules

Natural-language skip conditions. LLM-evaluated.

## Writing Effective Guards

1. **Observable facts** — reference concrete output: `scope-confirm output shows scope_complete: true`
2. **Specific** — name exact phase, exact field. NOT `"if plan is done"` → USE `"scope-confirm output shows scope_complete: true"`
3. **Conservative default** — ambiguous judgment → execute node (guard = "true"). Do NOT skip when uncertain.
4. **Direct upstream only** — reference fields of direct upstream outputs. NEVER sibling output existence (`no … output present`) or hardcoded `.taskflow/outputs/` paths.

## Anti-Patterns

|Bad|Good|
|-|-|
|`"plan seems ready"`|`"scope-confirm output shows scope_complete: true"`|
|`"previous steps done"`|`"requirement-analysis output exists and has: phase_count > 0"`|
|`"DDD check needed"`|`"scope-confirm output shows ddd_needed: true"`|
|`"no sibling output present"`|`"scope-confirm output shows save_location and no skill_path"`|

## Cascade Skip

When node skips, downstream nodes with `dependsOn` on skipped node — scheduler treats as completed, not skipped. Downstream `when` guard fires normally.

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
- **Reference skills** — skill names loaded via `skill://` protocol. Handler resolves and injects as `## Reference: <skill-name>`.
- **Files** — project file globs. Handler resolves before dispatch. Injected as `## File: <path>`.

## YAML channels Field

Graph YAML `channels` field (main type) derives from the dispatched skill's contract — type comes from the contract tables, never guessed:

|YAML channel entry|Type|Example|
|-|-|-|
|`skill:<name>` (explicit prefix)|Reference skills|`skill:atom-graph-spec`|
|`node:<id>` (explicit prefix)|From upstream — cross-level legal|`node:plan-parse`|
|bare entry in contract From upstream table|From upstream|`scope-confirm` (only when also a `dependsOn` node — else migrate to `node:` prefix)|
|bare entry in contract Reference skills table|Reference skills|`atom-graph-spec`|
|bare entry in contract Files table or glob shape (`*`, `?`, `[`, `/`)|Files|`docs/adr/*.md`|
|entry duplicating a `dependsOn` node|redundant declaration → warning|—|
|entry matching nothing|error — no fallback search|—|

Approval phases declare `preText` (single string) instead of channels. Main phases declare `preText` never; main may declare `channels` (inline context assembly — contract source is the `skill` field when present, else explicit `skill:`/`node:`/glob entries only).

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
|Base|`main`, `approval`, `gate`|Static handlers resolved by type (schema-enforced enum)|Never — FSM jump protocol, decision-card flow, and gate protocol depend on them|
|Composition|`flow`|Load-time expansion (merge-at-load) — not a dispatch type|N/A — dispatch has no meaning for it|

No custom project types — `type` is a closed enum (`main`/`approval`/`gate`/`flow`); unknown types fail schema parse.

## Gate Type

Gate phase (`type: gate`) is the **machine-judgment node** — the pair of `approval` (human card). Decision authority is split: approval asks the human, gate decides by eval conditions. Both produce the same `IApprovalDecision` protocol (pilot routing unchanged); gate decisions carry no `label` (machine path).

### Field Closure

Gate SHALL declare exactly: `id`, `type`, `dependsOn`, `eval` (required), `when?`, `join?`, `constraints` (injected). Forbidden fields (`task`/`preText`/`routing`/`channels`/`agent`/`skill`) SHALL be rejected by schema (loud rejection — superRefine pattern). Eval action values closed to `retry`/`jump` — `continue` rejected: automatic approval = silent bypass of a non-bypassable gate.

### Gate+Approval Pair Pattern

Auto-or-ask is an explicit topology edge — machine check first, human card second:

```yaml
# Split — gate decides machine, approval decides human
- id: change-gate
  type: gate
  dependsOn: [change-review]
  eval:
    - when: 'change-review output shows overall: fail AND retryAttempt < 2'
      action: retry
      target: apply-change
      note: 'auto: review found blocking issues — fix and re-review'
- id: change-accept
  type: approval
  dependsOn: [change-gate]
  routing:
    actions:
      - action: continue
        label: 'Approve and archive'
        description: 'Implementation passes review — archive the change'
      - action: retry
        target: apply-change
        label: 'Revise implementation'
        description: 'Re-run apply-change with review feedback'
```

Gate no-match (all eval conditions false / completion failure) falls through to the downstream node — conservatively asking the human at the paired approval. Never a silent pass.

### Loop Router Pattern (exception)

A gate may act as a **loop router** — machine-iterating NEW artifacts instead of reworking the same one. Distinguishing shape (arch-review-loop `loop-gate`, v4 reviewer-reuse):

- The eval condition references the reviewer's **affirmative continuation signal** (`review/arch-review` output `top_rec_remaining: true`) — the loop re-runs the **reviewer** while it affirms progress, not while it reports failure.
- The retry target is the **round worker itself** (`review` — a flow id; flatten remaps it to the flow's entry, re-running the whole review segment). The flow declares an **empty JUMP closure** (`dependsOn: []`) + a `node:loop-entry` channel — retry re-runs only the review segment; the entry (scope + mode) is never re-asked.
- Retry is bounded by the **round worker's own iteration counter** (`round < N` in the reviewer's output) instead of the gate's `retryAttempt` (the gate itself is never jumped). The bound caps the gate's retry only — it is NOT a termination mechanism: past the bound the gate no-matches and the round-end approval takes over.
- **Termination is always an explicit human decision** (v4): the round-end approval runs every round with `Loop again → retry review` as the first action (default — Run Mode auto executes it, so auto mode repeats) and `Complete loop` as the explicit end. Auto mode does NOT auto-complete — the operator force-ends; the report's round marker provides progress.
- The gate may declare **eval-context dependsOn** beyond a single review dep (e.g. the entry decision node + the round worker's flattened id) — the eval reads those outputs directly (§DependsOn Rules #3 exception).

## Constraint Layering

Project constraints — `.graph-scheduler/constraints.md` — inject into every node (main/approval) as `## Constraints` block. Layer order (additive floor):

platform injection < project graph constraints < node-level task/context < skill-level `## Rules`

- Lower layer appends only — never overrides upper layer
- Same-dimension conflict (e.g. language) → keep both entries, agent judges by more specific layer
- Dedup: skip entries duplicating `lang.conversation`/`lang.documents`/`git.policy` structured fields (atom-kernel rule 3 reuse)
- Block cap 2 KB — exceed → explicit warning, never silent truncation

---

# Approval Routing Patterns

Approval phase (`type: approval`) presents decision to user via question(). Three standard actions:

## Standard Three-Route

```yaml
routing:
  actions:
    - action: continue
      label: 'Accept <artifact>'
      description: '<Artifact> ready — proceed'
    - action: retry
      label: 'Revise <artifact>'
      description: '<Artifact> needs changes — re-run upstream phase'
    - action: jump
      label: 'Revise <upstream>'
      description: 'Fundamental issues — jump back to <upstream-phase>'
```

## Action Semantics

|Action|Routing|target field|
|-|-|-|
|`continue`|Normal advance. `note` logged to metadata.|Unused|
|`retry`|Retry target phase — re-execute from target (graph_jump). `note` injected as feedback.|Required — explicit retry target. `dependsOn[0]` fallback deprecated.|
|`jump`|Jump to target phase. Resets target + downstream. `note` logged as reason.|Required|

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

Rationale: `join: any` on an approval with writer deps makes the gate ready as soon as ANY writer completes — decoupling the gate from the review conclusion. Writer phases are transitive deps of the review node; listing them violates §DependsOn Rules #3 (redundancy check).

## Approval Redundancy Rule

Approval phases SHALL present a reviewable artifact or a semantic branch to the human — never re-confirm a decision already confirmed by an interactive upstream node (scope interview, grilling conversation). A card whose decision was interactively confirmed moments earlier in the same conversation and whose surface carries no artifact the human has not yet seen is redundant — SHALL NOT be declared. Redundancy removal SHALL NOT create a silent pass-through: the paired gate keeps bounded auto-rework, and the downstream generation node SHALL degrade observably (e.g. `spec_status: blocked` with candidates) when the gate retry bound is exhausted with incomplete fields.

Gate nodes SHALL NOT replace approval acceptance semantics — gate eval actions close to `retry`/`jump` (continue rejected, §Gate Type): acceptance decisions stay approval-only.

```yaml
# Redundant — interview confirmed the scope; gate checks completeness; card has nothing new to review
- id: scope
  type: main
  skill: atom-scope-interview
- id: scope-gate
  type: gate
  dependsOn: [scope]
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
- id: plan-accept # ✓ first PRD artifact review — keep
  type: approval
  dependsOn: [plan-gate]
```

## Auto-Rework (gate) Rules

`eval` conditions on gate nodes drive automatic routing. Auto-rework conditions SHALL satisfy all four rules — violation is a validation warning:

1. **Contract-field reference** — the condition SHALL reference observable fields of the reviewer's machine-parseable output contract (e.g. code-review `overall: fail`), never free-text phrases ("contains FAIL verdict") the LLM must guess at.
2. **Bounded** — the condition SHALL bound rework by a deterministic counter: `AND retryAttempt < N` (the gate node's own jump re-execution count — FSM JUMP increments the target, never zeroes, so the bound deterministically trips) OR a reviewer iteration counter (`verify round < N` — loop routers that iterate new artifacts). Past the bound the condition is false and the gate no-matches, falling through to the paired approval (human). Unbounded auto-rework risks an infinite loop.
3. **Writer target** — `action: retry` target SHALL be the writer node whose output the reviewer evaluated (the node whose re-execution can change the verdict). Targeting the reviewer itself re-runs it over unchanged artifacts — same verdict, wasted cycle.
4. **Single-writer scope** — auto-rework SHALL only be used when the reviewer has exactly one writer upstream. Multi-writer reviews (a cross-review over several flows) have no single rework point — omit `eval` and let the human approval choose the target via routing actions.

```yaml
# Correct — bounded, contract-field, writer target, single writer
- id: change-gate
  type: gate
  dependsOn: [change-review]
  eval:
    - when: 'change-review output shows overall: fail AND retryAttempt < 2'
      action: retry
      target: apply-change
      note: 'auto: review found blocking issues'
```

```yaml
# Wrong — unbounded free-text condition targeting the reviewer
- id: gate
  type: gate
  dependsOn: [review]
  eval:
    - when: 'review output contains FAIL verdict'
      action: retry
      target: review
```

---

# Run Mode

Run Mode = run-level auto-approve convention. A run may opt into auto-approval at its entry: every approval in the run (except entry confirmations themselves — they are interviews, never auto) then executes its recommended routing action without a card. The mode is a **run attribute**, not a node-level field — zero schema additions, zero per-approval declarations.

## Standard Entry Mode Topic

Graphs with approval phases SHALL offer the mode topic at their entry (default Manual). Two entry shapes:

- **atom-scope-interview entries** — the graph task text declares the standard topic; the skill handles it (ask AFTER scope, echo scan first).
- **Work-type entries** — the task text carries the standard preamble; the executing agent confirms before work (same rules).

Standard topic text (graph entries):

```
Auto-approve mode (standard topic — ask AFTER scope, NEVER auto-approved):
Manual (recommended, default) — every approval presents a decision card.
Auto — every approval in this run (entry confirmations excluded — they are
interviews, never auto) executes its recommended routing action (routingActions[0]).
Echo rule: scan current-run completed node outputs first — an existing
auto_approve field (nested composition) is inherited WITHOUT asking.
```

**Entry output field**: `auto_approve: true|false` (machine-parseable). Absent field = Manual (never silent Auto).

## Scope

Run Mode controls **approval presentation only**:

- Approval phases — auto-execute `routingActions[0]` (the graph-declared recommendation — question() "recommended first" convention) when the mode is Auto.
- Main nodes (grill/scope interviews, work nodes) — NEVER auto-skipped, NEVER auto-decided. The mode topic never gates an interview.
- Gate eval semantics unchanged — a gate may reference `auto_approve` explicitly in eval conditions (loop router pattern).

## Consumption (deterministic scan)

atom-phase-handler approval branch scans the current run's completed node outputs (snapshot-scoped — only `snapshot.nodes` with `status: done`) for the field `auto_approve: true`:

- Match → auto-execute `routingActions[0]`: `IApprovalDecision { action, target, label: first.label, note: 'auto-approve mode' }`, decision file persisted WITH the label — downstream when-guards consume it exactly as the human path.
- Snapshot absent / no match / parse failure / conflicting values / empty routingActions → human card (fail-safe — never auto-decide on uncertainty).
- Stale outputs from prior runs are excluded by construction (snapshot-scoped).

`graph_start` returns the run snapshot — entry dispatch carries it (echo scan + consumption share the mechanism).

## Propagation (echo)

Nested entries inherit the mode instead of re-asking: the entry interview scans the current run's completed outputs — an existing `auto_approve` field is echoed into this entry's output (no question). The scan is run-scoped (not conversation-scoped) — same-session consecutive runs do not leak. Standalone runs (zero completed outputs at entry) always ask. Flow composition needs no plumbing — the run-level scan is the propagation mechanism at any nesting depth.

## Loop Router Integration

arch-review-loop demonstrates the full pattern: `loop-entry` (report input + mode topic) → approvals consumed by Run Mode → `loop-gate` (loop router — eval references `auto_approve`, decision label, and the round worker's `top_rec_remaining` + `round` bound, retry target `review`) → `loop-accept` first action `Loop again` (default repeat — the auto outcome is repeat, never auto-Complete; termination is always a human decision, force-end in auto mode).

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

`#` comments document intent — when guards, phase purpose, routing rationale:

```yaml
- id: graph-review
  type: main # main — inline execution, review skill may dispatch axis sub-agents per hints
  dependsOn: [graph-write]
  # when guard absent — always execute
```

## File Location

Graph YAML files live in the scheduler's graphs directory. File name `<name>.taskflow.yaml` maps to graph `name` for `graph_start({ graphName })` resolution.

## Registry

Register new graphs in the scheduler's graph registry. Without registration, `graph_start` fails with unknown graph name.

---

# Language Constraints

1. **Graph YAML** — field names lowercase, values English. Phase IDs kebab-case.
2. **task content** — English instructions. References to skills use `skill://` protocol. References to phase outputs use nodeId names (injected by main agent from upstream outputs). Declared-inputs contract:
   - **Input references covered** — every phase-output reference in task text must be covered by `dependsOn` (implicit) or `channels` (explicit `node:` entry).
   - **No hardcoded paths** — task text must not contain `.taskflow/outputs/` (validation error, mirroring the when-guard rule).
   - **Claims match declarations** — «injected» wording must correspond to an actual declared channel or dependsOn edge (undeclared claims warn).
3. **when guards** — English conditions referencing observable facts in phase outputs.
