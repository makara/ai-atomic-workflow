# task-templates Specification

## Purpose

The builtin task-template capability — compiled-in task texts (handoff result report, optional startup step) live as standalone TS modules in a dedicated directory with a registration surface, so adding future builtin templates never requires editing the compiler.

## Requirements

### Requirement: Builtin task templates SHALL live in a dedicated template directory

MODIFIED: the builtin task-template directory (`src/task-templates/`) and its index registration surface remain — the mechanism is retained per user ruling. The `TASK_TEMPLATES` registration list enumerates the live templates (`handoff` + `startup` + `router` + `scope-entry` + `adopting`) — `adopt-scope` is removed (adopt-scope-and-handler-blocks, ADR 0247: the adoption goal is already confirmed by the framework's scope-entry + requirement accept loop, so the second atom-scope-interview node is deleted), and the `loop` template module is retired with the flow self-edge replacement (loop semantics are graph-interpretation, never a task template). Adding a future builtin template still requires a new module file + an index export only (no compiler edits).

#### Scenario: Registration list enumerates the live templates

- **WHEN** the `TASK_TEMPLATES` list is read
- **THEN** it SHALL enumerate the live templates (`handoff` + `startup` + `router` + `scope-entry` + `adopting`)
- **AND** no delegation template, no loop template, and no adopt-scope template SHALL be exported

#### Scenario: New template needs no compiler edit

- **WHEN** a new builtin task template is added
- **THEN** the addition SHALL be a new module file in `task-templates/` plus an index export and a `TASK_TEMPLATES` list entry
- **AND** the compiler source SHALL remain unmodified

#### Scenario: Loop template absent from registry

- **WHEN** the template registry is enumerated
- **THEN** `loop` SHALL NOT appear — only `handoff`, `startup`, `router`, `scope-entry`, `adopting`

#### Scenario: Loop task text never injected

- **WHEN** a graph compiles
- **THEN** no compiled node SHALL carry loop-template task text (loop = flow self-edge)

#### Scenario: Adopt-scope template absent from registry

- **WHEN** the template registry is enumerated
- **THEN** `adopt-scope` SHALL NOT appear — only `handoff`, `startup`, `router`, `scope-entry`, `adopting`

### Requirement: Handoff template SHALL be the zero-parameter session contract

MODIFIED: the handoff task template SHALL be a zero-parameter function (`handoffTaskTemplate()`) producing the session contract: assemble the two-element result (`tasks_done` / `outputs`) from the members' `node:` channel outputs and return it to the session (the node report). The template SHALL NOT contain a report path, SHALL NOT instruct a file write, and SHALL NOT reference the deterministic-path mechanism (deleted). The two-element contract words (`tasks_done` / `outputs`) and the typed-pointer output contract SHALL remain verbatim. Parameterization SHALL NOT weaken the zero-parameter handoff contract — the function stays callable with zero args. The session-contract wording SHALL be single-sourced in `task-templates/handoff.ts`: skills (atom-kernel, atom-pilot) SHALL reference the template as the contract source and SHALL NOT re-encode the result-report wording (debt Card 15/23 resolved). The per-level `<composing>/__handoff` synthesis SHALL NOT exist — composition is deleted, so only the root `__handoff` remains.

#### Scenario: Handoff text carries the session contract

- **WHEN** the handoff template is invoked
- **THEN** the returned text SHALL be non-empty, SHALL contain `tasks_done` and `outputs`
- **AND** SHALL NOT contain a report path, a file-write instruction, or a path-derivation instruction

#### Scenario: Handoff never asks the user

- **WHEN** the handoff template is invoked
- **THEN** the returned text SHALL NOT contain `Interview:`/`confirm:` user-confirmation tokens

#### Scenario: Contract wording single-sourced

- **WHEN** the handoff result-report contract wording is located across atom-kernel, atom-pilot, and task-templates
- **THEN** the canonical wording SHALL exist only in `task-templates/handoff.ts`; the skills SHALL reference it, not duplicate it

#### Scenario: No per-level handoff synthesis

- **WHEN** a graph compiles
- **THEN** exactly one `__handoff` node SHALL be synthesized at the root — no `<composing>/__handoff` member exists (composition is deleted)

### Requirement: Template texts SHALL be directly contract-tested

MODIFIED: the template modules SHALL be covered by direct contract tests (importing the template functions), independent of the dispatch chain: the handoff template SHALL yield non-empty task text containing the two-element report contract words (`tasks_done`, `outputs`) and SHALL remain interaction-compatible (self-decide, no user-question tokens); the startup template SHALL name the constraints artifact, serena activation, and jcodemunch indexing; the router template SHALL name `graph_assets`, `graph_start`, and the path list; each of the 5 node templates (scope-entry / review-accept / adopt-scope / adopting / adopt-accept) SHALL yield non-empty task text naming its declared skill contract; the index SHALL export exactly the templates enumerated in `TASK_TEMPLATES`, one per file. Loop-template tests SHALL be removed with the retired module.

#### Scenario: Handoff text contract asserted

- **WHEN** the handoff template is invoked
- **THEN** the returned text SHALL be non-empty, SHALL contain `tasks_done` and `outputs`
- **AND** SHALL NOT contain `Interview:`/`confirm:` tokens, a report path, or a file-write instruction

#### Scenario: Startup text contract asserted

- **WHEN** the startup template is invoked
- **THEN** the returned text SHALL be non-empty, SHALL name the constraints artifact (`.graph-scheduler/constraints.json`), serena activation, and jcodemunch indexing
- **AND** SHALL NOT contain `Interview:`/`confirm:` tokens, a report path, or a run identity

#### Scenario: Registration completeness asserted

- **WHEN** the template contract tests run
- **THEN** every index export SHALL appear in `TASK_TEMPLATES` and every list entry SHALL resolve to an export — any mismatch SHALL fail the tests

#### Scenario: Router text contract asserted

- **WHEN** the router template is invoked with `{ paths: [a, b] }`
- **THEN** the returned text SHALL be non-empty, SHALL name `graph_assets`, `graph_start`, and both candidate paths
- **AND** SHALL NOT contain `Interview:`/`confirm:` tokens

#### Scenario: Per-node template text asserted

- **WHEN** each of the 5 node template functions is invoked
- **THEN** the returned text SHALL be non-empty and SHALL name the node's execution contract (scope interview per atom-scope-interview / grilling / requirement confirmation)
- **AND** SHALL NOT contain `Interview:`/`confirm:` tokens where the template is self-decide

#### Scenario: One-template-per-file asserted

- **WHEN** the template contract tests run
- **THEN** every module file in `src/task-templates/` (excluding `index.ts`, `contracts.ts`) SHALL export exactly one template function
- **AND** every index export SHALL appear in `TASK_TEMPLATES` and every list entry SHALL resolve to an export — any mismatch SHALL fail the tests

#### Scenario: Loop template test removed

- **WHEN** the template contract tests run
- **THEN** no loop-template assertion exists — the retired module has no test surface

### Requirement: Startup template SHALL declare the heavy startup steps

the `startup` task template SHALL be a compiled-in content asset (module in `src/task-templates/`, exported via the index registration surface) whose task text instructs the executing agent to run the heavy startup steps once, in order: (1) load the project constraints compiled artifact (`.graph-scheduler/constraints.json`) into the session — every downstream node's `## Constraints` block is assembled from this session copy by the handler; (2) run serena `activate_project` (LSP code navigation ready); (3) run jcodemunch `index_folder` (code index ready). The template SHALL be self-decide (no `Interview:`/`confirm:` tokens) and SHALL NOT reference a report path, run identity, or any graph-specific parameter.

#### Scenario: Startup node loads constraints into session

- **WHEN** the startup template node executes
- **THEN** the node SHALL load `.graph-scheduler/constraints.json` into the session (once)
- **AND** downstream nodes' `## Constraints` blocks SHALL be assembled from that session copy (no per-node file reads)

#### Scenario: Startup node activates serena and indexes

- **WHEN** the startup template node executes
- **THEN** the node SHALL run serena `activate_project`
- **AND** SHALL run jcodemunch `index_folder`

### Requirement: Template functions SHALL accept parameters

The `TASK_TEMPLATES` template functions SHALL accept an optional args argument (`(args) => string`); a template MAY consume the phase's `template_args` to compose its task text. The `startup` and `handoff` templates SHALL remain parameter-free — the same signature SHALL accept zero args (compatibility with the existing call sites). The task text SHALL be the template output with the args applied — explicit `task` on a template phase SHALL remain rejected.

#### Scenario: Router template consumes template_args

- **WHEN** the router template function is invoked with `{ paths: [openspec-apply, openspec-engineer] }`
- **THEN** the returned task text SHALL name both candidate graphs and the selection/launch instructions

#### Scenario: Zero-param call sites unchanged

- **WHEN** the startup or handoff template function is invoked without args
- **THEN** it SHALL return the same static text as before (no args, no graph-specific content)

### Requirement: Router template SHALL be a registered builtin template

MODIFIED: `TASK_TEMPLATES` SHALL enumerate `handoff`, `startup`, `router`, `scope-entry`, `adopt-scope`, `adopting`. The router template module SHALL live in `src/task-templates/` (module file + index export + list entry — no compiler edits beyond the existing call-site signature). The router template SHALL additionally accept an optional data parameter `questions: [{ prompt, condition }]` — caller-declared extra judgment entries (accept-node consolidation, ADR 0246). When present, the router task text SHALL instruct: after collecting the sibling-run result, present each caller-provided prompt to the user; the user's choice SHALL be reported as the flow `condition` value on advance (transition-table routed — the edge vocabulary lives in the calling graph's `flow` block). The template SHALL encode zero accept semantics — it only knows the node has additional judgment and corresponding flow edges; concrete prompt content and condition vocabulary SHALL come from the calling graph YAML. Absent `questions` → current pure-router behavior unchanged. Direct contract tests SHALL assert: the router text SHALL be non-empty, SHALL name `graph_assets`, `graph_start`, and the path list; with questions SHALL name the caller prompt + condition mapping; without questions SHALL NOT contain the extra-judgment instructions.

