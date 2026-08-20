# graph-fidelity/value-ratio Specification

## Purpose

The per-call echo line renders a single value-ratio graphic — the current token total versus the uncompressed/untrimmed reference total — so the net benefit of the graph-fidelity pipeline (fidelity dedup, consumed-elision, context-module compression) is visible at a glance with scale.

## Requirements

### Requirement: Value-ratio graphic on the echo line

The echo line SHALL render one benefit graphic `│████░░│ cur/ref` whenever benefit facts are present: 8 fixed cells, fill ratio = current / (current + saved), followed by dual compact numbers (current / reference) when exact figures exist. The graphic SHALL be omitted when no benefit facts exist, when the face has no measured current source (opencode), and when saved = 0 (no benefit — user ruling, round 10; supersedes the former "render even when zero" clause).

#### Scenario: Ratio renders dual numbers

- **WHEN** the session current is 12,400 tokens and saved is 55,700 tokens
- **THEN** the graphic fills 12,400/68,100 of 8 cells, the dual numbers render `12.4k/68.1k`, and a format pin test asserts the exact line shape

#### Scenario: Zero benefit omits the graphic

- **WHEN** saved = 0
- **THEN** the benefit segment does not render — no bar, no dual numbers, no status flag; the line keeps identity + progress

#### Scenario: Zero benefit is directly visible

- **WHEN** saved = 0 (no accepted reduction in the run so far)
- **THEN** no benefit segment renders — the zero-benefit state is directly visible by the segment's absence, with no status flag (user ruling, round 10: no benefit → no display)

#### Scenario: Zero current renders the graphic

- **WHEN** a measured current source reports current = 0 but saved > 0 (benefit exists, entirely saved)
- **THEN** the value-ratio segment renders with a zero-filled bar and `0/ref` dual numbers — the measured-zero current state is visible, not silently omitted

#### Scenario: Ratio-only without exact figures

- **WHEN** benefit facts exist but the compressor reports no exact token figures
- **THEN** the graphic renders with the ratio fill (computed from reported sizes) and no absolute numbers follow it

#### Scenario: No current source omits the graphic

- **WHEN** the face has no measured usage data (opencode)
- **THEN** no value-ratio segment renders and the line keeps identity + progress (declared platform difference, same rule as usage metering)

### Requirement: Line segment pruning

The echo line SHALL carry only the identity pointer, the progress segment (N/M), and the value-ratio graphic. The budget bar/percentage segment, the mode segment, and the status-flag segment (high / iteration) SHALL NOT render.

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

Saved-token figures SHALL accumulate in a session ledger fed by platform-reported compression feedback (per-execution before/after sizes; exact token figures when the compressor response carries them). Character-delta token estimates (÷4) are REMOVED (user ruling, round 10): when the compressor reports no exact figures the ledger keeps the ratio only and the line renders no absolute numbers. Compaction-result events remain platform-side (R8 — the module registers no compaction handlers; outcome facts never enter the ledger and never touch the saved-token total). The ledger SHALL be monotonic within a run (non-positive exact values clamp to zero). The opencode face SHALL NOT feed a ledger — no display current source exists there.

#### Scenario: Estimate fallback is flagged

- **WHEN** a compression applies and the compressor reports no exact token figures
- **THEN** no ÷4 estimate is recorded and no contamination flag is set; the ledger keeps the ratio only (the ratio fallback), the line renders no absolute numbers, and nothing fabricated is shown (user ruling, round 10: ÷4 estimates removed)

#### Scenario: Platform facts accumulate into one number

- **WHEN** compression feedback records arrive in a run (accepted reductions with compressor-reported figures)
- **THEN** the ledger sums the reported figures and the line renders one cumulative figure

#### Scenario: Ratio fallback without fabrication

- **WHEN** a compression applies and the compressor reports no exact token figures
- **THEN** no ÷4 estimate is recorded; the ledger keeps the ratio, the line renders no absolute numbers, and nothing fabricated is shown

### Requirement: opencode settlement visibility contract

The opencode face SHALL deliver settlement visibility through the shared settle/notify path: the pre-rendered settlement line (identity pointer + progress segment — the same `renderEchoLine` output minus the value-ratio graphic) SHALL be emitted via `client.tui.showToast` when the toast surface is reachable; when it is unreachable, the line rides the transcript as an echo-class append — the declared fallback, explicitly annotated (REVISED 2026-08-14 by change `graph-fidelity-round8-spec-residue-sweep` — the former "no toast/sendMessage API — declared ABSENT" claim was false). The operator SHALL see the line; no separate graphic, no post-hoc module, no silent settlement (main spec "Single settle/notify path" + "opencode face keeps management off the request path").

#### Scenario: opencode line is the pre-rendered echo

- **WHEN** an opencode session settles a node boundary
- **THEN** the settlement line is delivered via `client.tui.showToast` (or the annotated transcript fallback), byte-identical to the OMP render minus the omitted graphic segment

#### Scenario: No graphic without a measured source

- **WHEN** the opencode line renders
- **THEN** no value-ratio segment appears (no measured current source — never fabricated)

### Requirement: Echo benefit-facts wiring

Benefit facts SHALL reach the echo renderer through an optional pure-function parameter: `renderIdentityEcho` accepts an optional benefit segment input; the lifecycle exposes a registration slot through which the context module's ledger provides the facts. The ledger remains the single render source; the echo renderer stays a pure function (facts in, line out) — the segment renders only when a provider is registered and facts exist. The base adapter and the context adapter SHALL operate on one shared lifecycle instance per platform face at runtime (bundle-level composition), so a provider registered by the context module reaches the echo hook rendered by the base adapter.

#### Scenario: Echo renders segment from provider

- **WHEN** a benefit provider is registered and benefit facts exist
- **THEN** the echo line renders `▣ [seam] node <id> · N/M · │████░░│ cur/ref` (segment per the value-ratio rule)

#### Scenario: No provider omits the segment

- **WHEN** no benefit provider is registered (or no facts exist)
- **THEN** the echo line renders identity + progress only — zero coupling when the context module is absent

#### Scenario: Renderer stays pure

- **WHEN** the echo renderer is unit-tested
- **THEN** the test passes facts as input and asserts the line output — no state, no side effects

#### Scenario: Bundle composition shares one instance

- **WHEN** the base adapter and the context adapter load as separate bundles in one platform face
- **THEN** both bundles operate on one shared lifecycle instance and the provider registered by the context module feeds the echo hook rendered by the base adapter — the bundle-level docking test asserts the composed behavior

#### Scenario: Provider reaches the renderer across bundles

- **WHEN** the context module registers its ledger as benefit provider at runtime
- **THEN** the base adapter's echo hook on the same instance consumes it and renders the value-ratio segment (regression guard for the bundle-split wiring gap)

### Requirement: Settlement notification gating

The settlement line SHALL be emitted only when reportable facts exist (at least one accepted transform recorded or a usage delta observed since the last emission); zero-activity sessions SHALL NOT produce settlement notifications. When emitted, the line SHALL carry an action explanation (per-action counts and the benefit graphic when present) so the notification's meaning is self-evident.

#### Scenario: Zero activity emits nothing

- **WHEN** a session reports usage events but no transform has been recorded and no usage delta exists
- **THEN** no settlement line is emitted — the notification surface stays silent

#### Scenario: Facts present emit an explanatory line

- **WHEN** accepted transforms exist (e.g. trim 2, compress 1) with savings
- **THEN** the settlement line renders with the action counts and the benefit graphic, prefixed by an action explanation (e.g. `ctx managed: trim 2 · comp 1 · saved 12.4k`)
