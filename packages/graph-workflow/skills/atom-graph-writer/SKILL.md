---
name: atom-graph-writer
description: 'Entry skill for graph YAML generation - loads atom-graph-spec, validates topology, generates valid .taskflow.yaml. Trigger: implement phase in graph-generate graph.'
disable-model-invocation: true
user-invocable: false
version: 1.3.0
last_updated: '2026-08-07'
---

> **Runtime constraints** - graph dispatch: atom-graph-spec content arrives at dispatch. Standalone use: load `atom-graph-spec` for format rules and field definitions. Dependency missing (atom-graph-spec unavailable) -> fail loudly, no silent fallback.

# Atom-Graph-Writer

Entry skill for graph YAML generation. Loads atom-graph-spec as format reference. Reads design document. Validates topology. Generates valid `.taskflow.yaml`. Writes to target path.

## Context Requirements

### From upstream

- entry
- spec

### Reference skills

- atom-graph-spec

### Operation classes

- read
- write
- verify

### Files

## Entry

**MUST WRITE** - when dispatched by atom-phase-handler for the implement phase node in the graph-generate maker journey.

## Flow

### Step 1: Read Design

Read from spec output. Extract:

- `graph_name` - top-level name field
- `phases` - array of { id, type, dependsOn, join, task_summary, channels, jumps }

### Step 2: Generate YAML

Generate YAML per PHASESCHEMA.md §YAML Format Rules + YAML-EXAMPLES.md (single source - no skeleton reproduced here); task text per PHASESCHEMA.md §Task Content Spec (Directive + phase-local invariants + canonical `Output contract:` spelling + dedup deletion test) and §Output Contract Spelling.

Task-text criterion (checkable): exactly one `Output contract:` line per main/approval task; no skill-protocol restatement; approval header <= 30 chars.

### Step 3: Validate

Validate generated YAML against every atom-graph-spec rule class (schema fields, topology constraints, gate jump hygiene, flow use-only, join modes, approval routing, task-content rules, PHASESCHEMA.md §Language Constraints classes - declared-inputs coverage, hardcoded-path rejection, claims-match-declarations).

### Step 4: Write

Write generated YAML to the save_location from the entry output. Default: scheduler graphs directory (per PHASESCHEMA.md §File Location convention). Create parent directories if needed.

### Step 5: Output

Write result to the implement output:

```
graph_path: <absolute path to written .taskflow.yaml>
graph_name: <name>
phase_count: <n>
validation: passed | failed (<failure details>)
```
