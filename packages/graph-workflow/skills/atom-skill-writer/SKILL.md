---
name: atom-skill-writer
description: 'Entry skill for skill authoring — loads atom-skill-spec, writes or edits SKILL.md. Auto-detects create vs edit mode from scope-confirm output fields. Trigger: skill-write phase in skill-author graph, skill-edit-write phase in skill-author graph.'
user-invocable: false
version: 2.0.0
last_updated: '2026-08-01'
---

> **Runtime constraints** — graph dispatch: atom-skill-spec arrives via `skill:` channel (handler-injected). Standalone use: load `atom-skill-spec` before use.

# Atom-Skill-Writer

Entry skill for skill authoring. Loads atom-skill-spec as reference. Auto-detects mode from scope-confirm output fields — edit mode when output shows `skill_path`, create mode when output shows `save_location` without `skill_path`. Never based on sibling output file existence. Handles both paths — create new SKILL.md or edit existing in-place.

## Context Requirements

### From upstream

- scope-confirm
- skill-select

### Reference skills

- atom-skill-spec

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-handler for skill-write or skill-edit-write phase node. Detect mode from upstream outputs, execute corresponding flow.

## Flow

### Mode Detection

Read upstream scope-confirm output injected by handler. Detect mode by output fields:

|scope-confirm output field|Mode|
|-|-|
|`skill_path` present|**edit** — modify existing SKILL.md|
|`save_location` present, no `skill_path`|**create** — draft new SKILL.md|

Sibling output existence (e.g. skill-select output file) SHALL NOT influence mode detection — it is timing-dependent and unreliable. Output absent → fail with `"Missing upstream outputs — need scope-confirm"`.

---

### Create Mode

#### Step C1: Read Plan

Read scope-confirm output. Extract:

- `name` — skill identifier, kebab-case or atom- prefix
- `description` — trigger phrase list
- `scope` — problem skill solves
- `inputs` — files/types skill consumes
- `outputs` — what skill produces
- `dependencies` — skills loaded by plain name
- `save_location` — filesystem path for SKILL.md

#### Step C2: Draft Frontmatter

Generate YAML frontmatter per atom-skill-spec §Frontmatter Format:

**Mandatory**:

- `name` — from plan
- `description` — from plan, trigger phrases

**Recommended**:

- `version` — `1.0.0`
- `last_updated` — today ISO date

**Invocation**:

- Default model-invoked. Use `disable-model-invocation: true` + `user-invocable: true` only for pure reference skills.

#### Step C3: Draft Body

Generate body per atom-skill-spec §Body Content Rules:

1. **Runtime constraints block** — first content after frontmatter. `>` lines. Declare skill dependencies by plain name.
2. **Body sections** — per `writing-great-skills` information hierarchy. Steps first, reference after.
3. **Entry skill rules** — if graph-callable:
   - `## Context Requirements` — From upstream + Reference skills + Files
   - `## Entry` — `**MUST <verb>**` imperative
4. **Prohibited** — no Core Philosophy, design philosophy, author intent. No self-repetition.

#### Step C4: Validate

Validate against every atom-skill-spec rule class (frontmatter format, Runtime constraints block, body content, language constraints, reference constraints, prohibited content).

#### Step C5: Write

Write SKILL.md to `save_location`. Create parent dirs if needed.

#### Step C6: Output

```
skill_path: <absolute path>
name: <skill name>
description: <skill description>
frontmatter_fields: [name, description, version, last_updated]
body_sections: [Runtime constraints, <section names>]
validation: passed | failed (<failure details>)
```

---

### Edit Mode

#### Step E1: Read Current Skill

Read skill-select output. Extract:

- `skill_path` — filesystem path to existing SKILL.md
- `skill_name` — skill identifier
- `current_frontmatter` — existing frontmatter summary
- `current_sections` — existing body section names

Read actual SKILL.md from `skill_path`. Store original for diff.

#### Step E2: Read Edit Plan

Read edit-scope-confirm output (also from upstream). Extract:

- `frontmatter_changes` — fields to add, update, remove
- `section_changes` — sections to add, update, remove
- `dependency_changes` — skill refs to add/remove
- `trigger_phrase_changes` — description trigger phrase updates

#### Step E3: Perform In-place Edits

Apply changes to original SKILL.md:

**Frontmatter**:

- Add missing mandatory fields if plan requires
- Update existing fields per plan
- **Always refresh `last_updated` to today ISO date** — unconditional, per delta spec (every edit bumps timestamp)
- Remove fields only if plan explicitly specifies
- Preserve unchanged fields exactly

**Body**:

- Add new sections at position specified in plan
- Replace existing section content per plan
- Remove sections only if plan explicitly specifies
- Preserve unchanged sections exactly — whitespace, line breaks, code blocks

**Constraints**:

- Never reorder sections not targeted
- Never reformat code blocks or YAML fences
- Keep original line endings

#### Step E4: Validate Modified Skill

Validate modified SKILL.md against every atom-skill-spec rule class (frontmatter format, Runtime constraints block, body content, language constraints, reference constraints) plus edit-specific integrity: no orphan skill references, section structure intact after edit.

Record each failure: rule, location, detail, suggested fix.

#### Step E5: Write Modified Skill

Write modified content back to `skill_path` — overwrite. Backup original before write.

#### Step E6: Output Diff

Compare original vs modified. Produce diff summary:

```
skill_path: <absolute path>
name: <skill name>
validation: passed | failed (<failure count> issues)
frontmatter_changes: [<changed fields>]
section_changes:
  added: [<added section names>]
  updated: [<updated section names>]
  removed: [<removed section names>]
diff_summary: <plain text before/after summary>
```

## Output

Output contract per mode — see Step C6 (create) / Step E6 (edit) output blocks above. Single source, no duplicate listing.
