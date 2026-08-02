---
name: atom-graph-spec
description: Reference for .taskflow.yaml graph format specification — PhaseSchema, topology, when guards, join modes, channels, approval routing. Use when writing or reviewing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.1.0
last_updated: '2026-08-01'
---

> **Runtime constraints** — load `skill://atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference specification for `.taskflow.yaml` graph definitions. Authoritative spec for graph format — PhaseSchema fields, topology constraints, when guards, join modes, channel requirements, approval routing, YAML format rules.

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
||`type`|`type`|string|yes|Phase type — closed enum: base dispatch types `main`/`approval` (static handlers) + composition type `flow` expanded at load time. See §Type Ownership Layers.|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
||`skill`|`skill`|string?|`main`|Execution skill — the skill that runs this phase's work; serves as the channels contract source (dual-track). Registry `skill` is the handler, never a dispatch target.|
||`agent`|`agent`|string[]?|`main`|Agent hints — priority-ordered sub-agent type preferences (e.g. `[reviewer, task]`). Advisory: skills pick the first available type when they dispatch; absent → platform default. Injected as `## Agent hints:` block by atom-phase-handler.|
|`use`|—|string|`flow` type|Referenced graph name. Static constant — merge-at-load flattens. `{...}` dynamic expression → error (Phase 2 deferred). Required for flow — the only flow field (def/with/maxDepth removed).|
|`task`|`task`|string?|`main`|Task instruction — executed inline (main) / decision-card topic (approval — approval topic derives from `task`, fallback `Decision Required`). Use block scalar `|` per §YAML Format Rules.|
||`channels`|`channels`|string[]?|`main`|Channel entries — derived from the dispatched skill's `## Context Requirements` contract: `skill:<name>` (reference), `node:<id>` (cross-level upstream), bare contract-table match, or file glob. Contract source dual-track: phase declares `skill` → that skill's contract; no `skill` → explicit `skill:`/`node:`/glob only, bare name errors. Resolved deterministically by the shared resolver (validate + runtime same implementation). Replaces legacy `context`.|
|`preText`|`preText`|string?|`approval`|Decision-card pre-call text — displayed before question(), never channel-resolved. Replaces legacy `context`.|
|`when`|`when`|string?|all|Natural-language skip condition — LLM-evaluated. See §When Guard Rules.|
|`eval`|`eval`|EvalCondition[]?|`approval`|Auto-decision conditions — evaluated before question(). First match short-circuits.|
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

- `handlerSkill` (string) — constant `atom-phase-handler` for main/approval (no registry).
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
3. **Redundancy check** — `dependsOn: [A, B]` where `B` depends on `A` → drop `A`. Only leaf deps needed.
4. **Entry nodes** — exactly one phase with `dependsOn: []`. Single entry point.

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

## Type Ownership Layers

Phase types belong to one of two layers (documented ownership model — optional layer removed with the agent type, registry mechanism removed):

|Layer|Types|Dispatch|Disability|
|-|-|-|-|
|Base|`main`, `approval`|Static handlers resolved by type (schema-enforced enum)|Never — FSM jump protocol and decision-card flow depend on them|
|Composition|`flow`|Load-time expansion (merge-at-load) — not a dispatch type|N/A — dispatch has no meaning for it|

No custom project types — `type` is a closed enum (`main`/`approval`/`flow`); unknown types fail schema parse.

## Constraints

1. Channel entries resolve BEFORE dispatch against the entry skill contract — unresolvable entry → phase fails (no fallback search).
2. File globs truncated to reasonable size before injection.
3. Upstream outputs injected as `## Upstream: <nodeId>` blocks into sub-agent prompt.
4. Reference skills injected as `## Reference: <skill-name>` blocks.
5. File contents injected as `## File: <path>` blocks.
6. Contract Reference skills / Files entries missing from graph channels → CLI validate error (channel deletion is never silent).
7. Skill `## Context Requirements` is the single source of truth — machine-parseable three-subsection lists, no `<configurable>` placeholders.

> **Terminology**: context contract = skill `## Context Requirements`; context channels = graph `channels` field; injected context = handler-assembled `## Upstream:` / `## Reference:` / `## File:` prompt blocks.

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

## Auto-Rework (eval) Rules

`eval` conditions drive automatic routing before the decision UI. Auto-rework conditions SHALL satisfy all four rules — violation is a validation warning:

1. **Contract-field reference** — the condition SHALL reference observable fields of the reviewer's machine-parseable output contract (e.g. code-review `overall: fail`), never free-text phrases ("contains FAIL verdict") the LLM must guess at.
2. **Bounded** — the condition SHALL bound rework by retry attempt: `AND retryAttempt < N` (e.g. `< 2`). Retry attempt is the approval node's jump re-execution count — FSM JUMP increments it, never zeroes, so the bound deterministically trips; past the bound the condition is false and the gate falls through to the human. Unbounded auto-rework risks an infinite loop.
3. **Writer target** — `action: retry` target SHALL be the writer node whose output the reviewer evaluated (the node whose re-execution can change the verdict). Targeting the reviewer itself re-runs it over unchanged artifacts — same verdict, wasted cycle.
4. **Single-writer scope** — auto-rework SHALL only be used when the reviewer has exactly one writer upstream. Multi-writer reviews (a cross-review over several flows) have no single rework point — omit `eval` and let the human gate choose the target via routing actions.

```yaml
# Correct — bounded, contract-field, writer target, single writer
- id: change-accept
  type: approval
  dependsOn: [change-review]
  eval:
    - when: 'change-review output shows overall: fail AND retryAttempt < 2'
      action: retry
      target: apply-change
      note: 'auto: review found blocking issues'
```

```yaml
# Wrong — unbounded free-text condition targeting the reviewer
- id: accept
  type: approval
  dependsOn: [review]
  eval:
    - when: 'review output contains FAIL verdict'
      action: retry
      target: review
```

## Jump Target Rules

1. Target MUST be valid phase `id` in same graph
2. Jump resets target phase AND all downstream nodes
3. Jump target reinjected into execute loop — pilot continues from there

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
