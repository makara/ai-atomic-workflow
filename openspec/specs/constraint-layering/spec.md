# constraint-layering Specification

## Purpose

Three-layer constraint system (global/instruction/standard) plus injection and validation. Artifacts: `.graph-scheduler/constraints.md`, `.graph-scheduler/config.json`.

## Requirements

### Requirement: Setup skill scaffolds constraints template

The setup-atomic-workflow skill SHALL create a `constraints.md` seed under `.graph-scheduler/` (containing a `## Rules` section and HTML comment guidance, sourced from `packages/graph-workflow/skills/setup-atomic-workflow/seeds/constraints.md`). The write MUST be idempotent — when the file already exists it is not overwritten and no error is raised, and the report lists existed. The Explore phase SHALL present the constraint file status: whether it exists, the rule count, and the rule content (inheriting the read behavior of the retired show command).

#### Scenario: Fresh project scaffold

- **WHEN** a project has no `.graph-scheduler/constraints.md` and setup-atomic-workflow Write is executed
- **THEN** a seed template file is created containing a `## Rules` section, and the report lists the file as created

#### Scenario: Template already exists

- **WHEN** `.graph-scheduler/constraints.md` already exists and setup-atomic-workflow Write is executed
- **THEN** the file content stays unchanged and the report lists the file as existed

#### Scenario: Explore shows constraint health

- **WHEN** the user runs setup-atomic-workflow and `.graph-scheduler/constraints.md` exists
- **THEN** Explore reports the file's existence and rule count
- **AND** lists the rule content

### Requirement: Reject removed constraint declaration fields

The phase schema SHALL reject any YAML phase declaring `constraints` or `runMode`, reporting a validation error that names the removed field and directs authors to `.graph-scheduler/constraints.md` as the single constraint injection source.

#### Scenario: Phase declares constraints field

- **WHEN** a graph phase declares `constraints` in YAML
- **THEN** schema validation fails with an error naming the `constraints` field

#### Scenario: Phase declares runMode field

- **WHEN** a graph phase declares `runMode` in YAML
- **THEN** schema validation fails with an error naming the `runMode` field

#### Scenario: Project constraints file still injects

- **WHEN** a graph run starts with a `.graph-scheduler/constraints.md` containing a `## Rules` section
- **THEN** every dispatched node carries the parsed rules in `NodeDetail.constraints`, unchanged

### Requirement: Constraint injection surface documentation matches implementation

The project constraints file header SHALL state that rules inject into every graph node type (main/approval/gate), matching the implementation.

#### Scenario: Reading the constraints file header

- **WHEN** an operator reads `.graph-scheduler/constraints.md`
- **THEN** the header states injection covers main, approval, and gate node types

### Requirement: Layered append without overwrite

Constraints from multiple sources MUST be injected by layered accumulation: platform injection < node-level task/context < skill-level `## Rules`; lower-layer constraints MUST append only and MUST NOT overwrite upper layers; when entries for the same dimension (e.g., language) conflict, the conflicting entries MUST be preserved for the executor to judge, and no entry MAY be silently dropped. The YAML phase `constraints` field (formerly the "project graph constraints" layer) SHALL have been removed — graph authors no longer declare node-level constraint fields; the project constraint injection path via `.graph-scheduler/constraints.md` → `NodeDetail.constraints` is retained.

#### Scenario: Conflicting entries preserved

- **WHEN** project constraints require "content in pure English" and skill-level rules require documents to use Chinese
- **THEN** the injected constraint block contains both conflicting entries, and neither is dropped

#### Scenario: Layered accumulation

- **WHEN** project constraints, node-level task constraints, and skill-level rules exist simultaneously
- **THEN** the constraint block received by the executor contains entries from all three layers, each distinguishable by its source prefix

#### Scenario: NodeDetail constraints from project file only

- **WHEN** any node is dispatched
- **THEN** `NodeDetail.constraints` SHALL carry the project constraints from `.graph-scheduler/constraints.md` (with the `[project]` prefix)
- **AND** a `constraints` field declared in graph YAML SHALL be rejected by the schema (the field has been removed)

### Requirement: Structured field semantic deduplication

During constraint injection, entries that are semantically duplicate of the `lang.conversation`, `lang.documents`, and `git.policy` structured fields MUST be skipped, so that the same rule does not appear more than once.

#### Scenario: Entries duplicating language fields are skipped

- **WHEN** project constraints contain "use Chinese for conversation" and the structured field `lang.conversation=zh` already exists
- **THEN** the injected constraint block does not contain the duplicate entry, and the structured field still takes effect

### Requirement: Constraint block truncation warning

When the total length of the constraint block content exceeds the limit, an explicit warning MUST be emitted and truncation MUST NOT be silent; the limit value SHALL be a documented configuration value.

