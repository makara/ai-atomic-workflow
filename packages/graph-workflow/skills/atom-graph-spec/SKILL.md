---
name: atom-graph-spec
description: Reference for .taskflow.yaml graph format specification - PhaseSchema, topology, gate rework jumps, join modes, channels, approval decision confirmation, branch routes, Run Mode. Use when writing or reviewing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.8.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load `atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference spec for the .taskflow.yaml graph format - PhaseSchema, topology, gate rework jumps, join modes, channels, approval routing, run mode.

Intended consumers: `atom-graph-design`, `code-review`, `atom-graph-writer`.

**Priority**: atom-graph-spec rules > atom-phase-handler conventions. Conflict -> atom-graph-spec wins.

**Invocation**: `user-invocable: true` with no `disable-model-invocation` = row-4 hybrid per the atom-skill-spec invocation matrix - model-invoked AND slash-invokable. Role note only.

**Reference layout**: schema field tables -> PHASESCHEMA.md; all YAML examples -> YAML-EXAMPLES.md; routing/run-mode detail -> ROUTING.md.

---

# Graph Schema

Top-level fields (`name`, `description`, `version`, `phases`), per-phase fields (`id`, `dependsOn`, `skill`, `agent`, `operations`, `use`, `task`, `channels`, `route`, `jumps`, `routing`, `join`), flow phase fields, auto-supplied fields (`handlerSkill`, `skill`, `retryAttempt`), route field, approval routing action fields - full tables: see PHASESCHEMA.md §Top-Level Fields, §Phase Fields, §Flow Phase Fields, §Auto-Supplied Fields, §Route Field, §Approval Routing Actions. Loaded flow example: see YAML-EXAMPLES.md §Flow Phase Example.

---

# Topology Constraints

## DependsOn Rules

1. **Acyclic** - NO dependency cycles. `A → B → A` invalid. Cycle detection: check transitive closure.
2. **Minimal** - declare only direct dependencies. Transitive deps resolved implicitly.
3. **Redundancy check** - `dependsOn: [A, B]` where `B` depends on `A` -> drop `A`. Only leaf deps needed. Judgment context is NOT a dependsOn concern - gate jump conditions and approval recommendations reference the judgment context (per §Jump Semantics), never implicit dependsOn edges (§Gate Type; dependsOn stays purely topological).
4. **Entry nodes** - exactly one phase with `dependsOn: []`. Single entry point. Exception - orchestrators with multiple entry roots (entry-rooted flows) declare several zero-in-degree phases; dispatch follows declaration order (load-bearing).

## Join Mode

Absent `join` = all (explicit `join: all` -> schema rejection); `join: any` fires when any upstream completes. Detail: see ROUTING.md §Join Mode Rules.

## Routes

`route: <id>` marks branch membership; absent = implicit default route (always active). Branch-route detail: see ROUTING.md §Routes.

---

# Routing Rules Summary

- **Gate jumps** - `jumps: [{when, to}]`: natural-language rework conditions, first match wins; hit = backward jump resetting target + downstream terminals. Detail: see ROUTING.md §Gate Jump Conditions, §Jump Semantics.
- **Approval routing** - default card = Accept (AI recommendation) + free input + AI-generated contextual options; written `routing` actions exist ONLY for explicit branch-route selection. Detail: see ROUTING.md §Approval Decision Confirmation.
- **Channels** - phase-level `channels:` context additions; `node:<id>` = read edge to a non-`dependsOn` stream; graph `context:` = global channel. Detail: see PHASESCHEMA.md §YAML channels Field.
- **Run Mode** - auto-approve convention: approval nodes and approval() checkpoints auto-execute the AI recommendation in auto, human card in manual (interviews structurally never gated - approval() without recommendation always cards); re-confirmed per activation. Detail: see ROUTING.md §Run Mode.

---

# Context Requirements Convention

Main and approval phases declare context requirements in four deterministic sections. The context arrives as prompt blocks at dispatch. Placement in entry skills: after frontmatter Runtime constraints block, before `## Flow` section (after `## Input` if present).

## Four-Section Format

Entry skills declare:

```markdown
## Context Requirements

### From upstream

- <nodeId>

### Reference skills

- <skill-name>

### Operation classes

- <tool-name>

### Files

- <glob>
```

