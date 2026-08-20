---
name: atom-graph-design
description: 'Entry skill for graph topology design - loads atom-graph-spec, analyzes requirements, designs phase list with dependsOn/channels. Trigger: spec phase in graph-generate graph.'
disable-model-invocation: true
user-invocable: false
version: 1.8.0
last_updated: '2026-08-20'
---

> **Runtime constraints** - load `atom-kernel` for interview() behavior contract. Graph dispatch: atom-graph-spec content arrives at dispatch; standalone use loads it directly.

## Context Requirements

### From upstream

- entry

### Reference skills

- atom-graph-spec

### Operation classes

- locate
- read

### Files

<!-- none -->

# Atom-Graph-Design

Entry skill for graph topology design. Design flow composition: confirm goal -> research specs -> think topology -> interview() confirmation rounds (participation: mandatory) -> repeat until confirmed. Loads atom-graph-spec as reference. Outputs structured design document for atom-graph-writer consumption.

## Entry

**MUST INTERVIEW** - when dispatched by atom-phase-handler for the spec phase node in the graph-generate maker journey. Execute the design flow per this skill — interview() confirms decisions only.

## Flow

### Design flow

Execute the design flow: research specs -> think topology -> interview() confirmation rounds (participation: mandatory). Goal: "design graph topology for confirmed scope".

```
interview({ goal: "design graph topology for <scope>", context, participation: 'mandatory' })
```

#### confirm(goal)

Confirm design goal with user via interview() (first turn). Read the entry output for scope. Confirm:

- Graph name and purpose - what workflow it orchestrates
- Phase count estimate - start-to-end phases needed
- Nested execution nodes (`template: router` + `template_args.paths`) - which graphs to launch as sibling runs
- Save location - where the workflow YAML writes

Never skip - goal consensus required before design.

#### research

Load `atom-graph-spec` - the single source for PhaseSchema fields, topology constraints, flow/rework semantics (flow self-edges, condition vocabulary), and router nesting (the `template: router` + `template_args.paths` form). Consult it; do not restate.

Scan existing graphs in the scheduler graphs directory for patterns (see PHASESCHEMA.md §File Location).

#### think

Design complete phase topology:

