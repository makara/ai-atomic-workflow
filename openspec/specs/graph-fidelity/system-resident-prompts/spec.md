# graph-fidelity/system-resident-prompts Specification

## Purpose

System-resident prompt injection: a fixed set of behavior-style prompts (caveman full rule, rtk guidance, YAGNI-first ladder, PCL vocabulary) injected into every LLM call's system prompt on both platform faces (OMP + opencode), resident by install with no session toggle, per-turn reasserted and compaction-proof.

## Requirements

### Requirement: Resident prompt block

The module renders a deterministic system-resident prompt block from a fixed resident set and injects it into the outgoing system prompt on every top-level turn on both platform faces. The block carries a machine anchor marker. Injection is additive (append), never replaces platform prompt content, and never mutates stored session messages.

The block SHALL be applied to the system prompt through the SDK resident attach seam (`attachResident` registered on the `before_agent_start` canonical hook) — consumer-side hand-wired `before_agent_start` handlers and the `bind` resident option are removed.

#### Scenario: Every-call injection

- **WHEN** a top-level turn begins on either platform with the plugin active
- **THEN** the outgoing system prompt contains the resident prompt block, including entries for all enabled resident prompts

#### Scenario: No accumulation

- **WHEN** consecutive top-level turns occur with the same resident set
- **THEN** the block appears exactly once per turn (canonical-dedup; a previously injected block is replaced in place, never stacked)

#### Scenario: Compaction survival

- **WHEN** the platform compacts earlier history and the next top-level turn begins
- **THEN** the resident prompt block is present in the rebuilt system prompt (per-turn reassertion; the block is ephemeral, never persisted as a message)

#### Scenario: Injection via SDK attach

- **WHEN** a session begins on either platform with the discipline module active
- **THEN** the resident block is applied through the SDK attach handler registered on the resident seam
- **AND** no consumer-side `before_agent_start` handler and no `bind` resident option participate

### Requirement: Resident set

The default resident set SHALL be exactly two entries: (a) PCL vocabulary (atom-pilot source of truth), including the graph-start step — at graph start the pilot SHALL load the `atom-kernel` and `atom-phase-handler` skills and run jcodemunch `index_folder` + serena `activate_project` — and (b) a full five-scenario enumeration rendered as a multi-line LIST (one line per scenario: find / read / write / verify / run, each stating its operation flow and concrete tool names once). The activate guidance entry, the discipline line, and the code-exploration entry SHALL NOT be resident-injected — the resident set is exactly PCL (with the graph-start step) + full five-scenario enumeration list. Style prompts (caveman / rtk) SHALL NOT be injected, and no style-prompt text SHALL appear in any resident prompt entry.

The resident content set SHALL be supplied by the consumer as `attachResident(content)` data; the content data single-source home (consumer-side `core/resident-data.ts`) is unchanged, and the `residentPrompts()` builder is removed — the content constants pass directly to `attachResident`. The jcodemunch entry SHALL be preserved byte-identically during the attach conversion.

#### Scenario: No style injection

- **WHEN** a top-level turn begins on either platform with the plugin active
- **THEN** the outgoing system prompt contains the resident block with the PCL (incl. graph-start step) and full five-scenario enumeration entries, and no style prompt text (caveman / rtk) is injected by the module

#### Scenario: Style guidance consumer-owned

- **WHEN** a consumer applies style guidance themselves (e.g. via their own prompts)
- **THEN** the module does not inject, replace, or modify that guidance

#### Scenario: Default resident set present

- **WHEN** the plugin is active with default configuration
- **THEN** the resident block contains exactly the PCL vocabulary entry (incl. graph-start step) and the five-scenario enumeration list entry (and no style prompt entries)

#### Scenario: Graph-start step declared in PCL

- **WHEN** a graph run starts under the pilot
- **THEN** the PCL vocabulary declares the graph-start step: load `atom-kernel` + `atom-phase-handler` skills, run jcodemunch `index_folder` + serena `activate_project`; the declaration is present in the resident PCL entry and the atom-pilot SKILL.md §Process-Control Language table

#### Scenario: Enumeration renders as a list

- **WHEN** the resident block is rendered on either platform face
- **THEN** the five-scenario enumeration entry renders as a multi-line list — one line per scenario (find / read / write / verify / run), never a single concatenated line

#### Scenario: Style text absent from resident content

- **WHEN** the resident block is inspected
- **THEN** no style-prompt text appears in any resident prompt entry

#### Scenario: Code exploration entry verbatim

- **WHEN** the resident block is rendered on either platform face
- **THEN** the code-exploration posture entry is absent (superseded by the full five-scenario enumeration per ADR 0208); the jcodemunch Code Exploration Policy text is NOT resident-injected

#### Scenario: Upstream attribution

- **WHEN** a copied prompt text is rendered
- **THEN** the block or its source registry records the upstream source for each copied text (atom-pilot / atom-kernel / .refs/jcodemunch-mcp/QUICKSTART.md stay the sources of truth; HLT-era text is absent by byte-level assertion)

#### Scenario: jcodemunch entry content preserved

- **WHEN** the resident jcodemunch entry is rendered on either platform face
- **THEN** its content is unchanged from the pre-refactor single source (the round-13 carry-over entry does not regress during the attach conversion)

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
