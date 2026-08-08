# atom-kernel Specification

## Purpose

Platform primitives — task()/question()/interview()/judge() + graph tool detection (platform layer). Asset: `packages/graph-workflow/skills/atom-kernel/SKILL.md`.

## Requirements

### Requirement: task() — sub-agent dispatch

System SHALL provide `task()` for dispatching sub-agents with a 4-field contract. Tasks SHALL be batched in `tasks[]` with shared `context`. Each sub-agent receives self-contained instructions with explicit acceptance criteria. The contract SHALL describe dispatch behavior without naming a platform tool. Platform spellings SHALL live in a single spelling table within atom-kernel: OMP maps `task()` to the `task` tool; other platforms map their equivalents.

#### Scenario: Single task dispatches sub-agent

- **WHEN** `task({ i: "Running lint", context: "# Constraints: use bun", tasks: [{ name: "LintCheck", task: "# Target: src/\n# Change: run linter\n# Acceptance: zero errors" }] })` is called
- **THEN** a sub-agent SHALL be spawned with the specified task instructions
- **THEN** the sub-agent SHALL receive the shared context as background
- **THEN** the agent ID SHALL be returned for result retrieval via `agent://<id>`

#### Scenario: Batched tasks dispatch in parallel

- **WHEN** `task()` receives multiple items in `tasks[]`
- **THEN** all sub-agents SHALL be spawned concurrently
- **THEN** shared `context` SHALL apply to every task in the batch

#### Scenario: 4-field contract embedded in sub-agent task

- **WHEN** a sub-agent task includes the 4-field contract
- **THEN** `target-skill` SHALL name the skill the sub-agent loads by plain name (required)
- **THEN** `auxiliary-skills` SHALL list extra skills to load, or `[]` if none (required)
- **THEN** `target-skill-input` SHALL describe what the skill works on — spec, ticket, scope (optional)
- **THEN** `input-paths` SHALL list context files to read, or `[]` if none (optional)

#### Scenario: Routing modes control handoff

- **WHEN** task completes in default handoff mode — agent SHALL verify results and present a `## Decision Request` checkpoint card for user routing
- **WHEN** task completes in skip-checkpoint mode — agent SHALL verify and return to caller directly; caller SHALL checkpoint later

#### Scenario: Platform spelling table maps contract to tool

- **WHEN** a platform does not expose the OMP `task` tool
- **THEN** atom-kernel's spelling table SHALL document that platform's equivalent mapping
- **AND** skills SHALL NOT need modification

### Requirement: question() — single-decision UI

System SHALL provide `question()` for presenting a single decision to the user. Eight format rules govern structure, and a Decision Card maps question fields to approval routing actions. Platform spellings SHALL live in the spelling table (OMP: `ask` tool).

#### Scenario: question presents single decision

- **WHEN** `question({ header: "Token refresh strategy", options: [{ label: "Polling", description: "Timer-based expiry check" }, { label: "On-demand", description: "Refresh on 401" }], custom: true })` is called
- **THEN** the user SHALL see a decision card with the header as topic, options as routing actions
- **THEN** pre-call text SHALL include background, option meanings, and recommendation — three parts in the same message
- **THEN** exactly one decision SHALL be presented per call

#### Scenario: Eight format rules enforced

- **WHEN** `question()` is called
- **THEN** Rule 1: header SHALL be a noun phrase ≤30 chars — topic, not outcome
- **THEN** Rule 2: first option SHALL be the recommended answer, label as concrete answer phrase
- **THEN** Rule 3: description SHALL be single line, may note next step
- **THEN** Rule 4: pre-call text SHALL have background + option meanings + recommendation — three parts, same message
- **THEN** Rule 5: body SHALL be forbidden — no extra content after the call
- **THEN** Rule 6: `custom` SHALL be mandatory `true`
- **THEN** Rule 7: one question per call
- **THEN** Rule 8: no control characters (`\r`, `\t`, `\n`) in any field

