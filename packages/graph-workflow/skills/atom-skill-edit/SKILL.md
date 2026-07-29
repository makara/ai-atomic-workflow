---
name: atom-skill-edit
description: Entry skill for in-place skill editing — loads atom-skill-writer, reads current skill + diff plan, performs in-place edits, validates. Trigger: skill-edit-write phase in skill-edit graph.
user-invocable: false
version: 1.0.0
last_updated: '2026-07-29'
---

> **Runtime constraints** — load `skill://atom-skill-writer` before use.

# Atom-Skill-Edit

Entry skill for in-place skill editing. Loads atom-skill-writer as reference. Reads current SKILL.md + diff plan from upstream phase outputs. Performs in-place edits per plan. Validates modified result against atom-skill-writer rules. Writes back to same path. Outputs before/after diff.

## Context Requirements

### Files

- .taskflow/outputs/skill-select.output.txt
- .taskflow/outputs/edit-scope-confirm.output.txt
- .taskflow/outputs/plan-confirm.output.txt
- .taskflow/outputs/ddd-update.output.txt

### Description

Read current skill state from skill-select output — skill_path, skill_name, current_frontmatter, current_sections. Read edit scope from edit-scope-confirm output — plan_complete, ddd_needed, changes, dependencies, trigger_phrases. When plan was complete at scope-confirm stage, this serves as primary plan (edit-analysis and plan-confirm both skipped). Read edit plan from plan-confirm output if file exists — what to change (frontmatter fields, body sections to add/update/remove). Read DDD changes from ddd-update output if file exists. Perform in-place edits per available plan. Validate modified SKILL.md against every atom-skill-writer rule: frontmatter mandatory fields (name + description), Runtime constraints block, caveman full level, pure English, no external references, no "why" narrative, no self-repetition. Overwrite original file. Output before/after diff with changed sections, added lines, removed lines.

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-agent handler for skill-edit-write phase node.

## Flow

### Step 1: Read Current Skill

Read skill-select output from `.taskflow/outputs/skill-select.output.txt`. Extract:

- `skill_path` — filesystem path to existing SKILL.md
- `skill_name` — skill identifier from frontmatter
- `current_frontmatter` — summary of existing frontmatter fields
- `current_sections` — list of existing body section names

Read actual SKILL.md from `skill_path`. Store full original content for diff later.

### Step 2: Read Edit Plan

Read plan-confirm output from `.taskflow/outputs/plan-confirm.output.txt`. Extract:

- `frontmatter_changes` — fields to add, update, or remove in YAML frontmatter
- `section_changes` — sections to add, update (replace), or remove from body
- `dependency_changes` — skill:// references to add or remove
- `trigger_phrase_changes` — description trigger phrases to update

Read ddd-update output from `.taskflow/outputs/ddd-update.output.txt` if file exists. Note domain concept changes that may affect skill content.

### Step 3: Perform In-place Edits

Apply changes to original SKILL.md:

**Frontmatter**:

- Add missing mandatory fields (name, description) if plan requires
- Update existing fields per plan
- Remove fields only if plan explicitly specifies removal
- Preserve all unchanged frontmatter fields exactly as-is

**Body**:

- Add new sections at position specified in plan
- Replace existing section content with new content per plan
- Remove sections only if plan explicitly specifies removal
- Preserve all unchanged sections exactly as-is — whitespace, line breaks, code blocks

**Constraints during edit**:

- Never reorder sections not targeted by plan
- Never reformat code blocks or YAML fences
- Keep original line endings

### Step 4: Validate Modified Skill

Load atom-skill-writer rules. Check modified SKILL.md against every rule:

- [ ] Frontmatter has `name` + `description` (mandatory)
- [ ] Frontmatter has `version` + `last_updated` (recommended — warn if missing)
- [ ] Runtime constraints block present — starts with `> **Runtime constraints** —`
- [ ] Body uses caveman full level (no articles, filler, hedging)
- [ ] Body is pure English
- [ ] No external references (docs/, URLs) — sibling files + `skill://` only
- [ ] No "why" narrative (Core Philosophy, background stories)
- [ ] No self-repetition (checklists duplicating body content)
- [ ] No orphan references — all skill:// dependencies declared in plan are present
- [ ] Section structure integrity — headings, code blocks, tables parse correctly after edit

Record each failure: rule, location, detail, suggested fix.

### Step 5: Write Modified Skill

Write modified content back to `skill_path` — overwrite existing file. Create backup to `.taskflow/outputs/skill-edit-write.backup.md` (original content before edit).

### Step 6: Output Diff

Compare original vs modified SKILL.md. Produce diff summary. Write to `.taskflow/outputs/skill-edit-write.output.txt`:

```
skill_path: <absolute path to modified SKILL.md>
name: <skill name>
validation: passed | failed (<failure count> issues)
frontmatter_changes: [<list of changed fields>]
section_changes:
  added: [<list of added section names>]
  updated: [<list of updated section names>]
  removed: [<list of removed section names>]
diff_summary: <plain text before/after summary>
```

## Output

```
skill_path: <path>
name: <name>
validation: passed | failed
frontmatter_changes: <list>
section_changes: { added, updated, removed }
diff_summary: <text>
```
