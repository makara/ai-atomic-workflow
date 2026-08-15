---
name: atom-graph-design
description: 'Entry skill for graph topology design - loads atom-graph-spec, analyzes requirements, designs phase list with dependsOn/jumps/channels. Trigger: spec phase in graph-generate graph.'
disable-model-invocation: true
user-invocable: false
version: 1.6.0
last_updated: '2026-08-15'
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
- Any sub-graph calls (flow type) - which graphs to invoke
- Save location - where the workflow YAML writes

Never skip - goal consensus required before design.

#### research

Load `atom-graph-spec` - the single source for PhaseSchema fields, topology constraints, gate jump rules, flow phase constraints, and approval routing patterns. Consult it; do not restate.

Scan existing graphs in the scheduler graphs directory for patterns (see PHASESCHEMA.md §File Location).

#### think

Design complete phase topology:

1. **Root phases** - `dependsOn: []`, start of workflow (scope confirm, input gather)
2. **Work phases** - dependsOn upstream, main body (design, write, review)
3. **Gate phases** - pure rework nodes (jumps: when/to backward pairs, bounded by target retryCount)
4. **Approval phases** - decision confirmation (card: task text + Accept + free input; branch-route routing only for track selection)

For each phase (design-relevant fields; full tables: see PHASESCHEMA.md §Phase Fields):

- `id`: kebab-case, unique, descriptive
- `type`: main / approval / gate / flow per semantics
- `dependsOn`: leaf deps only - acyclic dependency edges, load-enforced (judgment context rides channels, never transitive dependsOn)
- `join`: (optional) `any` - branch-route convergence only (direct upstreams span >=2 routes); absent = all; `all` is never written
- `task`: sketch - full text per §Task Content Spec (PHASESCHEMA.md) at write time; approval task = card prompt (first line = header)
- `channels`: main - from entry skill Context Requirements contract; gate/approval - node: entries for cross-level judgment context
- gate `jumps`: when/to pairs - conditions reference direct dependsOn + channels node: outputs, bounded (`<target> retryCount < N`)

Validate per atom-graph-spec §Topology Constraints + ROUTING.md §Gate Jump Conditions (single home - consult, do not restate). Design-specific mappings: gate jump targets = writer nodes (not reviewers), upstream of the gate; flow phases declare `use` (required - def removed).

#### interview(decisions)

Present design decisions one at a time via interview() confirmation rounds (approval() without recommendation - card in any mode; participation: mandatory). Recommendation first.

Confirm:

- Graph name - matches scope
- Phase count and types - complete, no missing steps
- dependsOn edges - correct acyclic dependency edges, leaf deps only
- Gate jumps - bounded conditions, writer targets
- Approval routing - branch-route actions only where tracks exist

User rejects any decision -> return to think. Revise. Re-interview affected decisions only.

#### Output

Include an **inventory draft** in the design output: one row per planned phase `{ id, type, goal, constraints? }` with bounded-compound goals (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), prose `and`/`or` lowercase; conditional phrases use IF; ordinary ≤ 5 steps; gates ≤ 3 operands; conditional ≤ 3 paths); skill-bound main nodes name the executing skill in verb form; flow entries state "expands <use> subgraph". Draft goals MUST comply with the case discipline (structural keywords uppercase). Draft `constraints` (optional, per row): one-sentence prose rules — general boundaries plus explicit non-goals ("does not X" / "avoids Y"); at most 5 per atom (convention bound); general rules prefer positive framing, non-goals state the negation directly; prose only — no structural keywords. The draft is the basis for the writer's generated inventory (per PHASESCHEMA.md §Top-Level Fields — `inventory` row).

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
    join: <any | absent>
    task_summary: <one-line — seed for full task text per §Task Content Spec, PHASESCHEMA.md>
    channels: [<channel entries — contract-derived for main; node: for gate/approval>]
    jumps: <gate only — when/to pairs, retryCount-bounded>
    route: <branch-route id | absent>
    routing: <approval branch-route actions | absent — branch-route tracks only>
inventory_draft:
  - id: <id>
    type: <type>
    goal: <bounded compound intent statement per case discipline — structural keywords ALL-CAPS (AND/OR/IF/THEN/ELSE), prose and/or lowercase>
    constraints: <optional — one-sentence prose rules; general boundaries + explicit non-goals; ≤ 5 per atom; never machine-validated>
validation:
  cycles: passed | failed
  reachability: passed | failed
  jump_bounds: passed | failed
```

Return `consensus` per interview() confirmation contract (design flow output assembled by this skill).
