---
name: atom-graph-spec
description: Reference for .taskflow.yaml graph format specification - PhaseSchema, topology, gate rework jumps, join modes, channels, approval decision confirmation, branch routes, Run Mode. Use when writing or reviewing taskflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.9.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load `atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference spec for the .taskflow.yaml graph format - PhaseSchema, topology, gate rework jumps, join modes, channels, approval routing, run mode.

Intended consumers: `atom-graph-design`, `code-review`, `atom-graph-writer`.

**Priority**: atom-graph-spec rules > atom-phase-handler conventions. Conflict -> atom-graph-spec wins.

**Invocation**: `user-invocable: true` with no `disable-model-invocation` = row-4 hybrid per the atom-skill-spec invocation matrix - model-invoked AND slash-invokable.

**Reference layout**: schema field tables -> PHASESCHEMA.md; all YAML examples -> YAML-EXAMPLES.md; routing/run-mode detail -> ROUTING.md.

---

# Graph Schema

Top-level fields (`name`, `description`, `version`, `phases`), per-phase fields (`id`, `dependsOn`, `skill`, `agent`, `operations`, `use`, `task`, `channels`, `route`, `jumps`, `routing`, `join`), flow phase fields, auto-supplied fields (`handlerSkill`, `skill`, `retryCount`), route field, approval routing action fields - full tables: see PHASESCHEMA.md §Top-Level Fields, §Phase Fields, §Flow Phase Fields, §Auto-Supplied Fields, §Route Field, §Approval Routing Actions. Loaded flow example: see YAML-EXAMPLES.md §Flow Phase Example.

---

# Topology Constraints

## DependsOn Rules

1. **Acyclic** - NO dependency cycles. `A → B → A` invalid. Cycle detection: check transitive closure.
2. **Minimal** - declare only direct dependencies. Transitive deps resolved implicitly.
3. **Redundancy check** - `dependsOn: [A, B]` where `B` depends on `A` -> drop `A`. Only leaf deps needed. Judgment context is NOT a dependsOn concern - gate jumps and approval recommendations reference it (per §Jump Semantics), never implicit edges.
4. **Entry nodes** - exactly one phase with `dependsOn: []`. Single entry point. Exception - orchestrators with multiple entry roots (entry-rooted flows) declare several zero-in-degree phases; dispatch follows declaration order (load-bearing).

## Join Mode

Semantics + schema rejection: see ROUTING.md §Join Mode Rules (single home).

## Routes

`route: <id>` marks branch membership; absent = implicit default route (always active). Branch-route detail: see ROUTING.md §Routes.

---

# Routing Rules Summary

- **Gate jumps** - `jumps: [{when, to}]`: natural-language rework conditions, first match wins; hit = backward jump resetting target + downstream terminals. Detail: see ROUTING.md §Gate Jump Conditions, §Jump Semantics.
- **Approval routing** - default card + `routing` actions semantics: see ROUTING.md §Approval Decision Confirmation (single home).
- **Channels** - phase-level `channels:` context additions; `node:<id>` = read edge to a non-`dependsOn` stream; graph `context:` = global channel. Detail: see PHASESCHEMA.md §YAML channels Field.
- **Run Mode** - per-activation auto-approve convention (auto executes AI recommendation; manual/absent -> card; interviews never gated): see §Activation (single site).

---

# Context Requirements Convention

Main and approval phases declare context requirements in four deterministic sections; context arrives as prompt blocks at dispatch. Placement in entry skills: after frontmatter Runtime constraints block, before `## Flow` (after `## Input` if present).

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

- **From upstream** - upstream phase node IDs -> `## Upstream: <nodeId>` blocks.
- **Reference skills** - skill names -> `## Reference: <skill-name>` blocks.
- **Operation classes** - closed-set members of the High-Level Tool Registry (atom-kernel §High-Level Tool Registry) the skill performs by default. Optional: absent = no default classes. Registry entries for the merged class set (skill default + phase `operations:`) accompany dispatch; tool usage is verified per declared class. Skill bodies reference the registry - never re-specify chains.
- **Files** - project file globs. Content arrives as `## File: <path>` blocks.

## Entry Annotation Grammar

Contract entries MAY carry a trailing parenthetical annotation: `- <value> ( <annotation> )`. Annotation = prose, stripped at parse, excluded from matching. Single-level parens only.

## Convention Layer Exemption

Convention-layer files (`DEFAULT_CONVENTIONS`: `./CONTEXT.md`, `docs/domains.md`) are platform-shipped, default-loaded, absence-tolerant - implicit coverage, never per-skill obligations. Skills MAY declare/omit/annotate them; none affects loading. Graphs SHALL NOT declare. Non-convention entries keep obligation semantics.

## Contract Rules

Skill-side contract rules - single definition site (atom-skill-spec points here):

1. Contract is the single source of truth for graph channel declarations - the load-time pass cross-checks every dispatching graph's `channels` against it (missing reference/file -> error, phantom channel -> warning).
2. **Placeholder entries forbidden** - `<configurable …>` style entries fail contract parsing with an error. Every entry MUST be a concrete node ID, skill name, operation class, or file glob. Annotation stripping precedes the placeholder check - `<configurable> (note)` still fails.
3. **No runtime output paths in skill body** - the `.taskflow/outputs/` form no longer exists (content flows via the agent session); references to it are inert text, no check exists. Upstream arrives via declared context (dependsOn implicit + `node:` channels) from the agent session.
4. **No self-load duplication** - content reachable via declared context arrives at dispatch; the skill body MUST NOT re-load reference skills or re-read declared files.
5. **Operation classes are closed-set members** - an unknown class name fails contract validation naming the skill and the class (loud rejection, no runtime fallback).
6. `atom-kernel` excluded from Reference skills - platform primitives, always available.

---

# Activation

Activation facts (run mode, constraints) live at the invocation boundary — never as graph nodes. Two facts, loaded per activation:

|Fact|Source|Behavior|
|-|-|-|
|Constraints load|pilot startup|Compiled-artifact protocol - `.graph-scheduler/constraints.json` exists -> emit its `constraints` array verbatim (fast path, zero markdown I/O); missing -> caveman-compile `.graph-scheduler/constraints.md` `## Rules` into the artifact (`compiled_at` audit metadata) and emit. Existence = validity; deletion = reset; invalid JSON -> recompile. Session fact `{"constraints": [...]}`.|
|Run mode|`graph_start` `args.mode`|`manual` \| `auto`, REQUIRED at invocation — absent -> `MODE_REQUIRED` response, no run created. The pilot asks the user before starting when no flag was passed (Manual recommended - absence NEVER auto). Session fact `{"mode": "manual"\|"auto"}`. Re-decided EVERY activation.|

Mechanics:

- **No prologue nodes** - runs contain author phases only; `$`-prefixed ids are schema-rejected (the prefix is reserved; the activation prologue was removed).
- **Activation rule** - facts are fixed per activation: a backward reset (gate branchTo or graph_jump) targeting an entry node re-runs the entry directly; mode and constraints are NOT re-asked (session facts persist for the run).
- **Consumption** - the handler formats `## Run Mode:` / `## Constraints:` blocks from the session facts per dispatch (main/approval/gate alike). Missing facts -> degrade (manual mode, empty constraints) + warning - never blocks.
- Flow composition needs no plumbing - nested graphs share the run activation; the mode applies at any nesting depth.
- Graphs SHALL NOT declare a mode topic in entry task texts - the mode lives at the invocation boundary.
- Grilling nodes in graph dispatch carry an encapsulation contract in their task text (mandatory question rounds, never zero-question, never auto-gated — the upstream grilling skill body is never modified).
