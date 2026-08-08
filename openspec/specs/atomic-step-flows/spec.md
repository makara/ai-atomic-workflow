# atomic-step-flows Specification

## Purpose

Atomic step flows — every atomic operation (query, read, create, delete, edit, verify, review) follows a fixed cross-plane tool sequence: index → confirm → mutate → register → verify. Predictable and auditable execution.

## Requirements

### Requirement: Atomic steps SHALL follow fixed cross-plane flows

Each atomic operation SHALL follow its declared plane sequence. Plane shorthand: **IX** = query plane (jcodemunch), **LS** = mutation/ground-truth plane (serena). The declared flows SHALL be:

- Query (query/locate): IX search -> LS ground-truth confirmation
- Read: IX locate (unknown target only) -> LS overview -> LS sliced read; >8KB -> headroom compress
- Create: LS create -> IX register
- Delete: IX preflight -> LS reference-checked delete -> IX register
- Edit: IX preflight -> LS edit -> IX register -> LS verify
- Verify: LS diagnostics + re-read
- Review: IX analytics -> LS evidence reads -> sub-agent aggregation

#### Scenario: Edit follows the full flow

- **WHEN** a step edits an existing symbol
- **THEN** the step SHALL run IX preflight (check_edit_safe / get_blast_radius), apply the LS edit, register with IX, and verify with LS diagnostics + re-read
- **AND** no step in the sequence SHALL be skipped

#### Scenario: Read locates before reading when target unknown

- **WHEN** a read step's target is not known by name
- **THEN** the step SHALL locate via the query plane before reading
- **AND** the read SHALL use LS structural overview then sliced reads

#### Scenario: Delete preflights before deleting

- **WHEN** a step deletes a symbol
- **THEN** the step SHALL preflight with IX (check_delete_safe / get_impact_preview) then delete via LS `safe_delete_symbol`
- **AND** the deletion SHALL be registered with IX afterwards

### Requirement: Plane-down SHALL be a loud failure

A plane's tools being unavailable SHALL fail the step loudly, naming the missing dependency — never a silent cross-tool fallback. Query-plane-down fails locate/analytics; mutation-plane-down fails write/verify; the run class is unaffected.

#### Scenario: Query plane down fails locate

- **WHEN** the jcodemunch index is down during a locate step
- **THEN** the step SHALL fail naming jcodemunch as the missing dependency
- **AND** no serena fallback locate SHALL be attempted

#### Scenario: Mutation plane down fails write

- **WHEN** serena is down during a write step
- **THEN** the step SHALL fail naming serena as the missing dependency
- **AND** no jcodemunch or platform-native write SHALL be attempted