- **From upstream** - upstream phase node IDs. Their outputs arrive as `## Upstream: <nodeId>` blocks.
- **Reference skills** - skill names; content arrives as `## Reference: <skill-name>` blocks.
- **Operation classes** - closed-set members of the High-Level Tool Registry (atom-kernel §High-Level Tool Registry) the skill performs by default. Optional: absent = no default classes. Registry entries for the merged class set (skill default + phase `operations:`) accompany dispatch; tool usage is verified per declared class. Skill bodies reference the registry - never re-specify chains.
- **Files** - project file globs. Content arrives as `## File: <path>` blocks.

## Contract Rules

Skill-side contract rules - single definition site (atom-skill-spec points here):

1. Contract is the single source of truth for graph channel declarations - the load-time pass cross-checks every dispatching graph's `channels` against it (missing reference/file -> error, phantom channel -> warning).
2. **Placeholder entries forbidden** - `<configurable …>` style entries fail contract parsing with an error. Every entry MUST be a concrete node ID, skill name, operation class, or file glob.
3. **No hardcoded output paths in skill body** - skills MUST NOT reference `.taskflow/outputs/<id>.output.txt` directly; upstream content arrives via declared context (dependsOn implicit + `node:` channels).
4. **No self-load duplication** - content reachable via declared context arrives at dispatch; the skill body MUST NOT re-load reference skills or re-read declared files as its primary mechanism.
5. **Operation classes are closed-set members** - an unknown class name fails contract validation naming the skill and the class (loud rejection, no runtime fallback).
6. `atom-kernel` excluded from Reference skills - platform primitives, always available.

---

# Activation Prologue

Activation prefix (P) = graph-level abstract-node mechanism. Carries user-layer facts (run mode, project constraints) as agent-executed nodes, not backend run-record fields. Two reserved-id built-ins, synthesized at load, executed before every round:

|Node|Reserved id|Behavior (built-in default)|
|-|-|-|
|Constraints load|`$load-constraints`|Compiled-artifact protocol - `.graph-scheduler/constraints.json` exists -> emit its `constraints` array verbatim (fast path, zero markdown I/O); missing -> caveman-compile `.graph-scheduler/constraints.md` `## Rules` into the artifact (`compiled_at` audit metadata) and emit. Existence = validity; deletion = reset; invalid JSON -> recompile. Output JSON `{"constraints": [...]}`.|
|Run mode confirm|`$run-mode-confirm`|Emit `args.mode` when set (`{args.mode}` interpolation); otherwise presents the approval() card (no mode block exists yet -> manual branch; Manual recommended - absence NEVER auto). Output JSON `{"mode": "manual"\|"auto"}`. Re-decides EVERY activation - round restarts re-ask (no echo).|

Synthesis order is load-first: `$load-constraints` dispatches before `$run-mode-confirm`, so the confirm decision card carries the `## Constraints` block (mode decided with the project norms visible).

Mechanics:

- **Synthesis** - P is NOT part of the author DAG: excluded from topology, contract checks, and jump-closure math. `$load-constraints` is always synthesized and dispatches FIRST; `$run-mode-confirm` only when the flattened graph contains an approval node (mode exists only where consumed - approval-less graphs get no mode question, no `## Run Mode:` block).
- **Reserved ids** - `$` prefix is reserved for the two prologue built-ins. Declaring the same id in YAML REPLACES the built-in (own task/skill - custom constraints source, forced-auto CI graph, disabled confirm); any other `$` id and any non-entry reserved declaration are schema-rejected.
- **Activation rule** - P runs at run start AND on every backward reset (gate branchTo or graph_jump) whose target is an entry node (flattened in-degree 0): round restart re-runs the prefix (constraints artifact re-emitted, mode re-confirmed). Mid-graph rework resets never touch P.
- **Gating** - while any P node is not terminal, ONLY P nodes are eligible; author nodes dispatch after the prefix completes. P nodes are run members (snapshot `nodes` visible).
- **Consumption** - the handler reads the P output files per dispatch and formats `## Run Mode:` / `## Constraints:` blocks (main/approval/gate alike). Missing/corrupt P output -> degrade (manual mode, empty constraints) + warning - never blocks.
