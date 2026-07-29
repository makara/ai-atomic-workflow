---
name: atom-graph-writer
description: Reference for writing .taskflow.yaml graph definitions — PhaseSchema, topology, when guards, join modes, context globs, approval routing. Use when creating or editing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.0.0
last_updated: '2026-07-29'
---

> **Runtime constraints** — load `skill://atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Writer

Reference for writing `.taskflow.yaml` graph definitions. Authoritative spec for graph format — PhaseSchema fields, topology constraints, when guards, join modes, context globs, approval routing, YAML format rules.

Intended consumers: `atom-graph-design`, `atom-graph-review`, `atom-graph-write` (forthcoming entry skills — research/architecture-review-graph-generate-2026-07-28.md Phase 2-4).

**Priority**: atom-graph-writer rules > atom-phase-handler conventions. Conflict → atom-graph-writer wins.

---

# Graph Schema

## Top-Level Fields

|Field|Type|Required|Purpose|
|-|-|-|-|
|`name`|string|yes|Graph identifier — resolved by scheduler registry. Kebab-case.|
|`version`|number|yes|Schema version. Increment on breaking phase changes.|
|`phases`|Phase[]|yes|Phase list. Declaration order cosmetic — execution order resolved exclusively by dependsOn DAG. List in dependency order for readability.|

## Phase Fields

YAML field names shown below. Scheduler resolves to internal NodeDetail fields at runtime — see `skill://atom-phase-handler` §NodeDetail for full schema. Field names in `.taskflow.yaml` differ from NodeDetail for some fields — table maps both.

|Field (YAML)|NodeDetail|Type|Required|Purpose|
|-|-|-|-|-|
|`id`|`nodeId`|string|yes|Unique phase identifier. Kebab-case.|
|`type`|`type`|string|yes|`main`, `agent`, `approval`, or `flow`|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
|`skill`|`entrySkill`|string|`agent` type|Target skill for sub-agent dispatch|
|`agent`|`agent`|string?|`agent` type|Agent type for task() dispatch. Auto-supplied from agent-registry — write only to override default.|
|`use`|—|string|`flow` type|Referenced graph name. Static constant — merge-at-load flattens. `{...}` dynamic expression → error (Phase 2 deferred). Mutually exclusive with `def`.|
|`def`|—|object|`flow` type|Inline sub-graph definition `{ phases: [...] }`. Static — merge-at-load flattens. `{...}` dynamic expression → error. Mutually exclusive with `use`.|
|`with`|—|object?|`flow` type|Key-value args passed to sub-graph. Referenced in child task via `{args.key}`.|
|`maxDepth`|—|number?|`flow` type|Recursion depth cap. Default 5 (aligns with taskflow spec). Depth 6 → FlowPhaseError.|
|`task`|`task`|string?|`main`, `agent`|Task instruction. `main` inline; `agent` forwarded to sub-agent. Use block scalar `|` per §YAML Format Rules.|
|`context`|`context`|string[]?|`agent`, `approval`|Glob patterns — files pre-read before dispatch. Agent: injected as `## Context Files`. Approval: displayed as pre-call text.|
|`when`|`when`|string?|all|Natural-language skip condition — LLM-evaluated per ADR 0036 D2. See §When Guard Rules.|
|`topic`|`topic`|string?|`approval`|Decision Card topic — question() header. Noun phrase ≤30 chars.|
|`routing`|`routingActions`|Route[]?|`approval`|Decision routing with nested `actions` array. See §Approval Routing.|
|`join`|`join`|string?|`any` phase|`"any"` — phase fires when any upstream completes. Default: all upstreams.|

## Flow Phase Fields

`type: flow` references saved sub-graph (`use`) or inline definition (`def`). Phase 1 (merge-at-load): loader flattens flow phases at graph load time. Zero runtime overhead — flow type invisible to FSM/API/agent after load. See ADR 0043.

### Constraints

1. **Mutually exclusive** — `use` XOR `def`. Both empty → validation error. Both set → validation error.
2. **Static only** — `use: "graph-name"` or `def: {phases: [...]}` — no `{...}` runtime expressions (Phase 2 deferred). Dynamic expression → `FlowPhaseError`.
3. **Depth cap** — `maxDepth` (default 5). One flow referencing another → depth counter increments. Level 6 → error.
4. **Name collision** — child node ID prefixed with `<parentId>/`. Parent graph MUST NOT have existing `parentId/childId` nodes — detected at load time.
5. **dependsOn semantics** — parent phase downstream depends on child graph terminals (nodes with no downstream in child). Loader rewrites after flatten.
6. **Registry required** — `use` name MUST exist in graph registry (`registry.json`). Unregistered graph → load error.

### Example

