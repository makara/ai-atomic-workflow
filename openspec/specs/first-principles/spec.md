# first-principles Specification

## Purpose

Built-in skill `first-principles` — the first-principles thinking methodology (assumption audit → law-vs-convention breakdown → atomic decomposition → rebuild from fundamentals), vendored into `packages/graph-workflow/skills/` as a trimmed copy so built-in graphs depend on a repo-owned asset instead of a user-deployed external skill.

## Requirements

### Requirement: first-principles — vendored trimmed skill asset

The `first-principles` skill SHALL exist at `packages/graph-workflow/skills/first-principles/SKILL.md` as a copy of the upstream skill (author ClawFu, MIT), trimmed by whole-section deletion only. Retained content: When to Use, Methodology Foundation, What Claude Does vs What You Decide, What This Skill Does, Instructions (Steps 1–5), Checklists & Templates, Red Flags, Skill Boundaries, Quality Checkpoints. Deleted content (whole sections only): the two worked Examples, Iteration Guide, Learning Curve, References, Related Skills, the marketing metadata block, and the Useful Follow-up Prompts section. The wording of retained content SHALL be unchanged (deletion-only trimming — never rewritten, never rephrased).

#### Scenario: Skill available to graphs

- **WHEN** a built-in graph declares `skill: first-principles`
- **THEN** the skill resolves to the vendored `packages/graph-workflow/skills/first-principles/SKILL.md` and dispatches the four-step methodology

#### Scenario: Deletion-only diff against upstream

- **WHEN** the vendored copy is diffed against the upstream source
- **THEN** the diff SHALL contain only deleted whole sections — no modified lines, no added lines

### Requirement: first-principles — deployment boundary

The vendored copy SHALL NOT modify, move, or depend on user-deployed copies (`~/.agents/skills/`, `~/.claude/skills/`). The upstream deployment copy SHALL remain untouched.

#### Scenario: External copy untouched

- **WHEN** the vendored copy is created or updated
- **THEN** no write occurs outside `packages/`
