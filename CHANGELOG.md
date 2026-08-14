# Changelog

> Release history for ai-atomic-workflow — monorepo, one release line for both packages. Content derived from code state (skills, graphs, schema features), not git commits. Caveman style — one line per change, latest state wins.

## [v0.5.0]

"Signal discipline module."

### Added

- Packages: graph-fidelity (signal-discipline module — core chain/echo-line/runframe/pcl/resident + interfaces + OMP/opencode adapters + test suite), prompt-assembly-probe (probe test suite), scripts/gen-manifests.mjs + marketplace graph-fidelity entry.
- Specs: graph-fidelity family (12 sub-specs), signal-distribution, token-lifecycle, display-minimalism, questioning-primitives.

### Changed

- Engine: activation prologue removed (graph_start args.mode required), fsm/transition, context contracts + resolve-channels, snapshot + api reworked; 10 graphs + tests updated.
- Skills: atom-kernel, atom-pilot, atom-phase-handler, atom-graph-spec, atom-doc-maintain, atom-graph-design, atom-scope-interview, atom-skill-spec, setup-atomic-workflow updated.
- Docs: CONTEXT.md glossary (seam map, signal distribution, token lifecycle, display minimalism), domains.md index 67 domains.
- Config: package.json, yarn.lock.

### Removed

- Engine: prologue.ts, atom-kernel INTERVIEW-DETAIL.md.
- Specs: activation-prologue, atomic-step-flows, hlt-heat-layering, mutation-plane, query-plane, omp-adapter, opencode-hlt-policy.
- Tests: constraints, defaults-single-source, init-repro (×3).

## [v0.4.0]

"High-level tools".

### Added

- Graphs: estate-maintain, release-prep.
- Skills: release-prep-analyze/release-prep-apply; doc-estate family (atom-adr-maintain, atom-doc-lifecycle, atom-doc-maintain, atom-domain-spec, atom-spec-maintain); HLT registry.
- Engine: three-tier channels + track-closure (channel context model + run closure).
- Docs: 51 openspec specs; docs/domains.md + CONTEXT.md (domain index + glossary); skill reference docs; execution-output + opencode-hlt-policy domains.

### Changed

- Engine: crud/loader/maintenance/snapshot/contracts/resolve-channels/transition/prologue/scheduler-runtime/phase schemas reworked (approval() replaces question(); channel contract simplified; prologue reports to session).
- Skills: atom-graph-spec, atom-kernel, atom-phase-handler, atom-pilot, atom-scope-interview, atom-skill-spec, setup-atomic-workflow, atom-graph-design, atom-graph-writer optimized.
- Graphs: adopt-with-docs, arch-review, graph-generate, openspec-apply, openspec-engineer, registry.json rebuilt.
- Docs: README family + marketplace.json canonical description + blueprint facts 0.4.0; domain index 57 domains; ADR citations repointed (0097→0099, 0116, index 0142).
- Config: package.json, skills.sh.json, marketplace.json.

### Removed

- Graphs: doc-update (folded into estate-maintain).
- Skills: atom-doc-maintenance (renamed atom-doc-maintain), atom-mcp-contract (merged into atom-kernel), atom-openspec-archive, atom-pilot MCP-REFERENCE.md.
- Specs: readme-family (retired — no Doc-Family kind).

## [v0.3.1]

Channels redesign + graph estate rebuild.

### Added

- Graphs: adopt-with-docs, spec-implement.
- Skills: atom-doc-maintenance (single maintain() contract).
- Engine: config-service (.graph-scheduler/config.json + schema validation).
- Docs: readme-blueprint (README family regeneration source); identity + adopt-with-docs graph tests.

### Changed

- Engine: channels two-scope context model (global context + per-phase channels, node streams); approval-handler, prologue, flow-flatten, registry-loader, scheduler-runtime, schemas, filesystem.
- Graphs: all rebuilt (arch-review(-loop), doc-update, e2e-minimal, graph-generate, openspec-apply, openspec-engineer, registry).
- Skills: atom-graph-design/-spec/-writer, atom-mcp-contract, atom-openspec-archive, atom-phase-handler, atom-pilot, atom-scope-interview, setup-atomic-workflow updated.
- Docs: readme family + bilingual changelog structure.
- Config: package.json, marketplace.json, skills.sh.json, .gitignore.

### Removed

- Graphs: 8 legacy (grill-with-docs, implement, openspec-create, openspec-pipeline, plan-generate, skill-author, skill-change-workflow, skill-delete).
- Skills: atom-doc-spec / atom-doc-writer (replaced by atom-doc-maintenance), atom-skill-writer.
- Tests: e2e-skill-change-workflow + pipeline-v2-flatten-smoke (flow removed/reworked).

## [v0.2.0]

The arch-review-loop.

### Added

- Engine: gate phase type (pure rework node with `jumps`), branch routes (route membership via `branchTo`), activation prologue (run mode per activation, constraints per round), flow composition (merge-at-load flatten, depth cap 5), approval cards redesign (free input + contextual options).
- Skills: atom-mcp-contract (MCP tool-call contract).

### Changed

- Engine: `graph_advance` routing (`branchTo` + `endRun` added, `skip` removed); schema convergence (`reads`/`preText`/`eval` and top-level `when` removed; `join` = `any` only).
- Docs: bilingual changelog (CHANGELOG.md + docs/CHANGELOG.zh-CN.md).

### Removed

- Engine: top-level `when` skip guard (moved to gate `jumps[].when`).

## [v0.1.0]

Initial release.

### Added

- Engine: graph-scheduler DAG engine + MCP server (9 tools, stdio), pure-function FSM kernel, libsql persistence; approval gates (non-bypassable human decision cards).
- Graphs: `.taskflow.yaml` format (main/approval, `dependsOn`, `task`, `skill`, `channels`, `join`).
- Skills: graph-workflow system (atom-pilot, atom-phase-handler, atom-kernel, entry + reference skills); setup-atomic-workflow (scaffolds `.graph-scheduler/`, idempotent).
