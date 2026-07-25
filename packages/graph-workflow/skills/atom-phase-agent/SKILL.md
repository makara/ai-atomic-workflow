---
name: atom-phase-agent
description: Phase handler for agent type tasks — discover entry skill context requirements, assemble runtime context, dispatch via task(). Dispatched when NextNode.handlerSkill = "atom-phase-agent".
user-invocable: false
disable-model-invocation: true
version: 5.1.0
last_updated: '2026-07-27'
---

> **Runtime constraints** — called by atom-phase-handler. Load `skill://atom-kernel` for task() 4-field contract.

> **Layer**: atom — phase handler for agent type tasks

# Atom-Phase-Agent

Standardized handler for agent-type phase nodes. Receives NodeDetail, discovers the entry skill's context contract, assembles runtime context from files and conversation, dispatches a sub-agent, collects the result, and lands output to disk.

## Input

Dispatched when `NextNode.handlerSkill = "atom-phase-agent"`. Receives NodeDetail fields:

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`task`|string|yes|Task instruction text|
|`entrySkill`|string|yes|Target skill for task() dispatch — loaded via `skill://<entrySkill>`|
|`context`|string|no|Glob patterns — files to pre-read and prepend to prompt|
|`agent`|string|no|Agent type for task() dispatch. Default `"task"`.|

## Handler Flow

### Step 1: Receive

Receive `{ nodeId, task, context?, entrySkill, agent? }` from NodeDetail. Dispatch keyed by `NextNode.handlerSkill = "atom-phase-agent"`.

### Step 2: Discover

Load `skill://<entrySkill>`. Read the `## Context Requirements` section. Extract:

- **Files** — glob patterns listing files the entry skill requires (deterministic).
- **Description** — natural language describing additional context the entry skill needs (LLM judgment).

If `## Context Requirements` is absent: skip context collection. Proceed to Step 4 with only `node.context` resolved as the prompt prefix. This is the **legacy** backward-compatible path.

### Step 3: Collect & Assemble

**3a — Deterministic files.** Merge `node.context` globs (if any) with entry-required `Files`. For each merged glob: expand via `glob` tool, read every resolved file via `read`, truncate each to a reasonable size, format as:

```
## File: <path>

<content>
```

Collect all file blocks under a `## Context Files` header.

**3b — LLM-driven context.** Understand the `Description` text. Search the conversation for relevant information (user args, prior outputs, decisions). Read additional files if needed. Format findings as:

```
## Additional Context

<content>
```

**3c — Assemble final prompt.** Compose the sub-agent prompt:

```
## Context Files
<file blocks from 3a>

## Additional Context
<content from 3b>

## Task
<node.task>
```

### Step 4: Dispatch

Dispatch via `task()` per `skill://atom-kernel` 4-field contract in skip-checkpoint mode:

|Contract field|Value|
|-|-|
|`target-skill`|`entrySkill` — loaded via `skill://<entrySkill>`|
|`auxiliary-skills`|`[skill://atom-kernel]`|
|`target-skill-input`|Assembled prompt from Step 3|
|`input-paths`|Resolved file paths from 3a. `[]` if none.|
|`agent`|`agent ?? "task"`|

### Step 5: Collect & Return

Capture sub-agent result from `agent://<id>`. Map to output — success → `status: "done"`, failure → `status: "failed"`. Measure wall-clock duration from Receive to result collection.

After sub-agent completes, write output to disk:

```
.taskflow/outputs/<nodeId>.output.txt
```

If the file write fails — mark `[FILE MISSING: .taskflow/outputs/<nodeId>.output.txt]` in the prompt, do not crash. The file landing is a convention, not a hard constraint.

Return to atom-phase-handler:

```
{ status: "done" | "failed", output: string, durationMs: number }
```

Caller advances via `graph_advance(runId, nodeId, durationMs)` — output lives in agent session and on disk.

## Context Requirements

Entry skills declare required runtime context via a `## Context Requirements` section in their SKILL.md. The handler discovers this section at Step 2 and assembles context at Step 3.

### Files

A list of file paths or glob patterns the entry skill needs deterministically. The handler resolves these at runtime: `glob` → `read` → inject into the sub-agent prompt.

```markdown
### Files

- .taskflow/outputs/lint.output.txt
- project/CODING-STANDARDS.md
```

### Description

Natural language describing additional context the entry skill needs. The handler uses LLM judgment to search the conversation and read extra files.

```markdown
### Description

I need the lint results showing which files have errors, and the project coding standards for reference.
```

If the `## Context Requirements` section is absent from the entry skill, the handler falls back to **legacy** behavior: resolve `node.context` globs only, then forward the task verbatim. No context discovery, no assembly.

## Output

```
{ status: "done" | "failed", output: string, durationMs: number }
```

|Field|Value|
|-|-|
|`status`|`"done"` on success, `"failed"` on any error|
|`output`|Execution result text. Error message when `"failed"`.|
|`durationMs`|Wall-clock execution time in milliseconds|
