---
name: atom-scope-interview
description: Shared scope-confirmation interview for graph entry phases — search conversation, interview() one-question-per-turn, interview() solve mode until complete, uniform scope_complete output contract. Use when dispatching entry scope phases in arch-review, arch-review-loop, openspec-create, plan-generate, doc-update, skill-author, graph-generate, grill-with-docs.
argument-hint: none (entry skill — dispatched by atom-phase-handler)
user-invocable: false
version: 1.2.0
last_updated: '2026-08-03'
---

> **Runtime constraints** — load `atom-kernel` for interview() and question() behavior contracts.

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

<!-- atom-kernel + atom-mcp-contract excluded — platform primitives, always injected via auxiliary-skills constant; not channel-resolved references -->

### Files

- CONTEXT.md

## Flow

1. **Check flow-context plan metadata** — if upstream `plan-parse` provides the target (`skill_create_name` / `skill_delete_name` / `doc_update_files`): use it directly, skip interview, write `scope_complete: true`. **Exemption rationale**: the plan-parse path carries prior user participation — the upstream plan was confirmed by the user during plan-generation; no new scope decision is introduced here. This is the ONLY graph-dispatch exemption from the mandatory-interview rule (step 5) — any other graph dispatch SHALL interview.
2. **Search conversation** for user-provided scope — topic, domain, feature, problem, goal, or specific paths/files.
3. **If scope found** — confirm via interview(): confirm topic (conceptual, not file paths), confirm focus dimensions, confirm output path — MUST be explicitly confirmed by user, NEVER default.
4. **If scope not found** — analyze project: read CONTEXT.md for domain model (graph dispatch: arrives via `./CONTEXT.md` channel — handler-injected), list docs/adr/ for existing decisions. Propose conceptual scope with rationale. Recommend focus dimensions. Interview() to confirm.
5. **Interview rules** — per atom-kernel §interview() behavior contract (one question per turn, recommendation first, fact lookup before asking, zero-question degradation). User scope authoritative — do not add/remove/re-analyze. **Graph dispatch override**: when this skill runs as a graph phase (entry/scope node), zero-question degradation is DISABLED — the interview SHALL ask at least one question() (scope confirmation) regardless of how complete the context appears; `scope_complete: true` SHALL NOT be written without user participation.
6. **Assess completeness** — scope complete when topic, focus, output path all confirmed. If incomplete: continue interview() solve mode — research → think → interview → repeat until `scope_complete: true`.
7. **Write output** — common field `scope_complete: true|false` plus graph-specific fields from task text. Output captured by main agent.

## Output

Common contract: `scope_complete: true|false` plus graph-specific fields from the dispatching phase's task text:

|Graph entry phase|Extra output fields|
|-|-|
|arch-review / arch-review-loop `scope-detect`|`scope`, `focus`, `output`|
|arch-review-loop `loop-entry`|`scope`, `focus`, `output`, `report_input`, `report_path`|
|plan-generate `scope-confirm`|`prd_path`, `ticket_split_needed`, `change_summary`|
|openspec-create `spec-scope`|`input_source`, `change_name`, `affected_domains`, `spec_plan`, `adr_created`, `adr_path?`, `decision_summary`, `decisions`|
|doc-update `doc-scope`|`save_locations`, confirmed scope + impact analysis summary|
|skill-author `scope-confirm`|`save_location`, skill plan summary|
|graph-generate `scope-confirm`|`save_location`, phase topology summary|
|grill-with-docs `grill-scope`|`idea_goal`, `doc_trace_intent`, `output_path`|

Extension point: a graph adds fields by declaring them in its entry phase task text — the skill contract itself stays fixed (interview protocol + `scope_complete`).
