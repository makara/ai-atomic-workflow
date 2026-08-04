# graph-scheduler

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../docs/readme-blueprint.md) instead.

Graph-driven work-order system for AI agents — explicit phases, scoped context, and non-bypassable approval gates.

DAG execution engine as a standalone **MCP Server** (stdio transport) — 9 MCP tools, no network port.

graph-scheduler is the infrastructure half of Atomic Workflow. It loads `.taskflow.yaml` graph definitions, schedules phases in topological order, manages approval decisions, and persists run state. The agent does all the actual work; the scheduler only issues work orders and tracks progress.

**Stack**: bun · Effect-TS · zod v4 (validation) · libsql (persistence) · MCP SDK

## Requirements

Two supported runtimes — pick one; the installer matches the runtime:

|Runtime|Version|Used by|
|-|-|-|
|[Node](https://nodejs.org)|≥ 22|npm route — runs the compiled entry `dist/server.js`|
|[bun](https://bun.sh)|≥ 1|bun route — runs the TypeScript entry `server.ts` natively|

## Install

Two routes — the runtime matches the installer:

**Option A: npm + Node runtime**

```bash
npm install -g @ai-atomic-workflow/graph-scheduler
```

Resolve the global path (used by the MCP registration below):

```bash
npm root -g   # → <npm-root>, e.g. /usr/local/lib/node_modules
```

**Option B: bun**

```bash
bun add -g @ai-atomic-workflow/graph-scheduler
```

Resolve the global bin folder:

```bash
bun pm bin -g   # → <bun-bin>, e.g. ~/.bun/bin
```

Verify either route:

```bash
npm list -g @ai-atomic-workflow/graph-scheduler
# @ai-atomic-workflow/graph-scheduler@0.2.0
```

This installs the `atom-graph-scheduler` bin alongside the package.

## MCP Registration

graph-scheduler speaks MCP JSON-RPC 2.0 over stdio. Register it in your platform's MCP config — the command invokes your chosen runtime explicitly:

**npm + Node** — replace `<npm-root>` with the `npm root -g` output:

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "node",
      "args": ["<npm-root>/@ai-atomic-workflow/graph-scheduler/dist/server.js"]
    }
  }
}
```

**bun** — replace `<bun-bin>` with the `bun pm bin -g` output:

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "bun",
      "args": ["<bun-bin>/atom-graph-scheduler"]
    }
  }
}
```

Config file locations: OMP → `~/.omp/agent/mcp.json`, OpenCode → `opencode.json` — same JSON either way.

The platform manages the process lifecycle: discover → spawn → connect → health check → reconnect. A crash doesn't kill the session — the platform reconnects automatically.

### Environment

|Variable|Default|Meaning|
|-|-|-|
|`GS_DB_PATH`|`:memory:`|libsql database file — stores `graph_runs` and `node_states` tables. Scaffolded `config.json` supplies `.graph-scheduler/data/graph-scheduler.db`; env overrides config; falls back to `:memory:` when unset everywhere.|

## Project Setup

Initialize a project with the **setup-atomic-workflow** skill (the retired `atom-graph-config` CLI no longer exists):

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
    task: |
      Approval Review

      Agent output produced. Accept → proceed. Recommendation: accept when the
      output is correct; free input overrides; dynamic option regenerate
      re-runs agent-echo with feedback.