#### Scenario: Decision Card maps to question fields

- **WHEN** an approval phase defines routing actions
- **THEN** `topic` SHALL map to `header`
- **THEN** `routingActions[].label` SHALL map to `options[].label`
- **THEN** `routingActions[].description` SHALL map to `options[].description`
- **THEN** `routingActions[].action` SHALL drive decision routing (continue/retry/jump)
- **THEN** `pre_text` SHALL be the pre-call text

#### Scenario: Custom input carries free-text semantics

- **WHEN** user provides free-text via `custom: true`
- **THEN** the input SHALL be recorded as `note` in the `ApprovalDecision`
- **THEN** `note` semantics vary by action: `continue` → recorded remark, `retry` → inject into upstream context, `jump` → potential target override

### Requirement: judge() — one-shot judgment primitive

System SHALL provide `judge()` as a one-shot LLM judgment primitive: a single lightweight-model judgment returning a constrained answer (e.g. `true`/`false`), used for when-guard and gate-eval evaluation. `judge()` SHALL fail conservatively — an ambiguous when-guard result SHALL execute the phase, and a gate-eval no-match SHALL route downstream. Platform spellings SHALL live in the spelling table (OMP: `completion(…, model="smol")`); skills SHALL invoke the `judge()` contract, never a platform spelling.

#### Scenario: when-guard judgment uses judge()

- **WHEN** atom-phase-handler evaluates a when guard
- **THEN** it SHALL issue a `judge()` call per the kernel contract
- **AND** no direct `completion(…, model="smol")` spelling SHALL appear in the handler

#### Scenario: Gate eval uses judge()

- **WHEN** atom-phase-handler evaluates gate eval conditions
- **THEN** the judgment SHALL be issued via the `judge()` contract
- **AND** judgment failure SHALL degrade conservatively — no-match routes downstream, ambiguous when-guard executes

### Requirement: interview() — multi-turn consensus

System SHALL define `interview()` as a behavior contract for multi-round consensus conversations with two modes (consensus mode and solve mode) sharing one rule set. The contract SHALL stay decoupled from platform spellings — all questions SHALL go through the `question()` contract. Eight behavior rules govern the interview process. `interview()` is NOT a callable function — it is implemented by the agent using `question()` one turn at a time.

Consensus mode: confirm goal → decision rounds → `{ decisions }`. Solve mode: confirm goal → research? (default true) → think → decision rounds → reject → re-think → repeat until accepted → `{ goal, findings?, design, consensus }`. Solve mode SHALL apply when `research: true` or the goal produces a design/solution; the mode SHALL be selected by the caller, not inferred.

Solve-mode additions SHALL apply on top of rules 1-8: research before think (when research: true — load `research`, look up reference specs, patterns, constraints); think exhaustively (complete design covering structure, naming, edges, guards, edge cases); re-think on reject (revise design, re-interview affected decisions only — confirmed decisions SHALL NOT be re-asked).

#### Scenario: interview conducts multi-turn consensus

- **WHEN** agent implements `interview({ goal: "Choose database strategy", context: "..." })`
- **THEN** every aspect of the goal topic SHALL be covered — comprehensive coverage, no skipped dimensions
- **THEN** each branch of the decision tree SHALL be exhausted before stopping
- **THEN** dependencies between decisions SHALL be resolved in order — prerequisite before dependent
- **THEN** exactly one question SHALL be asked per turn via `question()`

#### Scenario: Recommendation drives each question

- **WHEN** agent presents a decision question
- **THEN** the recommended answer SHALL be the first option
- **THEN** the recommendation SHALL be derived from context analysis

#### Scenario: Fact lookup avoids unnecessary questions

- **WHEN** a fact is discoverable from the environment (filesystem, tools, skills)
- **THEN** the agent SHALL look it up — not ask the user

#### Scenario: Goal consensus gate

- **WHEN** `interview()` starts
- **THEN** the agent SHALL first confirm shared understanding of the goal itself
- **THEN** the interview SHALL NOT proceed until goal consensus is reached