#### Scenario: Registration list includes router

- **WHEN** the `TASK_TEMPLATES` list is read
- **THEN** it SHALL enumerate `handoff` + `startup` + `router` (+ the per-node templates)

#### Scenario: Router text contract asserted

- **WHEN** the router template is invoked with a paths list
- **THEN** the returned text SHALL be non-empty, SHALL name `graph_assets` and `graph_start`, SHALL enumerate the paths

#### Scenario: Router is the only nesting form

- **WHEN** a graph expresses nested execution
- **THEN** it SHALL declare `template: router` with `template_args.paths` — the `use` field SHALL NOT exist in the schema and SHALL be rejected at load if present

#### Scenario: Router text carries caller-declared questions

- **WHEN** the router template is invoked with `{ paths: [arch-review], questions: [{ prompt: "Requirement ready?", condition: "revise" }] }`
- **THEN** the returned text SHALL name `graph_assets`, `graph_start`, the path list, SHALL present the caller-provided prompt to the user, and SHALL map the user choice to the `revise` condition value reported on advance

#### Scenario: Router without questions stays pure router

- **WHEN** the router template is invoked with `{ paths: [a, b] }` only
- **THEN** the returned text SHALL NOT contain the questions-presentation instructions (auto-select / candidate-card only, unchanged)

