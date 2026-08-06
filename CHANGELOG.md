# Changelog

> Release history for ai-atomic-workflow — monorepo, one release line for both packages. Content derived from code state (skills, graphs, schema features), not git commits. Caveman style — one line per change, latest state wins.

## [Unreleased]

### Added

- Two-scope channels context model — global `context:` + per-phase `channels:`, node streams, one judgment-domain formula.
- 9 built-in graphs — e2e-minimal, arch-review, arch-review-loop, adopt-with-docs, graph-generate, doc-update, spec-implement, openspec-apply, openspec-engineer.
- Auto-decision rationale — Run Mode auto approvals persist a one-line recommendation basis.
- graph-generate identity — maker-journey graph name, optional graph description, project-first registry precedence, load-probe validation, runId-scoped outputs.
- Spec-skill loading per affected domain — implementation loads atom-graph-spec / atom-skill-spec / atom-doc-maintenance by domain.
- `.graph-scheduler/docs/` scaffold in setup-atomic-workflow.
- atom-doc-maintenance skill — single maintain() contract, replaces atom-doc-spec + atom-doc-writer.
- Post-archive doc maintenance — openspec graphs run doc-update after archive.

### Changed

- Adopt-stage interview boundary — conventions out, decisions in, explicit close.
- doc-update graph reshape — trigger-first flow.

### Removed

- artifact-workflow + skill-workflow graphs — skill production flows through arch-review-loop changes.
- atom-doc-spec / atom-doc-writer skills — superseded by atom-doc-maintenance.

## [v0.2.0]

The arch-review-loop.

### Added

- Gate phase type — pure rework node with `jumps` conditions.
- Branch routes — phase `route` membership activated via `branchTo`.
- Activation prologue — run mode confirmed per activation (manual default), constraints loaded per round.
- Flow composition — merge-at-load flatten (depth cap 5).
- Approval cards redesign — decision-confirmation with free input + contextual options.
- atom-mcp-contract skill — MCP tool-call contract.

### Changed

- `graph_advance` routing — `branchTo` + `endRun` added, `skip` removed.
- Schema convergence — `reads` / `preText` / `eval` and top-level `when` removed; `join` limited to `any`.

### Removed

- Top-level `when` skip guard — conditions moved to gate `jumps[].when`.

## [v0.1.0]

Initial release.

### Added

- graph-scheduler — DAG execution engine + MCP server (9 tools, stdio), pure-function FSM kernel, libsql persistence.
- `.taskflow.yaml` graph format — main/approval phases, `dependsOn`, `task`, `skill`, `channels`, `join`.
- Approval gates — non-bypassable human decision cards between phases.
- graph-workflow skill system — atom-pilot, atom-phase-handler, atom-kernel, entry + reference skills, setup-atomic-workflow.
- Setup skill — setup-atomic-workflow scaffolds `.graph-scheduler/`, idempotent.
