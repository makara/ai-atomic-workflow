# mutation-plane Specification

## Purpose

Mutation + ground-truth plane — serena is the sole engine for write and verify classes in the HLT registry. LSP-accurate semantics, safety-guarded editing, diagnostics-backed verification.

## Requirements

### Requirement: Write class SHALL be serena-only

HLT write-class chains SHALL name serena as the sole tool (`create_text_file`, `replace_content`, `replace_in_files`, `replace_symbol_body`, `rename_symbol`, `insert_before/after_symbol`, `safe_delete_symbol`). jcodemunch SHALL NOT appear in any write chain (read-only charter). No cross-tool fallback SHALL exist for write.

#### Scenario: Edit applies through serena

- **WHEN** a write step edits a file
- **THEN** the step SHALL call a serena edit tool
- **AND** no jcodemunch or platform-native edit tool SHALL appear in the write chain

#### Scenario: New file creates through serena

- **WHEN** a write step creates a file
- **THEN** the step SHALL call serena `create_text_file`
- **AND** the created file SHALL be registered with the query plane afterwards

### Requirement: Verify class SHALL be serena diagnostics + re-read

HLT verify-class chains SHALL be serena `get_diagnostics_for_file` (min_severity 1) followed by a re-read of the changed region. Verify SHALL NOT depend on the query plane.

#### Scenario: Write verifies via diagnostics and re-read

- **WHEN** a write step completes
- **THEN** the step SHALL run serena diagnostics on the written files
- **AND** re-read the changed region to confirm applied state

### Requirement: Mutation SHALL be registered with the query plane unconditionally

Every mutation SHALL be followed by `jcodemunch register_edit` while the index is mounted, regardless of whether the execution used query-plane tools. Index freshness is a correctness property of the query plane; a missing registration SHALL be recorded as a violated Tool usage check entry.

#### Scenario: Edit registers unconditionally

- **WHEN** a write step edits a file and the index is mounted
- **THEN** the step SHALL call `jcodemunch register_edit` naming the edited files
- **AND** the registration result SHALL be recorded in the Tool usage check

#### Scenario: Unmounted index records n/a

- **WHEN** the jcodemunch index is not mounted
- **THEN** the Tool usage check SHALL record `n/a: jcodemunch not in use`
- **AND** the step SHALL NOT be marked violated for missing registration