### Requirement: Contract-prose templates single-source repeated graph contracts

The task-template directory SHALL add template content single-sourcing the contract prose currently re-encoded in multiple builtin graphs: (1) the grilling encapsulation contract (mandatory rounds — whole frontier per round, never zero-question, never auto-gated; output shape `{ decisions, shared_understanding }`; closing question "Anything to add?") — the graph task text SHALL reference the template or the grilling skill pointer instead of re-encoding the contract (F3 debt, ADR 0244); (2) the change-name blocked-resolution rule (never ask — `{args.changeName}` → openspec list → single active → blocked + candidates) — single-sourced, graphs reference it (F10 debt); (3) the direct-end wording — the `direct end: <label>` token stays in graph task text; the surrounding contract prose lives in atom-kernel §Direct end (single home, F6 debt); (4) spec-standards references — the "Spec standards per affected domain — per atom-skill-spec §Domain Spec Standards Mapping" line is a pointer to atom-skill-spec, not a re-encoding (F9 debt). New templates SHALL follow the existing registration surface (new module file + index export + `TASK_TEMPLATES` list entry — zero compiler edits).

#### Scenario: Grilling contract referenced not re-encoded

- **WHEN** a graph task text needs the grilling encapsulation contract
- **THEN** the task text SHALL reference the single source (template or skill pointer) — the contract body appears in exactly one place in the repo

#### Scenario: Blocked-resolution rule single-sourced

- **WHEN** a graph consumes a change name via `{args.changeName}`
- **THEN** the resolution rule SHALL be single-sourced — graphs reference it, never re-encode the rule text

#### Scenario: Direct-end token remains, prose single-homed

