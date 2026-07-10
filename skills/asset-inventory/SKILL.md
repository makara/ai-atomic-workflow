---
name: asset-inventory
description: Execute asset inventory step — systematically enumerate existing assets (code modules, docs, tools, standards, etc.), produce gap analysis against target requirements.
argument-hint: "[scope] [target description]"
user-invocable: true
disable-model-invocation: false
version: "2.2.0"
last_updated: "2026-07-09"
---

# Asset Inventory

> **Role**: Own pure-analysis step — systematically enumerate existing assets (code modules, docs, tools, standards, etc.) and produce gap analysis against target requirements.
> **This file is the step type definition**.

## Use Cases

- Understand the full asset landscape when starting a new project
- Inventory current module, doc, tool, and standard states before architecture refactoring
- Assess existing compatibility before introducing new tech stacks or toolchains
- Any scenario requiring "current state vs target" gap analysis

## Responsibility Boundary

**Do**:
- Systematically list existing assets (grouped by category)
- Evaluate coverage and gaps of each asset category against target requirements
- Produce traceable gap checklist (with priority grading)

**Don't**:
- Don't propose specific design solutions — that's the solution design step's responsibility
- Don't modify any files — asset inventory is a pure analysis step

## Behavior Guide

1. [F2] Clarify inventory scope and goals — confirm which asset categories the user wants inventoried and against what target
2. [F1] If scope or target is ambiguous, raise decision requests to the user
3. Traverse project directory structure — use `glob` and `read` tools to collect file and directory information
4. Group and organize assets by category — code modules, docs, tool scripts, standards files, configs, etc.
5. Evaluate gaps against target for each item — annotate each with priority (P0/P1/P2/P3)
6. Produce inventory report and write to disk (default `plans/asset-inventory-report.md`):
   - Asset list (current state description)
   - Gap analysis table (with priority and impact scope)
   - Recommendations (next steps sorted by priority)
7. [F4] Output ready: inventory report file path. Acceptance checklist.

## Deliverables

1. Inventory report file (written to agreed path)
2. Asset list (current state description by category)
3. Gap analysis (with P0–P3 priorities)
4. Follow-up recommendations — suggested next step types

## Completion Criteria

- [ ] Inventory report has been written to disk
- [ ] Asset list covers all declared categories
- [ ] Each gap includes priority and impact description
- [ ] Report includes follow-up recommendations

## Constraints

- Pure analysis step — do not modify any project business files
- Output language: determined by `lang.conversation` parameter — default `zh` (Chinese) unless overridden by project standards or orchestrate invocation
- No git operations
