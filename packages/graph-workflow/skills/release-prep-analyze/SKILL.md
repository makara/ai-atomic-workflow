---
name: release-prep-analyze
description: Pre-release analysis - propose next version from git tag history (never package.json), derive changelog inventory from actual diff. Deterministic, idempotent pre-tag, never executes git tag/commit/push. Use when dispatching the release-prep propose phase.
argument-hint: none (entry skill - dispatched by atom-phase-handler)
disable-model-invocation: true
user-invocable: false
version: 1.0.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load `atom-kernel` for tool schemas (operation classes).

Pre-release analysis - pure read-only function of git state. Version proposal + changelog inventory from one diff scan.

## Context Requirements

### From upstream

<!-- none -->

### Reference skills

<!-- none -->

### Operation classes

- run

### Files

<!-- none -->

## Entry

**MUST EXECUTE** - when dispatched as the release-prep `propose` phase, analyze git state and emit the version proposal + changelog inventory.

## Flow

1. **Last tag** - run `git tag --sort=-version:refname` (rtk). Head of list = last release tag. No tags -> bump `none`, proposed_version empty, explain in basis.
2. **Diff scan** - one scan: `git diff --name-status <last_tag>..HEAD` + `git diff --stat <last_tag>..HEAD`. Group changes by area: derive from changed paths at runtime (package dirs, docs, root config) - never a hard-coded area list.
3. **Semver classification** (evidence-based, adjustable at plan-grill):

|Diff class|Bump|
|-|-|
|breaking changes (schema/contract removals, renamed artifacts)|major|
|new feature areas (new graphs/skills/capabilities)|minor|
|fixes/docs only|patch|
|no changes|none (nothing to release)|

4. **Propose version** - apply bump to last tag (strip `v`, semver increment). tag_proposal = `v<proposed>`.
5. **Changelog inventory** - from diff name-status: added files -> Added candidates, modified -> Changed candidates, deleted -> Removed candidates. One simple sentence per change (caveman), latest-state-wins (no intermediate counts, no deleted graphs/skills, no rollback narratives). Commit messages are NEVER a derivation source - file state only.
6. **Boundary** - NEVER execute `git tag`, `git commit`, `git push` (rule home: release-prep-apply §Flow 4). Analysis idempotency: pure reads only - identical git state -> identical proposal.

Output JSON:

```
{last_tag, diff_summary, bump, proposed_version, tag_proposal, changelog_inventory, basis, idempotent: true}
```

## Completion

Proposal emitted, diff classified, inventory derived. Every changelog item traces to an actual file addition/deletion/modification since the last tag.
