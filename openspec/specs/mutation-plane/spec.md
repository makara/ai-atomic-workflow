# mutation-plane Specification

## Purpose

Mutation + ground-truth plane — serena is the sole engine for write and verify classes in the HLT registry. LSP-accurate semantics, safety-guarded editing, diagnostics-backed verification.

## Requirements

### Requirement: Write class SHALL be serena-only

HLT write-class chains SHALL name serena as the sole tool for in-project targets (`create_text_file`, `replace_content`, `replace_in_files`, `replace_symbol_body`, `rename_symbol`, `insert_before/after_symbol`, `safe_delete_symbol`). jcodemunch SHALL NOT appear in any write chain (read-only charter). Out-of-project writes SHALL use the platform-native write (serena project-root-bound — structural n/a). No cross-tool fallback SHALL exist for write.

#### Scenario: Edit applies through serena

- **WHEN** a write step edits an in-project file
- **THEN** the step SHALL call a serena edit tool
- **AND** no jcodemunch or platform-native edit tool SHALL appear in the write chain for in-project targets

#### Scenario: New file creates through serena

- **WHEN** a write step creates an in-project file
- **THEN** the step SHALL call serena `create_text_file`
- **AND** the created file SHALL be registered with the query plane afterwards (indexed subtypes only)

#### Scenario: Out-of-project write uses platform-native write

- **WHEN** a write step targets a path outside the project root
- **THEN** the step SHALL use the platform-native write tool
- **AND** serena SHALL be declared `n/a: project-root-bound`

### Requirement: Verify class SHALL be serena diagnostics + re-read

HLT verify-class chains SHALL be serena `get_diagnostics_for_file` (min_severity 1) followed by a re-read of the changed region for LSP-covered languages. For non-code text without LSP coverage, diagnostics SHALL be `n/a: no LSP coverage` and verification SHALL be the re-read alone. Verify SHALL NOT depend on the query plane.

#### Scenario: Write verifies via diagnostics and re-read

- **WHEN** a write step completes on an LSP-covered file
- **THEN** the step SHALL run serena diagnostics on the written files
- **AND** re-read the changed region to confirm applied state

#### Scenario: Non-code-text write verifies via re-read only

- **WHEN** a write step completes on a non-code text file without LSP coverage
- **THEN** the step SHALL re-read the changed region
- **AND** diagnostics SHALL be declared `n/a: no LSP coverage`

### Requirement: Mutation SHALL be registered with the query plane unconditionally

Every mutation on an indexed target SHALL be followed by `jcodemunch register_edit` while the index is mounted (in-project code + indexed non-code-text subtypes), regardless of whether the execution used query-plane tools. Mutations on unindexed targets (markdown/plain text) or out-of-project paths SHALL declare `n/a: not indexed`. Index freshness is a correctness property of the query plane; a missing registration on an indexed target SHALL be recorded as a violated Tool usage check entry.

#### Scenario: Edit registers unconditionally

- **WHEN** a write step edits an indexed file and the index is mounted
- **THEN** the step SHALL call `jcodemunch register_edit` naming the edited files
- **AND** the registration result SHALL be recorded in the Tool usage check

#### Scenario: Unmounted index records n/a

- **WHEN** the jcodemunch index is not mounted
- **THEN** the Tool usage check SHALL record `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration

#### Scenario: Unindexed target records n/a

- **WHEN** a mutation touches markdown, plain text, or an out-of-project file
- **THEN** the Tool usage check SHALL record `n/a: not indexed`
- **AND** no registration SHALL be required