- **WHEN** a graph declares `direct end: <label>`
- **THEN** the token stays in task text (machine-derived completion) and the contract prose lives in atom-kernel §Direct end — no duplicate prose in graph files

#### Scenario: New template registers without compiler edits

- **WHEN** a contract-prose template is added
- **THEN** the addition SHALL be a new module file in `task-templates/` plus an index export and a `TASK_TEMPLATES` list entry — the compiler source SHALL remain unmodified

### Requirement: Framework-chain content parameterized

MODIFIED: the shared framework chain previously single-sourced in `framework-chain.ts` (scope-entry, adopting, review-accept, adopt-scope, adopt-accept) SHALL be single-sourced as standalone node templates (one file per node — the factory form is deleted). The accept-node consolidation (ADR 0246) deletes `review-accept` / `adopt-accept`; the adopt-scope-and-handler-blocks change (ADR 0247) deletes `adopt-scope` — the remaining shared-chain node templates are `scope-entry` / `adopting` (adopting carries the nothing-to-adopt direct end and absorbs the adoption-goal topics into its grilling first-round frontier); the requirement confirmation is a caller-declared accept loop on the requirement router node (`template_args.questions`). The two framework graphs (`arch-review-loop` / `first-principles-dev`) SHALL declare the node template directly (`template: scope-entry` etc.); the terminal diverge…

#### Scenario: Framework graphs reference shared chain

- **WHEN** `arch-review-loop` or `first-principles-dev` task text is read
- **THEN** the shared-chain nodes SHALL declare the standalone node templates (`template: scope-entry` / `adopting`) — no `template: framework-chain`, no `template_args.node`, no `template: review-accept` / `adopt-accept` / `adopt-scope`
- **AND** the same node id's task text is not byte-duplicated across the two graphs (single source per node template)

#### Scenario: Terminal divergence parameterized

- **WHEN** the scope-entry template is invoked for each framework graph
- **THEN** the terminal difference (round-report vs fp-doc-update) SHALL arrive via `template_args.terminal` — interpolated data, not a discriminator

### Requirement: One template one file — factory pattern banned

MODIFIED: each node task template SHALL be a standalone module in `src/task-templates/` exporting exactly one template function. The factory pattern is banned for node templates: no single-file multi-template switch dispatch, no variant-selection discriminator parameters. The per-node template set SHALL drop `review-accept` / `adopt-accept` (accept-node consolidation, ADR 0246 — the adopting grilling consensus IS the adoption confirmation; the requirement confirmation is a caller-declared accept loop on the requirement router node via the `questions` data parameter) and `adopt-scope` (ADR 0247 — the adoption goal is confirmed by the framework's scope-entry + requirement accept loop + adopting grilling; the second atom-scope-interview node is pure redundancy). A template function MAY consume data parameters (values interpolated into a single template text — `router` `paths` + `questions`, `scope-entry` `terminal`); data interpolation is not a factory.

#### Scenario: Framework-chain factory deleted

- **WHEN** the `src/task-templates/` directory is enumerated
- **THEN** no `framework-chain.ts` module exists — replaced by `scope-entry.ts` / `adopting.ts` (review-accept / adopt-accept / adopt-scope deleted), each exporting exactly one template function
- **AND** no template function dispatches among multiple node texts via a discriminator parameter (no `template_args.node`)

#### Scenario: Accept templates absent from the template surface

- **WHEN** the `src/task-templates/` directory is enumerated
- **THEN** no `review-accept.ts` / `adopt-accept.ts` / `adopt-scope.ts` module exists; `TASK_TEMPLATES` SHALL enumerate `handoff` + `startup` + `router` + `scope-entry` + `adopting`

#### Scenario: Adopting declares the nothing-to-adopt direct end

- **WHEN** the adopting template is invoked
- **THEN** the returned text SHALL declare `direct end: end the round` and SHALL name the no-content rule (change_name empty → zero side effects)

#### Scenario: Registration list 1:1 with files

- **WHEN** the `TASK_TEMPLATES` list is read
- **THEN** it SHALL enumerate `handoff` + `startup` + `router` + `scope-entry` + `adopting`
- **AND** each entry SHALL resolve to one module's single export (bidirectional completeness asserted by contract tests)

#### Scenario: Data parameters interpolated, not dispatch

- **WHEN** the router template is invoked with `{ paths: [a, b] }` or the scope-entry template with `{ terminal: round-report }`
- **THEN** the returned text SHALL interpolate the data into a single template text
- **AND** SHALL NOT select among template variants
