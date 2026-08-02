# graph-scheduler

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../docs/readme-blueprint.md) instead.

Graph-driven work-order system for AI agents — explicit phases, scoped context, and non-bypassable approval gates.

DAG execution engine as a standalone **MCP Server** (stdio transport) — 9 MCP tools, no network port.

graph-scheduler is the infrastructure half of Atomic Workflow. It loads `.taskflow.yaml` graph definitions, schedules phases in topological order, manages approval decisions, and persists run state. The agent does all the actual work; the scheduler only issues work orders and tracks progress.

**Stack**: bun · Effect-TS · zod v4 (validation) · libsql (persistence) · MCP SDK

## Requirements

- [bun](https://bun.sh) ≥ 1.x — runtime (server runs on bun, TS natively)
- [npm](https://nodejs.org) ≥ 9 — package manager

## Install

Global npm install:

```bash
npm install -g @ai-atomic-workflow/graph-scheduler
```

Verify:

```bash
npm list -g @ai-atomic-workflow/graph-scheduler
# @ai-atomic-workflow/graph-scheduler@0.1.0
```

This installs the `atom-graph-scheduler` bin (bun shebang) — used by the MCP registration below.

## MCP Registration

graph-scheduler speaks MCP JSON-RPC 2.0 over stdio. Register it in your platform's MCP config:

**OMP** (`~/.omp/agent/mcp.json`):

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "atom-graph-scheduler",
      "args": []
    }
  }
}
```

**OpenCode** (`opencode.json`):

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "atom-graph-scheduler",
      "args": []
    }
  }
}
```

The platform manages the process lifecycle: discover → spawn → connect → health check → reconnect. A crash doesn't kill the session — the platform reconnects automatically.

### Environment

|Variable|Default|Meaning|
|-|-|-|
|`GS_DB_PATH`|`:memory:`|libsql database file — stores `graph_runs` and `node_states` tables. Scaffolded `config.json` supplies `.graph-scheduler/data/graph-scheduler.db`; env overrides config; falls back to `:memory:` when unset everywhere.|

## Project Setup

Initialize a project with the **setup-atomic-workflow** skill (the retired `graph-config` CLI no longer exists):

```
Use setup-atomic-workflow to initialize this project
```

The skill runs a four-step flow (explore → present → confirm → write) and scaffolds `.graph-scheduler/`:

- `config.json` — dbPath, taskflowDir, registryPaths, optional skillsDir (graph-workflow skills package dir, used for entry-skill alignment checks)
- `graphs/` — where your custom `.taskflow.yaml` files live
- `constraints.md` — rules enforced on every graph run

Idempotent: never overwrites existing files. Re-running writes nothing.

## Graph Format

A `.taskflow.yaml` graph declares phases and their dependencies:

```yaml
name: e2e-minimal
phases:
  - id: agent-echo
    type: main
    dependsOn: []
    task: say hello in a random language.

  - id: approval-review
    type: approval
    dependsOn: [agent-echo]
    task: 'Approval Review'
    routing:
      actions:
        - action: continue
          label: 'Accept output'
          description: 'Output OK — proceed'
        - action: retry
          target: agent-echo
          label: 'Regenerate output'
          description: 'Output needs changes — re-run agent-echo with feedback'
```

### Phase fields

|Field|Meaning|
|-|-|
|`id`|Unique phase id — referenced by `dependsOn` and `routing.target`|
|`type`|`main` (inline execution), `approval` (decision gate), `flow` (composition — referenced sub-graph via `use`, flattened into the parent at load)|
|`dependsOn`|Declared upstream phases — the graph runs a phase only when all of them completed|
|`task`|Main: the work order — exact prompt for the agent, `{args.key}` templates interpolated at run time. Approval: decision-card topic|
|`skill`|Execution skill for this phase (e.g. `code-review`) — how the phase's work gets done|
|`agent`|Priority hints — `string[]` of agent types (e.g. `[reviewer, task]`); advisory, consumed by skills when they dispatch sub-agents (main type only)|
|`channels`|Main-type context patterns — skill names, file globs, or `node:<id>` refs, resolved against the execution skill's Context Requirements contract|
|`preText`|Approval-type decision-card pre-call text — displayed before `question()`, never channel-resolved|
|`join`|Dependency resolution — `all` (default: every dep must complete) or `any` (one dep sufficient)|
|`when`|Natural-language skip guard — LLM-evaluated before execution; report `skip: true` via `graph_advance` when it evaluates false|
|`eval`|Approval-type auto-decision rules — agent evaluates before `question()`; first match short-circuits (`continue` / `retry` / `jump`)|
|`use`|Flow type — referenced graph name to compose in (required when `type: flow`)|
|`routing`|Approval actions — `continue`, `retry`, `jump`; `retry` / `jump` carry an explicit `target` phase|

## MCP Tools

9 tools, one action per tool, each with its own JSON Schema:

