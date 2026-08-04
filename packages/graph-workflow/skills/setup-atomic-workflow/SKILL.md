---
name: setup-atomic-workflow
description: 'Initialize graph-scheduler project config — setup .graph-scheduler, create config.json, scaffold constraints.md, verify existing layout. Replaces retired atom-graph-config CLI init/show. Trigger phrases: "initialize graph-scheduler project config", "setup .graph-scheduler", "create config.json", "setup-atomic-workflow".'
version: 1.0.0
last_updated: '2026-08-01'
---

> **Runtime constraints** — load `atom-kernel` for question() decision UI rules.

# Setup-Atomic-Workflow

Scaffold `.graph-scheduler/` project layout. Four-step flow: Explore → Present → Confirm → Write. Deterministic content comes from seed files in this skill folder — prompt never re-encodes layout semantics.

## Entry

**MUST EXECUTE** — when user or graph requests graph-scheduler project setup, run the four-step flow and return created/existed inventory.

## Flow

### Step 1: Explore

Detect current state. Read `.graph-scheduler/` existence:

- `config.json` — exists? parses? matches ConfigFileSchema shape (dbPath/taskflowDir/registryPaths/skillsDir — no agentRegistry)?
- `graphs/` — exists? `registry.json` present?
- `constraints.md` — exists? `## Rules` section present?
- project root signals — monorepo `packages/*`? existing `.graph-scheduler` elsewhere?

Explore output = state summary. Setup always starts from "present current state".

### Step 2: Present

Show findings. For each missing piece, offer recommended default first (atom-kernel question() rule):

- **dbPath** — `.graph-scheduler/data/graph-scheduler.db` (recommended)
- **taskflowDir** — `.graph-scheduler/graphs` (recommended)
- **registryPaths** — `[.graph-scheduler/graphs/registry.json]` (recommended)

Existing pieces presented as-is — never re-proposed.

### Step 3: Confirm

Confirm each item one per turn, recommendation first. User overrides accepted. Skip confirm for items already present (state unchanged).

### Step 4: Write

Copy seed files. **Never overwrite existing files — fill gaps only.** Idempotency rule hardcoded:

> never overwrite existing files, fill gaps only

- `.graph-scheduler/config.json` ← `./seeds/config.json` (when missing)
- `.graph-scheduler/constraints.md` ← `./seeds/constraints.md` (when missing)
- `.graph-scheduler/graphs/` directory — create when missing (empty)

Output inventory mirroring retired IInitReport:

```
created: [<paths>]
existed: [<paths>]
```

### Step 5: Self-check

Re-read every written file. Verify:

- JSON parses (config.json)
- `## Rules` section present (constraints.md)
- file content byte-identical to seed

Parse failure → report file path + error. Failed step, not silent pass.

## Seeds

- `./seeds/config.json` — default project config. Derived from `createDefaultConfig()` in `packages/graph-scheduler/src/scheduler-runtime.ts` — single source of truth. Regenerate seed when the function changes; never hand-edit layout literals.
- `./seeds/constraints.md` — constraints template with `## Rules` section. Mirrors retired init constraint template.

## Done

Tell user: setup complete, layout inventory, constraints active on next graph run. Re-run safe — second run writes nothing, all existed.
