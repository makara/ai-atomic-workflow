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

Every registry entry SHALL carry four views: `contract` (declared read/write I/O, verification obligations, index-registration obligations, n/a rules), `chain` (execution order — query-plane classes: jcodemunch; mutation-plane classes: serena; run: platform shell), `enforcement` (per-platform application view — allowed/denied/mandatory tool sets per platform; may record deferred implementation), and `plane` (query | mutation | run | utility). A registry entry missing any view SHALL fail validation. (Tier markers `core`/`utility` are replaced by plane membership: locate/search/analyze → query plane; write/verify → mutation plane; run → platform shell; compress/review/archive/graph-ops remain utility with declared use cases + n/a rules.)

#### Scenario: Entry completeness is validated

- **WHEN** the registry is validated
- **THEN** every entry SHALL have contract, chain, enforcement, and plane views
- **AND** an entry missing a view SHALL be a validation error

#### Scenario: Core-class chains are single-tool

- **WHEN** an entry is marked `mutation`
- **THEN** its chain SHALL have length exactly 1 and name serena
- **AND** a mutation entry with a multi-tool chain SHALL be a validation error

#### Scenario: Query-plane chains are index-first

- **WHEN** an entry belongs to the query plane (locate/search/analyze)
- **THEN** its chain SHALL name jcodemunch as head
- **AND** a query-plane chain without a jcodemunch head SHALL be a validation error

#### Scenario: Mutation-plane chains are serena-only

- **WHEN** an entry belongs to the mutation plane (write/verify)
- **THEN** its chain SHALL name serena only
- **AND** a mutation-plane chain with a non-serena tool SHALL be a validation error

#### Scenario: Utility entries declare optionality

- **WHEN** an entry is marked `utility`
- **THEN** it SHALL declare its use cases and n/a rules
- **AND** utility tools SHALL never appear in a query or mutation chain head

#### Scenario: Enforcement view may defer implementation

- **WHEN** an entry's enforcement view records a platform's application shape but the adaptation module is not yet implemented
- **THEN** the view SHALL be marked deferred and the generic-layer behavior SHALL remain fully functional without it

### Requirement: Chains are capability-tiered within serena, never cross-tool

A tool's chain SHALL stay within its plane. Chain heads SHALL NOT cross planes (a locate chain headed by serena symbol tools, a write chain headed by jcodemunch — both validation errors); intra-entry steps beyond the head MAY cross planes by declared design (locate's serena ground-truth confirmation, read's query-plane locate step — in-plane by design, never fallbacks). Intra-tool tiering remains (serena symbol LSP tier requires LSP coverage / FS tier requires no LSP); the query plane adds its own freshness tier (index results carry confidence/freshness metadata; LSP confirmation is a ground-truth step, not a fallback). Cross-tool fallback SHALL NOT exist for any plane.

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

- **WHEN** a locate step targets a symbol
- **THEN** the chain SHALL head with jcodemunch, not serena symbol tools
- **AND** serena SHALL appear only as the ground-truth confirmation step

#### Scenario: Serena unavailable fails loudly

- **WHEN** serena is unavailable during a mutation-plane step
- **THEN** the step SHALL fail naming serena as the missing dependency
- **AND** no cross-plane fallback SHALL occur

#### Scenario: Query plane down fails loudly

- **WHEN** jcodemunch is unavailable during a query-plane step
- **THEN** the step SHALL fail naming jcodemunch as the missing dependency
- **AND** no cross-plane fallback SHALL occur

### Requirement: Verification and index obligations travel with the tool

Every write-capable tool SHALL declare its verify loop (serena diagnostics + re-read) as part of its contract; the step SHALL record the verify evidence in machine-parseable form. Index registration (`jcodemunch register_edit`) SHALL be unconditional while the index is mounted — every mutation registers, whether or not the execution used query-plane tools; `n/a: jcodemunch not in use` applies only when the index is not mounted.

#### Scenario: Write tool records verification evidence

- **WHEN** a step applies a write-capable tool
- **THEN** the step's output SHALL record serena diagnostics result and re-read confirmation
- **AND** register_edit SHALL be recorded as evidence for every mutation while the index is mounted

#### Scenario: Register_edit is conditional

- **WHEN** the jcodemunch index is not mounted by the execution
- **THEN** the Tool usage check SHALL report `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration

#### Scenario: Register_edit unconditional while mounted

- **WHEN** the jcodemunch index is mounted and a mutation occurs
- **THEN** the step SHALL call register_edit naming the edited files
- **AND** a missing registration SHALL be recorded as a violated entry

#### Scenario: Unmounted index is n/a

- **WHEN** the jcodemunch index is not mounted
- **THEN** the Tool usage check SHALL report `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration
