# serena-single-engine Specification

## Purpose

Core-class execution contract where serena is the sole tool: locate/read/write/verify/run chains have length exactly 1 with zero fallback — missing serena is a loud failure, never a silent degrade.

## Requirements

### Requirement: Core classes SHALL be serena single-tool with no fallback

write/verify SHALL be serena sole-tool chains (create_text_file, replace_content, replace_in_files, replace_symbol_body, rename_symbol, insert_before/after_symbol, safe_delete_symbol, get_diagnostics_for_file, read_file). locate/read SHALL NOT be serena-headed (query plane owns locate; read locates via query plane when target unknown). run SHALL use the platform shell (`bash`, rtk prefix per project constraints); serena `execute_shell_command` is not part of the tool surface. No fallback tool SHALL exist for serena-backed classes: serena unavailable (server down, project unactivated, LSP missing) SHALL produce a loud failure naming the missing dependency, never a silent degrade.

#### Scenario: Core class executes via serena only

- **WHEN** a step references a serena-backed mutation-plane tool
- **THEN** the tool SHALL execute through serena only
- **AND** no non-serena tool SHALL appear in the serena-backed mutation-plane chain

#### Scenario: Serena missing fails loudly

- **WHEN** serena is unavailable during a serena-backed mutation-plane step
- **THEN** the step SHALL fail naming serena as the missing dependency
- **AND** no fallback execution SHALL occur

#### Scenario: Core chain length is enforced

- **WHEN** the registry is validated
- **THEN** every mutation-plane entry SHALL name serena tools only
- **AND** a mutation-plane entry naming a non-serena tool SHALL be a validation error

#### Scenario: Run executes through the platform shell

- **WHEN** a step runs a command
- **THEN** it SHALL execute through the platform shell with the rtk prefix per project constraints
- **AND** the run chain SHALL name the platform shell only

### Requirement: Serena covers all languages via its own FS tier

Serena-backed chains SHALL rely on serena's two internal tiers — symbol tier (LSP-covered languages) and FS tier (all languages) — as one dependency. Language coverage SHALL NOT be a reason to introduce a second tool into a serena-backed chain.

#### Scenario: Uncovered language locates via serena FS tier

- **WHEN** the target file's language has no serena LSP coverage
- **THEN** the serena ground-truth confirmation SHALL use serena FS-tier tools (`search_for_pattern`, `find_file`, `list_dir`)
- **AND** the chain SHALL NOT reference a non-serena tool

#### Scenario: Surgical edits use serena replace tools

- **WHEN** a write is a surgical text change (single- or multi-file)
- **THEN** the write chain SHALL use `replace_content` (single file, ambiguity-guarded) or `replace_in_files` (multi-file, dry-run + expected-count guarded)
- **AND** platform-native edit tools SHALL NOT appear in the write chain

### Requirement: Run class SHALL use the platform shell

The run class SHALL execute through the platform shell (`bash`) with the project constraint (rtk prefix) applied to the command string. Serena `execute_shell_command` is not listed in the run chain. The Tool usage check SHALL record the platform-shell call as evidence.

#### Scenario: Run executes via the platform shell

- **WHEN** a step runs a command
- **THEN** it SHALL execute through the platform shell with the rtk prefix
- **AND** the Tool usage check SHALL record the platform-shell call as evidence

#### Scenario: Run command follows rtk discipline

- **WHEN** a step runs a command during graph execution
- **THEN** the command SHALL carry the rtk prefix per the RTK_PROMPT discipline attached during the armed window
- **AND** raw non-rtk commands SHALL be used only for debugging

### Requirement: Core-class index obligations are conditional

`jcodemunch register_edit` SHALL be required for every mutation while the index is mounted — unconditional on query-plane usage. Mutation-plane verify SHALL NOT depend on jcodemunch: verification SHALL be serena diagnostics + re-read confirmation only. Absence of the index SHALL NOT block or violate a mutation-plane step (`n/a: jcodemunch not in use`).

#### Scenario: Verify passes without jcodemunch

- **WHEN** a write step verifies and jcodemunch is not mounted
- **THEN** the verify SHALL complete with serena diagnostics + re-read evidence
- **AND** the Tool usage check SHALL record `n/a: jcodemunch not in use` for register_edit

#### Scenario: register_edit required while jcodemunch in use

- **WHEN** the jcodemunch index is mounted and an execution edits files
- **THEN** each edit SHALL be followed by `jcodemunch register_edit`
- **AND** missing registration SHALL be a `violated` entry

### Requirement: Enforcement view SHALL record the OMP adapter prototype

The enforcement view of core-class registry entries SHALL remain deferred (per-platform application recorded in the view, not shipped as a generic-layer feature). The OMP adapter prototype (`.omp/extensions/hlt-policy.ts`) SHALL exist as the mechanical form of the enforcement seam — tool_call gate, setActiveTools crop, lifecycle signals — without altering the deferred status of the view.

#### Scenario: Prototype present, view stays deferred

- **WHEN** the adapter prototype is present and active in an OMP session
- **THEN** the registry enforcement view SHALL still read deferred (per-platform)
- **AND** the prototype SHALL be documented as the seam's mechanical form in the arch-review report

#### Scenario: Adapter lifecycle documented in the report

- **WHEN** the adapter prototype's lifecycle (arm on dispatch, disarm on terminal signals incl. agent_end fail-safe) is implemented
- **THEN** the arch-review report round 2 SHALL record the implementation evidence
