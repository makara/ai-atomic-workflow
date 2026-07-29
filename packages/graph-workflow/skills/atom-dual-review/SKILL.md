---
name: atom-dual-review
description: Native dual-axis review skill — zero-interaction, single-layer dispatch, structured YAML output. Audits artifact against standards and spec. Trigger: graph-scheduler dispatches atom-phase-agent with entrySkill=atom-dual-review.
user-invocable: false
version: 1.0.0
last_updated: '2026-07-29'
---

> **Runtime constraints** — load `skill://atom-kernel` before use.

# Atom-Dual-Review

Native dual-axis review entry skill. Zero-interaction. Single-layer dispatch — no internal task() spawning. Reads artifact + standards + optional spec from context. Audits artifact against every structured rule in standards. Checks spec consistency if spec provided. Outputs structured YAML report — machine-parseable by approval nodes.

**Design**: headless-safe — all input from handler-assembled context via ADR 0029 Context Requirements. No question(), no user confirmation, no multi-step QA flow.

## Context Requirements

### Files

<configurable — graph node's context field specifies>

### Description

<configurable — natural language describing review target, rules, and spec mapping>

## Input Contract

Handler assembles these from graph node's `context` + `task` fields. Skill reads them from injected context:

|Field|Type|Required|Purpose|
|-|-|-|-|
|`artifact`|path|yes|Reviewed file/output path — e.g. SKILL.md path from skill-write output|
|`standards`|path(s)|yes|Rule set file path(s) — e.g. atom-skill-writer/SKILL.md, CODING-STANDARDS.md|
|`spec`|path|no|Spec/requirement file path — e.g. scope-confirm.output.txt. Skip Spec axis if empty|
|`description`|string|yes|Natural language — review target, extra rules, user-specified constraints|

## Flow

Linear 6-step. No interaction. No internal task() dispatch.

### Step 1: Read Artifact

Locate artifact path from context. Read full file content.

If path missing or file not found → output critical failure, exit.

### Step 2: Load Standards

Read standards file(s) — single file or file list.

Extract structured audit checklist — each rule = identifier + check item + judgment criteria.

If standards empty or unreadable → output critical failure, exit.

### Step 3: Load Spec (conditional)

If spec path provided → read spec file, extract requirement list — key-value or structured items.

If spec not provided → skip this step, Spec axis report empty.

### Step 4: Standards Audit

Check artifact against each extracted rule:

- **pass** — rule satisfied
- **violation** — rule broken, blocking
- **warning** — partial satisfaction, non-blocking

Record each finding: rule identifier, severity, detail description, suggested fix.

### Step 5: Spec Consistency Audit

Compare artifact against each extracted requirement:

- **pass** — requirement implemented consistently
- **violation** — requirement unimplemented or conflicting
- **not_applicable** — requirement does not apply to this artifact

Record each finding: requirement description, status, consistency assessment.

Skip if no spec provided.

### Step 6: Output Report

Assemble structured YAML report:

- `overall: pass` ←→ both axes have 0 violations
- Write to `.taskflow/outputs/<nodeId>.output.txt`

## Output

```yaml
artifact: <path to reviewed file>
standards_axis:
  total_checks: <N>
  pass: <N>
  violations: <N>
  warnings: <N>
  findings:
    - rule: <rule identifier>
      severity: violation | warning
      detail: <finding description>
      fix: <suggested fix>
spec_axis:
  total_checks: <N>
  pass: <N>
  violations: <N>
  findings:
    - requirement: <requirement description>
      status: pass | violation | not_applicable
      detail: <consistency assessment>
overall: pass | fail
```

## Decision Request

Return structured summary to calling handler:

|Field|Type|Purpose|
|-|-|-|
|`artifact`|string|Reviewed file path|
|`standards_axis.total_checks`|number|Total standards rules checked|
|`standards_axis.violations`|number|Blocking violations count|
|`spec_axis.total_checks`|number|Total spec requirements checked|
|`spec_axis.violations`|number|Spec consistency violations count|
|`overall`|string|pass \| fail — machine-parseable one-line verdict|
