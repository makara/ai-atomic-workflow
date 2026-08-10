---
name: release-prep-apply
description: Pre-release writes - apply the confirmed release plan with overwrite-style writes - version bump on release-line surfaces, CHANGELOG fold per spec, README list sync vs ground truth. Idempotent + per-domain verification. Use when dispatching the release-prep apply phase.
argument-hint: none (entry skill - dispatched by atom-phase-handler)
disable-model-invocation: true
user-invocable: false
version: 1.0.0
last_updated: '2026-08-09'
---

> **Runtime constraints** - load `atom-kernel` for High-Level Tool Registry (operation classes).

Pre-release writes - confirmed plan in, verified release-ready working tree out. Three write domains, each verified.

## Context Requirements

### From upstream

- plan-grill

### Reference skills

<!-- none -->

### Operation classes

- locate
- write
- verify

### Files

<!-- none - project files are located + verified via operation classes, never channel-delivered -->

## Entry

**MUST EXECUTE** - when dispatched as the release-prep `apply` phase, apply the confirmed plan (node:plan-grill output) with overwrite-style writes and per-domain verification.

## Flow

1. **Version bump** - release-line surfaces: root package.json + workspace member package.json files (yarn workspace discovery - never hard-coded enumeration) + marketplace manifests (family glob, e.g. `.claude-plugin/marketplace.json`). `presentation/package.json` excluded by rule (private placeholder, not a workspace member - rule-based, never an exception list). Overwrite version field via regex `"version":\s*"<old>"` -> `"version": "<confirmed>"` - formatting-preserving, never JSON.stringify reflow. Verify: re-read every surface, version == confirmed.
2. **CHANGELOG fold** - fold `[Unreleased]` into `[v<confirmed>]` block at top (retain header + intro line). Entries from the confirmed changelog inventory (node:plan-grill echo of analyze output) - sentence style: producer home release-prep-analyze §Flow 5; apply consumes the inventory verbatim. `docs/CHANGELOG.zh-CN.md` mirror (project convention-layer surface) carries identical version structure + fact set (translated). Verify: top section == `[v<confirmed>]`, mirror isomorphic.
3. **README sync** - ground truth: registry.json graph names (`packages/graph-scheduler/graphs/registry.json`), skills dir listing, confirmed version, `guides/` directory listing (when present). Check every README list section (graphs table, skills table, version literals, guides index). Fix drift only - never restructure. Verify: every listed item exists in ground truth, every ground-truth item listed (where the README enumerates the family), version literals == confirmed.
4. **Boundary** - NEVER execute `git tag`, `git commit`, `git push`. Writes are overwrite-style; re-running with the same confirmed plan produces identical files (idempotent).

Output JSON:

```
{surfaces_updated, changelog_written, readmes_updated, verify}
```

verify = per-domain check results (surfaces_match, changelog_folded, mirror_isomorphic, readme_synced).

## Completion

All three write domains applied and verified; verify table emitted with per-domain pass/fail.
