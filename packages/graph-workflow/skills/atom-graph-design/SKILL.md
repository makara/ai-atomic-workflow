---
name: atom-graph-design
description: 'Entry skill for graph topology design - loads atom-graph-spec, analyzes requirements, designs phase list with dependsOn/jumps/channels. Trigger: spec phase in graph-generate graph.'
user-invocable: false
version: 1.4.0
last_updated: '2026-08-07'
---

> **Runtime constraints** - load `atom-kernel` for interview() behavior contract (solve mode). Graph dispatch: atom-graph-spec content arrives at dispatch; standalone use loads it directly.

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

Entry skill for graph topology design. Uses atom-kernel interview() solve mode - confirm goal -> research specs -> think topology -> interview decisions -> repeat until confirmed. Loads atom-graph-spec as reference. Outputs structured design document for atom-graph-writer consumption.

## Entry

**MUST INTERVIEW** - when dispatched by atom-phase-handler for the spec phase node in the graph-generate maker journey. Execute interview() solve mode per atom-kernel §interview() behavior contract.

## Flow

### interview() solve mode

Execute atom-kernel interview() solve mode. Goal: "design graph topology for confirmed scope".

```
interview({ goal: "design graph topology for <scope>", research: true, context })
```

#### confirm(goal)

Confirm design goal with user via interview(). Read the entry output for scope. Confirm:

- Graph name and purpose - what workflow it orchestrates
- Phase count estimate - start-to-end phases needed
- Any sub-graph calls (flow type) - which graphs to invoke
- Save location - where .taskflow.yaml writes

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

For each phase:

- `id`: kebab-case, unique, descriptive
- `type`: main / approval / gate / flow per semantics
- `dependsOn`: list upstream phase ids - DAG, no cycles; leaf deps only (judgment context rides channels, never transitive dependsOn)
- `join`: (optional) `any` - branch-route convergence only (direct upstreams span >=2 routes); absent = all; `all` is never written
- `task`: sketch - full text per §Task Content Spec (PHASESCHEMA.md) at write time; approval task = card prompt (first line = header)
- `channels`: main - from entry skill Context Requirements contract; gate/approval - node: entries for cross-level judgment context
- gate `jumps`: when/to pairs - conditions reference direct dependsOn + channels node: outputs, bounded (`<target> retryCount < N`)

Validate per atom-graph-spec §Topology Constraints:

- No cycles in dependsOn edges
- Every phase reachable from root
- Gate jump conditions reference declared judgment context and carry retryCount bounds
- Gate jump targets are writer nodes (not reviewers), upstream of the gate
- Flow phases declare use (required - def removed)

#### interview(details)

Present design decisions one at a time via question(). Recommendation first.

Confirm:

- Graph name - matches scope
- Phase count and types - complete, no missing steps
- dependsOn edges - correct DAG, leaf deps only
- Gate jumps - bounded conditions, writer targets
- Approval routing - branch-route actions only where tracks exist

User rejects any decision -> return to think. Revise. Re-interview affected decisions only.

#### Output

When all decisions confirmed - write design to the spec output:

```
graph_name: <name>
save_location: <where .taskflow.yaml writes — confirmed in interview>
phase_count: <n>
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
validation:
  cycles: passed | failed
  reachability: passed | failed
  jump_bounds: passed | failed
```

Return `solution` per interview() solve mode contract.
