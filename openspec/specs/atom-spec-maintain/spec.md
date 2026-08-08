# atom-spec-maintain Specification

## Purpose

openspec/specs estate maintenance contract — repairs drift between actual capabilities, docs/domains.md, and main spec dirs via reverse analysis. One path: reverse-analyze → minimal change (delta specs only) → openspec-sync-specs → openspec archive. No implementation ceremony — this is maintenance, not the normal change → apply → sync → archive flow.

## Requirements

### Requirement: Reverse-analysis triple diff

The maintainer SHALL diff three views of the estate — actual capabilities (skills, graphs, engine feature points on disk), docs/domains.md domain rows, and openspec/specs capability dirs — and produce a drift list naming: specs without domains, domains without specs, count mismatches, and stale references.

#### Scenario: Orphan spec dir detected

- **WHEN** a spec dir has no domain row in docs/domains.md
- **THEN** the drift list SHALL name it and recommend register (real capability) or retire (historical artifact)

#### Scenario: Missing spec detected

- **WHEN** a registered active domain has no spec dir
- **THEN** the drift list SHALL name the domain as missing its spec

### Requirement: Minimal change transport

Spec repairs SHALL be transported as an openspec change with delta specs only — no tickets, no implementation tasks. The change SHALL be synced via openspec-sync-specs and archived. A skip-change path does not exist: openspec-sync-specs reads delta specs from an active change, so repairs without any spec-content change (pure registration) SHALL touch only docs/domains.md.

#### Scenario: Spec content repair

- **WHEN** main specs need requirement changes
- **THEN** the maintainer SHALL materialize a minimal change, sync it, and archive it

#### Scenario: Pure registration repair

- **WHEN** only docs/domains.md rows are missing (specs already on disk)
- **THEN** no delta spec is needed — the repair is a domains.md change only

### Requirement: Domain-spec 1:1 mapping

openspec/specs dirs SHALL match docs/domains.md domain IDs one-to-one. Reconciliation SHALL retire orphan capability dirs (REMOVED delta specs) and register real capabilities as domains.

#### Scenario: Retirement

- **WHEN** an orphan dir is a historical artifact with no current asset
- **THEN** its capability SHALL be retired via a REMOVED delta spec and the dir removed from main specs

#### Scenario: Registration

- **WHEN** an orphan dir is a real capability (decision recorded, e.g. ADR)
- **THEN** its domain SHALL be registered in docs/domains.md without touching the spec

### Requirement: Upstream contract concrete

atom-spec-maintain SHALL declare `From upstream: entry, requirement` in its context contract — `entry` (graph trigger classification + workstream selection) and `requirement` (confirmed domain-design requirements). The contract SHALL NOT reference planned, annotated, or self-named nodes as upstream.

#### Scenario: Workstream receives requirements by topology

- **WHEN** the dispatching graph (estate-maintain) runs the specs-sync workstream
- **THEN** the requirement node output arrives as an upstream block via dependsOn (topology guarantee, no timing race), and the compliance duty reads the confirmed requirements before any change

#### Scenario: Trigger scope preserved

- **WHEN** the workstream node depends on requirement instead of entry
- **THEN** the entry output (trigger, workstreams) still arrives via an explicit channel read edge, never silently dropped