#### Scenario: Zero-question degradation

- **WHEN** context already covers all aspects of the goal and no clarification is needed
- **THEN** `interview()` SHALL return consensus directly without asking questions
- **THEN** this is a natural consequence of rules 1-8 — not an independent rule

#### Scenario: Returns structured consensus

- **WHEN** interview completes in consensus mode
- **THEN** the return value SHALL be `{ decisions: [{ decision, rationale }] }` — structured summary of agreed points

#### Scenario: Solve mode runs complete loop

- **WHEN** agent implements `interview({ goal: "Design auth module", research: true, context: "..." })` in solve mode
- **THEN** the flow SHALL be: confirm(goal) → research → think → interview(details) → repeat until accepted
- **THEN** goal consensus SHALL be confirmed before any work begins
- **THEN** when `research: true` — agent SHALL load `research` and look up reference specs, patterns, constraints
- **THEN** think step SHALL design a complete solution covering structure, naming, edges, guards, edge cases

#### Scenario: Solve mode handles rejection

- **WHEN** user rejects a design decision during interview
- **THEN** agent SHALL return to think step, revise design, and re-interview affected decisions only
- **THEN** confirmed decisions SHALL NOT be re-asked

#### Scenario: Solve mode returns structured solution

- **WHEN** all design decisions are confirmed
- **THEN** return value SHALL be `{ goal, findings?, design, consensus }`
- **THEN** `findings` SHALL be present only when `research: true`
- **THEN** `consensus` SHALL record every confirmed decision with rationale

### Requirement: Primitives triangle — layered composition

The primitives SHALL form a layered dependency where each level builds on the one below. `question()` is the atomic unit; `interview()` composes multiple `question()` calls and carries both consensus and solve modes. There SHALL be exactly one conversation contract (`interview()`) — no standalone `solve()` contract, and no `solve()` references in skill documents or graph task texts (grep-verifiable zero residue).

#### Scenario: Each level composes the level below

- **WHEN** `interview()` runs — it SHALL use `question()` per turn
- **THEN** `task()` is orthogonal — it dispatches sub-agents that may themselves use any primitive

#### Scenario: No solve() residue in consumers

- **WHEN** an agent greps `packages/graph-workflow/skills/**/SKILL.md` and `packages/graph-scheduler/graphs/*.taskflow.yaml` for `solve()`
- **THEN** the only matches SHALL be historical references (reports/ADRs) — zero matches in live skill documents and graph task texts

### Requirement: atom-kernel SHALL NOT declare loading writing-great-skills

atom-kernel is a runtime-primitives reference skill (platform spellings, graph-scheduler tool detection, judge/task/question/interview contracts). It SHALL NOT declare loading skill `writing-great-skills` — an authoring-format skill with no content dependency on the kernel. The runtime-constraints header SHALL carry at most the `**Layer**` declaration; loading declarations SHALL be limited to skills the kernel body actually consumes.

#### Scenario: Kernel runtime constraints contain no authoring skill

- **WHEN** atom-kernel SKILL.md is inspected for loading declarations
- **THEN** `writing-great-skills` SHALL NOT appear in its runtime-constraints header
- **AND** the header SHALL retain `**Layer**: atom — runtime primitives.`

### Requirement: atom-kernel SHALL keep conditional research loading

`interview()` solve mode with `research: true` SHALL load skill `research` before the think step. This conditional loading declaration SHALL remain in atom-kernel.

#### Scenario: Solve mode research loads research skill

- **WHEN** an agent runs `interview()` solve mode with `research: true`
- **THEN** the agent SHALL load skill `research` before reasoning about the solution

### Requirement: interview() section SHALL NOT carry upstream descriptive references

The interview() behavior-contract section SHALL NOT list upstream skills (grilling, adopt-with-docs, domain-modeling) as references or loading declarations. The contract SHALL stand alone; upstream provenance notes are not part of the kernel's dependency surface.

