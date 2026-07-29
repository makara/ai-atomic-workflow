---
name: atom-arch-review
description: Non-interactive architecture review — explore scope, output markdown report. Dispatched by arch-review graph phase agent node. Trigger: graph-scheduler dispatches atom-phase-agent with entrySkill=atom-arch-review.
user-invocable: false
version: 1.0.0
last_updated: '2026-07-27'
---

> **Runtime constraints** — load `skill://improve-codebase-architecture` and `skill://codebase-design` before use.

# Atom-Arch-Review

Non-interactive wrapper for improve-codebase-architecture. Receive pre-confirmed scope from scope-detect phase. Execute Explore phase. Output markdown report — no HTML, no grilling loop, no domain-modeling.

## Input

|Field|Type|Required|Purpose|
|-|-|-|-|
|`scope`|string|yes|Scope path or glob — from scope-detect phase output|
|`focus`|string|no|Review dimensions — depth, coupling, testability, naming, duplication|
|`output`|string|yes|Output markdown path — from scope proposal|

## Context Requirements

### Files

- .taskflow/outputs/scope-detect.output.txt
- CONTEXT.md
- docs/adr/

### Description

Confirmed scope from scope-detect phase output. Project domain model from CONTEXT.md. Existing ADRs — avoid re-litigating decided topics. Search conversation for user-specified constraints or focus hints.

## Flow

### Step 1: Load Scope

Read `.taskflow/outputs/scope-detect.output.txt`. Extract scope paths, focus dimensions, output path. Confirm output path writable.

### Step 2: Explore

Per `skill://improve-codebase-architecture` §1 Explore procedure:

- Read CONTEXT.md — absorb domain vocabulary
- Read ADRs in scope area — skip already-decided topics
- Walk scope paths — sub-agent Explore for module structure
- Apply deletion test — identify shallow modules
- Note friction signals:
  - Many-small-modules — overhead without leverage
  - Shallow interfaces — pass-through without value
  - Tight coupling — import graph cycles, bidirectional deps
  - Untested code — no test coverage, no runtime evidence
  - Locality violations — logic scattered across files
  - Naming inconsistency — domain terms misaligned with ubiquitous language

### Step 3: Present as Markdown

For each finding, render card block:

```markdown
## Finding N: <title>

**Files**: <paths> **Problem**: <why friction — architectural root cause> **Solution**: <what changes — specific restructuring> **Benefits**: <locality + leverage + testability improvement> **Strength**: <Strong | Worth exploring | Speculative>
```

End with top-level summary:

```markdown
## Top Recommendation

<strongest candidate — which finding first + rationale>
```

### Step 4: Write Report

Write assembled markdown to output path from scope. Write summary to `.taskflow/outputs/arch-review.output.txt`.

## Output

```markdown
# Architecture Review — <scope>

> Date: <YYYY-MM-DD> Scope: <paths> Focus: <dimensions>

## Findings

## Finding 1: <title>

…

## Finding N: <title>

…

## Top Recommendation

…
```

Report saved to output path. Summary captured at `.taskflow/outputs/arch-review.output.txt`.

## Decision Request

Return structured summary to calling handler:

|Field|Type|Purpose|
|-|-|-|
|`findings`|number|Total findings count|
|`topRecommendation`|string|Highest-impact finding title + one-line rationale|
|`strength`|string|Overall confidence — Strong / Worth exploring / Speculative|
|`outputPath`|string|Where full report saved|
|`summary`|string|One-line verdict — architecture health assessment|
