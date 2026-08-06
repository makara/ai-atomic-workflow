---
name: atom-graph-writer
description: 'Entry skill for graph YAML generation — loads atom-graph-spec, validates topology, generates valid .taskflow.yaml. Trigger: implement phase in graph-generate graph.'
user-invocable: false
version: 1.1.0
last_updated: '2026-07-30'
---

> **Runtime constraints** — graph dispatch: atom-graph-spec arrives via `skill:` channel (handler-injected). Standalone use: load `atom-graph-spec` for format rules and field definitions.

# Atom-Graph-Writer

Entry skill for graph YAML generation. Loads atom-graph-spec as format reference. Reads design document. Validates topology. Generates valid `.taskflow.yaml`. Writes to target path.

## Context Requirements

### From upstream

- entry
- spec

### Reference skills

- atom-graph-spec

## Entry

**MUST WRITE** — when dispatched by atom-phase-handler for the implement phase node in the graph-generate maker journey.

## Flow

### Step 1: Read Design

Read from spec output (injected by main agent). Extract:

- `graph_name` — top-level name field
- `phases` — array of { id, type, dependsOn, when, join, task_summary, channels }

### Step 2: Generate YAML

Generate YAML per atom-graph-spec conventions:

```yaml
name: <graph_name>
version: 1
phases:
  - id: <id>
    type: <type>
    dependsOn: [<ids>]
    task: |
      <multi-line task instruction>
    channels:
      - skill:<reference-skill>
      - <file-glob>
```

Rules:

- `task`: block scalar `|` for multi-line — no escape characters
- `dependsOn`: flow sequence `[a, b]` — compact
- `channels`: block sequence `- item` — clear; entries derive from the dispatched skill's Context Requirements contract (see atom-graph-spec §YAML channels Field)
- `when`: inline string — short conditions
- `routing.actions`: block sequence — self-contained per action
- Indentation: 2 spaces
- Comments: `#` annotate phase intent where non-obvious

### Step 3: Validate

Validate generated YAML against every atom-graph-spec rule class (schema fields, topology constraints, when-guard hygiene, flow use-only, join modes, approval routing).

### Step 4: Write

Write generated YAML to the save_location from the entry output. Default: `<graph_name>.taskflow.yaml` in working directory. Create parent directories if needed.

### Step 5: Output

Write result to the implement output (main agent collects):

```
graph_path: <absolute path to written .taskflow.yaml>
graph_name: <name>
phase_count: <n>
validation: passed | failed (<failure details>)
```
