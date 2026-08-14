# display-minimalism Specification

## Purpose

display-minimalism governs graph-fidelity display feedback by three laws — single-line echo, single-source metering, behavior-reward pairs — with two delivery surfaces (context seam echo, model-side; node-boundary settlement via the platform notify surface — `ctx.ui.notify` / `client.tui.showToast`, operator-side — REVISED 2026-08-14 by change graph-fidelity-round9-residual-annotations (attribution corrected by change graph-fidelity-round10-annotation-hygiene): the former "node-boundary sendMessage" surface described the deleted channel), a two-tier display model (mechanical seam-live / prose degrade baseline, fail-safe in both directions), and the mechanical-tier marker as the tiering enforcement surface.

## Requirements

### Requirement: Display minimalism three laws

The standard SHALL govern display feedback by three laws. Law 1 — single-line echo: at most one injected display line per LLM call, carrying identity pointer + deltas, never copying facts already resident in the frame block. Law 2 — single-source metering: every fact has exactly one render point; other surfaces reference, never copy. Law 3 — behavior-reward pairs: every display has a named consumer, a consumption timing, and a behavior consequence; displays without a consumer (dead surfaces) and displays without gating SHALL be removed or gated.

#### Scenario: One line per call

- **WHEN** graph-fidelity processes an LLM call for an active node
- **THEN** at most one `[seam]` line is injected

#### Scenario: Dead surface removed

- **WHEN** a display's data source does not exist on a platform face (e.g. usage event on opencode)
- **THEN** the display does not render on that face and no estimated substitute is invented

### Requirement: Display tiering semantics

The display surface SHALL have two tiers. Prose tier (plugin absent — the degrade baseline): minimal prose — no Context hints block, single-line Checks, compact final report; always present, behavior correctness unchanged. Mechanical tier (plugin present — seam-live detection): the mechanical single line SHALL fully replace the skill's per-call feedback — handler prose feedback blocks SHALL NOT be assembled and pilot per-node status lines SHALL be skipped. Degrade SHALL be fail-safe: no seam line → prose tier returns automatically.

#### Scenario: Mechanical replaces prose

- **WHEN** a run executes with the plugin present
- **THEN** per-call feedback is the single mechanical line only; the handler does not assemble prose feedback blocks and the pilot does not print per-node status lines

#### Scenario: Fail-safe degrade

- **WHEN** the plugin stops emitting seam lines mid-run
- **THEN** the prose tier baseline resumes without any configuration change

### Requirement: Run frame glossary documents the glyphic echo vocabulary

The `Run frame` glossary entry SHALL document that the echo is a glyph-anchored identity pointer — `▣ [seam] node <id>` — with the progress segment (N/M) and the value-ratio graphic as the rendering vocabulary (display-minimalism law 1). No budget/percentage, mode, or status-flag segments SHALL be listed as vocabulary (pruned, ADR 0161).

#### Scenario: Glossary entry reflects glyphic rendering

- **WHEN** a reader consults the `Run frame` glossary entry
- **THEN** the entry states the echo carries the `▣` glyph anchor plus `[seam]` machine anchor, and lists the progress segment and value-ratio graphic as rendering vocabulary — no `%` budget, mode, or `⚠` flag segments

#### Scenario: Law-1 derivation stays single-line

- **WHEN** the handler derives the per-call echo from the frame
- **THEN** the derivation remains a one-line identity pointer (frame facts never copied), matching the glossary entry's glyphic format

### Requirement: Run frame mechanical-tier marker

The run-frame block SHALL carry a mechanical-tier marker segment (`· tier mech`) when the session is seam-live — a canonical `[seam]` line in recent user messages — assembled by the handler at dispatch alongside the mode segment. The marker is the display-tiering enforcement surface: in the mechanical tier the handler SHALL NOT assemble prose feedback (Context hints, prose Checks blocks), and the executing agent's tier basis is the frame's own marker — node input — not self-detection. The degrade baseline (no marker) keeps the prose-tier obligations unchanged.

#### Scenario: seam live marker present

- **WHEN** a run dispatches a node and the session carries a canonical `[seam]` line in recent user messages
- **THEN** the run-frame block includes the `· tier mech` segment and the handler assembles no prose Checks block and no Context hints block

#### Scenario: degrade baseline unchanged

- **WHEN** a run dispatches a node and no canonical `[seam]` line is present
- **THEN** the run-frame block has no tier marker segment and the prose-tier baseline applies unchanged (single-line Checks block, violation segments expand, markers preserved)

#### Scenario: marker is node input

- **WHEN** the run-frame block carries `· tier mech`
- **THEN** the executing agent treats mechanical tier as a declared node-input fact — no seam self-detection is required to comply with the no-prose-Checks obligation

### Requirement: Single-source metering across display surfaces

A metering fact rendered on the per-call echo line and the node-boundary settlement line SHALL have exactly one render source; the two surfaces SHALL NOT present divergent values for the same fact.

#### Scenario: Echo and settle reference the same ledger

- **WHEN** the echo line renders current tokens for a node
- **THEN** the value comes from the same node-local ledger the settlement line uses, so no divergence is possible

#### Scenario: Divergence is a display violation

- **WHEN** a future implementation renders a per-node current on echo and a different scope (e.g. session cumulative) on settle
- **THEN** the display violates single-source metering and is rejected on review

### Requirement: Discipline echo contract (graph-fidelity)

The per-call discipline echo SHALL be delivered by the graph-fidelity capability as a SINGLE-LINE identity pointer: `renderEchoLine` derives the line from the latest run-id anchored frame in the outgoing message array — `▣ [seam] node <id> · N/M · │████░░│ cur/ref` — node id pointer + progress segment (N/M from the frame when present) + value-ratio graphic (when a measured current source exists), and NEVER copies the frame's declared-operations/out-of-scope clause (the frame block already sits in the same message; law 1). Metering deltas fold into the node-boundary settlement `details` payload; budget/percentage, mode, and status-flag segments SHALL NOT render (ADR 0161). The line is maintained as one line per call (canonical-line byte-equality dedup; change-driven refresh in place).

#### Scenario: subagent without frame skips

- **WHEN** a subagent session's outgoing request contains no run frame
- **THEN** the echo is skipped — no discipline line is inserted

#### Scenario: echo never blocks

- **WHEN** the echo seam is active
- **THEN** tool capability is identical with and without it — the echo is text-level only

#### Scenario: owner renamed

- **WHEN** the seam mapping table names the discipline-echo implementation owner
- **THEN** it references `graph-fidelity` (the merged module), not `signal-seams`

#### Scenario: inline format pinned

- **WHEN** the spec's discipline-line format string is compared with the frame-contract pin
- **THEN** they are identical, and a test asserts the equality

#### Scenario: subagent sessions covered

- **WHEN** a subagent session's outgoing request passes through the echo seam (OMP context event / opencode messages.transform — both platforms dispatch these for subagent sessions, platform-verified)
- **THEN** the echo is applied with the same rules as the main session, and no optional off-by-default seam is required to extend coverage to subagents

#### Scenario: clause never copied

- **WHEN** a main-node frame declares `[locate, read, write, review]` operations
- **THEN** the injected line contains the node id, progress, and value-ratio only — no `declared operations` or `out of scope` clause text, no metering deltas, no mode/flag segments

#### Scenario: one line per call

- **WHEN** graph-fidelity processes an LLM call for an active node
- **THEN** at most one `[seam]` line is injected, refreshed in place (never accumulating)