#### Scenario: Kernel body contains no upstream skill mentions in interview contract

- **WHEN** the kernel's interview contract section is scanned
- **THEN** it contains no references to grilling, adopt-with-docs, or domain-modeling

### Requirement: Spelling table SHALL include the opencode platform row

atom-kernel §Platform Spellings SHALL carry an opencode row covering all three primitives: `task()` maps to the Task tool with agent vocabulary `build`/`plan`/`general`/`explore`/`scout` and platform default `general`; `question()` maps to the platform's question primitive; `judge()` maps to the platform's one-shot completion primitive. The row SHALL also name the platform's default agent type for hint fallback.

#### Scenario: opencode row present

- **WHEN** a reader loads atom-kernel §Platform Spellings
- **THEN** a row for opencode SHALL list the Task-tool mapping, the five built-in agent names, and default agent `general`

#### Scenario: New platform follows the row pattern

- **WHEN** another platform is added later
- **THEN** the single-row extension point (per ADR 0080) SHALL suffice — one new table row, no skill changes

### Requirement: Agent-hint availability SHALL be judged against the spellings-table vocabulary

The §Agent Hints consumption rule SHALL define "available" as membership in the current platform's agent vocabulary as listed in §Platform Spellings — not environment intuition. The fallback line SHALL reference the spellings table instead of a hardcoded `task`.

#### Scenario: Availability is vocabulary membership

- **WHEN** a skill evaluates hints `[reviewer, explore, task, general]`
- **THEN** availability of each entry SHALL be checked against the current platform's spellings-table vocabulary
- **AND** the rule text SHALL point at the spellings table as the vocabulary source

### Requirement: Platform default fallback SHALL resolve from the spellings table

A skill dispatching sub-agents with no available hint SHALL fall back to the platform default agent type as defined in atom-kernel §Platform Spellings (OMP: `task`; opencode: `general`) — never a hardcoded single name.

#### Scenario: No available hint on opencode

- **WHEN** a skill dispatches with hints `[reviewer, task]` on the opencode platform (neither available)
- **THEN** the skill SHALL use the opencode platform default `general`
- **AND** dispatch SHALL NOT fail for want of an agent type

#### Scenario: No hints declared

- **WHEN** a main phase declares no `agent` field
- **THEN** skills dispatching sub-agents SHALL use the current platform's default agent type from the spellings table

### Requirement: Tool detection SHALL live in atom-kernel

The graph-scheduler MCP tool-name detection rules (substring match for graph_start/graph_advance/graph_status/graph_list/graph_force_end/graph_jump/graph_init/graph_clean_completed/graph_clean_all) SHALL be inlined in atom-kernel — the platform-primitive layer, available to every graph-execution entry point (users are not required to run atom-pilot). The standalone `atom-tool-detection` skill SHALL be removed; atom-pilot and atom-phase-handler SHALL reference atom-kernel (already loaded as platform primitive), never a standalone detection skill.

#### Scenario: Kernel detects tools inline

- **WHEN** any graph-execution entry point needs graph-scheduler tool names
- **THEN** it SHALL apply the detection rules from atom-kernel's body
- **AND** no `atom-tool-detection` reference SHALL exist anywhere

### Requirement: atom-kernel SHALL drop the 4-Field Contract

atom-kernel's `task()` documentation SHALL NOT contain the 4-Field Contract table (target-skill/auxiliary-skills/target-skill-input/input-paths), Construct Rules, or Routing Modes — no dispatch consumer embeds them. It SHALL keep the `task()` signature, the Agent Hints selection rule, and the Decision Request output format (consumed by graph review nodes).

#### Scenario: Kernel documents live dispatch only

- **WHEN** a reader loads atom-kernel
- **THEN** the task() section SHALL cover signature, hints selection, Decision Request
- **AND** no 4-Field Contract table SHALL exist

### Requirement: todo() — platform-scoped todo lifecycle primitive

