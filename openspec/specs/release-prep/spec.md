# release-prep Specification

## Purpose

Pre-release preparation graph: deterministic version proposal from git tag history, grilling confirmation of every planned operation, idempotent overwrite writes, release boundary at a release-ready working tree (tag/commit executed manually by the user).

## Requirements

### Requirement: Version proposal derives from git tags

The release-prep graph SHALL propose the next version from git tag history (the latest release tag) and the actual diff since that tag — never from package.json values. The proposal SHALL be deterministic: identical git state yields an identical proposal (idempotent before tagging). The graph SHALL NOT execute `git tag`, `git commit`, or `git push`.

#### Scenario: Proposal from tags not package.json

- **WHEN** release-prep proposes a version and package.json versions differ from the latest tag
- **THEN** the proposal SHALL derive from the latest git tag and the diff since it, not package.json
- **AND** re-running before any tag SHALL produce the identical proposal

#### Scenario: No git writes

- **WHEN** release-prep runs to completion
- **THEN** no git tag/commit/push SHALL be executed
- **AND** the final report SHALL print the tag (and commit) commands for the user to execute manually

### Requirement: Confirmation covers all operations

Before any write, release-prep SHALL confirm every planned operation with the user via grilling (exploration conversation — never auto-gated, never zero-question; graph dispatch encapsulation contract: mandatory question rounds, whole frontier per round, output `decisions` + `shared_understanding`): version value, version bump surfaces, changelog scope, README targets, and the release boundary.

#### Scenario: Grill before writes

- **WHEN** release-prep reaches the confirmation phase
- **THEN** no file SHALL be modified before the user confirms all planned operations
- **AND** the confirmation SHALL appear as cards, never auto-gated (the "in any run mode" wording is removed — run mode is deleted, ADR 0215)

#### Scenario: Grilling round never skipped

- **WHEN** plan-grill dispatches with full context coverage
- **THEN** at least one question round SHALL be presented — zero-question degradation never applies to grilling

### Requirement: Version bump overwrites release-line surfaces

Version bump SHALL overwrite the version field of release-line surfaces: root package.json, workspace package package.json files, and marketplace manifests (e.g. `.claude-plugin/marketplace.json`). `presentation/package.json` SHALL NOT be bumped (private placeholder outside the release line). Writes SHALL be overwrite-style and formatting-preserving; re-running with the same confirmed version SHALL produce identical files.

#### Scenario: All release-line surfaces match

- **WHEN** the version bump completes
- **THEN** every release-line surface version SHALL equal the confirmed version
- **AND** presentation/package.json SHALL retain its own version

#### Scenario: Bump re-run is idempotent

- **WHEN** the version bump runs twice with the same confirmed version
- **THEN** the second run SHALL leave every surface identical to the first run's result

### Requirement: CHANGELOG derives from actual changes

The CHANGELOG SHALL be derived from the actual file-state diff between the last tag and HEAD (not commit messages): new/deleted/modified areas classified into Added/Changed/Removed. Format per the changelog spec: one simple sentence per item, latest state wins, caveman, `[Unreleased]` folds into the `[v<proposed>]` block, zh mirror isomorphic.

#### Scenario: Fold on release

- **WHEN** the CHANGELOG write completes
- **THEN** the top section SHALL be `[v<proposed>]` (folded from `[Unreleased]`)
- **AND** CHANGELOG.md and docs/CHANGELOG.zh-CN.md SHALL carry the same version structure and fact set

#### Scenario: Entries from diff state

- **WHEN** changelog entries are enumerated
- **THEN** each entry SHALL trace to an actual file addition, deletion, or modification since the last tag
- **AND** no entry SHALL be derived from commit message text alone

### Requirement: README lists checked against ground truth

README feature/module lists SHALL be checked against ground truth: graph registry names, skills directory listing, proposed version, guides directory. Drift SHALL be fixed (graph tables, version literals, missing index entries).

#### Scenario: Lists match ground truth

- **WHEN** the README check completes
- **THEN** every listed graph/skill SHALL exist in ground truth and every ground-truth graph/skill SHALL be listed where the README enumerates the family
- **AND** version literals in READMEs SHALL match the proposed version

### Requirement: release-review SHALL offer direct end

The `release-review` confirmation node SHALL offer the direct-end option on its final card. When the user decides to stop the release round (nothing further to apply or review), choosing 「无内容可采纳（推荐）」 or 「结束本轮（direct end）」 SHALL end the run directly (`direct_end: true` → `graph_force_end`) — the final report still prints the tag/commit commands, but the run terminates instead of draining.

#### Scenario: Release round ends directly

- **WHEN** the user confirms at `release-review` that the round should end
- **THEN** the final card SHALL present 「结束本轮（direct end）」
- **AND** choosing it SHALL terminate the run via `graph_force_end`; the final report SHALL still print the user-executed tag/commit commands

#### Scenario: Release confirmed — continue

- **WHEN** the user confirms the release at `release-review`
- **THEN** the run SHALL continue to completion as today — unchanged
