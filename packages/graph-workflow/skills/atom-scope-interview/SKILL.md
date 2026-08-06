---
name: atom-scope-interview
description: Shared scope-confirmation interview for graph entry phases — search conversation, interview() one-question-per-turn, interview() solve mode until complete, uniform scope_complete output contract. Use when dispatching entry scope phases in arch-review, arch-review-loop, doc-update, graph-generate, adopt-with-docs.
argument-hint: none (entry skill — dispatched by atom-phase-handler)
user-invocable: false
version: 1.4.0
last_updated: '2026-08-06'
---

> **Runtime constraints** — load `atom-kernel` for interview() and question() behavior contracts.

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-handler for a graph entry scope phase, conduct the scope confirmation interview and return the confirmed scope with `scope_complete` field.

## Input

|Field|Type|Required|Purpose|
|-|-|-|-|
|graph-specific topics|task text|yes|Question topics for this graph's scope — domain, change type, output fields|
|graph-specific output fields|task text|yes|Fields to write beyond the common `scope_complete` contract|

## Context Requirements

### From upstream

<!-- none — entry scope phases receive scope via graph task text + handler-injected channels -->

### Reference skills

<!-- atom-kernel + atom-mcp-contract excluded — platform primitives, always injected via auxiliary-skills constant; not channel-resolved references -->

### Files

- CONTEXT.md

## Flow

1. **Search conversation** for user-provided scope — topic, domain, feature, problem, goal, or specific paths/files.
2. **If scope found** — confirm via interview(): confirm topic (conceptual, not file paths), confirm focus dimensions; confirm output path ONLY when the graph's task text declares a user-owned output field (e.g. arch-review `report_path` — the report is a deliverable the user owns). Convention outputs (byproduct records with a dated default) are NOT interview topics — the executing skill derives them; never ask.
3. **If scope not found** — analyze project: read CONTEXT.md for domain model (graph dispatch: arrives via `./CONTEXT.md` channel — handler-injected), list docs/adr/ for existing decisions. Propose conceptual scope with rationale. Recommend focus dimensions. Interview() to confirm.
4. **Interview rules** — per atom-kernel §interview() behavior contract (one question per turn, recommendation first, fact lookup before asking, zero-question degradation). User scope authoritative — do not add/remove/re-analyze. **Graph dispatch override**: when this skill runs as a graph phase (entry/scope node), zero-question degradation is DISABLED — the interview SHALL ask at least one question() (scope confirmation) regardless of how complete the context appears; `scope_complete: true` SHALL NOT be written without user participation.
5. **Assess completeness** — scope complete when topic, focus, and (when graph-declared) output path all confirmed. If incomplete: continue interview() solve mode — research → think → interview → repeat until `scope_complete: true`.
6. **Maker-journey dual-name check** — when the graph produces artifacts and the entry confirms a produced artifact name (e.g. `graph_name` in graph-generate), the produced name SHALL differ from the executed graph's name (known from the dispatch context). Equal names = self-production shadowing accident (the agent producing the very graph it is running) — report a warning and re-ask; never accept silently.
7. **Write output** — common field `scope_complete: true|false` plus graph-specific fields from task text. Output captured by main agent.

## Output

Common contract: `scope_complete: true|false` plus graph-specific fields from the dispatching phase's task text:

|Graph entry phase|Extra output fields|
|-|-|
|arch-review / arch-review-loop `scope-detect`|`scope`, `focus`, `output`|
|arch-review-loop `loop-entry`|`scope`, `focus`, `output`, `report_input`, `report_path`|
|doc-update `doc-scope`|`save_locations`, confirmed scope + impact analysis summary|
|graph-generate `entry`|`graph_name`, `scope`, `save_location`, `scope_complete`|
|adopt-with-docs `adopt-scope`|`idea_goal`, `doc_trace_intent`, `input_document` (path \| none)`|

Extension point: a graph adds fields by declaring them in its entry phase task text — the skill contract itself stays fixed (interview protocol + `scope_complete`).
