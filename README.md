# Atomic Workflow ![alpha](https://img.shields.io/badge/status-alpha-orange)

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](docs/readme-blueprint.md) instead.

**Languages**: English (root) · [中文](docs/README.zh-CN.md)

Graph-Engineering for Real Engineers: Graphs define workflows; workflows build graphs. Based on mattpocock/skills.

![alpha](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-OMP%20%7C%20OpenCode-lightgrey)

## Table of Contents

**Part 1 — Out-of-the-Box Workflows**

- [arch-review-loop](#arch-review-loop)
- [estate-maintain](#estate-maintain)
- [All Built-in Workflows](#all-built-in-workflows)
- [Documentation Management](#documentation-management)

**Part 2 — Basics & Graph Making**

- [The Problem](#the-problem)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Setup](#setup)
- [Making a Graph](#making-a-graph)

**Tail**

- [Architecture](#architecture)
- [Status & Roadmap](#status--roadmap)
- [Contributing](#contributing)
- [Dependencies](#dependencies)
- [Thanks](#thanks)
- [Further Reading](#further-reading)

---

## Part 1 — Out-of-the-Box Workflows

## arch-review-loop

The flagship workflow — one loop takes the biggest remaining architectural problem from review to shipped change.

**How to read this section**: code blocks are **prompts** you send to your agent (verbatim); plain text is explanation. Every prompt follows one template; `<angle brackets>` are the parts you fill in:

```text
Use atom-pilot to run <graph name>: <your goal in plain language>
```

The loop at a glance — one round composes requirement production, adoption, and implementation; `loop-gate` re-enters the loop while a Top Recommendation remains (auto mode, bounded):

```mermaid
graph LR
   REQ[Requirement<br/>arch-review] --> ADOPT[Adopt<br/>adopt-with-docs]
   ADOPT --> TRACK{ADR exists?}
   TRACK -->|no: minimal| MIN[Apply + review]
   TRACK -->|yes: detailed| DET[Spec + tickets + implement]
   MIN --> GATE{Accept?}
   DET --> GATE
   GATE -->|no: rework| TRACK
   GATE -->|yes| ARCHIVE[Archive spec]
   ARCHIVE --> LOOP{Review reqs}
   LOOP -->|Top Rec remains<br/>auto · bounded| REQ
   LOOP -->|no Top Rec| DONE[Loop complete]
```

One round composes requirement production (`arch-review`), adoption + spec production (`adopt-with-docs`), and implementation (`spec-implement`); `loop-gate` re-enters the loop while a Top Recommendation remains (auto mode, bounded); `loop-accept` ends the round (Loop again default, Complete = user ends). Run mode (manual/auto) is confirmed at each activation:

```text
Use atom-pilot to run arch-review-loop: find and fix the biggest architectural problem in this codebase.
```

### Decomposition steps

The round splits into three independently executable graphs; `arch-review-loop` composes them. Pick the entry that matches your need:

|Need|Run|
|-|-|
|Requirement production only (find problems)|`graph_start arch-review`|
|Adoption + spec only (confirm a produced report / raw idea, produce the change)|`graph_start adopt-with-docs`|
|Implementation only (change exists)|`graph_start spec-implement` with `args.changeName`|
|Full round (requirement + adoption + implementation in one loop)|`graph_start arch-review-loop`|

- `arch-review` — requirement production — standalone: scope interview (scope + output path + report input fresh\|existing) → arch-review report (improve-codebase-architecture) → review-accept (Continue = requirement ready, Loop again, End).
- `adopt-with-docs` — requirement adoption + spec production — standalone raw-idea entry; composed, it receives the produced report as input document, appends its record as a dated appendix section, and materializes the adopted requirements as the OpenSpec change (spec-propose).
- `spec-implement` — implementation: spec-extract reads the produced change (upstream channel when composed, `args.changeName` standalone) → track machinery → archive (tracks own post-archive doc maintenance). No spec generation, no auto-loop gate — rework is the single loop in `arch-review-loop`.

**Raw MCP tools?** The loop behind all of this is `graph_start` → execute the returned work order → `graph_advance` → repeat until null. If you want to drive the MCP tools directly instead of via atom-pilot, see the call-flow example in [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md).

**Want to go deeper?** → [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md) for the graph format and all tools, [packages/graph-workflow/README.md](packages/graph-workflow/README.md) for the skill system.

## estate-maintain

Doc-estate maintenance as a graph — keeps the derived-view / normative / contract doc classes in sync after a domain or skill change.

```mermaid
graph LR
   ENTRY[Entry<br/>trigger classification] --> REQ{user-request?}
   REQ -->|yes| GRILL[Grill requirements]
   REQ -->|no| WORK{Workstream}
   GRILL --> WORK
   WORK -->|domains| DOM[domains-index]
   WORK -->|specs| SYN[specs-sync]
   WORK -->|adrs| ALN[adr-align]
   DOM --> REV[Review]
   SYN --> REV
   ALN --> REV
   REV -->|pass| ACC[Accept]
   REV -->|rework| WORK
```

The entry classifies the trigger (domain-change / skill-change / proactive / user-request — user-request adds a grilling confirmation step, no ADR), then dispatches the matching workstream — `domains-index` (atom-doc-maintain), `specs-sync` (atom-spec-maintain), `adr-align` (atom-adr-maintain); the review is a consistency gate (requirements class + reverse-validation + read-only deployment-mirror check):

```text
Use atom-pilot to run estate-maintain: sync the doc estate after the domains change.
```

## All Built-in Workflows

Ten workflows ship in `packages/graph-scheduler/graphs/` and run out of the box. Three get the deep treatment above (arch-review-loop, estate-maintain, graph-generate below); the rest are one-line entries — full detail in [packages/graph-scheduler/README.md](packages/graph-scheduler/README.md):

|Graph|What it does|
|-|-|
|**arch-review-loop**|See above — the flagship loop|
|**arch-review**|Requirement production graph, standalone: scope-entry interview (entry node — scope + output path + report input fresh\|existing) → arch-review report (improve-codebase-architecture — producer) → review-accept (Continue = requirement ready / Loop again / End). Independently executable requirement production; the loop composes it as its requirement stage (adopt + implement follow in arch-review-loop).|
|**adopt-with-docs**|Requirement adoption (adopt stage) + spec production: adopt-scope (interview: idea/goal or input document) → adopting (grilling conversation, inline domain-modeling side effects) → adopt-accept (adoption approval) → spec-propose (openspec-propose — adopted requirements materialize as the OpenSpec change). Standalone raw idea entry; composed as the loop's adopt stage — receives the produced report as input document and appends its record as a dated appendix section.|
|**spec-implement**|Implementation graph: spec-extract (produced change — upstream channel when composed / {args.changeName} standalone) → track gate (minimal/detailed) → track-owned closure (plain archive / atom-doc-lifecycle) → pipeline-done. Pure implementation of an existing change — no spec generation; rework is the loop in arch-review-loop.|
|**openspec-apply**|OpenSpec apply pipeline: apply change → dual review → bounded auto-rework gate → plain archive (openspec-archive-change)|
|**openspec-engineer**|OpenSpec detailed implementation: spec synthesis → tickets → tdd implementation → dual review → bounded gate → approval → lifecycle closure (reverse-validated archive + ADR fold + index)|
|**e2e-minimal**|Minimal E2E: main → approval loop|
|**estate-maintain**|See above — estate maintenance|
|**release-prep**|Pre-release preparation — propose (release-prep-analyze: version from git tag history, deterministic + idempotent pre-tag, never executes git tag/commit/push) → plan-grill (grilling confirmation of every planned operation — interview, never auto-gated) → apply (release-prep-apply: version bump on release-line surfaces + CHANGELOG [Unreleased] fold per spec + README list sync vs ground truth, overwrite-style + verified) → release-review (approval; continue completes the run — final report prints tag/commit commands, user executes manually; jump re-runs a phase).|
|**graph-generate**|See [Making a Graph](#making-a-graph) (Part 2) — the maker journey|

## Documentation Management

How this project's documentation is managed — **only the documents the current built-in graphs actually consume are listed**; everything else in `docs/` is legacy, kept for reference, not consumed by any graph.

The graph runtime delivers context through channels: ambient context (convention files, user-supplement config, platform estate) plus graph-declared channels, constraints, and run state. What the 10 built-in graphs actually consume:

|Class|Documents|Consumed by|
|-|-|-|
|Convention layer (default-loaded into every phase)|`CONTEXT.md` (glossary), `docs/domains.md` (domain index)|all graph phases|
|Platform estate (organic — agent-read when present, never declared)|`docs/adr/` + `index.md` + `archive/` (ADRs), `openspec/specs/**`, `openspec/changes/**` (spec assets)|estate-maintain (adr-align), openspec graphs, arch-review-loop adoption chain|
|Constraints|`.graph-scheduler/constraints.md` → `constraints.json`|activation (pilot loads once into the session; every node's Constraints block assembles from it)|
|Runtime|node run state (progress only — status/retry/timing; node content lives in the agent session, ADR 0143)|graph-scheduler DB (delta snapshots — one-line rows + changed rows per dispatch)|
|Assets|`packages/graph-scheduler/graphs/` + `registry.json` (10 graphs), `packages/graph-workflow/skills/` (16 skills)|all graph execution|
|Artifacts|`docs/reports/` (arch-review reports), `docs/adopt/` (adoption records)|arch-review / adopt-with-docs|

Specs and changes follow the OpenSpec flow: proposals become `openspec/changes/<name>/` (proposal + delta specs + design + tasks), implementation syncs deltas into `openspec/specs/`, then the change archives. ADRs record decisions; superseded ones fold into `docs/adr/archive/`. The README family itself is regenerated from this blueprint.

**Legacy, not graph-consumed**: `docs/design.md`, `docs/philosophy.md`, `docs/requirements.md`, `docs/core-requirements.md`, `docs/conventions.md`, `docs/workflow.md`, `docs/constraints.md`, `docs/specs/`, `docs/grill/`, `docs/designs/`, `docs/tickets/`, `docs/agents/`, `docs/platform/`, `docs/dev/`, `docs/readme-blueprint.md` (regeneration source, not graph input) — kept for reference.

---

## Part 2 — Basics & Graph Making

**Graph is just a tool; Attention is all you need.**

## The Problem

AI agents skip steps silently, lose context between stages, can't express conditional branches, and lack structured approval gates. These failures share a root cause: **the agent has no work-order system**. It's told "build this feature" and left to improvise. When it misses a review step or forgets to update docs, nothing in the execution model prevents it — because there _is_ no execution model. Atomic Workflow gives agents one: explicit phases, declared dependencies, runtime context injection, and non-bypassable approval gates.

---

## How It Works

**Runtime work orders with graph.** Each phase is a self-contained work order. Your agent pulls the next ready order, executes it, reports back; the scheduler advances the graph. The graph only tracks progress and reminds what's next — it executes nothing. A DAG captures what linear chains can't: conditional branches, approval gates, parallel fan-outs.

**Scoped context with channels.** Each work order carries the exact prompt, the right skill, and a context "channel" — a focused slice of relevant decisions and artifacts, nothing heavy. Effective context is one deterministic merge: ambient context (convention files, user-supplement config, platform estate — see `CONTEXT.md` glossary) plus graph-declared channels (skill references, upstream node outputs, file globs), identical for every phase. Activation facts (run mode, constraints) live at the invocation boundary — `graph_start` requires the mode, the pilot loads constraints once into the session. The engine reads no prose: skills carry the knowing; dispatch payloads are delta snapshots (one-line node rows + changed rows), so progress display and jump navigation never re-pay the full state.

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

Two install channels — pick one (all 16 built-in skills are required for graph execution):

**Option A: Claude Code marketplace**

```bash
/marketplace install makara/ai-atomic-workflow
```

**Option B: skills.sh** (third-party CLI, 76+ agent platforms — OpenCode / Codex / Cursor etc.)

```bash
npx skills add makara/ai-atomic-workflow
```

Common flags: `-a <agent>` pick platform (`-a '*'` all), `-g` global install, `-y` non-interactive, `-l` preview without installing.

### Install Dependencies

Two prerequisites for the openspec graphs and the parent skill chain:

- **OpenSpec CLI** — `npm install -g @fission-ai/openspec@latest`, then `openspec init` inside your project. → [installation docs](https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md)
- **mattpocock/skills** — parent skills (grilling, domain modeling, TDD, code review): `npx skills add mattpocock/skills`. → [README](https://github.com/mattpocock/skills/blob/main/README.md)

## Setup

Initialize a project with the **setup-atomic-workflow** skill (the retired `atom-graph-config` CLI no longer exists):

```text
Use setup-atomic-workflow to initialize this project
```

It scaffolds `.graph-scheduler/` — `config.json` (db path, taskflow dir, registry paths), `graphs/`, `docs/`, and `constraints.md`. Idempotent: never overwrites existing files. Re-running it writes nothing.

## Making a Graph

The maker journey — Atomic Workflow bootstraps itself: authoring a graph is a built-in workflow, driven the same way as every graph.

```mermaid
graph LR
   ENTRY[Entry<br/>scope interview] --> SPEC[Spec<br/>atom-graph-spec]
   SPEC --> DESIGN[Design]
   DESIGN --> IMPL[Implement]
   IMPL --> REVIEW[Review]
   REVIEW --> GATE{Accept?}
   GATE -->|no: rework| IMPL
   GATE -->|yes| ACCEPT[Accepted]
```

Entry (atom-scope-interview, no CONTEXT.md hard dependency) → spec (topology design via atom-graph-design per atom-graph-spec) → spec-accept → implement (atom-graph-writer writes the `.taskflow.yaml` + registry entry + attached doc `.graph-scheduler/docs/<name>.md`, load-probe validated) → review → gate (bounded rework) → accept. Single kind (graph), single operation (create) — no skill co-production. Skill production (create/edit) flows through `arch-review-loop` (improver journey) openspec changes — implementation loads the spec skill per affected domain (graph → atom-graph-spec, skill → atom-skill-spec, doc → atom-doc-maintain):

```text
Use atom-pilot to run graph-generate: generate a workflow for release notes from merged PRs.
```

---

## Architecture

**What a graph is.** A graph is a work-order board declared in a `.taskflow.yaml` file: a named set of phases wired by `dependsOn` edges. The scheduler issues each ready phase as a work order and tracks progress — it executes nothing. Your agent pulls the order, does the work, reports back; the graph advances.

**Graph structure.** Phases are the units of work. Types: `main` (inline execution), `approval` (human decision card), `gate` (machine rework judgment), and `flow` composition (reference another graph via `use`, flattened at load). Key phase fields: `task` (the work order / card text), `skill` (execution skill), `agent` (priority hints for sub-agent dispatch), `channels` (context — global `context:` + per-phase additions), `jumps` (gate-only rework conditions), `routing` (approval-only branch-route actions), `dependsOn` (topological order).

**Built-in vs user graphs.** Built-in graphs ship in `packages/graph-scheduler/graphs/`, registered in `graphs/registry.json`. User graphs live in `.graph-scheduler/graphs/` (scaffolded by setup-atomic-workflow). Resolution is project-first: a project graph with the same name overrides a built-in.

Two packages:

|Package|Role|
|-|-|
|**graph-scheduler**|Infrastructure. MCP Server (DAG execution engine, 9 tools) + built-in graphs shipped in the package.|
|**graph-workflow**|Skill system. `atom-pilot` (lifecycle loop), `atom-phase-handler` (dispatch by phase type), entry and reference skills.|

The 10-workflow list lives in [Part 1](#all-built-in-workflows) with the out-of-the-box pitch.

## Status & Roadmap

Atomic Workflow is in **alpha**.

**Stable** (implemented, no planned breaking changes before v1.0):

- graph-scheduler FSM engine and 9 MCP tools
- `.taskflow.yaml` graph format and phase schema (main/approval/gate + flow composition, join modes, channels, agent hints, branch routes, run state)
- CRUD execution loop (`graph_start` → `graph_advance` → `graph_jump`, plus `graph_status` / `graph_list`)
- setup-atomic-workflow project initialization
- 10 built-in graphs and 16 built-in skills

**Active development** (may change):

- More control-flow features — branch-route patterns, gate jump conditions
- More built-in graphs / workflows
- Data maintenance tools (current `graph_clean_*` are minimal) — the MCP tool interface may change

### Roadmap

- [ ] More out-of-the-box graphs — release-notes generation, spec drafting, estate workflow extensions
- [ ] More token-saving strategies — headroom compression integration, leaner context channels, smaller graph overhead
- [ ] More convenient operations tooling — run status views, smarter history/cleanup
- [ ] Wider platform support — cross-platform MCP registration

---

## Contributing

Bug reports and pull requests welcome. See [CONTEXT.md](CONTEXT.md) for the project glossary and [docs/adr/](docs/adr/) for architectural decision records.

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
|[packages/graph-scheduler/README.md](packages/graph-scheduler/README.md)|Graph format, all 9 MCP tools, built-in graphs, making graphs with graphs|
|[packages/graph-workflow/README.md](packages/graph-workflow/README.md)|Skill system, full skill list, how skills drive graph execution|
|[CONTEXT.md](CONTEXT.md)|Terminology reference (project glossary)|
