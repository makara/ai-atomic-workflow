# graph-fidelity/compress-stage Specification

## Purpose

Class-driven working-face context compression executed at the graph-fidelity context seam via the headroom MCP engine: candidate selection by signal class (unconditional submission of class-eligible content — no size thresholds, budget gates, or scaling ramps; the engine arbitrates no-op), protection list, hash markers, async worker + cache, zero-deny degradation. (REVISED 2026-08-14 by change graph-fidelity-round7-doc-residue-sweep — former "Budget-driven … adaptive thresholds" wording was historical; the delta spec cannot carry Purpose edits, so this block is corrected in place per the main-spec single-writer exception.)

## Requirements

### Requirement: Compress-stage description states class-driven selection

The compress-stage capability description SHALL present compression as class-driven working-face context compression executed at the graph-fidelity context seam via the headroom MCP engine — candidate selection by signal class, protection list, hash markers, async worker + cache, zero-deny degradation. The "Budget-driven … adaptive thresholds" phrasing SHALL NOT appear in the capability description; the description SHALL agree with the class-driven requirement (no size thresholds, no budget gates, no scaling ramps — ADR 0167/0172).

#### Scenario: Description matches requirements

- **WHEN** a reader opens the compress-stage capability description
- **THEN** it states class-driven selection, and no budget-driven or adaptive-threshold wording appears anywhere in the capability document

#### Scenario: Intro contradiction removed

- **WHEN** the capability description and its class-driven requirement are compared
- **THEN** both describe the same class-driven contract (unconditional submission by signal class, engine-arbitrated no-op)

### Requirement: Protection list honored verbatim

Reference-face content (skills, convention files, task text, constraints/run-mode blocks), node outputs, approval/gate decisions, task() receipts, and write-operation results SHALL never be compression candidates.

#### Scenario: Protected content survives uncompressed

- **WHEN** a run frame, node output, or decision text appears in the transcript
- **THEN** the compress stage never selects it as a candidate, regardless of size

### Requirement: Compressed replacement with retrieval marker

A compressed candidate SHALL be replaced by the headroom-compressed text plus a `[compressed — hash=<h>]` marker; the original is retrievable via `headroom_retrieve(<hash>)` while the store holds it.

#### Scenario: Marker format

- **WHEN** a candidate is compressed
- **THEN** the transcript carries the compressed text and a marker containing the headroom hash

#### Scenario: On-demand restoration

- **WHEN** a downstream consumer needs the original detail of a compressed output
- **THEN** `headroom_retrieve(<hash>)` restores it (query-aware when supported)

### Requirement: Zero-deny degradation

Any compress-stage failure (health gate down, MCP error, worker down) SHALL leave the transcript unchanged; the node never fails because of compression.

#### Scenario: Headroom down

- **WHEN** the headroom engine reports down (MCP unreachable / worker failed) and the compress stage cannot run
- **THEN** the seam passes the transcript through uncompressed and records the `[HEADROOM DOWN]` marker state

### Requirement: Node-boundary pre-compression

At node-boundary settlement, a completed node's oversized working outputs SHALL be pre-compressed so the cache is warm for downstream calls (prewarm runs at the turn boundary / idle window — ADR 0171).

#### Scenario: Settlement warms the cache

- **WHEN** a node boundary settles and the settled node's working outputs exceed the class-eligibility bar
- **THEN** compression jobs run in the background and the cache holds the replacements for subsequent context calls

### Requirement: Compress stage sits in the seam chain

The context-seam transform chain SHALL run `fidelity → compress → echo` on both platform faces (3 stages — elision removed, ADR 0170; single composition, ADR 0167).

#### Scenario: Chain order on OMP face

- **WHEN** the OMP context seam processes a message set
- **THEN** the compress stage runs after fidelity reduction, the echo applies last, and no elision stage exists in the composition

#### Scenario: Chain order on opencode face

- **WHEN** the opencode messages.transform hook processes a message set
- **THEN** the same chain order applies (fidelity → compress → echo)

### Requirement: Class-driven unconditional selection

Compression candidates SHALL be selected purely by signal class: any working-face tool result that is not on the protection list, not already compressed (marker idempotency), and not anchored-frame reference content is submitted to headroom compression unconditionally. No size thresholds, budget gates, or scaling ramps SHALL gate the decision (ADR 0167); the headroom engine's router decides whether compression yields a result (no-op for incompressible content). This mirrors the main spec's "Class-driven unconditional compression" requirement — this sub-spec adds no separate trigger.

#### Scenario: Over-threshold concept removed

- **WHEN** a working-face tool result of any size (including small payloads) is processed
- **THEN** it is submitted to headroom compression without any byte/token threshold check, and the engine returns either a compressed replacement or a no-op

#### Scenario: Budget-independent execution

- **WHEN** session budget consumption is below any historical water mark
- **THEN** compression still executes for eligible candidates (no enable gate)

#### Scenario: First frame stays full-size

- **WHEN** a landed tool result appears in the message array for the first time and its store already completed (cache hit)
- **THEN** the result stays verbatim (full fidelity for the model's first read) and the marker applies from the second transform pass onward

### Requirement: Deterministic cache worker

Compression application SHALL be deterministic: the seam applies a cached replacement synchronously on cache hit; on cache miss the current call passes through verbatim and a later call applies the cached result. Landing events (opencode `message.updated` / OMP `message_end`) initiate store jobs fire-and-forget (never blocking the request path); the worker is a per-session deterministic cache, not a deferred-application queue (ADR 0167 d5).

#### Scenario: Cache miss passes through, later call applies

- **WHEN** a candidate is identified but its compressed form is not yet cached (store job in flight)
- **THEN** the current call passes through unchanged and a later call (same transcript content) applies the cached replacement synchronously

#### Scenario: Landing events warm the cache

- **WHEN** a tool result lands and the landing-event store initiation completes before the next transform
- **THEN** the next call applies the marker synchronously from the cache — no queue, no deferred callback