#### Scenario: Over-limit warning

- **WHEN** the total length of the parsed constraint list exceeds the configured limit
- **THEN** the run emits a warning indicating that the constraints were truncated, and the warning states the fact of truncation

### Requirement: Unified constraint block format

When constraints are injected into the execution context, a unified block format MUST be used: the block title is `## Constraints`, each constraint is one bullet line, and entries carry the `[project]` source prefix; the end of the block MUST append a fixed sentence requiring a per-entry compliance declaration before output.

#### Scenario: Injection block format is consistent

- **WHEN** project constraints are injected for any node type
- **THEN** the injected content is the `## Constraints` title plus per-entry bullets (each starting with the `[project]` prefix) plus the fixed declaration sentence at the end

### Requirement: main node constraint injection

Before executing an inline task, a main-type node MUST place the constraint block before the task text, so that the executing agent can see the constraints at the start of the task.

#### Scenario: Constraints visible before inline task

- **WHEN** a main-type node is dispatched and project constraints are non-empty
- **THEN** the task text received by the executing agent contains the constraint block at the top, positioned before the task instructions

### Requirement: agent node constraint injection

When an agent-type node dispatches a sub-agent, the constraint block MUST be injected into the dispatch prompt: positioned after the file content blocks and before `## Task`; in addition, the dispatch context MUST carry the constraints in a `# Constraints` section.

#### Scenario: Dispatch prompt contains constraint block

- **WHEN** an agent-type node is dispatched and project constraints are non-empty
- **THEN** the constraint block in the prompt received by the sub-agent is located after the file blocks and before the task text

#### Scenario: Dispatch context contains constraints section

- **WHEN** an agent-type node dispatches a sub-agent
- **THEN** the dispatch context contains a `# Constraints` section whose content is the project constraint list

### Requirement: approval node constraint injection

Before an approval-type node displays the decision card, the constraint block MUST be merged into the pre-call text; the judgment context of automatic evaluation conditions (eval) MUST include the constraint content.

#### Scenario: Decision card shows project constraints

- **WHEN** an approval node is reached and project constraints are non-empty
- **THEN** the pre-call text of the decision card seen by the user contains the project constraint block

#### Scenario: Automatic evaluation context contains constraints

- **WHEN** an approval node has an eval condition and automatic evaluation is executed
- **THEN** the evaluation prompt's context contains the project constraint content

### Requirement: Constraint injection rule test assertions single-sourced

Automated assertions of constraint injection rules (2 KB cap, lang/git deduplication, injection order) MUST point to the single rule owner `atom-graph-spec` §Constraint Layering — handler-side tests assert only that `atom-phase-handler/SKILL.md` contains the pointer sentence and the shape of the `## Constraints Block Format` section, and rule-detail assertions read the canonical spec content. Tests MUST NOT assert inline rule text that has been removed through pointerization.

#### Scenario: Rule assertions point to canonical

- **WHEN** the constraint block tests in `atom-phase-handler-skill.test.ts` are run
- **THEN** the 2 KB cap and lang/git deduplication assertions read the rule text from atom-graph-spec for verification
- **AND** the handler SKILL.md side asserts that the pointer sentence exists ("specified once in atom-graph-spec §Constraint Layering")

#### Scenario: No dual-track assertions

- **WHEN** the `## Constraints Block Format` section in the handler SKILL.md contains only a pointer (rule details have been moved to graph-spec)
- **THEN** the tests do not fail because of missing inline rule text — the assertion semantics do not depend on the handler SKILL.md restating the rules

### Requirement: Compliance declaration forced output

A sub-agent that receives project constraints MUST output a `Constraint check:` section before returning, with one declaration line per constraint — either `satisfied` or `unsatisfied`; an `unsatisfied` declaration MUST include an explanation of the violation evidence.

#### Scenario: Per-entry declaration when all constraints are satisfied

- **WHEN** a sub-agent receives 2 constraints and complies with both
- **THEN** its output contains a `Constraint check:` section with 2 declarations, both `satisfied`

#### Scenario: Declaration with evidence when constraints are unsatisfied

- **WHEN** a sub-agent receives 1 constraint and does not comply
- **THEN** its output contains a `Constraint check:` section, the declaration is `unsatisfied` and includes an evidence explanation

### Requirement: Compliance results persisted with output

After a node finishes execution, the compliance declarations MUST be merged into the node output and persisted to the output file; the compliance declarations MUST be visible to the run report along with the result summary.

#### Scenario: Output file contains compliance declarations

- **WHEN** any node with constraints finishes execution
- **THEN** the node's persisted output file contains the `Constraint check:` section with per-entry declarations

#### Scenario: Run report can show compliance summary

