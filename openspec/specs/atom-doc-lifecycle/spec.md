# atom-doc-lifecycle Specification

## Purpose

End-of-workflow lifecycle closure — the minimal, machine-checked completion of an openspec change and its decision records: reverse-validated archive, ADR decision-fold, and live index rebuild, exposed as one deep-module contract. Absorbs the atom-openspec-archive contract (no standalone archive entry point remains).

## Requirements

### Requirement: Lifecycle closure contract

atom-doc-lifecycle SHALL expose one closure contract `close({ change_name, adr_created?, supersedes? })` → `{ archive_status, adr_changes, index_rebuilt, validation }`. Archive SHALL be reverse-validated per Step 0 — task completion verified against code evidence before archiving; unresolved → `archive_status: blocked` with candidate list, never archived, never guessed. `adr_created: true` SHALL trigger the decision-fold in the same pass; absent → fold skipped (no ADR work).

#### Scenario: Reverse-validation blocks incomplete change

- **WHEN** close() receives a change with checked tasks lacking code evidence
- **THEN** archive_status SHALL be blocked with the evidence-gap list
- **AND** no archive SHALL occur

#### Scenario: Closure without ADR

- **WHEN** close() receives a change with adr_created: false
- **THEN** the archive SHALL run and the fold SHALL be skipped
- **AND** validation SHALL still report ADR lifecycle invariants

### Requirement: ADR decision-fold ownership

atom-doc-lifecycle SHALL own the ADR decision-fold procedure (validate-all → mark superseded → move to archive verbatim → rebuild index). The fold machinery SHALL be shared with atom-adr-maintain — estate alignment folds run through the same procedure; atom-adr-maintain SHALL NOT reimplement fold logic.

#### Scenario: Fold applies a supersedes edge

- **WHEN** a new record declares `supersedes: [A]` and A is accepted and live
- **THEN** A SHALL be marked, moved to archive, and the index rebuilt in one pass

#### Scenario: Estate fold reuses machinery

- **WHEN** atom-adr-maintain folds a stale record chain
- **THEN** the fold SHALL run through atom-doc-lifecycle's procedure and report the index delta

#### Scenario: Fold aborts on cycle

- **WHEN** supersedes edges form a cycle
- **THEN** the fold SHALL abort with an error and zero writes

### Requirement: ADR record metadata contract

ADR record format (metadata block: `id`, `title`, `date`, `status`, `domain`, `decision`, `supersedes`, `superseded_by`, `related`; body Context / Decision / Consequences; accepted records immutable) SHALL be single-sourced in atom-doc-lifecycle. New records SHALL be written by workflows before the closure pass; the closure validates and folds them.

#### Scenario: Record validated before fold

- **WHEN** the fold validates a new record's metadata block
- **THEN** missing fields, invalid status values, or non-immutable edits SHALL abort the fold with format findings

### Requirement: ADR live index contract

`docs/adr/index.md` SHALL be the generated live decision table (per domain rows: id | decision | date | supersedes), rebuilt by every fold. Consumers (arch-review reuse checks, spec-implement emission) SHALL read the index, never the flat directory.

#### Scenario: Index reflects the live set

- **WHEN** a fold moves a record to archive
- **THEN** the record SHALL disappear from the index and the superseding record SHALL appear in its place

### Requirement: Lifecycle validation

atom-doc-lifecycle SHALL run ADR lifecycle validation as part of every closure: index ↔ directory counts agree; no accepted live record claiming in-body supersession (state lives in the metadata block only); no dangling `supersedes`/`superseded_by` edges; supersedes graph acyclic; format compliance. Drift SHALL be reported as validation findings — never silently patched.

#### Scenario: Count drift reported

- **WHEN** the index lists a different live count than `docs/adr/` directory facts
- **THEN** validation SHALL report the mismatch with paths

### Requirement: Detailed-track closure wiring

openspec-engineer's `openspec-archive` node SHALL dispatch atom-doc-lifecycle; the post-archive doc-maintenance flow SHALL NOT exist — the closure covers reverse-validated archive + fold + index in one unit. Archive failure surfaces as `archive_status: blocked` from the closure itself (no separate case-5 self-judgment branch).

#### Scenario: Detailed track closes through the lifecycle node

- **WHEN** the detailed track reaches its archive node
- **THEN** the node SHALL dispatch atom-doc-lifecycle and report archive_status from the closure

### Requirement: ADR Record Language Deferral

atom-doc-lifecycle §Record Format SHALL NOT mandate a specific language for ADR record prose. Language choice SHALL defer to the project document-language conventions (single home: atom-doc-maintain §Language Constraints); the skill itself does not mandate a language. Structural rules remain: metadata block, fixed body (Context / Decision / Consequences), one decision per record, status machine, live/archive split, immutability of accepted records.

#### Scenario: No language mandate

- **WHEN** an agent consults atom-doc-lifecycle Record Format for ADR prose language
- **THEN** no specific language is mandated - the project document-language conventions (atom-doc-maintain single home) decide

#### Scenario: Structural rules retained

- **WHEN** an agent writes an ADR record
- **THEN** metadata block, fixed body, one-decision-per-record, status machine, and immutability remain required

### Requirement: Record Format Tabular

atom-doc-lifecycle §Record Format SHALL render the ADR record contract as a field table (id | title | date | status | domain | decision | supersedes | superseded_by | related) plus a numbered rules list (one-decision, transitions, live/archive, immutability) — not a single run-on paragraph.

#### Scenario: Table carrier

- **WHEN** reading §Record Format
- **THEN** fields appear in a table and status transitions in a numbered list — no prose-mixed field enumeration

### Requirement: Runtime Dependency Declared by Exclusion

atom-doc-lifecycle's `### Reference skills` subsection SHALL NOT list atom-kernel — atom-graph-spec §Contract Rules 6 excludes platform primitives from Reference skills (always available, never declared; a declaration hard-fails channel forward-coverage at graph load). The subsection SHALL carry the exclusion comment, matching sibling skills (atom-pilot, atom-scope-interview).

#### Scenario: Exclusion comment present

- **WHEN** reading the skill's Context Requirements
- **THEN** `### Reference skills` carries the atom-kernel exclusion comment and no atom-kernel entry
