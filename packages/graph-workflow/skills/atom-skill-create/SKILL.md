---
name: atom-skill-create
description: Entry skill for skill authoring — loads atom-skill-writer, reads plan, drafts SKILL.md. Trigger: skill-write phase in skill-create graph.
user-invocable: false
version: 1.0.0
last_updated: '2026-07-28'
---

> **Runtime constraints** — load `skill://atom-skill-writer` before use.

# Atom-Skill-Create

Entry skill for skill authoring. Loads atom-skill-writer as reference. Reads plan from upstream phase outputs. Drafts complete SKILL.md per atom-skill-writer rules. Writes to target path.

## Context Requirements

### Files

- .taskflow/outputs/scope-confirm.output.txt
- .taskflow/outputs/plan-confirm.output.txt
- .taskflow/outputs/ddd-update.output.txt

### Description

Read plan from scope-confirm + plan-confirm outputs — scope, requirements, structure, save location. Read DDD changes from ddd-update output if file exists. Draft SKILL.md per atom-skill-writer rules: frontmatter (mandatory name + description, recommended version + last_updated), Runtime constraints block (load dependencies with `>` prefix, `**Runtime constraints**` header), Context Requirements section if skill is graph-callable entry skill, caveman full level, pure English. Write completed SKILL.md to path specified in plan. Output path + summary to `.taskflow/outputs/skill-write.output.txt`.

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-agent handler for skill-write phase node.

## Flow

### Step 1: Read Plan

Read upstream outputs:

- `.taskflow/outputs/scope-confirm.output.txt` — confirmed scope, DDD needs, save location
- `.taskflow/outputs/plan-confirm.output.txt` — confirmed complete plan (skill structure, references, trigger phrases)
- `.taskflow/outputs/ddd-update.output.txt` — DDD document changes (if file exists)

Extract from plan:

- `name` — skill identifier, no spaces, kebab-case or atom- prefix
- `description` — trigger phrase list, branches that invoke skill
- `scope` — what problem skill solves
- `inputs` — what files/types skill consumes
- `outputs` — what skill produces
- `dependencies` — skills loaded via `skill://` protocol
- `save_location` — filesystem path for SKILL.md

### Step 2: Draft Frontmatter

Generate YAML frontmatter per atom-skill-writer §Frontmatter Format:

**Mandatory**:

- `name` — from plan
- `description` — from plan, trigger phrases

**Recommended**:

- `version` — `1.0.0`
- `last_updated` — today's date in ISO format

**Invocation**:

- Default model-invoked (omit `disable-model-invocation`). Use `disable-model-invocation: true` + `user-invocable: true` only if skill is pure reference (not execution-triggered).

### Step 3: Draft Body

Generate body per atom-skill-writer §Body Content Rules:

1. **Runtime constraints block** — first content after frontmatter. Lines prefixed with `>`. Declare skill dependencies via `skill://`.

2. **Body sections** — per `writing-great-skills` information hierarchy. Organize: steps first, reference after. Push reference behind context pointers when only some branches reach it.

3. **Entry skill rules** — if skill is graph-callable:
   - `## Context Requirements` section — Files (deterministic globs) + Description (LLM-driven)
   - `## Entry` section — `**MUST EXECUTE**` with imperative action

4. **Prohibited** — no Core Philosophy, design philosophy, author intent. No self-repetition.

### Step 4: Validate

Check against atom-skill-writer rules before writing:

- [ ] Frontmatter has `name` + `description`
- [ ] Runtime constraints block starts with `> **Runtime constraints** —`
- [ ] Body uses caveman full level (drop articles, filler, hedging)
- [ ] Body is pure English
- [ ] No external references (docs/, URLs) — sibling files + `skill://` only
- [ ] No "why" narrative (Core Philosophy, background stories)
- [ ] No self-repetition (checklists duplicating body content)

### Step 5: Write

Write generated SKILL.md to path from plan's `save_location`. Create parent directories if needed.

### Step 6: Output

Write result to `.taskflow/outputs/skill-write.output.txt`:

```
skill_path: <absolute path to written SKILL.md>
name: <skill name>
description: <skill description>
frontmatter_fields: [name, description, version, last_updated]
body_sections: [Runtime constraints, <section names>]
validation: passed | failed (<failure details>)
```

## Output

```
skill_path: <path>
name: <name>
frontmatter_fields: <list>
body_sections: <list>
validation: passed | failed
```
