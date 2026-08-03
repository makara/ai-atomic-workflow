---
name: atom-scope-interview
description: Shared scope-confirmation interview for graph entry phases — search conversation, interview() one-question-per-turn, interview() solve mode until complete, uniform scope_complete output contract, standard auto-approve mode topic with echo inheritance. Use when dispatching entry scope phases in arch-review, arch-review-loop, openspec-create, plan-generate, doc-update, skill-author, graph-generate, grill-with-docs.
argument-hint: none (entry skill — dispatched by atom-phase-handler)
user-invocable: false
version: 1.1.0
last_updated: '2026-08-03'
---

> **Runtime constraints** — load `skill://atom-kernel` for interview() and question() behavior contracts.

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-handler for a graph entry scope phase, conduct the scope confirmation interview and return the confirmed scope with `scope_complete` field. When the task text declares the standard auto-approve mode topic, handle it after scope confirmation per §Auto-Approve Mode Topic (echo inheritance — never re-ask a decided mode, never auto-decide the mode itself).

## Input

|Field|Type|Required|Purpose|
|-|-|-|-|
|`plan-parse` output|upstream|no|Flow-context plan metadata (`skill_create_name`, `skill_delete_name`, `doc_update_files`) — when present, use directly and skip interview. Optional — absent in standalone invocation|
|`snapshot`|dispatch|no|Run snapshot — carries per-node states; scan scope for the mode-topic echo rule. Present since Run Mode (graph_start returns it)|
|graph-specific topics|task text|yes|Question topics for this graph's scope — domain, change type, output fields; may include the standard auto-approve mode topic|
|graph-specific output fields|task text|yes|Fields to write beyond the common `scope_complete` contract (may include `auto_approve`)|

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
6. **Auto-approve mode topic** — when the task text declares it: handle AFTER scope confirmation per §Auto-Approve Mode Topic.
7. **Assess completeness** — scope complete when topic, focus, output path (and mode topic, when declared) all confirmed. If incomplete: continue interview() solve mode — research → think → interview → repeat until `scope_complete: true`.
8. **Write output** — common field `scope_complete: true|false` plus graph-specific fields from task text. Output captured by main agent.

## Auto-Approve Mode Topic (standard — Run Mode, atom-graph-spec §Run Mode)

The mode topic is declared by the entry graph's task text (standard template — see graph entries). Processing rules, in order:

1. **Echo scan first** — scan the current run's completed node outputs: from `snapshot.nodes`, enumerate nodes where `status === 'done'`; read `.taskflow/outputs/<nodeId>.output.txt` (missing → skip). If any output contains the field `auto_approve`:
   - **Echo — do NOT ask.** The mode is already decided (nested composition — the parent graph's entry chose it; the choice propagates through the run, not through channels).
   - Write the inherited value into this entry's output: `auto_approve: <inherited value>` (note `inherited` in the decision summary). Any nesting depth — the run-level scan is the propagation mechanism.
2. **Ask** — no `auto_approve` field found (standalone run — zero completed outputs, or no prior entry): ask AFTER scope confirmation, one question:
   - **Manual (recommended, default)** — every approval in this run presents a decision card.
   - **Auto** — every approval in this run (except this entry confirmation itself — it is an interview, never auto) executes its recommended routing action (`routingActions[0]`) without a card.
3. **Never auto** — the mode confirmation itself is ALWAYS a manual question (or an echo of a prior manual decision). No auto-skip, no auto-default when the field is absent — absence means Manual cards, not silent Auto.

Scope rule (Run Mode): the mode controls approval presentation ONLY — grill/scope interviews and work nodes are never auto-skipped nor auto-decided. The mode topic never gates the interview itself.

## Output

Common contract: `scope_complete: true|false` plus graph-specific fields from the dispatching phase's task text:

|Graph entry phase|Extra output fields|
|-|-|
|arch-review / arch-review-loop `scope-detect`|`scope`, `focus`, `output`|
|arch-review-loop `loop-entry`|`scope`, `focus`, `output`, `report_input`, `report_path`, `auto_approve`|
|plan-generate `scope-confirm`|`prd_path`, `ticket_split_needed`, `change_summary`|
|openspec-create `spec-scope`|`input_source`, `change_name`, `affected_domains`, `spec_plan`, `adr_created`, `adr_path?`, `decision_summary`, `decisions`|
|doc-update `doc-scope`|`save_locations`, confirmed scope + impact analysis summary|
|skill-author `scope-confirm`|`save_location`, skill plan summary|
|graph-generate `scope-confirm`|`save_location`, phase topology summary|
|grill-with-docs `grill-scope`|`idea_goal`, `doc_trace_intent`, `output_path`|

Extension point: a graph adds fields (incl. `auto_approve`) by declaring them in its entry phase task text — the skill contract itself stays fixed (interview protocol + `scope_complete` + mode topic protocol).
