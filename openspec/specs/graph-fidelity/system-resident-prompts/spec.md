# graph-fidelity/system-resident-prompts Specification

## Purpose

System-resident prompt injection: a fixed set of behavior-style prompts (caveman full rule, rtk guidance, ponytail ladder, PCL vocabulary) injected into every LLM call's system prompt on both platform faces (OMP + opencode), resident by install with no session toggle, per-turn reasserted and compaction-proof.

## Requirements

### Requirement: Resident prompt block

The module renders a deterministic system-resident prompt block from a fixed resident set and injects it into the outgoing system prompt on every top-level turn on both platform faces. The block carries a machine anchor marker. Injection is additive (append), never replaces platform prompt content, and never mutates stored session messages.

#### Scenario: Every-call injection

- **WHEN** a top-level turn begins on either platform with the plugin active
- **THEN** the outgoing system prompt contains the resident prompt block, including entries for all enabled resident prompts

#### Scenario: No accumulation

- **WHEN** consecutive top-level turns occur with the same resident set
- **THEN** the block appears exactly once per turn (canonical-dedup; a previously injected block is replaced in place, never stacked)

#### Scenario: Compaction survival

- **WHEN** the platform compacts earlier history and the next top-level turn begins
- **THEN** the resident prompt block is present in the rebuilt system prompt (per-turn reassertion; the block is ephemeral, never persisted as a message)

### Requirement: Resident set

**Before**: The default resident set is fixed at install: (a) caveman full rule text, (b) rtk shell-output guidance, (c) ponytail ladder guidance, (d) PCL vocabulary table; the set is always active.

**After**: The default resident set SHALL be PCL vocabulary + HLT core requirement only. Style prompts (caveman / rtk / ponytail) SHALL NOT be injected — style guidance is consumer-owned (ADR 0175); the first-principles base document SHALL state the base cost-economy principle (prompt attachment only, never context modification) without claiming runtime injection.

#### Scenario: No style injection

- **WHEN** a top-level turn begins on either platform with the plugin active
- **THEN** the outgoing system prompt contains the resident block with PCL + HLT core requirement, and no style prompt text (caveman / rtk / ponytail) is injected by the module

#### Scenario: Style guidance consumer-owned

- **WHEN** a consumer applies style guidance themselves (e.g. via their own prompts)
- **THEN** the module does not inject, replace, or modify that guidance

#### Scenario: Default resident set present

- **WHEN** the plugin is active with default configuration
- **THEN** the resident block contains the PCL vocabulary and HLT core requirement entries (and no style prompt entries)

#### Scenario: Upstream attribution

- **WHEN** a copied prompt text is rendered
- **THEN** the block or its source registry records the upstream source for each copied text (atom-pilot / atom-kernel stay the sources of truth; HLT core requirement byte-pinned)

### Requirement: Subagent inheritance

Subagent sessions receive the resident prompt block in their system prompt on both platforms. No state bridge is required for the fixed set.

#### Scenario: Subagent system prompt

- **WHEN** a subagent session starts under an active plugin
- **THEN** its system prompt contains the resident prompt block

### Requirement: Pluggability degrade

Without the plugin, no resident block is injected and existing prose discipline (constraints, AGENTS.md) remains fully functional. Behavior correctness is identical with and without the plugin; only token cost and mechanical enforcement differ.

#### Scenario: Plugin absent

- **WHEN** the plugin is uninstalled
- **THEN** no resident block appears and no error is raised