```

### Phase fields

|Field|Meaning|
|-|-|
|`id`|Unique phase id — referenced by `dependsOn` and jump/route targets|
|`type`|`main` (inline execution), `approval` (human decision card), `gate` (machine rework judgment), `flow` (composition — referenced sub-graph via `use`, flattened into the parent at load)|
|`dependsOn`|Declared upstream phases — the graph runs a phase only when all of them completed|
|`task`|Main: the work order — exact prompt for the agent, `{args.key}` templates interpolated at run time. Approval: decision-card prompt — first line = card header (≤30 chars), rest = card body|
|`skill`|Execution skill for this phase (e.g. `atom-scope-interview`) — how the phase's work gets done|
|`agent`|Priority hints — `string[]` of agent types (e.g. `[reviewer, task]`); advisory, consumed by skills when they dispatch sub-agents (main type only)|
|`channels`|Context patterns — `skill:<name>` (skill content), file globs, or `node:<id>` (upstream phase output), resolved against the execution skill's Context Requirements contract; approval/gate carry `node:` entries only (judgment context)|
|`jumps`|Gate-only rework conditions — `[{when, to}]`, agent-evaluated in declaration order; first hit → backward jump to `to` (target + downstream reset, retry count incremented); no hit → pass through|
|`route`|Branch-route membership — declared route id; flows propagate their id to children; absent = implicit default route (always active). Approval branch options activate a route via `graph_advance` `branchTo`; unselected routes never activate|
|`routing`|Approval-only branch-route actions — `{ actions: [{ action, target?, value, label, description }] }`, declared only in branch-route scenarios; drives the decision-card options. Rejected on other types|
|`join`|Dependency resolution — `any` (one dep suffices; the only accepted literal)|
|`use`|Flow type — referenced graph name to compose in (required when `type: flow`)|

## MCP Tools

9 tools, one action per tool, each with its own JSON Schema:

|Tool|Parameters|What it does|
|-|-|-|
|`graph_start`|`graphName: string`, `args?: object`|Create a run, return the first ready node (NextNode)|
|`graph_advance`|`runId`, `nodeId`, `durationMs`, `branchTo?`, `endRun?`|Report a node complete — notify + ask next in one step. `branchTo` passes a routing target (gate rework target / approval branch-route target); `endRun: true` completes the run immediately (approval end action). Output is not passed in — it lives in the agent session or on disk|
|`graph_jump`|`runId`, `targetPhaseId`|Jump to a specific phase — re-run it after an approval REWORK decision|
|`graph_force_end`|`runId`|Force-terminate a run — unfinished nodes marked aborted, run marked terminated. **Irreversible**|
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
|`gate`|Machine decision node|Evaluate `jumps` rework conditions — first hit → backward jump to the target (scheduler resets target + downstream terminals, upstream kept); no hit → pass through|
|`approval`|Human decision node|Present a Decision Card and collect the choice|

`flow` is a load-time composition type, not a dispatch type — sub-graphs via `use` are flattened into the parent graph before execution (depth cap 5). `graph_start` / `graph_advance` only ever return `main` / `approval` / `gate` nodes.

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

15 graphs ship with the package (in `graphs/`, registered in `graphs/registry.json`). The project's `.graph-scheduler/graphs/` is searched first — a project graph with the same name overrides a built-in.

|Graph|What it does|
|-|-|
|**e2e-minimal**|Minimal E2E: main → approval loop, for learning|
|**arch-review**|Architecture review: scope detect → review report|
|**grill-with-docs**|Raw idea entry: scope → grilling interview with inline domain-modeling side effects (CONTEXT.md terms + ADR offers, user-confirmed) → decision gate. Two-track shared idea-sharpening entry|
|**arch-review-loop**|Closed-loop architecture review: entry (existing report or fresh review; run mode per activation) → arch-review re-review (round worker) → approve Top Rec → openspec-pipeline → round-end approval (Loop again default, Complete = user ends) → loop until no Top Rec remains|
|**implement**|Generic implementation: input-source detection (change/tickets/PRD) → tdd implementation → dual-axis review → bounded gate → approval → conditional OpenSpec archive|
|**openspec-create**|OpenSpec spec creation: scope interview with input source detection + inline ADR judgment → gate → openspec propose CLI|
|**openspec-apply**|OpenSpec apply: apply change → dual review → bounded auto-rework gate → archive|
|**openspec-engineer**|OpenSpec detailed implementation: spec synthesis → tickets → tdd implementation → dual review → bounded gate → approval → reverse-validated archive|
|**openspec-pipeline**|OpenSpec full-lifecycle pipeline: raw idea entry (grill-with-docs) → spec creation (openspec-create) → human gate → branch (openspec-apply direct / openspec-engineer detailed) → archive|
|**plan-generate**|Generic plan generation: scope interview → to-spec PRD → optional tickets split. Reusable via flow type|
|**skill-author**|Skill authoring: create or edit — scope → write → review → approval → output|
|**skill-delete**|Skill deletion: select → impact analysis → confirm → execute → review → approval|
|**skill-change-workflow**|Orchestrated skill change: plan → parse → flow writers (author + delete + doc + spec, case-5 self-judged) → cross review → approval → archive|
|**graph-generate**|Graph generation: interview → design → write → review → approval → examples|
|**doc-update**|Document update: interview → analyze → confirm → write → review → approval|

## arch-review-loop — one loop, one problem

The flagship graph: each loop round takes the biggest remaining architectural problem from review to shipped change. Phases:

|Phase|Type|Role|
|-|-|-|
|`loop-entry`|main|Scope interview (`atom-scope-interview`) — **re-confirmed every round**, never auto-skipped: domain/feature/problem + focus dimensions, plus report input — `fresh` (write a new report to a confirmed output path) or `existing` (closed-loop re-review of a prior report; the path's Top Recommendation is read)|
|`review`|flow|Runs `arch-review` — the round worker, always executes. Round 2+ re-reads the report (single source of truth, no path re-confirmation), marks per-Top-Rec implementation progress from code evidence, updates the report in place, rewrites the Top Recommendation (strongest remaining candidate, or empty)|
|`review-accept`|approval|Decision card — implement the Top Rec (continue) or end the loop (end action). Recommendation follows the report state|
|`implement`|flow|Runs `openspec-pipeline` — grill → spec creation → track decision → direct apply / detailed engineer → archive|
|`loop-gate`|gate|Backward jump to `loop-entry` when: run mode is auto AND `review/arch-review` output shows `top_rec_remaining: true` AND `loop-entry` retryCount < 8. No match → pass through|
|`loop-accept`|approval|Round-end card — Loop again (default) or Complete (end action). Recommendation follows the report state and the loop bound; when nothing remains, ending IS the recommendation|

Key semantics:

- **Run mode** is a per-activation decision — the built-in `$run-mode-confirm` prologue (`args.mode` short-circuits, otherwise a question), never a graph topic. Auto mode executes the gate jump and the end actions without asking; manual mode presents every decision card.
- **Round restart** jumps back to `loop-entry`, so the whole segment (scope → review → accept → implement) re-runs with re-confirmed scope.
- **Normal end** = the review reports no remaining Top Recommendation (`top_rec_remaining: false`) — the loop finishes; the bound (`loop-entry` retryCount < 8) only caps forced auto rework.

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

**Orchestrated skill change** — `skill-change-workflow` plans the change, then runs four self-judged writer flows (skill-author, skill-delete, doc-update, openspec-create — each skips itself when the plan doesn't need it), a cross-artifact review, an approval gate, and archives:

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