|Tool|Parameters|What it does|
|-|-|-|
|`graph_start`|`graphName: string`, `args?: object`|Create a run, return the first ready node (NextNode)|
|`graph_advance`|`runId`, `nodeId`, `durationMs`, `skip?`|Report a node complete — notify + ask next in one step. `skip: true` marks a node skipped when its when-guard evaluated false. Output is not passed in — it lives in the agent session or on disk|
|`graph_jump`|`runId`, `targetPhaseId`|Jump to a specific phase — re-run it after an approval REWORK decision|
|`graph_force_end`|`runId`|Force-terminate a run — remaining nodes marked skipped, run marked terminated. **Irreversible**|
|`graph_status`|`runId`|Full run snapshot — per-phase status, retry counts, timestamps|
|`graph_list`|—|All run summaries (runId, graphName, status, startedAt), newest first|
|`graph_init`|—|Initialize the database (create tables + run migration) plus a full health check — entry-skill contract alignment with orphan detection + config health report. Idempotent|
|`graph_clean_completed`|`before?: string`|Delete completed run records, optionally before an ISO 8601 date|
|`graph_clean_all`|—|Delete ALL run records — running/blocked/terminated. **Dangerous**|

### NextNode types

`graph_start` / `graph_advance` return a NextNode:

|type|Meaning|Agent behavior|
|-|-|-|
|`main`|Execution node|Execute the task inline — context assembled from `channels`, `## Agent hints:` injected when declared|
|`approval`|Human decision node|Present a Decision Card and collect the choice|

`flow` is a load-time composition type, not a dispatch type — sub-graphs via `use` are flattened into the parent graph before execution (depth cap 5). `graph_start` / `graph_advance` only ever return `main` / `approval` nodes.

### Typical call flow

```
graph_start({ graphName: "e2e-minimal" })
  → { runId, node: { nodeId: "agent-echo", type: "main", task: "say hello in a random language.", ... } }
  → agent executes the task
  → graph_advance({ runId, nodeId: "agent-echo", durationMs: 1234 })
  → { snapshot, node: { nodeId: "approval-review", type: "approval", routingActions: [...], ... } }
  → ... loop until node is null (graph complete)
```

## Built-in Graphs

12 graphs ship with the package (in `graphs/`, registered in `graphs/registry.json`). The project's `.graph-scheduler/graphs/` is searched first — a project graph with the same name overrides a built-in.

|Graph|What it does|
|-|-|
|**e2e-minimal**|Minimal E2E: main → approval loop, for learning|
|**arch-review**|Architecture review: scope detect → review report|
|**arch-review-to-spec**|Composed pipeline: architecture review → decision gate (spec or document only) → optional spec generation|
|**openspec-create**|OpenSpec spec creation: scope interview with input source detection → approval gate → arch-decision step → openspec propose CLI|
|**openspec-apply**|OpenSpec apply: apply change → dual review → bounded auto-rework gate → archive|
|**openspec-pipeline**|OpenSpec lifecycle: spec creation (openspec-create) → human approval gate → implementation (openspec-apply)|
|**plan-generate**|Generic plan generation: scope interview → to-spec PRD → optional tickets split. Reusable via flow type|
|**skill-author**|Skill authoring: create or edit — scope → write → review → approval → output|
|**skill-delete**|Skill deletion: select → impact analysis → confirm → execute → review → approval|
|**skill-change-workflow**|Orchestrated skill change: plan → flow phases (author + delete + doc) → cross review → approval|
|**graph-generate**|Graph generation: interview → design → write → review → approval → examples|
|**doc-update**|Document update: interview → analyze → confirm → write → review → approval|

## Making Skills and Graphs with Graphs

Atomic Workflow bootstraps itself — the meta-workflows for authoring skills and graphs are built-in graphs:

**Create or edit a skill** — `skill-author` takes an idea through scope confirmation, write, review, and approval:

```
Use atom-pilot to run skill-author: make a skill that auto-generates changelogs from git history.
```

**Delete a skill** — `skill-delete` runs impact analysis and confirmation before executing:

```
Use atom-pilot to run skill-delete: remove the changelog skill.
```

**Orchestrated skill change** — `skill-change-workflow` plans a change, then runs author + delete + doc phases, a cross review, and an approval gate:

```
Use atom-pilot to run skill-change-workflow: rework the changelog skill to support conventional commits.
```

**Generate a graph** — `graph-generate` is the meta-graph: interview → design → write → review → approval. It produces a valid `.taskflow.yaml` from a plain-language description:

```
Use atom-pilot to run graph-generate: generate a workflow for release notes from merged PRs.
```

**Update docs** — `doc-update` runs interview → analyze → confirm → write → review → approval for project documents.

All of them are driven by `atom-pilot` from [graph-workflow](../graph-workflow/README.md).

## Development

```bash
cd packages/graph-scheduler

npm install        # install dependencies
npm run build      # build (tsup)
npm test           # run tests (vitest)
npm run typecheck  # type check
npm start          # start the server
```

Tests live in `tests/`, covering types, topology, state persistence, scheduler runtime, graph execution, graph definitions, and integration. Every zod schema in `src/schemas/` has unit tests (valid / invalid / boundary).

## FAQ

### graph_start returns a node but the agent doesn't respond?

Check the MCP connection. Confirm `command`/`args` in your `mcp.json` resolve, and that the scheduler process is alive (platform MCP health-check logs).

### How do I see run history?

`graph_list` for run summaries, then `graph_status({ runId })` for phase-level detail.

### How do I abort a stuck run?

`graph_force_end({ runId })`. **Irreversible** — the run is marked `terminated` and cannot be recovered.

### Where is the database?

Scaffolded `config.json` sets `.graph-scheduler/data/graph-scheduler.db` (relative to the working directory). Override with `GS_DB_PATH` (beats config.json); unset everywhere → in-memory. Two tables: `graph_runs` (run metadata) and `node_states` (per-node status, retry count, timestamps; duration is computed from timestamps, not stored). Output is **not** persisted — it lives in the agent session or on disk.
