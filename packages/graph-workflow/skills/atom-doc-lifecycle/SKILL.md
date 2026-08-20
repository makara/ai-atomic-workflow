---
name: atom-doc-lifecycle
description: 'Entry skill for end-of-workflow lifecycle closure - one close() contract: reverse-validated openspec archive, ADR decision-fold, live index rebuild, lifecycle validation. Use when archiving a completed change, folding ADR records, rebuilding the ADR index, closing a workflow after approval, or running detailed-track post-archive closure.'
argument-hint: none (contract skill - dispatched by graph closure nodes or invoked directly)
disable-model-invocation: true
user-invocable: true
version: 1.0.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - load `atom-kernel` before use. Archive via `openspec archive` CLI. No standalone archive entry point exists.

# Atom-Doc-Lifecycle

End-of-workflow lifecycle closure. One contract `close({ change_name, adr_created?, supersedes? })` -> `{ archive_status, adr_changes, index_rebuilt, validation }`. Estate maintenance (taxonomy, gate, format) lives in atom-doc-maintain. CHANGELOG excluded - per atom-doc-maintain §Document Types (single home).

## Context Requirements

### From upstream

- to-spec
- implement-accept
- spec-propose

(change name + adr_created echo from to-spec/implement-accept (detailed track); spec-propose supplies change name + decisions for standalone invocation.)

### Reference skills

<!-- none -->

### Operation classes

- run
- archive
- read
- write

### Files

- openspec/changes/**/*.md

## Entry

**MUST EXECUTE** - when dispatched by atom-phase-handler for a closure node, run the closure pipeline: reverse-validate -> archive -> fold ADRs -> rebuild index -> validate lifecycle -> report.

## close() Contract

```
close({ change_name, adr_created?, supersedes? }) → { archive_status, adr_changes, index_rebuilt, validation }
```

- `change_name` - change to close (NEVER ask; resolution order below).
- `adr_created` - true -> decision-fold runs in the same pass; absent/false -> fold skipped (no ADR work).
- `supersedes` - declared edges from the change's ADR record (fallback: read the new record's metadata).
- `archive_status` - success | failed | blocked.
- `adr_changes` - folded record ids.
- `index_rebuilt` - boolean.
- `validation` - lifecycle validation findings.

Pipeline: Step 0 reverse-validation -> Step 1 archive -> Step 2 parse result -> Step 3 ADR fold -> Step 4 lifecycle validation -> output report.

## Step 0: Reverse-Validation Gate

Verify task completion against code evidence before archive. Code = ground truth. Tickets not involved.

1. **Resolve change name** (NEVER ask user): read upstream output - use its `change_name` field. Else run `openspec list --json`, filter entries where `status` field equals `"complete"`. Single entry, use its name. Multiple or zero: output `archive_status: blocked` with the candidate/empty list - do not archive, do not ask.

2. **Read CLI state**: run `openspec instructions apply --change <name> --json`. Parse `progress{total,complete,remaining}` + `tasks[{id,description,done}]` + `contextFiles` (implementation-relevant file paths). Exit code non-zero: report unexpected error, stop.

3. **Per-task verification** (checked + unchecked). Evidence cache: `openspec/changes/<change>/verification.md` - create file if absent.

|Task state|Code evidence|Action|
|-|-|-|
|checked|cached in verification.md|pass - skip re-grep|
|checked|none cached|grep code by token. hit -> register evidence / miss -> drift|
|unchecked|grep hit|check off `- [ ]` -> `- [x]` (progress marking) + register evidence|
|unchecked|no hit|keep unchecked + register unverified|

- **Token extraction**: pull backtick-wrapped identifiers from task description, then kebab/snake-case names, then behavior verbs paired with artifact names. Grep scope: `contextFiles` + repo-root-relative paths, including graphs, skills, and test trees.
- **Evidence form by task type**: graph definition -> YAML phase/eval/when/channels hit + line in `packages/graph-scheduler/graphs/*.yaml`; skill change -> SKILL.md section + version in skills tree; doc task -> file exists + content grep; test task -> test file + assertion name in `packages/**/*.test.ts`; schema/CLI contract -> type definition / command output hit.
- **Fallback** (no token in description): read delta specs `specs/**/*.md`, extract noun phrases from SHALL behavior sentences, grep those. Still vague -> mark drift "task unverifiable - rewrite description or add spec". Never guess, never check off.
- **Skip class**: pure doc/verification tasks. Verify assertion itself - parse file, grep zero matches, confirm existence. No code search.

