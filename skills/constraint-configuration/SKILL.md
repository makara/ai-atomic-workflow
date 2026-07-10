---
name: constraint-configuration
description: Own tool skill — add or modify configuration entries at the specified constraint layer (project-instruction / project-standards / global).
argument-hint: "[constraint layer] [entry description]"
user-invocable: true
disable-model-invocation: false
version: "2.2.0"
last_updated: "2026-07-09"
---

# Constraint Configuration

> **Role**: Own tool skill — alongside asset-inventory and finalize, responsible for independent management of constraint configurations.
> **Usage**: Loaded directly by the user, specifying the constraint layer parameter and configuration entries.

## Use Cases

- Add behavior constraints at the project-instruction layer
- Update coding standards at the project-standards layer
- Configure cross-project shared rules at the global layer
- Modify existing constraint entries and sync affected docs

## Three-Layer Constraint Model

| Constraint Layer | Typical Target | Impact Scope | Operational Characteristics |
|------------------|----------------|--------------|----------------------------|
| **global** | Global layer config files | Cross-project, cross-session enforcement | High impact; high rollback cost; recommend dry-run preview |
| **project-instruction** | Project instruction layer files (e.g. AGENTS.md) | Per-project AI behavior constraints | Medium impact; verify readability and completeness |
| **project-standards** | Project standards layer files (e.g. standards/common/CODING-STANDARDS.md) | Per-project code quality standards | Decoupled from instruction layer, independently maintained |

## Behavior Guide

1. Confirm constraint layer ownership — identify which layer the target belongs to
2. Operate per-layer — different layers have different modification approaches and file paths; do not mix
3. Check for conflicts after modification — whether new constraints conflict with existing ones at the same or higher layer
4. Output language: determined by `lang.conversation` parameter — default `zh` (Chinese) unless overridden by project standards or orchestrate invocation

## Completion Criteria

- [ ] Constraints written to correct layer's target file
- [ ] New constraints do not conflict with existing ones
- [ ] Affected docs synced (if applicable)

## Constraints

- Output language: determined by `lang.conversation` parameter
- No git operations
- No cross-layer mixing — each operation targets only one constraint layer
