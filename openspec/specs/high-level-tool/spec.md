# high-level-tool Specification

## Purpose

High-Level Tool (HLT) registry — the closed set of named, composable execution tools that atomic steps call. Each entry defines the tool's contract (declared I/O + verification + conditional index obligations), its execution chain (core: serena single-tool, no fallback; utility: declared tools with n/a rules), its per-platform enforcement view, and its tier marker. Derived from arch-review 2026-08-07 round 1 (Top Rec SSE) and ADR 0119/0123.

## Requirements

### Requirement: HLT registry is a closed set of named tools

The registry SHALL define a closed set of high-level tools, each identified by a unique kebab-case name. Every atomic step SHALL reference exactly one registered tool by name. A step referencing an unregistered name SHALL fail at analyze with the unknown name and the candidate list; no fallback execution SHALL occur.

#### Scenario: Registered tool executes

- **WHEN** a step references a tool name present in the registry
- **THEN** the step SHALL execute that tool's chain with the step's args

#### Scenario: Unknown tool fails loudly

- **WHEN** a step references a tool name absent from the registry
- **THEN** the step SHALL fail at analyze naming the unknown tool and listing the closest registered candidates

### Requirement: Entry anatomy — contract, chain, enforcement, tier

Every registry entry SHALL carry four views: `contract` (declared I/O, obligations, n/a rules), `chain` (execution order — the scenario's designated adapter; in-project code: two-plane chain; in-project non-code text: serena FS tier (+ jcodemunch for indexed locate); in-project special types / out-of-project: platform-native; run: platform shell; compress: headroom-ai; utility: declared tools), `enforcement` (per-platform application view — allowed/denied/mandatory tool sets per platform; may record deferred implementation), and `scenario` key (in-project code | in-project non-code text indexed/unindexed | in-project special | out-of-project | run | compress | utility). A registry entry missing any view SHALL fail validation.

#### Scenario: Entry completeness is validated

- **WHEN** the registry is validated
- **THEN** every entry SHALL have contract, chain, enforcement, and scenario views
- **AND** an entry missing a view SHALL be a validation error

#### Scenario: Core-class chains are single-tool

- **WHEN** an entry belongs to a core scenario (in-project code / non-code text / special types / out-of-project)
- **THEN** its chain SHALL name exactly the scenario's designated adapter
- **AND** a multi-adapter chain SHALL be a validation error

#### Scenario: Query-plane chains are index-first

- **WHEN** an entry targets the in-project code domain
- **THEN** its locate chain SHALL name jcodemunch as head with serena ground-truth
- **AND** its write/verify chain SHALL name serena only

#### Scenario: Mutation-plane chains are serena-only

- **WHEN** an entry targets the in-project code write/verify operation
- **THEN** its chain SHALL name serena only
- **AND** a chain with a non-serena tool SHALL be a validation error

#### Scenario: Platform-native adapters for out-of-project and special types

- **WHEN** an entry targets the out-of-project domain or in-project special-type domain
- **THEN** its chain SHALL name the platform-native read/write as the sole adapter
- **AND** serena/jcodemunch SHALL be declared `n/a` with structural reasons

#### Scenario: Utility entries declare optionality

- **WHEN** an entry is marked utility
- **THEN** it SHALL declare its use cases and n/a rules
- **AND** utility tools SHALL never appear as the designated adapter of a core scenario

#### Scenario: Enforcement view may defer implementation

- **WHEN** an entry's enforcement view records a platform's application shape but the adaptation module is not yet implemented
- **THEN** the view SHALL be marked deferred and the generic-layer behavior SHALL remain fully functional without it

### Requirement: Chains are capability-tiered within serena, never cross-tool

A tool's chain SHALL stay within its scenario. Cross-adapter steps SHALL NOT exist (a locate chain headed by serena symbol tools for an indexed code target, a write chain headed by jcodemunch — both validation errors); intra-adapter steps MAY cross by declared design (locate's serena ground-truth confirmation, read's locate step — in-adapter by design, never fallbacks). Intra-serena tiering remains (symbol LSP tier requires LSP coverage / FS tier requires no LSP); the query plane adds its own freshness tier (index results carry confidence/freshness metadata; LSP confirmation is a ground-truth step, not a fallback). Cross-adapter fallback SHALL NOT exist for any scenario.

#### Scenario: Locate uses serena FS tier for uncovered languages

- **WHEN** the target file's language has no serena LSP coverage
- **THEN** the serena ground-truth confirmation SHALL use serena FS-tier tools (`search_for_pattern`, `find_file`, `list_dir`)
- **AND** the chain SHALL NOT proceed to a non-serena tool

#### Scenario: Read overflow compresses mechanically

- **WHEN** a read result exceeds 8KB
- **THEN** the read chain SHALL compress it via headroom before reasoning (hash retained for retrieve) — headroom is a utility-class compress tool, invoked by rule, never a read-chain fallback

#### Scenario: Locate skips unavailable LSP tier

- **WHEN** the target file's language has no serena LSP coverage
- **THEN** the serena ground-truth confirmation SHALL use the serena FS tier (`search_for_pattern`, `find_file`, `list_dir`)
- **AND** the chain SHALL NOT proceed to a non-serena tool

#### Scenario: Locate heads with the query plane

- **WHEN** a locate step targets an indexed in-project symbol
- **THEN** the chain SHALL head with jcodemunch, not serena symbol tools
- **AND** serena SHALL appear only as the ground-truth confirmation step

#### Scenario: Unindexed text locate uses serena

- **WHEN** a locate step targets in-project markdown or plain text
- **THEN** the chain SHALL use serena `search_for_pattern` (FS tier)
- **AND** jcodemunch SHALL be declared `n/a: not indexed`

#### Scenario: Serena unavailable fails loudly

- **WHEN** serena is unavailable during an in-project mutation step
- **THEN** the step SHALL fail naming serena as the missing dependency
- **AND** no cross-adapter fallback SHALL occur

#### Scenario: Query plane down fails loudly

- **WHEN** jcodemunch is unavailable during an indexed-target query step
- **THEN** the step SHALL fail naming jcodemunch as the missing dependency
- **AND** no cross-adapter fallback SHALL occur

### Requirement: Verification and index obligations travel with the tool

Every write-capable tool SHALL declare its verify loop (serena diagnostics + re-read for LSP-covered targets; re-read only for non-code text) as part of its contract; the step SHALL record the verify evidence in machine-parseable form. Index registration (`jcodemunch register_edit`) SHALL be unconditional while the index is mounted on indexed targets (in-project code + indexed non-code-text subtypes); `n/a: not indexed` applies to unindexed targets (markdown/plain text, out-of-project); `n/a: jcodemunch not in use` applies only when the index is not mounted.

#### Scenario: Write tool records verification evidence

- **WHEN** a step applies a write-capable tool on an indexed target
- **THEN** the step's output SHALL record serena diagnostics result and re-read confirmation
- **AND** register_edit SHALL be recorded as evidence for every mutation while the index is mounted

#### Scenario: Register_edit is conditional

- **WHEN** the jcodemunch index is not mounted by the execution
- **THEN** the Tool usage check SHALL report `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration

#### Scenario: Register_edit unconditional while mounted

- **WHEN** the jcodemunch index is mounted and a mutation occurs on an indexed target
- **THEN** the step SHALL call register_edit naming the edited files
- **AND** a missing registration SHALL be recorded as a violated entry

#### Scenario: Unmounted index is n/a

- **WHEN** the jcodemunch index is not mounted
- **THEN** the Tool usage check SHALL report `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration

#### Scenario: Unindexed target is n/a

- **WHEN** a mutation touches markdown, plain text, or an out-of-project file
- **THEN** the Tool usage check SHALL report `n/a: not indexed`
- **AND** no registration SHALL be required

### Requirement: Entries reference schemas, never restate

Tool parameter tables SHALL live in exactly one file — the schemas (SERENA/JCODEMUNCH-SCHEMAS.md) hold parameter tables; HLT-REGISTRY entries SHALL reference tools by name and SHALL NOT restate parameter tables.

#### Scenario: Schema parameters single-home

- **WHEN** a tool's parameter table is located
- **THEN** it SHALL appear in exactly one schemas file
- **AND** HLT-REGISTRY entries SHALL reference the tool without restating its parameters

#### Scenario: Duplicate tables deleted

- **WHEN** an allocation audit finds a parameter table duplicated between schemas and HLT-REGISTRY entries
- **THEN** the duplicate SHALL be deleted from the entry
- **AND** the entry SHALL reference the schemas home
