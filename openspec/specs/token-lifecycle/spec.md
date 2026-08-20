# token-lifecycle Specification

## Purpose

token-lifecycle governs the token economy across the full lifecycle — prompt face (birth: what content in what style enters), context face (life/death: selection, position, fidelity L0–L3, prune, archive), feedback face (measurement: usage facts, audit, nudge, reward) — closed by the feedback loop. Prompts are classified by usage frequency (P0 system-resident / P1 session-resident / P2 node-resident / P3 cold-read) with resident prompts as the L0 face of prompt content. Each face carries a prose tier (degraded baseline) and a mechanical tier (graph-fidelity seams only).

## Requirements

### Requirement: Three-face lifecycle model

MODIFIED: the standard SHALL govern token economy across the full lifecycle — prompt face (birth: what content in what style enters), context face (life/death: selection, position, fidelity L0–L3, prune, archive), feedback face (measurement: usage facts, audit, nudge, reward) — closed by the feedback loop (measured usage facts → budget/nudge → policy). Each face SHALL have a prose tier (degraded baseline, always present — L0–L3 laws, Checks self-report) and a mechanical tier (graph-fidelity seams only). "Manual headroom" is removed from the prose tier — compression is the graph-fidelity-context module's internal mechanism, not a lifecycle-tier feature. Pluggability contract: without graph-fidelity the mechanical tier is absent and behavior correctness is unchanged (zero deny); with graph-fidelity the mechanical tier executes and built-in metering replaces agent estimates.

#### Scenario: No-plugin degrade

- **WHEN** graph-fidelity is not installed
- **THEN** prose discipline (L0–L3 laws, Checks self-report) remains fully functional and no mechanical savings apply

#### Scenario: Plugin upgrade

- **WHEN** graph-fidelity is installed
- **THEN** mechanical errored-result reduction, class-driven compression, the per-call echo, and settlement with measured metering execute at the seams, and the Checks context row reports measured usage

### Requirement: Prompt frequency classification

Prompts are classified by usage frequency into four classes: P0 system-resident (every LLM call), P1 session-resident (per session/platform load), P2 node-resident (per graph node dispatch), P3 cold-read (on demand). The system-resident class (P0) means: mechanically injected every call, resident by install (no session toggle), strength controlled by operator configuration. Resident prompts are the L0 (verbatim) face of prompt content; full prompt texts are the L2 (cold-read) face. This classification lives in the `token-lifecycle` standard.

#### Scenario: Classification applies to new prompts

- **WHEN** a new prompt is introduced
- **THEN** it is assigned a frequency class (P0–P3) and placed accordingly, never left uncategorized

#### Scenario: Resident = L0 prompt

- **WHEN** a prompt is classified P0
- **THEN** its essence renders verbatim every call and its full text is cold-readable on demand
