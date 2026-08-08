---
name: atom-spec-maintain
description: 'openspec/specs estate maintenance contract - one path: reverse-analyze (triple diff: actual capabilities <-> docs/domains.md <-> spec dirs) -> minimal change (delta specs only, no tickets) -> openspec-sync-specs -> openspec archive. Repairs drift, retires orphan capability dirs, registers real capabilities as domains, keeps spec dirs <-> domain IDs 1:1. Use when fixing openspec/specs drift, reorganizing spec domains, or dispatching the specs-sync workstream of estate-maintain. Distinct from the normal change -> apply -> sync -> archive flow (no implementation ceremony).'
argument-hint: none (contract skill - dispatched by estate-maintain specs-sync node or invoked directly)
disable-model-invocation: true
user-invocable: true
version: 1.0.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load atom-domain-spec before use. Maintenance only - never implementation.

# Atom-Spec-Maintain

openspec/specs estate maintenance deep module. One contract `repair({ trigger })` -> `{ drift, change_name?, synced, archived }`. Maintenance only - never implementation: the normal flow is change -> apply -> sync + archive; maintenance is reverse-analyze -> minimal change -> sync + archive.

## Context Requirements

### From upstream

- entry
- requirement

### Reference skills

- atom-domain-spec
- atom-doc-maintain

### Operation classes

- run
- read
- write
- verify

### Files

- openspec/specs/**/*.md
- docs/domains.md
- openspec/changes/**/*.md

## Entry

**MUST EXECUTE** - dispatched by atom-phase-handler for specs-sync nodes, or invoked directly as the spec-estate maintenance surface. Read upstream trigger output; execute the repair pipeline.

## repair() Contract

```
repair({ trigger }) -> { drift, change_name?, synced, archived }
```

- `trigger` - `domain-change` | `skill-change` | `proactive` (echoed from upstream; never re-classified).
- `drift` - triple-diff result: `{ orphans: [...], missing: [...], count_mismatches: [...], stale_refs: [...] }`.
- `change_name` - present when spec content needed repair (a minimal change was materialized).
- `synced` / `archived` - openspec CLI outcomes.

Pipeline: triple diff -> classify drift -> minimal change (delta specs only) -> openspec-sync-specs -> openspec archive -> verify 1:1.

## Triple-Diff Reverse Analysis

Diff three views of the estate:

1. **Actual capabilities** - disk facts: `packages/graph-workflow/skills/`, `packages/graph-scheduler/graphs/`, engine feature points (src modules).
2. **docs/domains.md** - registered domain rows (per atom-domain-spec).
3. **openspec/specs/** - capability spec dirs.

Produce the drift list, one entry per finding, each with evidence (path + claim + disk fact):

|Drift|Meaning|Resolution|
|-|-|-|
|Orphan spec dir|Spec dir with no domain row|Real capability (decision recorded, e.g. ADR) -> register domain row; historical artifact -> retire via REMOVED delta|
|Missing spec|Registered active domain with no spec dir|Spec gap - create spec (maintenance change) or drop the row (domain not real)|
|Count mismatch|Claimed counts disagree with disk|Fix the claim at its source|
|Stale reference|Citation of retired/archived contract|Repoint to the superseding record or owning module|

## Minimal Change Transport

Spec content repairs SHALL be transported as an openspec change with **delta specs only** - no tickets, no implementation tasks:

1. `openspec new change "<name>"` - name derived from the drift topic.
2. Write delta specs: ADDED for new capabilities, REMOVED for retirements, MODIFIED for contract updates (full scenario sets preserved - a MODIFIED requirement replaces its whole block).
3. `openspec validate "<name>"` - must pass before sync.
4. `openspec-sync-specs` - sync deltas into main specs.
5. `openspec archive "<name>"` - archive the change.

**A skip-change path does not exist**: openspec-sync-specs reads delta specs from an active change (`artifactPaths.specs.existingOutputPaths`); no change -> no delta -> sync stops. Repairs with zero spec-content change (pure registration) touch only docs/domains.md - no change, no sync.

## 1:1 Mapping Rule

`openspec/specs/` dirs SHALL match docs/domains.md domain IDs one-to-one:

- Orphan dir (no domain row): register (real capability) or retire (REMOVED delta; dir removed from main specs after sync).
- Registered domain without spec: spec gap - create or drop.
- After a pass, the symmetric difference SHALL be empty; the check is mechanical (`ls openspec/specs/` vs domain IDs).

## Verification

After every pass, run:

1. `openspec validate` on the change (if any) - errors block archive.
2. Diff check: spec dirs vs domain IDs - symmetric difference empty.
3. Counts: openspec/specs dir count matches domains.md spec claims.
4. Report drift + outcomes in the output - never silently patch.

## Output

Per repair() contract: `drift` (with evidence), `change_name?`, `synced`, `archived`. Single source - no duplicate listing.
