---
name: atom-scope-interview
description: Shared scope-confirmation interview for graph entry phases — search conversation, interview() one-question-per-turn, solve() loop until complete, uniform scope_complete output contract. Use when dispatching entry scope phases in arch-review, arch-review-to-spec, plan-generate, openspec-create, doc-update, skill-author, graph-generate.
argument-hint: none (entry skill — dispatched by atom-phase-handler)
user-invocable: false
version: 1.0.0
last_updated: '2026-08-01'
---

> **Runtime constraints** — load `skill://atom-kernel` for interview() and question() behavior contracts.

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-handler for a graph entry scope phase, conduct the scope confirmation interview and return the confirmed scope with `scope_complete` field.

## Input

|Field|Type|Required|Purpose|
|-|-|-|-|
|`plan-parse` output|upstream|no|Flow-context plan metadata (`skill_create_name`, `skill_delete_name`, `doc_update_files`) — when present, use directly and skip interview. Optional — absent in standalone invocation|
|graph-specific topics|task text|yes|Question topics for this graph's scope — domain, change type, output fields|
|graph-specific output fields|task text|yes|Fields to write beyond the common `scope_complete` contract|

## Context Requirements

### From upstream

- plan-parse

### Reference skills

<!-- atom-kernel excluded — platform primitive, always injected via auxiliary-skills constant; not a channel-resolved reference -->

### Files

- CONTEXT.md

## Flow

1. **Check flow-context plan metadata** — if upstream `plan-parse` provides the target (`skill_create_name` / `skill_delete_name` / `doc_update_files`): use it directly, skip interview, write `scope_complete: true`.
2. **Search conversation** for user-provided scope — topic, domain, feature, problem, goal, or specific paths/files.
3. **If scope found** — confirm via interview(): confirm topic (conceptual, not file paths), confirm focus dimensions, confirm output path — MUST be explicitly confirmed by user, NEVER default.
4. **If scope not found** — analyze project: read CONTEXT.md for domain model (graph dispatch: arrives via `./CONTEXT.md` channel — handler-injected), list docs/adr/ for existing decisions. Propose conceptual scope with rationale. Recommend focus dimensions. Interview() to confirm.
5. **Interview rules** — per atom-kernel §interview() behavior contract (one question per turn, recommendation first, fact lookup before asking, zero-question degradation). User scope authoritative — do not add/remove/re-analyze.
6. **Assess completeness** — scope complete when topic, focus, and output path all confirmed. If incomplete: continue solve() loop — research → think → interview → repeat until `scope_complete: true`.
7. **Write output** — common field `scope_complete: true|false` plus graph-specific fields from task text. Output captured by main agent.

## Output

Common contract: `scope_complete: true|false` plus graph-specific fields from the dispatching phase's task text:

|Graph entry phase|Extra output fields|
|-|-|
|arch-review / arch-review-to-spec `scope-detect`|`scope`, `focus`, `output`|
|plan-generate `scope-confirm`|`prd_path`, `ticket_split_needed`, `change_summary`|
|openspec-create `spec-scope`|`input_source`, `change_name`, `affected_domains`, `spec_plan`|
|doc-update `doc-scope`|`save_locations`, confirmed scope + impact analysis summary|
|skill-author `scope-confirm`|`save_location`, skill plan summary|
|graph-generate `scope-confirm`|`save_location`, phase topology summary|

Extension point: a graph adds fields by declaring them in its entry phase task text — the skill contract itself stays fixed (interview protocol + `scope_complete`).
