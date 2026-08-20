# scenario-tool-hints Specification

## Purpose

Scenario-keyed unified hint layer for the tool discipline: the formal tool set (serena / jcodemunch / platform-native) merges into one hint block per common scenario, prompting the LLM consistently with the full promoted tool-set content — post-hoc as the primary channel with compliant-invocation suppression (a promoted tool used correctly attaches nothing), decision-time static injection as the pre-decision form.

## Requirements

### Requirement: Compliant invocation suppression

Scenario guidance SHALL NOT attach when the caller already used the promoted tool for the scenario: a tool invocation whose tool name belongs to the scenario's promoted tool set and whose result is not error-shaped is compliant, and a compliant invocation SHALL be silent — no hint block appended, no feedback line emitted. The promoted tool set per scenario SHALL be judged by the consumer-supplied display function via inline tool-name sets inside the `HintDisplayFn` (consumer-side data, never hardcoded in SDK core). Compliance for consumer-promoted tools SHALL be evaluated by the display function itself (`ctx.usedTool` matching against its inline sets → returns `null`); SDK-side native compliance (platform-native tool-name sets, CLI-locate tokens, internal-URI exemption class, `rtk` prefix for run) SHALL remain the SDK hard floor. Compliance SHALL be evaluated per tool result; there are no thresholds or cooldowns.

#### Scenario: Promoted tool used correctly

- **WHEN** the caller executes a tool that belongs to the current scenario's promoted set (e.g. `search_symbols` for find) and the result is not error-shaped
- **THEN** the display function recognizes `ctx.usedTool` in its inline set for the scenario and returns `null` — no hint attaches and no feedback emits

#### Scenario: Promoted tool used with error

- **WHEN** the caller executes a promoted tool but the result is error-shaped
- **THEN** the existing error skip applies (no hint attaches) — the error verdict remains the primary skip

#### Scenario: Non-promoted tool used

- **WHEN** the caller executes a tool classified into a scenario but outside the promoted set (e.g. native `grep` for find, native `read` for read, native `write`/`edit`/`ast_edit` for write)
- **THEN** the rendered hint attaches, naming the promoted alternatives

### Requirement: Scenario-keyed hint registry

The registry SHALL be exposed through the SDK `hints` capability (`hints.use(fn)`) in hook mode — the former attach interface (`attachScenarioHints`) and the former standalone `scenarioHints` middleware value stay replaced by the capability. The closed scenario set `{find, read, write, verify, run}`, the per-scenario hint block content (scenario definition, promoted tool set with explicit tool names and usage posture, verification obligations, `Hint: ` prefix), the review exclusion, and the single-source derivation SHALL be preserved. Hint block content SHALL use the explicit DO-NOT form: each block starts with the `Hint: ` prefix and reads `DO NOT use <tool>; use 1) <op> {params} (adapter) 2) <op> {params} (adapter) …` — the `<tool>` SHALL be the exact platform-native instruction that triggered the hint (write / edit / ast_edit / read / grep / glob / bash / lsp / CLI-locate token), never a generic class name such as "write" when the used instruction is `edit`; chain steps SHALL be numbered (`1) … 2) …`, at most three), adapter annotations `(jcm, …)` / `(serena, …)` SHALL name the recommending adapter, and the `→` symbol SHALL NOT appear anywhere in the block (its dual meaning — trigger mapping vs step connector — is removed: the DO-NOT subject carries the mapping, the numbering carries the step order). `/` separates equivalent tools within a step; `; ` separates steps. The block SHALL NOT contain "HLT".

#### Scenario: Find scenario hint block

- **WHEN** a hint is emitted for the find scenario
- **THEN** the hint block names the promoted locate tool set (indexed-target query head — `search_text` / `search_symbols` / `find_references` / `find_importers` — with ground-truth confirmation via the symbolic tools; non-indexed text search; permissive platform-native locate) with usage posture and the ordered operation flow
- **AND** the block leads with `Hint: DO NOT use <used locate tool>; use 1) …` naming the exact trigger instruction (`grep` / `glob` / CLI-locate token) — no generic "locate" subject
- **AND** the chain steps are numbered and the block contains no `→` symbol
- **AND** the block contains no "HLT" string

#### Scenario: Write scenario hint block

