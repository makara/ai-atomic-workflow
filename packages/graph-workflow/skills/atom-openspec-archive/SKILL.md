---
name: atom-openspec-archive
description: 'Archive completed OpenSpec change via openspec archive CLI. Step 0 reverse-validates task completion against code evidence before archive. Use as graph phase in arch-review-loop / spec-implement post-approval. Trigger: archive change, finalize openspec, archive completed change.'
version: 1.2.1
last_updated: '2026-08-01'
---

> **Runtime constraints** — requires openspec CLI installed. Load atom-kernel before use.

# Atom-OpenSpec-Archive

Archive completed OpenSpec change. Thin wrapper around openspec archive CLI. Designed as graph phase skill — dispatched by arch-review-loop / spec-implement post change-accept approval.

Non-interactive. Uses --yes --json flags. No filesystem path assumptions — CLI resolves openspec root internally.

## Context Requirements

### From upstream

- change-accept
- apply-change

## Entry

**MUST EXECUTE** — when dispatched by atom-phase-handler for archive phase node.

## Flow

### Step 0: Reverse-Validation Gate

Verify task completion against code evidence before archive. Code = ground truth. Tickets not involved.

1. **Resolve change name** (NEVER ask user): read upstream `apply-change` output (injected via `node:apply-change` channel) — use its `change_name` field. Else run `openspec list --json`, filter entries where `status` field equals `"complete"`. Single entry, use its name. Multiple or zero: output `archive_status: blocked` with the candidate/empty list — do not archive, do not ask.

2. **Read CLI state**: run `openspec instructions apply --change <name> --json`. Parse `progress{total,complete,remaining}` + `tasks[{id,description,done}]` + `contextFiles` (implementation-relevant file paths). Exit code non-zero: report unexpected error, stop.

3. **Per-task verification** (checked + unchecked). Evidence cache: `openspec/changes/<change>/verification.md` — create file if absent.

|Task state|Code evidence|Action|
|-|-|-|
|checked|cached in verification.md|pass — skip re-grep|
|checked|none cached|grep code by token. hit → register evidence / miss → drift|
|unchecked|grep hit|check off `- [ ]` → `- [x]` (progress marking) + register evidence|
|unchecked|no hit|keep unchecked + register unverified|

- **Token extraction**: pull backtick-wrapped identifiers from task description (`plan-scope`, `prd_path`), then kebab/snake-case names, then behavior verbs paired with artifact names. Example: "eval condition prd_path" yields tokens `prd_path`, `eval`. Grep scope: `contextFiles` + `packages/graph-scheduler/graphs/*.taskflow.yaml` + `packages/graph-workflow/skills/*/SKILL.md` + `packages/**/*.test.ts`.
- **Evidence form by task type** (from delta spec):

|Task type|Evidence form|Search target|
|-|-|-|
|graph definition|YAML phase/eval/when/channels hit + line|`packages/graph-scheduler/graphs/*.taskflow.yaml`|
|skill change|SKILL.md section + version|`packages/graph-workflow/skills/*/SKILL.md`|
|doc task|file exists + content grep|doc paths in task description|
|test task|test file + assertion name|`packages/**/*.test.ts`|
|schema/CLI contract|type definition / command output hit|`packages/*/src/**` + `openspec instructions apply --json` live output|

- **Fallback** (no token in description): read delta specs `specs/**/*.md`, extract noun phrases from SHALL behavior sentences (phase ids, field names, e.g. `prd_path`, `scope_complete`), grep those. Still vague, mark drift "task unverifiable — rewrite description or add spec". Never guess, never check off.
- **Skip class**: pure doc/verification tasks ("YAML parses correctly", "grep confirms zero matches"). Verify assertion itself: parse file with available tooling, grep for expected zero hits, confirm file exists. No code search.

4. **Register evidence**: append one line per verified task to `openspec/changes/<change>/verification.md`. Line unique per task id — skip if task id already registered (idempotent re-runs, no duplicates).

```
- task <id> — evidence: <file>:<line> — <grep|symbol|version|assert>: "<detail>"
```

Unverified task line:

```
- task <id> — unverified: <reason>
```

tasks.md checkbox = progress ledger — agent-writable. Task descriptions untouched — CLI owns description text.

5. **Drift gate**: any checked task without evidence (non-skip): write drift report:

```
## Reverse-Validation Drift (<change>)
- task <id> (<description summary>) — <missing evidence type>
```

Refuse `openspec archive`. No implementation file changes. Evidence-backed progress marks retained. Output rework suggestion.

6. **All pass**: output validation summary (verified count, drift count 0, evidence file path), proceed Step 1.

### Step 1: Execute Archive

Run `openspec archive <change-name> --yes --json`. Capture stdout (JSON), stderr, exit code.

--yes skips all confirmation prompts. --json gives structured machine-readable output.

### Step 2: Parse Result

JSON output: extract status, message, affected files. Exit code non-zero with no valid JSON: report as unexpected error.

### Step 3: Output

Write structured result:

```
archive_status: success | failed | blocked
change_name: <name>
message: <summary from JSON or stderr>
```

`blocked` — change name unresolvable (no apply-change metadata, no flow param, and `openspec list` shows multiple or zero complete changes). No archive executed, no question asked.
