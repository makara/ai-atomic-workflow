---
name: atom-doc-writer
description: 'Entry skill for document editing — loads atom-doc-spec, modifies markdown documents in-place. Trigger: doc-write phase in skill-change-workflow.'
user-invocable: false
version: 1.0.0
last_updated: '2026-08-01'
---

> **Runtime constraints** — graph dispatch: atom-doc-spec arrives via `skill:` channel (handler-injected). Standalone use: load `atom-doc-spec` before use.

# Atom-Doc-Writer

Entry skill for document editing. Loads atom-doc-spec as reference. Modifies existing markdown documents in-place per change plan from upstream doc-scope output. Single mode — edit only. Delta spec generation delegated to openspec propose CLI.

Symmetric with atom-skill-writer (SKILL.md editing) and atom-graph-writer (YAML generation).

## Context Requirements

### From upstream

- doc-scope

### Reference skills

- atom-doc-spec

## Entry

**MUST EXECUTE** — dispatched by atom-phase-handler for doc-write phase node. Read upstream doc-scope output, execute edit flow.

## Flow

### Edit Mode

Used by doc-write phase in skill-change-workflow. Modifies existing document in-place.

#### Step E1: Read Current Doc

Read doc-scope output. Extract:

- `doc_path` — filesystem path to existing document (from confirmed target files)
- `doc_type` — general | adr | report (from change type)

Read actual document from `doc_path`. Store original for diff. Fail if no doc-scope output present — `"Missing upstream outputs — need doc-scope"`.

#### Step E2: Read Change Plan

From doc-scope output, extract:

- `section_changes` — sections to add (position), update, remove (from expected changes)
- `metadata_changes` — metadata fields to add/update/remove (from expected changes)

#### Step E3: Apply In-place Edits

Apply changes to original document:

**Metadata**:

- Add missing fields if plan requires
- Update existing fields per plan
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

#### Step E4: Validate Modified Doc

Validate modified document against every atom-doc-spec rule class (Metadata Block / Heading Hierarchy / Link Validity / Code Blocks / Document Types). Record each failure: rule, location, detail, suggested fix.

#### Step E5: Write + Diff

Write modified content back to `doc_path` — overwrite.

Produce diff summary:

```
doc_path: <path>
doc_type: <type>
validation: passed | failed (<count> issues)
section_changes:
  added: [<names>]
  updated: [<names>]
  removed: [<names>]
metadata_changes: [<changed fields>]
diff_summary: <plain text before/after>
```

## Output

Output contract per edit mode — see Step E5 diff summary block above. Single source, no duplicate listing.