- **WHEN** a hint is emitted for the write scenario
- **THEN** the hint block names the promoted mutation engine as the sole write engine for in-project code, the pre-edit consultation tools (`get_blast_radius` / `find_references` / `search_text` / `get_symbol_source` / `get_file_outline`), the verify-after-write obligation, and the index registration obligations — `register_edit` (cache invalidation, trigger "while the index is in use" + explicit n/a condition) AND `index_file` (index freshness, the source-policy post-edit obligation)
- **AND** the block uses `Hint: DO NOT use <used mutation tool>; use 1) …` naming the exact trigger instruction (`write` / `edit` / `ast_edit`) — no generic "write" subject when the used instruction is `edit` or `ast_edit`
- **AND** the chain steps are numbered and the block contains no `→` symbol
- **AND** the block contains no "HLT" string

#### Scenario: Every hint item carries the Hint prefix

- **WHEN** any scenario hint block is emitted on either platform face
- **THEN** its body begins with the literal `Hint: ` prefix (the label is part of the delivered hint text, single-sourced in the block data)

#### Scenario: Registry single source

- **WHEN** any injection surface emits scenario guidance
- **THEN** the emitted text SHALL be derived from the registry entry, never from a parallel local copy

#### Scenario: Registry entry via attach

- **WHEN** a consumer registers scenario-hint content
- **THEN** the registration goes through the SDK `hints` capability (`hints.use(fn)`), with the closed scenario set and the review exclusion unchanged

#### Scenario: Classification closure SDK-owned

- **WHEN** a consumer resolves guidance for a tool execution through the `hints` capability middleware
- **THEN** the scenario key and the SDK-side compliance verdict are produced by the SDK classify primitive used inside the middleware (the ONLY classification standard)
- **AND** the classify primitive derives the key from tool name plus platform-native rules ONLY (native tool-name sets, CLI-locate command tokens, internal-URI exemption class) — the consumer supplies no classification extension table; the consumer's promoted tool names live in the display function's inline sets
- **AND** the consumer contributes display-decision data (inline tool-name sets inside the display function) only, never classification vocabulary or heuristic logic into the SDK

#### Scenario: Review excluded

- **WHEN** a review-role activity (graph review node / review skill) executes
- **THEN** no scenario hint attaches and no review scenario key exists
- **AND** the exclusion is documented in atom-kernel §Tool Discipline

#### Scenario: Hint content traces to reference-source flows

- **WHEN** a hint block body is compared against the reference sources
- **THEN** each named tool and each operation step traces to a `.refs` original flow (file:line cited in the tool-guidance derivation table)
- **AND** no tool name or flow step is invented outside the reference sources

#### Scenario: Index-file tool covered in the extension map

- **WHEN** the consumer display function's inline tool-name sets are inspected
- **THEN** `mcp__jcodemunch_index_file` maps to the write scenario (alongside `register_edit`), so the post-edit freshness tool is no longer an uncovered fail-open entry

#### Scenario: Repo-structure tools classified as reads

- **WHEN** the consumer display function's inline tool-name sets are inspected
- **THEN** `get_repo_outline` and `get_file_tree` map to the read scenario (their source semantics are repo-structure reads), not the find scenario

#### Scenario: Check-references single home

- **WHEN** the consumer display function's inline tool-name sets are inspected
- **THEN** `check_references` is enumerated in exactly one scenario home (verify), with no duplicate find-scenario entry (the atom-kernel tool-schema listing is a parallel discipline surface, not the classification data — the display function's inline sets are the consumer's only classification data)

### Requirement: Post-hoc hints are the primary channel

Scenario guidance SHALL be attached on the post-execution tool-result seam by the SDK `hints` capability middleware — classification and append SHALL execute SDK-side; the display decision (select + render) SHALL be delegated to the consumer-supplied display function. Consumers SHALL NOT re-implement the attachment mechanics. Append-only, at most one hint block per matching NON-COMPLIANT scenario, fail-open; attachment SHALL NOT mutate the tool-result content beyond the append. Compliant invocations SHALL be skipped entirely (see Compliant invocation suppression): the display function receives `compliant: true` and returns `null`.

#### Scenario: Successful read attaches read scenario hint

- **WHEN** a read-classified tool execution completes successfully with the `hints` capability wired on the `tool_result` hook and the invocation is non-compliant (native `read` used, not a promoted read surface)
- **THEN** the display function returns the read scenario hint and the SDK appends it to the result payload on both platform faces
- **AND** the result content is not modified beyond the append

#### Scenario: Failed execution attaches nothing

- **WHEN** a tool execution fails
- **THEN** no scenario hint is attached by the SDK `hints` capability middleware

#### Scenario: Compliant read attaches nothing

- **WHEN** a read-classified tool execution completes successfully and the caller used a promoted read surface (e.g. `get_symbol_source` / `get_file_outline`)
- **THEN** the display function recognizes `ctx.usedTool` in its inline read set and returns `null` — no hint and no feedback, silent

### Requirement: Decision-time static injection

The resident prompt SHALL carry the PCL vocabulary (including the graph-start step), a full five-scenario enumeration entry rendered as a multi-line LIST (one line per scenario, stating each scenario's operation flow and its concrete tool names once per scenario), and the independent jcodemunch entry (compressed full-coverage enumeration of the jcodemunch prompt-policy tool set). The five-scenario enumeration SHALL be DERIVED from the hint blocks and the consumer tool-name arrays (single source — one derivation over the block data and tool-name data, no parallel hand-written wording), rendering each scenario's representative promoted tool names from the same consumer data that feeds the blocks. Each enumeration line SHALL render in the DO-NOT form consistent with its hint block (`DO NOT use <trigger>; use 1) …`) and SHALL NOT contain the `→` symbol — the trigger mapping is carried by the DO-NOT subject and the step order by numbering, so no dual-meaning arrow appears in the resident block. The activate guidance entry and the code-exploration posture entry SHALL be absent.

#### Scenario: Resident selector at session start

- **WHEN** a session begins with the discipline module active
- **THEN** the resident block contains the PCL, the five-scenario enumeration list entries, and the jcodemunch entry only — no scenario selector line, no cold-read pointer, never the full scenario hint blocks
- **AND** no tool invocation payload is touched

#### Scenario: Resident injection at session start

- **WHEN** a session begins with the discipline module active
- **THEN** the resident block contains the PCL, the five-scenario enumeration list entries, and the jcodemunch entry (never the full scenario hint blocks by default, and no selector or cold-read pointer at all)
- **AND** no tool invocation payload is touched

#### Scenario: Decision-time posture precedes tool selection

- **WHEN** the resident block is inspected before any tool selection
- **THEN** each of the five scenarios is represented by its operation flow and concrete tool names, and the jcodemunch tool set is represented by its compressed full-coverage enumeration, so the model sees the actionable guidance before selecting a tool
- **AND** the full (per-scenario) hint blocks are absent from the resident block

#### Scenario: Review absent from resident

- **WHEN** the resident block is inspected
- **THEN** no review scenario appears in the resident block
- **AND** the review role-triggered exclusion is noted in atom-kernel

#### Scenario: Posture carries representative tool names

- **WHEN** the resident block is inspected before any tool selection
- **THEN** each of the five scenario lines names its concrete promoted tools so the model resolves the scenario to actionable tools pre-decision (find — `search_text` / `search_symbols` / `find_references` / `find_importers`; read — `get_file_outline` / `get_symbol_source` / `get_context_bundle` / `get_file_content`; write — serena write family + `register_edit`; verify — `get_diagnostics_for_file` / `find_dead_code` / `get_untested_symbols` / `check_references`; run — platform shell with the `rtk` wrapper prefix)
- **AND** the full tool-name data lives in the consumer tool-name arrays (single source feeding the display function's inline sets and the derivation) — no separate classification extension table exists

#### Scenario: Enumeration renders as a list

- **WHEN** the resident block is inspected
- **THEN** the five-scenario enumeration entry renders as a multi-line list — one line per scenario (find / read / write / verify / run), never a single concatenated line

#### Scenario: Enumeration lines carry no arrow symbol

- **WHEN** any five-scenario enumeration line is rendered in the resident block
- **THEN** the line uses the DO-NOT form with numbered chain steps and contains no `→` symbol (the arrow's dual meaning — trigger mapping vs step connector — is removed; the DO-NOT subject names the trigger, the numbering orders the steps)

#### Scenario: Single register_edit trigger condition

- **WHEN** the resident entry and the write scenario hint both state the register_edit obligation
- **THEN** both use the same trigger condition ("while the index is in use")
- **AND** neither carries a conflicting bulk-count phrasing

#### Scenario: Register-edit wording single-sourced across resident and write block

- **WHEN** the resident five-scenario enumeration write line and the write scenario hint block both state the register_edit obligation
- **THEN** the resident line SHALL name the obligation (derived from the block data source — `mcp__jcodemunch_register_edit` appended beyond the representative cap) and the trigger wording including the n/a case SHALL live in the write hint block (single wording home); a wording pin SHALL assert the resident name derives from the block source

#### Scenario: N/a condition actionable

- **WHEN** a consumer is about to register an edit while the index is in use
- **THEN** the write guidance SHALL make the n/a condition decidable: if the target is not indexed or jcodemunch is not mounted, state `n/a` explicitly instead of silently skipping

#### Scenario: Enumeration tool names single-sourced

- **WHEN** the resident enumeration, the jcodemunch entry, and the hint blocks all name tools for a scenario
- **THEN** all use the same wording derived from the same source (the enumeration is derived from the hint blocks and the consumer tool-name arrays; the jcodemunch entry derives from the same reference-source extraction table)
- **AND** a wording pin SHALL assert the sources match per scenario

#### Scenario: Activate and code-exploration entries absent

- **WHEN** the resident block is inspected
- **THEN** no activate guidance entry and no code-exploration posture entry appear in the resident block
- **AND** the resident set is exactly PCL (incl. graph-start step) + five-scenario enumeration list + jcodemunch entry

#### Scenario: Resident injection through the attach seam

- **WHEN** the resident block is injected on either platform face
- **THEN** the injection executes through the SDK `resident` capability (`resident.use(config)`) registered on the `before_agent_start` canonical hook
- **AND** no consumer-side resident handler and no `bind` resident option participate

### Requirement: Scenario-triggered hint firing

Scenario hints SHALL fire through the SDK `hints` capability middleware in the matching NON-COMPLIANT scenario, with the display decision taken from the consumer-supplied display function, and each successful attachment SHALL proactively emit a `FeedbackLine` (notify) so the attached guidance is displayed to the user. Wiring SHALL be re-wireable: repeated `use` of the capability on the same hook concatenates chains, `unwire()` detaches, and hook targets are parameterizable over canonical events — without module rebuild. Each attached hint SHALL begin with the `Hint: ` prefix and state the scenario's concrete operation flow and name the promoted tools to use, plus the verification obligation, in the explicit DO-NOT form (`Hint: DO NOT use <used tool>; use 1) …` — the used native tool named exactly, chain steps numbered, no `→` symbol).

#### Scenario: Write scenario fires on write execution

- **WHEN** a write-classified tool execution completes successfully and the invocation is non-compliant (native mutation tool used)
- **THEN** the display function returns the write scenario hint (mutation engine + pre-edit consultation + verify-after + `register_edit` with n/a case, in the DO-NOT form naming the used mutation tool exactly) and the SDK attaches it to the result
- **AND** the resident prompt carries the full five-scenario enumeration but never the per-scenario hint blocks

#### Scenario: Hint blocks are single-line posture

- **WHEN** a scenario hint block is rendered
- **THEN** its body is a single-line DO-NOT form group set beginning with `Hint: ` that names the scenario's promoted tools (find — `search_symbols` / `search_text` / `find_references` / `find_importers` + CLI-locate substitute path; read — `get_file_outline` / `get_symbol_source` / `get_context_bundle` / `get_file_content`; write — serena write family + pre-edit consultation + `register_edit`; verify — `get_diagnostics_for_file` / `find_dead_code` / `get_untested_symbols` / `check_references`; run — platform shell with full bash coverage + SAFE preferred examples + post-run index registration) — no exhaustive catalog beyond the scenario's named tools
- **AND** the body contains the `DO NOT use {tool}` subject naming the exact used native instruction and no `→` symbol
- **AND** the five rendered bodies stay within the per-call context budget (law L4)

#### Scenario: Unused scenarios carry no prompt content

- **WHEN** no execution of a scenario has occurred in the session
- **THEN** that scenario's per-scenario hint block does not appear in the prompt
- **AND** the five-scenario enumeration still appears in the resident block (decision-time guidance is unconditional)

#### Scenario: Consistent terminology across blocks

- **WHEN** the five hint blocks and the resident enumeration are compared
- **THEN** the same concept carries the same term across all six surfaces (query plane / symbolic tools / FS tier / platform shell)
- **AND** no block introduces an alternative name for a covered concept

#### Scenario: Write hint states the n/a case explicitly

- **WHEN** the write scenario hint is emitted
- **THEN** it names the concrete condition under which `register_edit` is skipped (target not indexed or jcodemunch not mounted) and requires an explicit n/a statement
- **AND** it does not use the bare "(else explicit n/a)" phrasing

#### Scenario: Setup tools carry no read hint

- **WHEN** activate_project / onboarding / open_dashboard executes
- **THEN** no read-scenario hint SHALL attach (state-change tools are not read operations); the exclusion SHALL be pinned by a display-function inline-set test

#### Scenario: Firing with proactive display

- **WHEN** a scenario-classified execution completes successfully with the `hints` capability wired and the invocation is non-compliant
- **THEN** the display function's text attaches to the payload AND a notify `FeedbackLine` carrying the hint text is emitted through the unified feedback interface
- **AND** the user sees the guidance on both faces

#### Scenario: Wiring re-wireable

- **WHEN** a consumer re-attaches hint middleware to a different canonical hook or unwires an existing attachment
- **THEN** firing follows the new wiring without any module rebuild

#### Scenario: Compliant execution fires nothing

- **WHEN** a scenario-classified execution completes successfully and the invocation is compliant (promoted tool used, no error)
- **THEN** the display function recognizes `ctx.usedTool` in its inline set for the scenario and returns `null` — no hint and no FeedbackLine (the compliant path is silent regardless of the fn's return)

### Requirement: Verify and run scenario tool coverage

The verify and run scenarios SHALL have explicit promoted tool coverage in the hint content and the display function's inline tool-name sets: verify — `get_diagnostics_for_file` (serena evidence) plus jcodemunch diagnostic tools (`find_dead_code` / `get_untested_symbols` / `check_references`); run — the platform shell with the SAFE command set (project wrapper prefix; raw debugging bypasses the wrapper) plus post-run index registration. The run hint SHALL present the SAFE set as preferred examples of full bash run-scenario coverage — the classifier maps every non-locate bash invocation to run, so the hint SHALL not imply an allow-list boundary. The run hint SHALL state the wrapper-prefix rule in the DO-NOT form (`DO NOT use bash` raw without the wrapper; prefix with `rtk`; raw debugging bypasses the wrapper) — not positive phrasing alone.

#### Scenario: Verify hint names evidence tools

- **WHEN** a verify-classified tool execution completes successfully
- **THEN** the verify hint names the evidence tool `get_diagnostics_for_file` and the diagnostic family (`find_dead_code` / `get_untested_symbols` / `check_references`)
- **AND** no success is reported without evidence over the prior write

#### Scenario: Run hint names shell posture

- **WHEN** a run-classified tool execution completes successfully and the invocation is non-compliant (raw bash, no wrapper prefix)
- **THEN** the run hint names the platform shell with the project wrapper prefix and the SAFE command set as preferred examples (not an exhaustive allow-list), raw debugging bypass posture, and post-run index registration
- **AND** the hint states the wrapper rule in the DO-NOT form (naming `bash` as the used tool: `DO NOT use bash` raw; prefix with `rtk`; raw debugging bypasses the wrapper) — no positive-only phrasing
- **AND** the hint does not imply that non-SAFE commands fall outside the run scenario

#### Scenario: Prefixed bash is compliant

- **WHEN** a bash invocation carries the project wrapper prefix (`rtk` or `rtk proxy`) and is not a CLI-locate chain
- **THEN** the invocation is compliant for the run scenario — no run hint attaches and no feedback emits

#### Scenario: Raw bash attaches the named hint

- **WHEN** a bash invocation carries no wrapper prefix and is not a CLI-locate chain
- **THEN** the run hint attaches with the used tool (`bash`) named in the DO-NOT subject and the wrapper rule stated in the DO-NOT form (prefix with `rtk`), no `→` symbol
