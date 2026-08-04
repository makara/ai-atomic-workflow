# Changelog

> Release history for ai-atomic-workflow — monorepo, one release line for both packages. Content derived from code state (skills, graphs, schema features), not git commits. Caveman style.

## [v0.2.0]

The arch-review-loop.

### Added

- **Gate phase type** — pure rework node, `jumps` `[{when, to}]`; jump back on hit, pass otherwise.
- **Branch routes** — phase `route` membership, activated via `graph_advance` `branchTo`; unselected never run.
- **Activation prologue** — run mode confirmed per activation (manual/auto, never auto by default), constraints loaded per round; auto mode executes approvals, interviews never skipped.
- **4 new graphs** (12 → 15) — arch-review-loop, openspec-engineer, implement, grill-with-docs.
- **atom-mcp-contract skill** (13 → 14) — MCP tool-call contract.
- **OpenSpec input-source detection** — wayfinder-map / arch-review / grill-consensus / direct; inline ADR judgment.
- **Approval cards redesign** — decision-confirmation: Accept + free input + contextual options; card text in `task`.
- **`graph_advance` routing** — `branchTo` + `endRun` added, `skip` removed.
- **Flow composition** — merge-at-load flatten (depth cap 5), channels propagate to entry nodes.
- **Schema convergence** — `reads`/`preText`/`eval` and top-level `when` removed; `join` restricted to `any`.
- **Documentation release pass** — CONTEXT.md rewrite, README + blueprint sync, bilingual changelog.

### Removed

- Top-level `when` skip guard — conditions moved to gate `jumps[].when`.
- `preText`, `eval`, `reads` phase fields.

## [v0.1.0]

Initial release.

### Added

- **graph-scheduler** — DAG execution engine + MCP server (9 tools, stdio), pure-function FSM kernel, libsql persistence.
- **`.taskflow.yaml` graph format** — main/approval phases, `dependsOn`, `task`, `skill`, `channels`, `join`, `when` guards.
- **Approval gates** — non-bypassable human decision cards between phases.
- **graph-workflow skill system** — 13 built-in skills: atom-pilot, atom-phase-handler, atom-kernel, entry + reference skills, setup-atomic-workflow.
- **12 built-in graphs** — e2e-minimal, arch-review, arch-review-to-spec (later replaced), openspec-create, openspec-apply, openspec-pipeline, plan-generate, skill-author, skill-delete, skill-change-workflow, graph-generate, doc-update.
- **Setup skill** — setup-atomic-workflow scaffolds `.graph-scheduler/`, idempotent.
