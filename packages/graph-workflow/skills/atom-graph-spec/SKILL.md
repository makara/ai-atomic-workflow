---
name: atom-graph-spec
description: Reference for workflow YAML graph format specification - PhaseSchema, topology, rework decisions, completion, channels. Use when writing or reviewing workflow graphs, mentions graph format, graph definition, PhaseSchema.
argument-hint: none (reference skill)
user-invocable: true
version: 1.12.0
last_updated: '2026-08-20'
---

> **Runtime constraints** - load `atom-phase-handler` for PhaseSchema reference.

# Atom-Graph-Spec

Reference spec for the workflow YAML graph format - PhaseSchema, topology, rework decisions, completion, channels, and the `$schema`/`version` self-description header contract (schema-determined identity, suffix-free).

Intended consumers: `atom-graph-design`, `code-review`, `atom-graph-writer`.

**Priority**: atom-graph-spec rules > atom-phase-handler conventions. Conflict -> atom-graph-spec wins.

**Invocation**: `user-invocable: true` with no `disable-model-invocation` = row-4 hybrid per the atom-skill-spec invocation matrix - model-invoked AND slash-invokable.

**Reference layout**: schema field tables -> PHASESCHEMA.md; all YAML examples -> YAML-EXAMPLES.md; rework-decision + completion detail -> ROUTING.md.

---

# Graph Schema

Top-level fields (`name`, `description`, `version`, `inventory`, `constraints`, `interaction`, `flow`, `phases`), per-phase fields (`id`, `dependsOn`, `skill`, `operations`, `task`, `channels`, `template`) - `type` is `main` only (the `flow` type is removed); `template` = builtin task-template reference — closed enum (`startup` \| `router` \| `scope-entry` \| `adopting`) (`template: router` = the one-shot selection declaration (sibling runs); the per-node templates = the framework-graph shared-chain texts (one template one file — `scope-entry` consumes `template_args.terminal`); the `framework-chain` factory and the `loop` template are removed — loop/rework semantics are top-level `flow` self-edges, `A -->|condition| A` inline bounded loops); `flow` = the graph's conditional-routing edges (mermaid subset `A --> B` / `A -->|condition| B`, compiled into the transition table); `startup` — entry node, mutually exclusive with `task` (the use field no longer exists), full startup when declared, bare otherwise); auto-supplied fields (`handlerSkill`, `skill`, `retryCount`) - full tables: see PHASESCHEMA.md §Top-Level Fields, §Phase Fields, §Auto-Supplied Fields. Nesting example: see YAM…

---

# Topology Constraints

## DependsOn Rules

1. **Acyclic dependency edges** - dependsOn SHALL NOT form cycles. `A → B → A` invalid — the engine enforces this at load (a cycle fails loading loudly with the cycle path); no manual cycle check needed. Runtime rework loops are `flow` self-edges (`A -->|condition| A` — transition-table re-entry, condition-matched), never dependency edges.
2. **Minimal** - declare only direct dependencies. Transitive deps resolved implicitly.
3. **Redundancy check** - `dependsOn: [A, B]` where `B` depends on `A` -> drop `A`. Only leaf deps needed. Judgment context is NOT a dependsOn concern - rework conditions reference it, never implicit edges.
4. **Entry nodes** - exactly one phase with `dependsOn: []`. Single entry point. Exception - orchestrators with multiple entry roots (entry-rooted flows) declare several zero-in-degree phases; dispatch follows declaration order (load-bearing).

## Branching

Conditional decision points run via approval() inside main phases (atom-kernel §approval()); branch semantics = subgraph selection (`template: router` — IF/ELSE condition evaluated inline by the executing agent, the chosen graph launched as a sibling run via `graph_start`); loop/rework semantics = flow self-edges (top-level `flow` field — `A -->|condition| A` inline bounded loops, condition-matched re-entry on advance; backward rework to an ancestor rides the advance `jump` channel, backward-only). Branch options surface at dispatch via the machine-declared `completion` block on NodeDetail (choices / direct_end — see atom-phase-handler NODE-SCHEMA.md §NodeDetail). No decision node type exists; no routing actions exist; no `branchTo` (removed).

---

# Run Completion

Runs end by natural drain (`node: null` -> fsmState `completed`) or `graph_force_end` (`terminated`); no endRun (removed); the direct-end decision (`completion` `direct_end` label) drains the run via natural drain. Detail + semantics: see ROUTING.md §Completion (single home).

# Rework Decisions, Branching, and Channels

- **Rework/loop decisions** - flow self-edges (top-level `flow` field): the loop-head phase declares `A -->|condition| A`; the node's task text evaluates the loop condition inline; the pilot advances with `graph_advance(runId, nodeId, condition)` — the transition table re-enters the node (bounded by the loop-head task text / constraints prose; the engine increments `retryCount` on condition re-entry). Backward rework to an ancestor rides the advance `jump` channel (backward-only, engine-guarded). No in-run backward reset exists as a node decision. Detail: see ROUTING.md §Rework Decisions + §Advance Channels.
- **Branch decisions** - subgraph selection via `template: router`: IF/ELSE condition evaluated inline by the executing agent; the chosen graph launches as a sibling run. Branch options surface at dispatch via the machine-declared `completion` block on NodeDetail. Detail: see ROUTING.md §Rework Decisions, §Completion.
- **Channels** - phase-level `channels:` context additions; `node:<id>` = read edge to a non-`dependsOn` stream; graph `context:` = global channel. Detail: see PHASESCHEMA.md §YAML channels Field.

---

# Context Requirements Convention

Main phases declare context requirements in four deterministic sections; context arrives as prompt blocks at dispatch. Placement in entry skills: after frontmatter Runtime constraints block, before `## Flow` (after `## Input` if present).

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
- **Operation classes** - declared execution classes (skill default + phase `operations:`), evidence-only verification in the Tool usage check (no registry injection). Skill bodies reference atom-kernel §Tool Schemas for parameters - never re-specify chains.
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

Activation facts (constraints) live at the invocation boundary — never as graph nodes. One fact, loaded per activation:

|Fact|Source|Behavior|
|-|-|-|
|Constraints load (project layer)|pilot startup|Session fact `{"constraints": [...]}` — protocol per CONTEXT.md `Constraint`; graph-layer constraints per-dispatch, not an activation fact.|

Mechanics:

- **No prologue nodes** - runs contain author phases only; `$`-prefixed ids are schema-rejected (the prefix is reserved; the activation prologue was removed).
- **Activation rule** - facts are fixed per activation: an operator `graph_jump` (PCL, graph-external — the operator-level backward reset) targeting an entry node re-runs the entry directly; constraints are NOT re-asked (session facts persist for the run).
- **Consumption** - the handler formats the `## Constraints:` block from the session fact per dispatch (main). Missing fact -> degrade (empty constraints) + warning - never blocks.
- Nested execution is router-sibling-only — a `template: router` node launches the chosen graph as a sibling run (`graph_start`), driven by the frontend; no compile-time composition plumbing exists.
- Grilling nodes in graph dispatch carry an encapsulation contract in their task text (mandatory question rounds, never zero-question, never auto-gated — the upstream grilling skill body is never modified).