4. **Register evidence**: append one line per verified task to `openspec/changes/<change>/verification.md` (path from upstream `verification_path` field when composed - tasks consume fields, never file globs). Line unique per task id - skip if already registered (idempotent).

```
- task <id> - evidence: <file>:<line> - <grep|symbol|version|assert>: "<detail>"
```

Unverified task line: `- task <id> - unverified: <reason>`.

5. **Drift gate**: any checked task without evidence (non-skip): write drift report under `## Reverse-Validation Drift (<change>)`, refuse `openspec archive`. No implementation file changes. Output rework suggestion.

6. **All pass**: output validation summary (verified count, drift count 0, evidence file path), proceed Step 1.

## Step 1: Execute Archive

Run `openspec archive <change-name> --yes --json`. Capture stdout (JSON), stderr, exit code.

## Step 2: Parse Result

JSON output: extract status, message, affected files. Exit code non-zero with no valid JSON: report unexpected error.

## Record Format

ADR records = lifecycle records: metadata block + fixed body (Context / Decision / Consequences).

|Field|Rule|
|-|-|
|`id`|NNNN - sequential, unique|
|`title`|kebab-case slug|
|`date`|YYYY-MM-DD|
|`status`|one of `proposed` \| `accepted` \| `superseded` \| `deprecated`|
|`domain`|domain id - one decision per record|
|`decision`|one-sentence decision statement|
|`supersedes`|ids of folded predecessors - `none` legal|
|`superseded_by`|set by fold, never authored|
|`related`|related ADR ids|

Rules:

1. One decision per record; status transitions `proposed` -> `accepted` -> `superseded` \| `deprecated`.
2. Root `docs/adr/` holds only live records (proposed + accepted); `docs/adr/archive/` holds superseded/deprecated records moved verbatim - provenance only, never read as current state.
3. Accepted records SHALL be immutable - a revision requires a new record declaring `supersedes`.
4. Language: per project document-language conventions (single home: atom-doc-maintain §Language Constraints).

## Step 3: ADR Decision-Fold

Run when `adr_created: true` (or a new ADR record exists in the change). Fold SHALL follow the decision-fold model:

1. **Resolve new record**: the change's ADR (`docs/adr/<NNNN>-<slug>.md`, newest) - metadata block `supersedes: [ids]`.
2. **Validate-all**: targets exist + accepted + same domain; supersedes graph acyclic; no live duplicate per (domain, decision-topic); whole-record granularity - partial supersession forbidden. Any failure -> abort before writes, hard error, no partial fold.
3. **Mark targets**: `superseded_by` += new id, `status` -> superseded.
4. **Move targets verbatim** to `docs/adr/archive/`.
5. **Rebuild index** - `docs/adr/index.md` per §Index Contract.
6. **Idempotency**: re-applying an already-folded edge -> no-op, not error.

## Index Contract

`docs/adr/index.md` SHALL be the generated live decision table - per domain rows (id | decision | date | supersedes). Rebuilt by every fold. Consumers (arch-review reuse checks, spec-implement emission) read the index, never the flat directory.

## Step 4: Lifecycle Validation

Run after fold (every closure):

- index <-> directory counts agree
- no accepted live record claiming in-body supersession (state lives in metadata block only)
- no dangling `supersedes`/`superseded_by` edges
- supersedes graph acyclic
- format compliance (metadata block complete, valid status values)

Drift -> reported as findings, never silently patched.

## Output

```
archive_status: success | failed | blocked
change_name: <name>
adr_changes: [<folded ids>]
index_rebuilt: true|false
validation: [<findings>]
message: <summary>
```

`blocked` - semantics per §Step 0 resolve (no upstream metadata, `openspec list` multiple/zero complete). No archive executed, no question asked.
