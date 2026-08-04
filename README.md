# Atomic Workflow ![alpha](https://img.shields.io/badge/status-alpha-orange)

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](docs/readme-blueprint.md) instead.

**Languages**: English (this file) · [中文](docs/README.zh-CN.md)

**Graph is just a tool; Attention is all you need.**

Graph-driven work-order system for AI agents — explicit phases, scoped context, and non-bypassable approval gates.

![alpha](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-OMP%20%7C%20OpenCode-lightgrey)

---

## The Problem

AI agents skip steps silently, lose context between stages, can't express conditional branches, and lack structured approval gates. These failures share a root cause: **the agent has no work-order system**. It's told "build this feature" and left to improvise. When it misses a review step or forgets to update docs, nothing in the execution model prevents it — because there _is_ no execution model. Atomic Workflow gives agents one: explicit phases, declared dependencies, runtime context injection, and non-bypassable approval gates.

---

## How It Works

**Runtime work orders with graph.** Each phase is a self-contained work order. Your agent pulls the next ready order, executes it, reports back; the scheduler advances the graph. The graph only tracks progress and reminds what's next — it executes nothing. A DAG captures what linear chains can't: conditional branches, approval gates, parallel fan-outs.

**Scoped context with channels.** Each work order carries the exact prompt, the right skill, and a context "channel" built from upstream phase outputs — declared per phase as channel patterns: skill names, file globs, or upstream node references, resolved against the execution skill's context contract. A channel is just a concept: a focused slice of relevant decisions and artifacts, nothing heavy. No more "where are we?" or "what was decided earlier?" — your agent gets exactly what it needs for _this_ step.

**Hints, not controls — the graph never dispatches.** A graph says _what_ each phase needs — skills, context, and, optionally, agent-type preferences in priority order. Dispatch itself stays in your agent's hands: when a skill fans out sub-agents, it follows the hints, not the graph's command. The graph is a work-order board, not a manager.

**Your agent still does everything.** No code execution, no hidden engine, no new runtime language. The agent keeps its full toolkit — skills, tools, files — and does all the work. The graph only issues orders and tracks progress. That's the whole mechanism.

**Attention is all you need.** Agents fail from lost focus, not incapability. "Build this feature" is too big; "Write the User model type definition, given the schema from the previous step" is just right. A clear work order with bounded context eliminates the ambiguity that causes skipped steps, forgotten reviews, and drifting scope.

---

## Installation

### graph-scheduler

One package, two capabilities: the **MCP Server** (9 tools, stdio transport) and the `atom-graph-scheduler` bin. Two install routes — **the runtime matches the installer**:

**Option A: npm + Node runtime**

```bash
npm install -g @ai-atomic-workflow/graph-scheduler
```