atom-kernel §Platform Spellings SHALL include a `todo()` primitive row defining clear semantics: the executing agent's platform todo list is cleared via the platform's native mechanism (oh-my-pi `todo` op `rm`; opencode `todo` op `rm`; RPC `set_todos []`); platforms without a todo tool map to a no-op. The spelling row SHALL cover the clear operation only — node-internal create/update usage stays native platform tooling. Skills SHALL reference the `todo()` contract, never a platform spelling.

#### Scenario: Clear semantics mapped per platform

- **WHEN** a skill or handler needs to clear the platform todo at a node boundary
- **THEN** it SHALL invoke the `todo()` clear contract
- **AND** the spelling table SHALL resolve it to the platform's native clear mechanism

#### Scenario: No-todo platform is a no-op

- **WHEN** the current platform exposes no todo tool
- **THEN** the `todo()` clear SHALL be a no-op with no error

#### Scenario: In-node usage stays native

- **WHEN** a node creates, updates, or completes todo items during its execution
- **THEN** it SHALL use the platform's native todo tooling directly
- **AND** the `todo()` spelling SHALL NOT be required for in-node operations

### Requirement: High-Level Tool Registry section in atom-kernel

`atom-kernel` is the sole home of the High-Level Tool Registry and the tool schema tables (merged from the retired atom-mcp-contract skill): the execution contract for main-phase work. The section defines the step as a registered tool call `{ intent, tool, args, bound }` (unknown tool names fail at analyze; legacy step fields rejected), the bounded evidence loop (default 3, evidence-gap failure), fault tolerance (retry-once → serena FS tier within core classes; visibility checks; intra-serena tier preconditions; serena unavailable → loud failure), the two-tier structure (core classes serena single-tool no fallback / utility classes optional), and the write-verify obligation per the registry `Entry: verify` (serena diagnostics + re-read; register_edit conditional on jcodemunch use). No Atomic Step Protocol chapter exists.

#### Scenario: Step shape declared once

- **WHEN** a main-phase execution contract is needed
- **THEN** the High-Level Tool Registry section in atom-kernel defines the step as a registered tool call `{ intent, tool, args, bound }` and no other skill defines a competing step shape

#### Scenario: Evidence loop bounded

- **WHEN** a step's evidence predicate is unsatisfied
- **THEN** the read loop re-enters only while loop count is below the bound (default 3); exceeding the bound fails the step with an evidence-gap list

#### Scenario: Registry entry supplies execution contract

- **WHEN** a step's execution contract is needed
- **THEN** the tool's registry entry (contract / chain / enforcement / tier views) supplies I/O, verify + conditional index obligations, and the two-tier structure (core = serena single-tool, utility = optional) — no second source exists

#### Scenario: Verify loop mandatory

- **WHEN** a step applies writes
- **THEN** the step verifies per the registry `Entry: verify` (serena diagnostics + re-read) and records verification evidence before reporting success
- **AND** register_edit is recorded while jcodemunch is in use, else `n/a: jcodemunch not in use`

### Requirement: Atomic Step Protocol chapter removed

The `§Atomic Step Protocol` chapter (step shape / evidence loop / execution-end summary / fault tolerance / verify loop / reference boundaries) is deleted from atom-kernel; its residue is the tool-call definition inside the §High-Level Tool Registry intro (the execution unit is a registered tool call `{ intent, tool, args, bound }` — no step layer exists). No skill, channel, constraint, or test references the chapter.

#### Scenario: No orphan reference

- **WHEN** the atom-kernel SKILL.md is scanned
- **THEN** no `# Atomic Step Protocol` chapter heading exists

### Requirement: atom-atomic-step skill removed

The standalone `atom-atomic-step` skill is deleted from the skills package; its content is superseded by the High-Level Tool Registry (ADR 0119). No skill, channel, constraint, or test references the deleted skill.

#### Scenario: No orphan reference