- **WHEN** a node's output contains compliance declarations and the run ends
- **THEN** the result report presents the compliance summary of that node

### Requirement: Violation signal visible for decisions

When a node's compliance declarations contain `unsatisfied`, an explicit violation marker MUST be carried in the output; that marker MUST be visible to downstream approval decisions (presented in the decision card's pre-call).

#### Scenario: Violation marker enters decision card

- **WHEN** an upstream node's compliance declarations contain `unsatisfied` and a subsequent approval node exists
- **THEN** the decision card's pre-call text presents the violation marker, and the user can choose continue or retry based on it

### Requirement: Project constraint file definition and discovery

A project SHALL carry project-level constraints in the `.graph-scheduler/constraints.md` file, and the constraint content MUST be located within the `## Rules` markdown section; at graph startup the system MUST automatically discover and parse this file, without the user manually declaring or passing it.

#### Scenario: Startup unaffected when constraints file is missing

- **WHEN** a project has no `.graph-scheduler/constraints.md` file
- **THEN** the graph starts normally, all nodes carry an empty constraint set, and no error is produced

#### Scenario: Empty constraint set when file has no Rules section

- **WHEN** `.graph-scheduler/constraints.md` exists but contains no `## Rules` section
- **THEN** the parse result is an empty constraint set, and no error is produced

#### Scenario: Per-entry extraction when file has Rules section

- **WHEN** `.graph-scheduler/constraints.md` contains a `## Rules` section with N constraint entries
- **THEN** the parse result MUST be a list of exactly N constraints, in the same order as the document

### Requirement: Project constraints dispatched with nodes

Every node in a graph run MUST carry the project constraint set at dispatch time, and all three node types — main, agent, and approval — MUST carry it; the constraints carried by a node MUST be the result parsed at the start of that run.

#### Scenario: First node returned at startup carries constraints

- **WHEN** a project has 2 constraints configured and the graph is started
- **THEN** the first node returned at startup carries the 2 constraints matching the parse result

#### Scenario: New run takes effect after constraint changes

- **WHEN** the user modifies `.graph-scheduler/constraints.md` and starts a new graph run
- **THEN** all nodes of the new run carry the modified constraint set, and the old run is unaffected

### Requirement: Constraint parsing is a pure function

The constraint parsing logic MUST be a pure function — it takes markdown text as input and outputs a list of constraint strings, without depending on run state or external I/O; a missing file or a file without a `## Rules` section MUST return an empty array rather than raising an error.

#### Scenario: Parsing does not depend on run state

- **WHEN** parsing is invoked twice on the same markdown content
- **THEN** both invocations return exactly the same constraint list

#### Scenario: Parsing abnormal input does not error

- **WHEN** the input is non-markdown text or any text without a Rules section
- **THEN** an empty array is returned and no error is thrown

### Requirement: Termination path clears cache

When a run is force-terminated (force-end), the system MUST delete that run's `graphLoadCache` graph definition cache entry. Constraints have no process cache and no run record column — the pilot loads them once per activation into the session, so there is no entry to clean.

#### Scenario: Cache deleted after force-end

- **WHEN** an active run performs force-end
- **THEN** the run's graph definition cache entry is deleted and subsequent queries leave no residue of that run's data; constraints are not in the run record (loaded per activation into the session)

### Requirement: Cleanup commands delete corresponding cache

When `clean_completed` and `clean_all` delete DB run records, the graph definition cache entries of the corresponding runs MUST be deleted in sync.

#### Scenario: clean_completed cleans in sync

- **WHEN** clean_completed is executed to delete M completed runs
- **THEN** the graph definition cache entries of these M runs are deleted together, and the caches of the remaining runs are retained

#### Scenario: clean_all clears all cache

- **WHEN** clean_all is executed
- **THEN** the graph definition cache Map is cleared, consistent with deleting everything from the DB

### Requirement: Active run cache retained

Non-terminating operations (jump redirection, normal advance) MUST NOT delete graph definition cache entries — the run is still active and subsequent node dispatch depends on the cache; constraints are read via the load node output on each activation (no process cache, no run record involvement).

#### Scenario: Cache retained after jump

- **WHEN** an active run performs a graph_jump redirection
- **THEN** the run's graph definition cache entry is retained and node dispatch works normally after the redirection; dispatched nodes consume this round's load output (the load has re-run when the target is the entry)

### Requirement: Warning when file exists but parses empty

When the file exists but the parse result is an empty array, the constraint loading function MUST output a diagnostic warning; the warning MUST include the file path, and MUST include a format hint when a near-miss heading is detected (wrong case, suffix, or a level other than `##`).

#### Scenario: Warning when there is no Rules section