```yaml
# Parent graph — skill-change-workflow.taskflow.yaml
name: skill-change-workflow
version: 1
phases:
  - id: plan
    type: agent
    dependsOn: []
    task: |
      Analyze requirements.
  - id: skill-ops
    type: flow
    use: skill-create
    dependsOn: [plan]
    with:
      skill_name: atom-graph-writer
  - id: review
    type: approval
    dependsOn: [skill-ops]
    routing:
      actions:
        - action: continue
          label: Accept
        - action: retry
          label: Revise
```

After merge-at-load, `skill-ops` replaced by `skill-ops/scope-confirm` through `skill-ops/output-examples`. `review` depends on child terminals — `skill-ops/output-examples` (final child node).

```yaml
# Inline def — no file I/O needed
- id: validate
  type: flow
  def:
    name: inline-validate
    version: 1
    phases:
      - id: lint
        type: agent
        dependsOn: []
        task: Run linter.
      - id: test
        type: agent
        dependsOn: []
        task: Run tests.
```

Auto-supplied fields (NEVER write in YAML):

- `handlerSkill` (string) — from agent-registry Layer 1. Default: `atom-phase-handler` for main/approval, `atom-phase-agent` for agent.
- `entrySkill` (string) — resolved from `skill` field. Falls back to agent-registry if `skill` unset.
- `retryAttempt` (number) — runtime counter. 0-based.

## Route Fields (approval type)

YAML format uses `routing` with nested `actions` array. Each action maps to one question() option.

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`action`|`action`|string|`continue`, `retry`, or `jump`|
|`target?`|`target?`|string|Jump target phase `id` — meaningful only when `action: jump`|
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

Natural-language skip conditions. LLM-evaluated per ADR 0036 D2.

## Writing Effective Guards

1. **Observable facts** — reference concrete output: `scope-confirm output shows plan_complete: true`
2. **Specific** — name exact phase, exact field. NOT `"if plan is done"` → USE `"scope-confirm output shows plan_complete: true"`
3. **Conservative default** — ambiguous judgment → execute node (guard = "true"). Do NOT skip when uncertain.

## Anti-Patterns

|Bad|Good|
|-|-|
|`"plan seems ready"`|`"scope-confirm output shows plan_complete: true"`|
|`"previous steps done"`|`"requirement-analysis output exists and has: phase_count > 0"`|
|`"DDD check needed"`|`"scope-confirm output shows ddd_needed: true"`|

## Cascade Skip

When node skips, downstream nodes with `dependsOn` on skipped node — scheduler treats as completed, not skipped. Downstream `when` guard fires normally.

---

# Context Glob Conventions

Agent and approval phase context — file channels for data handoff between phases.

## File Naming

Standard pattern: `.taskflow/outputs/<phaseId>.output.txt`

- Phase output → write to own output file → downstream reads via context glob
- Scope output: `.taskflow/outputs/scope-confirm.output.txt`
- Design output: `.taskflow/outputs/graph-design.output.txt`
- Review output: `.taskflow/outputs/graph-review.output.txt`

## Glob Precision

- **Exact path** for deterministic handoffs: `.taskflow/outputs/scope-confirm.output.txt`
- **Glob wildcard** for variable outputs: `.taskflow/outputs/skill-create-scope-*.txt`
- **Directory** for domain docs: `docs/domains/`

## Constraints

1. Context globs resolve BEFORE dispatch — empty resolution → phase fails with "No files matched context"
2. Each resolved file truncated to reasonable size before injection
3. Context files injected as `## File: <path>` blocks into sub-agent prompt

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
|`retry`|Retry upstream dependency. `retryTarget` from current node's `dependsOn`. `note` injected as feedback.|Unused|
|`jump`|Jump to target phase. Resets target + downstream. `note` logged as reason.|Required|

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

`dependsOn`, `context` use flow sequence `[...]` for inline lists:

```yaml
dependsOn: [scope-confirm, requirement-analysis]
context:
  - .taskflow/outputs/scope-confirm.output.txt
  - .taskflow/outputs/graph-design.output.txt
```

## Comments

`#` comments document intent — when guards, phase purpose, routing rationale:

```yaml
- id: graph-review
  type: agent # agent — dispatched to sub-agent review entry skill
  dependsOn: [graph-write]
  # when guard absent — always execute
```

## File Location

Graph YAML files live in `packages/graph-scheduler/graphs/`. File name `<name>.taskflow.yaml` maps to graph `name` for `graph_start({ graphName })` resolution.

## Registry

New graphs MUST register in `packages/graph-scheduler/graphs/registry.json`. Without registration, `graph_start` fails with unknown graph name.

---

# Language Constraints

1. **Graph YAML** — field names lowercase, values English. Phase IDs kebab-case.
2. **task content** — English instructions. References to skills use `skill://` protocol. References to phase outputs use `.taskflow/outputs/<phaseId>.output.txt` paths.
3. **when guards** — English conditions referencing observable facts in phase outputs.
