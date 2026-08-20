---
name: atom-graph-writer
description: 'Entry skill for graph YAML generation AND maintenance - create mode: loads atom-graph-spec, validates topology, generates valid workflow YAML. Maintain mode: audits graph assets (inventory compliance, flow-edge audit, content-vs-inventory, description drift), proposes fixes, applies approved proposals across the two-path bundle. Trigger: implement phase in graph-generate graph; audit/propose/execute phases in graph-maintain graph.'
disable-model-invocation: true
user-invocable: false
version: 1.8.0
last_updated: '2026-08-20'
---

> **Runtime constraints** - graph dispatch: atom-graph-spec content arrives at dispatch. Standalone use: load `atom-graph-spec` for format rules and field definitions. Dependency missing (atom-graph-spec unavailable) -> fail loudly, no silent fallback.

# Atom-Graph-Writer

Entry skill for graph YAML generation AND maintenance. Loads atom-graph-spec as format reference. Create mode: reads design document, validates topology, generates valid workflow YAML. Maintain mode: audits a graph asset, proposes fixes, applies approved proposals across the two-path bundle (graph YAML + registry entry).

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

<!-- none -->

## Entry

**MUST WRITE** - when dispatched by atom-phase-handler for the implement phase node in the graph-generate maker journey (create mode) OR the audit / propose / execute phase nodes in the graph-maintain maintenance flow (maintain mode). Mode comes from the dispatching node's task text — never inferred from context.

## Flow

### Step 1: Read Design

Read from spec output. Extract:

- `graph_name` - top-level name field
- `phases` - array of { id, type, dependsOn, template?, template_args?, task_summary, channels }
- `flow_draft` - optional array of flow-edge lines (mermaid subset — `A --> B` / `A -->|condition| B`; self-edges `A -->|condition| A` = inline bounded loops, condition-matched re-entry; condition values = flow-defined vocabulary)
- `inventory_draft` - array of { id, type, goal, constraints? } (the approved design's inventory draft — the produced table SHALL match it)
- `graph_constraints_draft` - optional array of one-sentence prose rules (the approved design's graph-level constraints draft — carried verbatim; absent → no top-level `constraints` field)

### Step 2: Generate YAML

Generate YAML per PHASESCHEMA.md §YAML Format Rules + YAML-EXAMPLES.md (single source - no skeleton reproduced here); task text per PHASESCHEMA.md §Task Content Spec (Directive + phase-local invariants + canonical `Output contract:` spelling + dedup deletion test) and §Output Contract Spelling. Nested execution emits `template: router` + `template_args.paths` (the sole nested-execution declaration). Router template nodes (`template: router`) carry NO authored task — write `template_args.paths` (the candidate graph names) per PHASESCHEMA.md §Router Template; the task text is injected from the template registry at load time.

**Generate the top-level `flow` array when the design provides `flow_draft`** (per PHASESCHEMA.md §Top-Level Fields — `flow` row): carry the approved flow-edge lines verbatim (mermaid subset — `A --> B` sequence default / `A -->|condition| B` condition-matched; self-edges `A -->|condition| A` = inline bounded loops — loop-head task text declares the condition + bound per PHASESCHEMA.md §Flow Transitions). Condition labels are flow-defined vocabulary — consistent spelling across edges and the loop-head task text. Absent draft → omit the top-level `flow` field (optional — no flow edges; nodes route by their dependsOn-derived successor set). **Full-coverage duty**: the produced `flow` array SHALL cover every declared phase — each phase id appears as a flow-edge source or target (the synthesized `__handoff` excluded — it is never a declared phase); the sequence section is written as explicit unlabeled default edges (`A --> B`), never left to the dependsOn-derived default. A draft missing sequence edges for declared phases SHALL be completed (never silently dropped) before writing.

Task-text criterion (checkable): exactly one `Output contract:` line per main task; no skill-protocol restatement.

**Generate the top-level `constraints` array when a draft exists** (per PHASESCHEMA.md §Top-Level Fields — `constraints` row): carry the approved `graph_constraints_draft` verbatim (prose one-sentence rules — general boundaries + explicit non-goals; ≤ 10 per graph convention bound; positive framing preferred except explicit non-goals; never fabricated). Absent draft → omit the top-level `constraints` field (optional — empty set).

**Generate the top-level `inventory` array** (per PHASESCHEMA.md §Top-Level Fields — `inventory` row): one entry `{ id, type, goal, constraints? }` per phase — **carry the approved `inventory_draft` goals (and constraints) from the design output verbatim** (the produced table SHALL match the approved design): id/type aligned to `phases`, goal text taken from the draft. Adjust draft wording ONLY when a draft goal violates the bounded-compound or case-discipline rules — and report the adjustment explicitly; never silently re-word approved goals. When no draft exists, author goals as bounded compound intent sentences (connectors AND/THEN/IF-ELSE/OR — structural keywords ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), prose `and`/`or` lowercase; conditional phrases use IF; ordinary nodes ≤ 5 steps; conditional paths ≤ 3) carrying the execution mechanism: skill-bound main nodes name the executing skill in verb form (e.g. "Executes atom-scope-interview to acquire scope"); router entries state "Launches the <graph> graph as a sibling run (router template — single path auto-select)"; main nodes with rework conditions carry decision semantics (`{ action: continue|retry|jump, target }`). Draft `constraints` (optional, per entry): one-sentence prose rules — general boundaries plus explicit non-goals ("does not X" / "avoids Y"); at most 5 per atom (convention bound); general rules prefer positive framing, non-goals state the negation directly; prose only — no structural keywords. Generated goals MUST comply with the case discipline (structural keywords uppercase). No `skill` field on entries (phase-level `skill` is the single source). Never regenerate an existing inventory — it is user-maintained after creation (user-hand-written content preserved).

### Step 3: Validate

Validate generated YAML against every atom-graph-spec rule class (schema fields, topology constraints, rework-condition conventions, task-content rules, PHASESCHEMA.md §Language Constraints classes - declared-inputs coverage, hardcoded-path rejection, claims-match-declarations) plus flow rule class: flow-edge endpoints resolve to declared phase ids (source + target), self-loops declare a bound in the loop-head task text / graph constraints prose, condition labels are consistent (flow-defined vocabulary — zero machine validation axis on the vocabulary), flow covers every declared phase (each phase id appears as an edge source or target — the `__handoff` synthesized terminal excluded) plus inventory rule classes: every inventory entry's `id` exists in `phases`, `type` matches the phase declaration, goals are in-bounds bounded compound sentences, constraints (when present) are one-sentence prose rules within the ≤ 5 per-atom convention bound.

### Step 4: Write

Write generated YAML to the save_location from the entry output. Default: scheduler graphs directory — `.graph-scheduler/graphs/<name>.yaml` (per PHASESCHEMA.md §File Location convention), with the `$schema` + `version` self-description header (per the graph-generate writer contract). Top-level keys in the canonical layout order (per PHASESCHEMA.md §Top-Level Fields): `name → description → $schema → version → interaction → flow → inventory → constraints → context → phases` — `flow` before `inventory`, `constraints` after `inventory`. Create parent directories if needed.

### Step 5: Output

Write result to the implement output:

```
graph_path: <absolute path to written .yaml>
graph_name: <name>
phase_count: <n>
validation: passed | failed (<failure details>)
```

---

## Run Ending

Writer consequences: no end phase in authored YAML; `graph_force_end` is the runtime terminate/abort tool (validation load-probes use it as cleanup) — never the graph's normal completion path; no routing actions (no `end` action exists). Completion: see atom-graph-spec ROUTING §Completion (single home — consult, do not restate).

## Maintain Mode

Maintenance contract — three operations, one per graph-maintain node (mode from task text): audit → propose → execute. Same format authority (atom-graph-spec); creation mode above stays unchanged.

### Audit

Run checks against the target graph asset (two-path bundle: graph YAML + registry entry):

Machine checks (deterministic, evidence-cited):

- inventory id/type vs phases — every entry's id exists in `phases`, type matches (per load-time contract-pass semantics; mismatch = finding)
- flow edge endpoints — every top-level `flow` edge's source and target exist in `phases` (per compile-time endpoint validation semantics; undeclared endpoint = finding)
- canonical layout order — the top-level key order follows the canonical layout (`flow` before `inventory`, `constraints` after `inventory` — per PHASESCHEMA.md §Top-Level Fields; a misplaced key = finding proposing the reposition; a builtin graph without a `flow` block = finding proposing the transition surface)
- self-loop bound presence — a flow self-edge (`X -->|...| X`) requires a declared bound in the loop-head node's task text or the graph's constraints prose (absence = finding; the bound's adequacy stays LLM-judged)
- graph-level constraints presence/format — a declared top-level `constraints` block is a string array of ≤ 10 prose entries (non-array, oversized, or structural-content entries = finding; content semantics stay LLM-judged — zero machine validation of meaning)
- graph definition description drift — the top-level `description` (catalog single source; registry entries are a pure `{name, path}` index — description never lives in the registry) mentions a phase name not in the graph (per validateGraphDescriptionDrift semantics)
- in-graph declaration existence - comments/task-text in the graph YAML referencing fields or mechanisms that do not exist in the load pipeline or the graph shape (e.g. a retired response field, or a stale reference to the retired rework mechanism); stale declaration = finding
- schema-unknown phase keys — tolerant raw-YAML key audit: parse the graph file WITHOUT requiring a schema-valid load, diff each phase's key set against the strict PhaseSchema surface (`PHASE_FIELD_KEYS` — the machine-known field set); extra keys (removed fields like `routing`/`mode`, legacy fields like `topic`/`maxDepth`) = one finding per phase with the keys cited. Runs even when the graph fails schema validation (load failure never blocks the audit — the audit is the repair path for schema-invalid graphs)
- non-interactive compliance — when the graph declares top-level `interaction: none`, run the machine scanner (`nonInteractiveCompliance` — the interaction-scan module, tolerant raw-YAML like unknown-key audit): per-node interaction markers (task-text tokens `Interview:`/`confirm:`/inline-interview wording, interaction skills `atom-scope-interview`/`grilling`, `direct end:` declarations) = one finding per offending node with the matched marker cited. A graph declaring `interaction: enabled` (explicit or absent) is never compliance-scanned

LLM checks (judgment — no machine axis):

- content-vs-inventory — phase task text semantically diverges from its inventory goal (or constraints)
- flow-vs-inventory — flow condition semantics diverge from the loop-head node's inventory goal / task text (e.g. a self-edge whose re-entry condition contradicts the node's stated purpose) = finding (cited)
- condition-label consistency — flow edge labels form a consistent vocabulary (same label, same meaning across edges and the loop-head task text; a label reused with divergent meaning = finding — zero machine validation axis on the vocabulary, LLM-judged)
- in-graph declaration semantics - comments/task-text claims diverge from implementation reality (cited)
- non-interactive semantic review — for a declared-`none` graph, interaction declared in prose the machine scan cannot classify (interview/confirmation intent in wording the token patterns miss) = finding

Emit findings `[{check, severity, evidence}]` per check with evidence — never silently patched. Zero findings → report no-op scope.

### Propose

Convert findings to fix proposals — one per finding: `{target: graph-yaml | registry-entry, change, rationale}`. Each proposal names the exact change (field, value, path) and why. Description-drift findings convert to graph-yaml proposals — the top-level `description` is the catalog single source; the registry entry never carries description text (pure `{name, path}` index). Unknown-key findings convert to deletion proposals — each finding proposes removing the cited extra keys from the phase in the graph YAML (the load-probe after execution validates the cleaned graph loads). Non-interactive compliance findings convert to compliance-fix proposals — each proposes a concrete remedy for the offending node (remove the interaction marker, remove the node, or migrate the interaction to the parent graph that launches it), with rationale; approved compliance fixes apply across the two-path bundle and are load-probe validated after execution. Zero findings → zero proposals, never fabricated.

### Execute

Apply APPROVED proposals only (approval is the gate — never execute unapproved fixes). Bundle invariant: apply across the two-path bundle in one pass — a phase change updates the graph YAML (including its top-level `description` — the catalog single source; description drift fixes target the graph definition, never the registry) and the registry entry (pure `{name, path}` index) together; never a partial bundle update. **Coverage repair**: when a proposal adds a phase to the graph, include the new phase's flow edges (source or target) in the applied YAML — the flow block SHALL keep covering every declared phase (the `__handoff` synthesized terminal excluded; the suite coverage assertion is the backstop). Then load-probe: `graph_start` the maintained graph → expect a node return → `graph_force_end` the probe run. Report per-path changes + probe result; deviations from proposals reported, never negotiated.
