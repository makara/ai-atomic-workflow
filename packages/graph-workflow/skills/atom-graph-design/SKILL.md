---
name: atom-graph-design
description: 'Entry skill for graph topology design — loads atom-graph-spec, analyzes requirements, designs phase list with dependsOn/when/channels. Trigger: graph-design phase in graph-generate graph.'
user-invocable: false
version: 1.2.0
last_updated: '2026-08-03'
---

> **Runtime constraints** — load `skill://atom-kernel` for interview() behavior contract (solve mode). Graph dispatch: atom-graph-spec arrives via `skill:` channel (handler-injected); standalone use loads it directly. Load `skill://atom-phase-handler` for phase type knowledge.

# Atom-Graph-Design

Entry skill for graph topology design. Uses atom-kernel interview() solve mode — confirm goal → research specs → think topology → interview decisions → repeat until confirmed. Loads atom-graph-spec as reference. Outputs structured design document for atom-graph-writer consumption.

## Context Requirements

### From upstream

- scope-confirm

### Reference skills

- atom-graph-spec

## Entry

**MUST INTERVIEW** — when dispatched by atom-phase-handler for graph-design phase node. Execute interview() solve mode per atom-kernel §interview() behavior contract.

## Flow

### interview() solve mode

Execute atom-kernel interview() solve mode. Goal: "design graph topology for confirmed scope".

```
interview({ goal: "design graph topology for <scope>", research: true, context })
```

#### confirm(goal)

Confirm design goal with user via interview(). Read upstream outputs for scope. Confirm:

- Graph name and purpose — what workflow it orchestrates
- Phase count estimate — start-to-end phases needed
- Any sub-graph calls (flow type) — which graphs to invoke
- Save location — where .taskflow.yaml writes

Never skip — goal consensus required before design.

#### research

Load `skill://atom-graph-spec`. Look up:

- PhaseSchema fields — id, type, dependsOn, when, join, task, channels, preText
- Topology constraints — acyclic, minimal deps, single entry
- When guard rules — deterministic, observable facts
- Flow phase constraints — use required (def removed), depth cap, name collision
- Approval routing patterns — continue/retry/jump

Scan existing graphs for patterns (reference atom-graph-spec for location convention).

#### think

Design complete phase topology:

1. **Root phases** — `dependsOn: []`, start of workflow (scope confirm, input gather)
2. **Work phases** — dependsOn upstream, main body (design, write, review)
3. **Gate phases** — approval type with routing.actions (continue/retry/jump)
4. **Output phases** — final step, dependsOn gate

For each phase:

- `id`: kebab-case, unique, descriptive
- `type`: main / approval / flow per semantics
- `dependsOn`: list upstream phase ids — DAG, no cycles
- `when`: (optional) skip condition referencing upstream output
- `join`: (optional) `"any"` for any-dependency gates
- `task`: sketch — full text filled by graph author

Validate per atom-graph-spec §Topology Constraints:

- No cycles in dependsOn edges
- Every phase reachable from root
- When guards reference upstream outputs
- Flow phases declare use (required — def removed)

#### interview(details)

Present design decisions one at a time via question(). Recommendation first.

Confirm:

- Graph name — matches scope
- Phase count and types — complete, no missing steps
- dependsOn edges — correct DAG
- When guards — deterministic
- Approval routing — correct actions

User rejects any decision → return to think. Revise. Re-interview affected decisions only.

#### Output

When all decisions confirmed — write design to graph-design output (main agent collects):

```
graph_name: <name>
phase_count: <n>
phases:
  - id: <id>
    type: <type>
    dependsOn: [<ids>]
    when: <condition or null>
    join: <all | any>
    task_summary: <one-line>
    channels: [<channel entries — derived from entry skill Context Requirements contract>]
validation:
  cycles: passed | failed
  reachability: passed | failed
  when_deterministic: passed | failed
```

Return `solution` per interview() solve mode contract.
