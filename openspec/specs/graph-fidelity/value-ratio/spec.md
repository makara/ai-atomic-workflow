# graph-fidelity/value-ratio Specification

## Purpose

The per-call echo line renders a single value-ratio graphic — the current token total versus the uncompressed/untrimmed reference total — so the net benefit of the graph-fidelity pipeline (fidelity dedup, consumed-elision, headroom compression) is visible at a glance with scale.

## Requirements

### Requirement: Value-ratio graphic on the echo line

The echo line SHALL render one benefit graphic `│████░░│ cur/ref` whenever benefit facts are present: 8 fixed cells, fill ratio = current / (current + saved), followed by dual compact numbers (current / reference). Reference = current + saved. The graphic SHALL render even when the current figure is zero (a measured source exists but reports zero) — the zero case SHALL be directly visible rather than omitted. The graphic SHALL be omitted only on faces without a measured current source (opencode) and when no benefit facts exist at all.

#### Scenario: Ratio renders dual numbers

- **WHEN** the session current is 12,400 tokens and saved is 55,700 tokens
- **THEN** the graphic fills 12,400/68,100 of 8 cells, the dual numbers render `12.4k/68.1k`, and a format pin test asserts the exact line shape

#### Scenario: Zero benefit is directly visible

- **WHEN** saved = 0 and current > 0
- **THEN** the bar renders full and the dual numbers render the same value twice (current/reference equal) — zero benefit is visible without any status flag

#### Scenario: Zero current renders the graphic

- **WHEN** a measured source exists but reports current = 0 (metering present, zero tokens)
- **THEN** the value-ratio segment renders with a zero-filled bar and `0/ref` dual numbers — the measured-zero state is visible, not silently omitted

#### Scenario: No current source omits the graphic

- **WHEN** the face has no measured usage data (opencode)
- **THEN** no value-ratio segment renders and the line keeps identity + progress (declared platform difference, same rule as usage metering)

### Requirement: Line segment pruning

The echo line SHALL carry only the identity pointer, the progress segment (N/M), and the value-ratio graphic. The budget bar/percentage segment, the mode segment, and the status-flag segment (high / iteration / headroom) SHALL NOT render.

#### Scenario: Pruned line format pinned

- **WHEN** the echo line renders with identity, progress, and benefit data
- **THEN** the exact shape is `▣ [seam] node <id> · N/M · │████░░│ cur/ref` and a pin test asserts it contains no `%` budget segment, no `mode` segment, and no `⚠` flag segment

#### Scenario: Budget signal retained off-line

- **WHEN** a node boundary settles
- **THEN** the settlement details payload carries the metering ledger and the benefit breakdown — the removed line segments' facts remain available on audit expansion

### Requirement: Settlement audit surface

Node-boundary settlement details SHALL include the benefit breakdown: per-source saved tokens with platform-fact provenance, alongside the metering ledger.

#### Scenario: Details carry benefit

- **WHEN** a node boundary settles with benefit activity
- **THEN** the details object includes the ledger and a benefit object with per-source splits and provenance flags

### Requirement: Benefit ledger fed by platform facts

Saved-token figures SHALL accumulate in a session ledger fed by platform-reported compression feedback (per-execution before/after sizes; exact token figures when the headroom response carries them). Platform compaction-result events (`auto_compaction_end` — action, result, aborted, will-retry, skipped) accumulate as outcome facts and SHALL NOT touch the saved-token total. Character-delta token estimates (÷4) are a flagged fallback: recorded only when no exact figures exist, permanently contaminating the source's exact flag, visible in the settlement audit surface. No dedup/elision sources exist (removed, ADR 0170). The ledger SHALL be monotonic within a run (non-positive exact values clamp to zero). The opencode face SHALL NOT feed a ledger — no display consumer there (declared platform difference alongside the omitted graphic).

#### Scenario: Platform facts accumulate into one number

- **WHEN** compaction-outcome events and compression feedback records arrive in a run
- **THEN** the ledger sums the platform-reported figures and the line renders one cumulative figure

#### Scenario: Estimate fallback is flagged

- **WHEN** a compression applies and the engine reports no exact token figures
- **THEN** a ÷4 character-delta estimate may be recorded, the source's exact flag flips to false (contamination, audit-visible), and the settlement audit surface annotates the estimate — exact figures always win when present

### Requirement: opencode settlement visibility contract

The opencode face SHALL deliver settlement visibility through the shared settle/notify path: the pre-rendered settlement line (identity pointer + progress segment — the same `renderEchoLine` output minus the value-ratio graphic) SHALL be emitted via `client.tui.showToast` when the toast surface is reachable; when it is unreachable, the line rides the transcript as an echo-class append — the declared fallback, explicitly annotated (REVISED 2026-08-14 by change `graph-fidelity-round8-spec-residue-sweep` — the former "no toast/sendMessage API — declared ABSENT" claim was false). The operator SHALL see the line; no separate graphic, no post-hoc module, no silent settlement (main spec "Single settle/notify path" + "opencode face keeps management off the request path").

#### Scenario: opencode line is the pre-rendered echo

- **WHEN** an opencode session settles a node boundary
- **THEN** the settlement line is delivered via `client.tui.showToast` (or the annotated transcript fallback), byte-identical to the OMP render minus the omitted graphic segment

#### Scenario: No graphic without a measured source

- **WHEN** the opencode line renders
- **THEN** no value-ratio segment appears (no measured current source — never fabricated)