- **WHEN** the skills package is scanned for references to atom-atomic-step
- **THEN** no inbound references exist (outside frozen ADR/spec history text)

### Requirement: atom-mcp-contract skill removed

The standalone `atom-mcp-contract` skill is deleted from the skills package; its content (High-Level Tool Registry, tool schema tables, schema-first protocol) lives in atom-kernel. The atom-phase-handler auxiliary-skills constant lists exactly one reference skill — atom-kernel. No skill, channel, constraint, or test references the deleted skill.

#### Scenario: No orphan reference

- **WHEN** the repository is scanned for references to atom-mcp-contract
- **THEN** no live inbound references exist (outside frozen ADR/spec history text)

#### Scenario: Single auxiliary reference

- **WHEN** any node of any graph is dispatched
- **THEN** the kernel reference content (primitives + registry + schemas) is present in the injected context via the single auxiliary constant

### Requirement: Constraints and docs re-point

`.graph-scheduler/constraints.md` references `atom-kernel §High-Level Tool Registry` for MCP tool usage and main-node execution; CONTEXT.md skills table lists no atom-atomic-step or atom-mcp-contract row and the execution-model paragraph references the registry; built-in skill count reflects the deletions (11).

#### Scenario: Constraint rule valid

- **WHEN** a main node loads project constraints
- **THEN** the MCP/execution rule names a skill that exists and is injected (atom-kernel, auxiliary layer)

#### Scenario: CONTEXT.md accurate

- **WHEN** CONTEXT.md skills table is read
- **THEN** atom-atomic-step and atom-mcp-contract are absent, the execution-model paragraph points at atom-kernel §High-Level Tool Registry, and the built-in skill count is 11

### Requirement: ASP spec files removed

`docs/specs/2026-08-06-atomic-step-protocol.md` and `openspec/specs/atomic-step-protocol/` are removed; their decision history lives in ADR 0116/0119. `openspec/specs/atom-mcp-contract/` is merged into this spec and removed.

#### Scenario: No ASP spec remains

- **WHEN** the docs/specs directory and openspec/specs directory are scanned for atomic-step-protocol or atom-mcp-contract spec files
- **THEN** no `2026-08-06-atomic-step-protocol.md`, no `atomic-step-protocol/` directory, and no `atom-mcp-contract/` directory exist

### Requirement: todo() spelling table carries the state machine

The atom-kernel §Platform Spellings table SHALL document the todo() state-machine semantics (pending/in_progress/completed + optional blocked/cancelled) and per-platform spellings: OMP `todo` tool ops (init/start/done/block/unblock/rm/append/view/drop), opencode `todowrite` full-array replacement, no-todo platform → no-op. In-node creation and updates SHALL use native platform tooling; the spelling table SHALL remain the sole cross-platform reference. The OMP op list SHALL cover the full tool surface the platform exposes — `append` (add items to an existing plan) and `drop` (discard an item) included.

#### Scenario: Spelling table maps both platforms

- **WHEN** a reader looks up the todo() spelling for a platform
- **THEN** the table SHALL give that platform's concrete tool/op form
- **AND** the table SHALL be the only place platform spellings appear in repo content

#### Scenario: OMP op list is complete

- **WHEN** a reader scans the OMP todo op list in the spelling table
- **THEN** it SHALL include `append` and `drop` alongside init/start/done/block/unblock/rm/view
- **AND** every op the platform actually exposes SHALL appear in the list

### Requirement: Tool-call contract schemas in atom-kernel

atom-kernel SHALL document, for each mounted MCP server (serena, jcodemunch, headroom, graph-scheduler), the exact parameter contracts of its high-frequency tools: parameter names, required flags, value domains, semantics, and a canonical invocation example. It SHALL also define the schema-first protocol (parameter names never guessed; contract-missing tool → read full `xd://<tool>` docs before first call) and the failure-recovery chain (validation failure → read schema → repair → retry once → degrade per the registry chain).

#### Scenario: Contract exists for a high-frequency tool

