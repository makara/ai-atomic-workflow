# AI Atomic Workflow

The project context for AI-assisted development of this repo: an atomic taskflow graph system (DAG engine + skill system) that turns architecture reviews and doc-estate changes into executed graph runs. This file is the project glossary — term disambiguation only.

## Language

**Graph**: A declarative DAG definition in taskflow YAML (`.taskflow.yaml`), containing a phases array, dependsOn edges, and control-flow fields — replaces skill call chains as the orchestration description. _Avoid_: workflow, pipeline, scenario

**Atom**: A single phase in the graph — has type (main/approval/gate/flow), dependency edges (dependsOn), and routing fields. _Avoid_: task, step

**Phase**: An execution unit in the graph, equivalent to an atom. Phase type determines execution logic (main → inline execution, approval → human decision, gate → machine rework judgment, flow → subgraph expansion). _Avoid_: node (reserved for run-time state), step

**Main type**: Phase type (ADR 0028 D1) that executes the task inline within the main agent process. Handler skill = "atom-phase-handler" (builtin); execution skill = `phase.skill` (optional). May declare an `agent` hints array. _Avoid_: agent type (deleted, ADR 0056)

**Approval**: Human-decision phase — a decision card (Accept + free input + contextual options) confirmed by the user or auto-executed in auto mode; routes via continue/retry/jump/end. _Avoid_: checkpoint, question() (absorbed into approval(), ADR 0133)

**Gate**: Pure rework node — evaluates `jumps` `[{when, to}]` conditions; hit → backward jump, no hit → pass through. _Avoid_: conditional branch, when-guard

**Activation prologue**: Graph-external built-in nodes with reserved `$` ids — `$run-mode-confirm` (run mode confirmation; `args.mode` short-circuit; absence NEVER auto) + `$load-constraints` (project constraints loading; compiled-artifact protocol). The prefix gates author activation and re-runs on backward resets targeting an entry node. _Avoid_: setup node, init phase

**Entry node**: A plain main phase with `dependsOn: []` that acquires the journey scope (idea, report, plan metadata) — the graph's first author node after the activation prologue. _Avoid_: start node, entry phase

**Run mode**: Per-activation decision controlling approval presentation — manual (card always) or auto (recommendation executes; no recommendation → card). Mode never stored backend-side; absence never auto. _Avoid_: headless mode (removed, ADR 0058)

**Convention layer**: Platform-shipped exact files (`CONTEXT.md`, `docs/domains.md`), default-loaded into every phase, absence-tolerant (missing → empty + warning, never fail). Graphs never declare them. _Avoid_: default context, builtin context

**Channel**: A context delivery edge — `skill:` references, `node:` stream promotions, and file globs under workflow runtime artifacts. Three-tier model: convention layer → project layer (`.graph-scheduler/config.json` context) → graph channels; effective ambient context = one deterministic merge, identical for every phase. _Avoid_: input file, context file, read set

**Contract**: A declaration — the skill's `## Context Requirements` four-subsection contract (From upstream / Reference skills / Operation classes / Files); the machine-parseable source of truth that graph `channels` resolve against at dispatch (three-way: channel = delivery edge, block = prompt artifact). _Avoid_: context section, requirements header

**Block**: An assembled prompt artifact — `## Upstream:` / `## Reference:` / `## File:` / `## Constraints` sections prepended to the node prompt at dispatch, materializing contract entries and channel deliveries. _Avoid_: context, prompt chunk

**Route**: Branch marker on a flow phase — approval branch option activates the route via `branchTo`; unselected route members never activate. _Avoid_: branch, conditional path

**Routing**: The YAML routing actions array — the approval phase's `routing:` field (`routing.actions`), written ONLY for explicit branch-route selection (default card = Accept + free input + AI-generated options); delivered agent-side as `routingActions`. _Avoid_: routingActions (NodeDetail spelling), route (membership field)

**routingActions**: NodeDetail spelling of `routing` — the approval phase's decision routing actions array as delivered agent-side; replaces the deprecated `routes` approval field. _Avoid_: routing (YAML spelling), routes (deprecated)

**Run state**: Scheduler-owned per-node execution facts — status, retryCount, timestamps, routing. Progress only; node CONTENT lives in the agent session (platform-persisted transcript; ADR 0143). _Avoid_: run stream (deleted, ADR 0142), output file, run-state content

**Output contract**: Declared field list a main phase emits — the report the node produces in its session (platform-persisted), consumed by downstream nodes via channels (ADR 0143). _Avoid_: output spec, output fields

**retryCount**: Single counter name for node retries — JUMP increments it (never zeroed) and gate jump conditions bound auto-rework against it (ADR 0046); `retryAttempt` deprecated/removed wording — same counter. _Avoid_: retryAttempt