Runtime: [Node](https://nodejs.org) ≥ 22. The package runs from its compiled entry — resolve the global path and register:

```bash
npm root -g   # → <npm-root>, e.g. /usr/local/lib/node_modules
```

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

**Option B: bun**

```bash
bun add -g @ai-atomic-workflow/graph-scheduler
```

Runtime: [bun](https://bun.sh) ≥ 1. bun executes the TypeScript entry directly:

```bash
bun pm bin -g   # → <bun-bin>, e.g. ~/.bun/bin
```

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

Config file locations: OMP → `~/.omp/agent/mcp.json`, OpenCode → `opencode.json`. Full details → [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md).

### graph-workflow

Two install channels — pick one (all 14 built-in skills are required for graph execution):

**Option A: Claude Code marketplace**

```bash
/marketplace install makara/ai-atomic-workflow
```

**Option B: skills.sh** (third-party CLI, 76+ agent platforms — OpenCode / Codex / Cursor etc.)

```bash
# Full install (14 graph-workflow skills + legacy skills)
npx skills add makara/ai-atomic-workflow

# graph-workflow only — 14 built-in skills (tree-subpath source, no marketplace.json dependency)
npx skills add https://github.com/makara/ai-atomic-workflow/tree/main/packages/graph-workflow/skills
```

Common flags: `-a <agent>` pick platform (`-a '*'` all), `-g` global install, `-y` non-interactive, `-l` preview without installing.

### Dependencies

Two prerequisites for the openspec graphs and the parent skill chain:

- **OpenSpec CLI** — `npm install -g @fission-ai/openspec@latest`, then `openspec init` inside your project. → [installation docs](https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md)
- **mattpocock/skills** — parent skills (grilling, domain modeling, TDD, code review): `npx skills add mattpocock/skills`. → [README](https://github.com/mattpocock/skills/blob/main/README.md)

## Setup

Initialize a project with the **setup-atomic-workflow** skill (the retired `atom-graph-config` CLI no longer exists):

```
Use setup-atomic-workflow to initialize this project
```

It scaffolds `.graph-scheduler/` — `config.json` (db path, taskflow dir, registry paths), `graphs/`, and `constraints.md`. Idempotent: never overwrites existing files. Re-running it writes nothing.

---

## Quick Start

With graph-workflow skills installed, drive the built-in graphs with `atom-pilot` — it handles the full execution loop (`graph_start` → phase dispatch → `graph_advance`) and presents approval gates.

**How to read this section**: code blocks are **prompts** you send to your agent (verbatim); plain text is explanation. Every prompt follows one template; `<angle brackets>` are the parts you fill in:

```
Use atom-pilot to run <graph name>: <your goal in plain language>
```

**1. Solve a problem end-to-end — one loop** — `arch-review-loop` drives the whole flow — review, spec, implementation, round-end approval — in a single loop that repeats until nothing remains:

```
Use atom-pilot to run arch-review-loop: find and fix the biggest architectural problem in this codebase.
```

Each round: entry scope interview (fresh review or an existing report) → architecture review → approve the Top Recommendation → OpenSpec spec + implementation (`openspec-pipeline`) → round-end approval (Loop again default, Complete = you end). The loop ends when the review reports no remaining Top Recommendation — or you choose Complete. Run mode (manual/auto) is confirmed at each activation.

**2. Same flow, decomposed** — equivalent to arch-review-loop, run step by step (what one loop automates):

- `arch-review` — find problems or refine an idea (scope detect → review report)
- `openspec-create` — turn the review's Top Recommendation into an OpenSpec change (spec)
- (optional) `plan-generate` — generate implementation tickets from the spec
- `implement` / `openspec-apply` — implement the change: input-source detection, tdd implementation, dual-axis review, bounded gate; auto-archives when the input was an OpenSpec change
- Re-run rounds while findings remain

**3. Make a graph or a skill** — the meta-workflows are built-in graphs, driven the same way:

- `graph-generate` — turn a plain-language description into a `.taskflow.yaml`:

```
Use atom-pilot to run graph-generate: generate a workflow for release notes from merged PRs.
```

- `skill-author` — create or edit a SKILL.md:

```
Use atom-pilot to run skill-author: make a skill that auto-generates changelogs from git history.
```

**Raw MCP tools?** The loop behind all of this is `graph_start` → execute the returned work order → `graph_advance` → repeat until null. If you want to drive the MCP tools directly instead of via atom-pilot, see the call-flow example in [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md).

**Want to go deeper?** → [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md) for the graph format and all tools, [packages/graph-workflow/README.md](packages/graph-workflow/README.md) for the skill system.

---

## Architecture

Two packages:

|Package|Role|
|-|-|
|**graph-scheduler**|Infrastructure. MCP Server (DAG execution engine, 9 tools) + built-in graphs shipped in the package.|
|**graph-workflow**|Skill system. `atom-pilot` (lifecycle loop), `atom-phase-handler` (dispatch by phase type), entry and reference skills.|

**Built-in graphs** — ready to run out of the box:

|Graph|What it does|
|-|-|
|**arch-review-loop**|Closed-loop architecture review: entry (existing report or fresh review + run mode) → arch-review re-review (round worker) → approve Top Rec → openspec-pipeline → round-end approval (Loop again default, Complete = user ends) → loop until the user approves ending|
|**arch-review**|Architecture review: scope detect → review report|
|**doc-update**|Document update: interview → analyze → confirm → write → review → approval|
|**graph-generate**|Meta-graph: generates a `.taskflow.yaml` from a plain-language description|
|**grill-with-docs**|Raw idea entry: scope → grilling interview with inline ADR/glossary side effects → decision gate|
|**implement**|Generic implementation: input-source detection (change/tickets/PRD) → tdd implementation → dual-axis review → bounded gate → approval → conditional OpenSpec archive|
|**openspec-apply**|OpenSpec apply: apply change → dual review → bounded rework → archive|
|**openspec-create**|OpenSpec spec creation: scope interview with input-source detection + inline ADR judgment → bounded gate → openspec propose CLI|
|**openspec-engineer**|OpenSpec detailed implementation: spec synthesis → tickets → tdd implementation → dual review → bounded gate → reverse-validated archive|
|**openspec-pipeline**|OpenSpec full-lifecycle pipeline: raw idea (grill-with-docs) → spec creation (openspec-create) → human gate → branch (openspec-apply direct / openspec-engineer detailed) → archive|
|**plan-generate**|Generic plan generation: scope interview → PRD → optional tickets split|
|**skill-author**|Skill authoring: create or edit — scope → write → review → approval|
|**skill-change-workflow**|Orchestrated skill change: plan → flow writers (author + delete + doc + spec, self-judged) → cross review → approval → archive|
|**skill-delete**|Skill deletion: select → impact analysis → confirm → execute → review → approval|
|**e2e-minimal**|Minimal E2E: main → approval loop, for learning|

---

## Status & Roadmap

Atomic Workflow is in **alpha**.

**Stable** (implemented, no planned breaking changes before v1.0):

- graph-scheduler FSM engine and 9 MCP tools
- `.taskflow.yaml` graph format and phase schema (main/approval/gate + flow composition, join modes, channels, agent hints, branch routes)
- CRUD execution loop (`graph_start` → `graph_advance` → `graph_jump`, plus `graph_status` / `graph_list`)
- setup-atomic-workflow project initialization
- 15 built-in graphs and 14 built-in skills

**Active development** (may change):

- More control-flow features — branch-route patterns, gate jump conditions
- More built-in graphs / workflows
- Data maintenance tools (current `graph_clean_*` are minimal) — the MCP tool interface may change

### Roadmap to v1.0

- [ ] skill-edit graph (alpha)
- [ ] cross-platform MCP support + phase schema v1 freeze (v1.0)

---

## Contributing

Bug reports and pull requests welcome. See [CONTEXT.md](CONTEXT.md) for the architecture overview and [docs/adr/](docs/adr/) for architectural decision records. More → [CONTRIBUTING.md](CONTRIBUTING.md).

## Dependencies

- [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md) — spec lifecycle for the openspec graphs
- [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/README.md) — parent skills for grilling, domain modeling, TDD, and more

## Thanks

- [taskflow](https://heggria.github.io/taskflow) — DAG execution model inspiration
- [Oh My Pi](https://omp.sh/) — agent harness platform

---

## Further Reading

|Document|For|
|-|-|
|[packages/graph-scheduler/README.md](packages/graph-scheduler/README.md)|Graph format, all 9 MCP tools, built-in graphs, making skills/graphs with graphs|
|[packages/graph-workflow/README.md](packages/graph-workflow/README.md)|Skill system, full skill list, how skills drive graph execution|
|[docs/glossary.md](docs/glossary.md)|Terminology reference|
|[CONTEXT.md](CONTEXT.md)|Internal architecture reference for contributors|