- **WHEN** an agent needs to call `serena_replace_content`
- **THEN** the contract MUST specify `relative_path` (required), `needle` (required), `repl` (required), `mode` (`"literal" | "regex"`, required), and `allow_multiple_occurrences` (optional) with a canonical example

#### Scenario: Contract unknown for a tool

- **WHEN** an agent needs to call an MCP tool not covered by the contract
- **THEN** the schema-first protocol MUST require reading the full `xd://<tool>` docs before the first call, and MUST prohibit guessing parameter names

### Requirement: Index cache consistency after edits

After any file modification while jcodemunch is in use, the agent MUST call jcodemunch `register_edit` to invalidate stale index entries before later nodes rely on code-intelligence results. Executions not using jcodemunch report `n/a: jcodemunch not in use` — the obligation is conditional, never mandatory.

#### Scenario: File edited mid-run

- **WHEN** a node modifies a source file and the execution uses jcodemunch
- **THEN** `register_edit` is invoked for that file so subsequent symbol searches in later nodes return fresh results

#### Scenario: No jcodemunch use means n/a

- **WHEN** the execution does not use jcodemunch
- **THEN** the register_edit obligation SHALL be reported `n/a: jcodemunch not in use`
- **AND** no violation SHALL be recorded

### Requirement: Legacy mcp-* skills removed

The legacy `skills/mcp-serena`, `skills/mcp-jcodemunch`, and `skills/mcp-headroom` MUST NOT exist; their capability is fully absorbed by atom-kernel tool schemas.

#### Scenario: Legacy skills absent

- **WHEN** the repository is scanned for skills
- **THEN** no `mcp-*` skill directories exist under `skills/`

### Requirement: HLT Registry section lean

The High-Level Tool Registry section SHALL stay under ~120 lines (measured post-trim: 113); every normative fact defined once; theory/rationale prose prohibited.

#### Scenario: single plane-down statement

Given the atom-kernel skill file When searching for the plane-down semantics (plane unavailable → fail loudly naming the dependency) Then it appears exactly once, in the Two-plane structure block, and Fault Tolerance contains no duplicate

#### Scenario: no enforcement-marker repetition

Given the atom-kernel skill file When searching for "enforcement:" lines in registry entries Then there is at most one table-intro line stating deferred/n/a status, not per-entry marker lines

#### Scenario: registry validation single-sited

Given the atom-kernel skill file When searching for the registry validation rules (four views) Then they appear once, in the Registry Entries views table, with no restating paragraph

### Requirement: Tool Schemas section lean

The Tool Schemas section SHALL stay under ~280 lines (measured post-trim: 274; 8 high-use tables kept per design); tools with zero references in the skill set or graph flows SHALL NOT carry schema blocks.

#### Scenario: dead schemas removed

Given the atom-kernel skill file When searching for get_symbol_source / check_references / plan_turn schema blocks Then no schema blocks exist for these three tools (chain mentions in Entry: locate permitted)

#### Scenario: graph-scheduler schema single-sourced

Given the atom-kernel skill file When searching for the graph-scheduler tool table Then the kernel carries only a pointer to atom-pilot §MCP Tool Reference and its own §Graph-Scheduler Tool Detection — no duplicated table or examples

#### Scenario: low-use serena tools compressed

Given the atom-kernel skill file When searching for find_declaration / find_implementations / find_file / list_dir / rename_symbol / insert_before_symbol / insert_after_symbol / safe_delete_symbol / create_text_file Then each carries a one-line signature and no param table (inline example permitted)

### Requirement: Solve-mode flow single-sourced

The interview() solve-mode chain SHALL be defined once — the Internal Flow diagram; other sections reference it.

#### Scenario: single solve-mode chain

Given packages/graph-workflow/skills/atom-kernel/SKILL.md When searching for the solve-mode chain (confirm → research → think → interview loop) Then it is fully stated only in the Internal Flow diagram; Mode Selection + Mode Comparison reference it