**Flow**: Load-time composition via `use` — a phase referencing another graph's phases; flattened at load, depth cap 5 (ADR 0043). _Avoid_: subgraph, nested graph

**Registry**: Graph registry (`graphs/registry.json`) — scenario name → graph file path mapping. Builtin graphs + project graphs (`.graph-scheduler/graphs/`) merged, same-name graphs: project overrides builtin. _Avoid_: catalog, index

**Builtin graph**: Taskflow YAML graph pre-installed by graph-scheduler, stored in `packages/graph-scheduler/graphs/`, registered via registry.json. _Avoid_: system graph, default graph

**Domain index**: `docs/domains.md` — fine-grained DDD domain standard + index (one domain per skill/graph/feature point). Governs "who owns what"; glossary governs term disambiguation; no duplication. _Avoid_: domain tree, domains directory (deleted, ADR 0090)

**ADR**: Architectural decision record in `docs/adr/` — sequential numbering, status state machine (accepted/superseded/deprecated), fold-on-supersede to `docs/adr/archive/` via atom-doc-lifecycle. _Avoid_: decision log, RFC

**Spec**: OpenSpec delta specification (`openspec/specs/`) — requirements with scenarios, per-capability; changes propose deltas, archive syncs them into main specs. _Avoid_: design doc, PRD (deprecated scratch form)

**Change**: OpenSpec change proposal (`openspec/changes/<name>/`) — proposal + delta specs + design + tasks; apply phase implements, archive phase folds into main specs. _Avoid_: feature branch, issue

**Taskflow YAML**: Graph definition format (`.taskflow.yaml`) — `name`, `context`, `phases` with dependsOn/channels/routing/route; validated at graph load (ADR 0049). _Avoid_: workflow YAML, scenario file

**Constraints**: Project rules in `.graph-scheduler/constraints.md` `## Rules`, compiled into `.graph-scheduler/constraints.json` (compiled-artifact protocol), injected as `## Constraints` block on every node via `$load-constraints`. _Avoid_: rules file (v1), instructions

**Decision UI / approval()**: Platform decision primitive — single decision per call, mode-aware: manual/absent → card; auto + recommendation → execute it; auto without recommendation → card. Absorbs question(). _Avoid_: question(), confirm dialog

**Interview()**: Multi-turn consensus conversation — two modes (consensus / solve); turns via approval() without recommendation — cards in any mode, never auto-skipped. _Avoid_: quiz, Q&A

**Judge()**: One-shot lightweight-model judgment — constrained answer (`true`/`false`); gate jump condition evaluation; failure → conservative default (no hit). _Avoid_: eval, gate decision

**End action**: Approval decision action `IApprovalDecision.action: 'end'` — completes the run immediately (no end node); agent-side spelling of the same mechanism as endRun. _Avoid_: terminate, cancel

**endRun**: `graph_advance` boolean param (`endRun: true`) — completes the run immediately; MCP-side spelling of the same run-completion mechanism as the approval end action. _Avoid_: end flag, end node

**HLT Registry**: High-Level Tool Registry (atom-kernel) — closed set of registered tool calls `{ intent, tool, args, bound }`; scenario structure: registry key = (target domain x operation) -> exactly one adapter + obligations + n/a rules (in-project code keeps the two-plane chain; platform-native adapters for out-of-project/special-type domains; run = platform shell; compress = headroom-ai platform-neutral; utility classes optional). _Avoid_: tool config, MCP contract (merged into kernel, ADR 0120)

**Two-plane model (demoted)**: In-project-code domain chain — jcodemunch query head (locate/search/analyze, read-only) + serena mutation/ground-truth (write/verify sole, zero fallback); no longer a global registry mandate (ADR 0128 revised, ADR 0138 scenario table). _Avoid_: read/write split, dual tooling

**Estate maintenance**: Doc estate upkeep — index (domains.md), derived-view (README), normative (docs/ family), contract (openspec/specs) classes; estate-maintain graph dispatches workstreams (domains-index / specs-sync / adr-align). _Avoid_: doc sync, docs upkeep

**Guide file**: Navigation map and process status record — deprecated (orchestrate removed wholesale with root `skills/`, ADR 0056). _Avoid_: plan file, status doc

**Orchestrate**: Legacy root skill (deleted, ADR 0056) — the old coordinator model replaced by the graph system. _Avoid_: coordinator, main-flow

**Skip-checkpoint**: Dispatch parameter (deleted, ADR 0056) — when enabled, the sub-agent returns without triggering the checkpoint gate. _Avoid_: (concept removed — do not reference)
