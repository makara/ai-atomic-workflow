---
name: atom-graph-writer
description: 'Entry skill for graph YAML generation AND maintenance - create mode: loads atom-graph-spec, validates topology, generates valid workflow YAML. Maintain mode: audits graph assets (inventory compliance, content-vs-inventory, description drift, attached-doc sync), proposes fixes, applies approved proposals across the three-path bundle. Trigger: implement phase in graph-generate graph; audit/propose/execute phases in graph-maintain graph.'
disable-model-invocation: true
user-invocable: false
version: 1.5.0
last_updated: '2026-08-15'
---

> **Runtime constraints** - graph dispatch: atom-graph-spec content arrives at dispatch. Standalone use: load `atom-graph-spec` for format rules and field definitions. Dependency missing (atom-graph-spec unavailable) -> fail loudly, no silent fallback.

# Atom-Graph-Writer

Entry skill for graph YAML generation AND maintenance. Loads atom-graph-spec as format reference. Create mode: reads design document, validates topology, generates valid workflow YAML. Maintain mode: audits a graph asset, proposes fixes, applies approved proposals across the three-path bundle (graph YAML + registry entry + attached doc).

## Context Requirements

### From upstream

- entry
- spec (create mode)
- audit / propose (maintain mode)

### Reference skills

- atom-graph-spec

### Operation classes

- read
- write
- verify

### Files

## Entry

**MUST WRITE** - when dispatched by atom-phase-handler for the implement phase node in the graph-generate maker journey (create mode) OR the audit / propose / execute phase nodes in the graph-maintain maintenance flow (maintain mode). Mode comes from the dispatching node's task text — never inferred from context.

## Flow

### Step 1: Read Design

Read from spec output. Extract:

- `graph_name` - top-level name field
- `phases` - array of { id, type, dependsOn, join, task_summary, channels, jumps }
- `inventory_draft` - array of { id, type, goal, constraints? } (the approved design's inventory draft — the produced table SHALL match it)
- `graph_constraints_draft` - optional array of one-sentence prose rules (the approved design's graph-level constraints draft — carried verbatim; absent → no top-level `constraints` field)

### Step 2: Generate YAML

Generate YAML per PHASESCHEMA.md §YAML Format Rules + YAML-EXAMPLES.md (single source - no skeleton reproduced here); task text per PHASESCHEMA.md §Task Content Spec (Directive + phase-local invariants + canonical `Output contract:` spelling + dedup deletion test) and §Output Contract Spelling.

Task-text criterion (checkable): exactly one `Output contract:` line per main/approval task; no skill-protocol restatement; approval header <= 30 chars.

**Generate the top-level `constraints` array when a draft exists** (per PHASESCHEMA.md §Top-Level Fields — `constraints` row): carry the approved `graph_constraints_draft` verbatim (prose one-sentence rules — general boundaries + explicit non-goals; ≤ 10 per graph convention bound; positive framing preferred except explicit non-goals; never fabricated). Absent draft → omit the top-level `constraints` field (optional — empty set).

**Generate the top-level `inventory` array** (per PHASESCHEMA.md §Top-Level Fields — `inventory` row): one entry `{ id, type, goal, constraints? }` per phase — **carry the approved `inventory_draft` goals (and constraints) from the design output verbatim** (the produced table SHALL match the approved design): id/type aligned to `phases`, goal text taken from the draft. Adjust draft wording ONLY when a draft goal violates the bounded-compound or case-discipline rules — and report the adjustment explicitly; never silently re-word approved goals. When no draft exists, author goals as bounded compound intent sentences (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), prose `and`/`or` lowercase; conditional phrases use IF; ordinary nodes ≤ 5 steps; gates ≤ 3 AND/OR operands; conditional paths ≤ 3) carrying the execution mechanism: skill-bound main nodes name the executing skill in verb form (e.g. "Executes atom-scope-interview to acquire scope"); flow entries state "expands <use> subgraph"; approval/gate entries carry decision semantics. Draft `constraints` (optional, per entry): one-sentence prose rules — general boundaries plus explicit non-goals ("does not X" / "avoids Y"); at most 5 per atom (convention bound); general rules prefer positive framing, non-goals state the negation directly; prose only — no structural keywords. Generated goals MUST comply with the case discipline (structural keywords uppercase). No `skill` field on entries (phase-level `skill` is the single source). Never regenerate an existing inventory — it is user-maintained after creation (user-hand-written content preserved).

### Step 3: Validate

Validate generated YAML against every atom-graph-spec rule class (schema fields, topology constraints, gate jump hygiene, flow use-only, join modes, approval routing, task-content rules, PHASESCHEMA.md §Language Constraints classes - declared-inputs coverage, hardcoded-path rejection, claims-match-declarations) plus inventory rule classes: every inventory entry's `id` exists in `phases`, `type` matches the phase declaration, goals are in-bounds bounded compound sentences, constraints (when present) are one-sentence prose rules within the ≤ 5 per-atom convention bound.

### Step 4: Write

Write generated YAML to the save_location from the entry output. Default: scheduler graphs directory — `.graph-scheduler/graphs/<name>.yaml` (per PHASESCHEMA.md §File Location convention), with the `$schema` + `version` self-description header (per the graph-generate writer contract). Create parent directories if needed.

### Step 5: Output

Write result to the implement output:

```
graph_path: <absolute path to written .yaml>
graph_name: <name>
phase_count: <n>
validation: passed | failed (<failure details>)
```

---

## Maintain Mode

Maintenance contract — three operations, one per graph-maintain node (mode from task text): audit → propose → execute. Same format authority (atom-graph-spec); creation mode above stays unchanged.

### Audit

Run checks against the target graph asset (three-path bundle: graph YAML + registry entry + attached doc):

Machine checks (deterministic, evidence-cited):

- inventory id/type vs phases — every entry's id exists in `phases`, type matches (per load-time contract-pass semantics; mismatch = finding)
- graph-level constraints presence/format — a declared top-level `constraints` block is a string array of ≤ 10 prose entries (non-array, oversized, or structural-content entries = finding; content semantics stay LLM-judged — zero machine validation of meaning)
- registry description drift — description mentions a phase name not in the graph (per validateGraphRegistryDrift semantics)
- attached-doc existence — `.graph-scheduler/docs/<name>.md` exists for a registered graph
- in-graph declaration existence - comments/task-text in the graph YAML referencing fields or mechanisms that do not exist in the load pipeline or the graph shape (e.g. a retired response field); stale declaration = finding

LLM checks (judgment — no machine axis):

- content-vs-inventory — phase task text semantically diverges from its inventory goal (or constraints)
- attached-doc coverage — doc covers the graph's phases (missing phases cited)
- in-graph declaration semantics - comments/task-text claims diverge from implementation reality (cited)

Emit findings `[{check, severity, evidence}]` per check with evidence — never silently patched. Zero findings → report no-op scope.

### Propose

Convert findings to fix proposals — one per finding: `{target: graph-yaml | registry-entry | attached-doc, change, rationale}`. Each proposal names the exact change (field, value, path) and why. Zero findings → zero proposals, never fabricated.

### Execute

Apply APPROVED proposals only (approval is the gate — never execute unapproved fixes). Bundle invariant: apply across the three-path bundle in one pass — a phase change updates the graph YAML, its registry description (when it mentions topology), and the attached doc together; never a partial bundle update. Then load-probe: `graph_start` the maintained graph → expect a node return → `graph_force_end` the probe run. Report per-path changes + probe result; deviations from proposals reported, never negotiated.