1. **Root phases** - `dependsOn: []`, start of workflow (scope confirm, input gather)
2. **Work phases** - dependsOn upstream, main body (design, write, review)
3. **Loop/rework via flow self-edge** - rework/loop = a top-level `flow` self-edge (`A -->|condition| A` — the inline bounded loop; the condition value is flow-defined vocabulary; the loop-head phase's task text evaluates the condition inline, bound in task text / constraints prose); backward rework to an ancestor rides the advance `jump` channel (backward-only, engine-guarded); the operator `graph_jump` (PCL, graph-external) is the operator-level backward reset
4. **Decision confirmation in main** - human decision points (approval() cards) live inside main phases; branch tracks express as main task-text decisions (no `route`/`routing` fields)
5. **Router template for nested execution** - when a stage must run a candidate GRAPH (a sibling run), declare `template: router` + `template_args.paths: [<graph-name>, ...]` (graph-router-template — paths are graph names, the only nested-execution form; the frontend auto-selects on a single candidate or satisfied hard criterion, or presents a recommendation card, then starts the chosen graph via `graph_start` as a sibling run). Nesting is sibling-run only — no branchTo for router paths; sibling inputs (report path / change name / adoption echo) pass via `graph_start` args.

For each phase (design-relevant fields; full tables: see PHASESCHEMA.md §Phase Fields):

- `id`: kebab-case, unique, descriptive
- `type`: `main` only (the `flow` type is removed)
- `dependsOn`: leaf deps only - acyclic dependency edges, load-enforced (judgment context rides channels, never transitive dependsOn)
- convergence: all AND - no `join` field (direct upstreams all complete before dispatch)
- `task`: sketch - full text per §Task Content Spec (PHASESCHEMA.md) at write time; loop/rework = a top-level `flow` self-edge (`A -->|condition| A` — condition-matched re-entry; the loop-head task text evaluates the condition inline, bound in task text / constraints prose); branch = `template: router` + `template_args.paths`; there is no rework/decision-target field (no branchTo, no retry action)
- `channels`: from entry skill Context Requirements contract
- branch tracks: subgraph selection via `template: router` + `template_args.paths` — the task text evaluates the criterion (IF/ELSE over the output contract) inline, the chosen graph launches as a sibling run (`graph_start`); decision options surface at dispatch via the machine-declared `completion` block (see §Design flow step 5)

Validate per atom-graph-spec §Topology Constraints (single home - consult, do not restate). Design-specific mappings: nested execution declares `template: router` + `template_args.paths` (the sole nested-execution form; sibling inputs pass via `graph_start` args); loop/rework = top-level `flow` self-edges (condition-matched re-entry; the condition value from the flow vocabulary; bound in task text / constraints prose); backward rework to an ancestor rides the advance `jump` channel (backward-only); the operator `graph_jump` (PCL, graph-external) is the operator-level backward reset.

#### run ending

Runs complete by natural drain (`node: null` -> fsmState `completed`); see atom-graph-spec ROUTING.md §Completion (single home — consult, do not restate). Design consequences: never propose end phases; no routing actions exist (there is no `end` action); `graph_force_end` is the runtime terminate tool (irreversible, pilot-command surface) — never a graph construct.

#### interview(decisions)

Present design decisions one at a time via interview() confirmation rounds (approval() without recommendation - card always; participation: mandatory). Recommendation first.

Confirm:

- Graph name - matches scope
- Phase count and types - complete, no missing steps
- dependsOn edges - correct acyclic dependency edges, leaf deps only
- Loop/rework decisions - top-level `flow` self-edges (`A -->|condition| A`; condition value from the flow vocabulary; the loop-head task text evaluates the condition inline, bound in task text / constraints prose; backward rework rides the advance `jump` channel)
- Branch tracks - `template: router` + `template_args.paths` (candidate graphs; the chosen graph launches as a sibling run); options surface at dispatch via the machine-declared `completion` block

User rejects any decision -> return to think. Revise. Re-interview affected decisions only.

#### Output

Include an **inventory draft** in the design output: one row per planned phase `{ id, type, goal, constraints? }` with bounded-compound goals (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), prose `and`/`or` lowercase; conditional phrases use IF; ordinary ≤ 5 steps; conditional ≤ 3 paths); skill-bound main nodes name the executing skill in verb form; router entries state "Launches the <graph> graph as a sibling run (router template — single path auto-select)". Draft goals MUST comply with the case discipline (structural keywords uppercase). Draft `constraints` (optional, per row): one-sentence prose rules — general boundaries plus explicit non-goals ("does not X" / "avoids Y"); at most 5 per atom (convention bound); general rules prefer positive framing, non-goals state the negation directly; prose only — no structural keywords. The draft is the basis for the writer's generated inventory (per PHASESCHEMA.md §Top-Level Fields — `inventory` row).

When all decisions confirmed - write design to the spec output:

```
graph_name: <name>
save_location: <where the workflow YAML writes — confirmed in interview>
phase_count: <n>
graph_constraints_draft: # optional — prose one-sentence rules; general boundaries + explicit non-goals; ≤ 10 per graph (convention bound); positive framing preferred except explicit non-goals; never fabricated; absent → no top-level constraints field
  - <rule 1>
phases:
  - id: <id>
    type: <type>
    dependsOn: [<ids>]
    template: router | <absent> # nested-execution node — template_args.paths list the candidate graphs; no task_summary (task text injected from the template registry at load)
    template_args:
      paths: [<graph-name>, ...] # when template: router
    task_summary: <one-line — seed for full task text per §Task Content Spec, PHASESCHEMA.md; loop/rework = a top-level `flow` self-edge (the loop-head task text evaluates the condition inline — condition value from the flow vocabulary, bound in task text / constraints prose); branch = `template: router` + `template_args.paths` — no decision-target output, no branchTo>
    channels: [<channel entries — contract-derived>]
flow_draft: # optional — flow edges (mermaid subset: `A --> B` / `A -->|condition| B`); self-edges = inline bounded loops (condition-matched re-entry)
  - <source> -->|condition| <target>
inventory_draft:
  - id: <id>
    type: <type>
    goal: <bounded compound intent statement per case discipline — structural keywords ALL-CAPS (AND/OR/IF/THEN/ELSE), prose and/or lowercase>
    constraints: <optional — one-sentence prose rules; general boundaries + explicit non-goals; ≤ 5 per atom; never machine-validated>
validation:
  cycles: passed | failed
  reachability: passed | failed
  flow_edges: passed | failed   # flow edge endpoints resolve to declared phases; self-loops declare a bound in the loop-head task text / constraints prose
```

Return `consensus` per interview() confirmation contract (design flow output assembled by this skill).