- **WHEN** the constraint file exists but contains no `## Rules` section and the loading function is invoked
- **THEN** a warning is output containing the file path and a format hint, and an empty array is returned

#### Scenario: Near-miss heading triggers hint

- **WHEN** the constraint file contains `## rules` (lowercase) and the loading function is invoked
- **THEN** the warning contains a near-miss heading hint, pointing out that the correct section header is `## Rules`

### Requirement: Zero noise on normal paths

Both the missing-file case and the successful-parse case MUST NOT output a warning.

#### Scenario: No warning when file is missing

- **WHEN** the constraint file does not exist and the loading function is invoked
- **THEN** no warning is output and an empty array is returned

#### Scenario: No warning on successful parse

- **WHEN** the constraint file contains N rules and the loading function is invoked
- **THEN** no warning is output and N rules are returned

### Requirement: Constraint source — compiled artifact loaded at activation

Constraint content SHALL come from the pilot-side activation load: the pilot reads `.graph-scheduler/constraints.json` (compiled-artifact protocol — existence = validity, `compiled_at` audit only), compiling `.graph-scheduler/constraints.md` `## Rules` into the artifact when the cache is missing (JSON parse failure = missing → recompile). Load happens once per activation into the agent session — SHALL NOT come from run records or process cache. The consuming side injects the session copy in the unified block format; when both files are absent, SHALL inject empty constraints plus a warning (no failure, no blocking).

#### Scenario: Block content comes from the session copy

- **WHEN** any node is dispatched after activation
- **THEN** the injected constraint block content matches the pilot-loaded session copy

#### Scenario: Missing artifact compiles from source

- **WHEN** `.graph-scheduler/constraints.json` is absent but `.graph-scheduler/constraints.md` has a `## Rules` section
- **THEN** the pilot compiles the artifact (caveman-organized rules) and loads the resulting array

#### Scenario: Absent everywhere degrades

- **WHEN** neither `.graph-scheduler/constraints.json` nor `.graph-scheduler/constraints.md` exists
- **THEN** no constraint block is injected (or an empty block) plus a warning — node execution is not blocked

### Requirement: Constraint artifact reset and activation-level load

At run creation, the system SHALL NOT write project constraints into the run record (the `graph_runs.constraints` column does not exist). The pilot SHALL load constraints once per activation from `.graph-scheduler/constraints.json` (compiled artifact) into the agent session; deleting the artifact resets the cache — the next activation recompiles from `.graph-scheduler/constraints.md` `## Rules`. The `runConstraints` process cache and the file fallback re-read SHALL NOT exist. No prologue nodes exist in runs — `$`-prefixed phase ids are schema-rejected.

#### Scenario: Snapshot at activation

- **WHEN** a run activates
- **THEN** the pilot loads the constraints once into the session; every dispatch in the run consumes that same copy

#### Scenario: Deletion resets the cache

- **WHEN** the user deletes `.graph-scheduler/constraints.json`
- **THEN** the next activation recompiles the artifact from `.graph-scheduler/constraints.md` and loads the new copy

#### Scenario: Edits apply on next activation

- **WHEN** `.graph-scheduler/constraints.md` is edited after activation
- **THEN** in-progress dispatches keep the loaded copy — file edits do not affect the active activation (the next activation reloads)

### Requirement: Compiled artifact format

`.graph-scheduler/constraints.json` SHALL be a JSON object `{ "constraints": [string, ...], "compiled_at": "<ISO8601>" }` — `constraints` is the ordered array of compiled rules; `compiled_at` records the compilation timestamp (audit-only, never used for invalidation).

#### Scenario: Artifact written on compile path

- **WHEN** the pilot executes the compile path at activation
- **THEN** `.graph-scheduler/constraints.json` is written as an object containing the `constraints` array and `compiled_at`

### Requirement: Caveman compilation semantics

Compilation SHALL be performed by the LLM organizing the `## Rules` source text at caveman full level — condensing wording, merging duplicate rules, correcting expressions, unifying order; technical substance (commands, paths, parameters, references) SHALL be preserved verbatim. The artifact SHALL be user-auditable and hand-editable (JSON edits take effect at the next activation).

#### Scenario: Compiled rules are condensed

- **WHEN** the compile path executes and the source rules contain duplicates/loose wording
- **THEN** the artifact array contains the organized, refined rules with the technical substance fully preserved

### Requirement: Fast path emits artifact verbatim

When `.graph-scheduler/constraints.json` exists, the pilot SHALL emit the verbatim content of its `constraints` array — without reading constraints.md, recompiling, or rewriting the artifact.

#### Scenario: Fast path zero md I/O

- **WHEN** constraints.json exists and a run activates
- **THEN** the loaded array is verbatim identical to the JSON content, and constraints.md was not read
