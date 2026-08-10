# tool-usage-contract Specification

## Purpose

MCP tool usage is a first-class observable contract with deterministic triggers: output size drives headroom compression, edits register cache invalidation while jcodemunch is in use, core task classes execute via serena only, and each main node self-reports its usage in a `Tool usage check:` section with violation markers aggregated through the constraint pipeline. Headroom infrastructure health is a three-state gate (down / cold / ok) surfaced honestly.

## Requirements

### Requirement: Deterministic output-size trigger SHALL compress before reasoning

A tool result or file content larger than 8KB (≈2K tokens) SHALL be compressed via `headroom_compress` before the agent reasons over it; the original SHALL remain retrievable by hash. The threshold SHALL be mechanical (result size), not heuristic.

#### Scenario: Large tool output compresses

- **WHEN** a tool returns a result larger than 8KB
- **THEN** the agent SHALL call `headroom_compress` on it before reasoning
- **AND** the compressed form SHALL carry the hash for `headroom_retrieve`

#### Scenario: Small output needs no compression

- **WHEN** a tool result is at or below 8KB
- **THEN** no compression SHALL be required
- **AND** the `Tool usage check:` line SHALL report `n/a: <threshold not met>`

### Requirement: Every file edit SHALL register cache invalidation while jcodemunch is in use

Every file edit SHALL be followed immediately by `jcodemunch register_edit` with the edited paths **while jcodemunch is in use by the execution**. Executions that do not use jcodemunch SHALL report `n/a: jcodemunch not in use`; missing registration while jcodemunch is in use is a `violated` entry in the self-report.

#### Scenario: Edit registers immediately while jcodemunch in use

- **WHEN** an agent edits one or more files and the execution uses jcodemunch
- **THEN** a `jcodemunch register_edit` call SHALL follow with the edited `file_paths`

#### Scenario: Unregistered edits are violations while jcodemunch in use

- **WHEN** the self-report lists edits without a corresponding `register_edit` and jcodemunch is in use
- **THEN** the entry SHALL be `violated: register_edit — <N> edits unregistered`
- **AND** the violation marker SHALL prefix the node output

#### Scenario: No jcodemunch use means n/a

- **WHEN** the execution does not use jcodemunch
- **THEN** the register_edit line SHALL report `n/a: jcodemunch not in use`
- **AND** no violation SHALL be recorded for missing registration

### Requirement: Task classes SHALL prefer the scenario's designated adapter

Task tool preference SHALL come from the HLT Registry scenario table (atom-kernel §High-Level Tool Registry): each operation executes via its scenario's designated adapter — in-project code locate = jcodemunch chain head + serena LSP ground-truth confirmation; in-project unindexed text (markdown/plain) locate = serena `search_for_pattern`; write/verify (in-project) = serena replace/symbol/diagnostics tools; special types / out-of-project = platform-native read/write; run = platform shell (`bash`, rtk prefix per project constraints); compress = headroom-ai; review work SHALL dispatch sub-agent review (index-backed queries on indexed repos). Channel file entries SHALL be consumed per the HLT read chain — structural overview (serena `get_symbols_overview`) before full reads, sliced reads.

#### Scenario: Code-touching main node opens with the scenario locate adapter

- **WHEN** a main node's task touches in-project code
- **THEN** the node SHALL open with a jcodemunch locate call (chain head) followed by serena LSP ground-truth confirmation
- **AND** the Tool usage check SHALL carry the `used:` line with evidence

#### Scenario: Unindexed text locate uses serena

- **WHEN** a main node's task touches in-project markdown or plain text
- **THEN** the node SHALL use serena `search_for_pattern`
- **AND** jcodemunch SHALL be declared `n/a: not indexed`

#### Scenario: Core adapter unavailable fails loudly

- **WHEN** a scenario's designated adapter is unavailable (server down, project unactivated, unindexed)
- **THEN** the step SHALL fail naming the adapter as the missing dependency
- **AND** no cross-adapter fallback SHALL occur
- **AND** the Tool usage check SHALL record `n/a: <reason>`

#### Scenario: Adapter unavailable degrades with reason

- **WHEN** a scenario's designated adapter is unavailable
- **THEN** the step SHALL fail naming the adapter
- **AND** no cross-adapter fallback SHALL occur
- **AND** the Tool usage check SHALL record `n/a: <reason>`

### Requirement: Main nodes SHALL self-report tool usage

Every main node output SHALL end with a `Tool usage check:` section — one line per declared scenario (operation class x target domain; phase `operations:` ∪ skill `Operation classes`): the scenario's designated adapter chain-head tool-call evidence or a named `n/a: <structural reason>` line. n/a reasons SHALL name the cause (`not indexed` / `project-root-bound` / `no LSP coverage` / `proxy down` / `threshold not met`). The marker is generated by the check, never self-issued: missing evidence for a declared scenario → automatic `[TOOL USAGE VIOLATION: N]`; an output with no `Tool usage check:` block counts all declared scenarios. The check SHALL cover agent-side obligations only — channel file consumption (overview-first, sliced reads, compress-after-read) per the HLT registry entries.

#### Scenario: Clean usage reports used lines

- **WHEN** a node complied with every declared scenario
- **THEN** the output SHALL end with `Tool usage check:` listing `used:`/`n/a:` lines only

#### Scenario: Violation markers reach the approval gate

- **WHEN** a node output carries `[TOOL USAGE VIOLATION: N]`
- **THEN** the approval pre-call SHALL append `[TOOL USAGE VIOLATION: <nodeId> × N]`
- **AND** the final report SHALL include the tools stats line with the violation count

#### Scenario: Declared class without evidence is marked

- **WHEN** a node declares `locate (in-project code)` but its output carries no locate-chain tool evidence and no n/a reason
- **THEN** the output SHALL be prefixed with `[TOOL USAGE VIOLATION: 1]` automatically

#### Scenario: Missing check block counts as full violation

- **WHEN** a node output lacks a `Tool usage check:` section
- **THEN** all declared scenarios SHALL be counted as violations
- **AND** the output SHALL be prefixed with `[TOOL USAGE VIOLATION: <N>]`

#### Scenario: Structural n/a satisfies the check

- **WHEN** a declared scenario's adapter is structurally impossible for the target (unindexed, project-root-bound, no LSP coverage, proxy down)
- **THEN** the check SHALL record `n/a` with the named reason
- **AND** no violation SHALL be recorded

#### Scenario: Large channel entries consume per the HLT read chain

- **WHEN** a main node's channels include file entries (globs / bare paths) aggregating ≥ 8KB
- **THEN** the dispatched NodeDetail SHALL NOT carry map headers (materialization removed)
- **AND** the agent SHALL consume per the HLT read chain (overview-first, sliced reads, compress-after-read)

#### Scenario: Channel file entries consume via verbatim or HLT read chain

- **WHEN** a main node's channels include file entries (globs / bare paths)
- **THEN** entries aggregating < 8KB SHALL be injected verbatim as `## File:` blocks
- **AND** entries aggregating ≥ 8KB SHALL NOT arrive as scheduler-side map headers (removed)
- **AND** the agent SHALL read file content on demand (structural overviews, sliced reads)
- **AND** any read result > 8KB SHALL be compressed via `headroom_compress` MCP before reasoning (compress entry trigger — no separate pipeline)

#### Scenario: No condense-context invocation

- **WHEN** a node consumes channel file entries
- **THEN** the `condense-context` CLI SHALL NOT be invoked (removed)
- **AND** the Tool usage check channel-file row SHALL report consumption obligations (overview-first, sliced reads, compress-after-read) with evidence

### Requirement: Headroom health SHALL be a three-state gate

Headroom availability SHALL be probed and reported as `down`, `cold`, or `ok`, and the final report stats SHALL aggregate from Tool usage check evidence and `headroom_stats` (no `.context.json` manifests).

#### Scenario: Proxy down is marked

- **WHEN** the headroom proxy is unreachable
- **THEN** the run SHALL carry `[HEADROOM PROXY DOWN]` observability
- **AND** compress calls SHALL still proceed (honest 0% fallback) with the state recorded

#### Scenario: Cold proxy reports bootstrap state

- **WHEN** the proxy is up but the Kompress model is still bootstrapping
- **THEN** the state SHALL be `cold`
- **AND** the savings line SHALL report the actual 0% with the `cold` state attached

#### Scenario: Pilot context stats aggregate from tool usage evidence

- **WHEN** the pilot compiles the final report
- **THEN** the context/tools stats SHALL aggregate from Tool usage check evidence and `headroom_stats` (no `.context.json` manifests exist)

### Requirement: Registry completeness is structurally enforced

The HLT Registry SHALL be validated for completeness: every entry has contract, chain, enforcement, and tier views; core entries have chain length exactly 1 — serena for locate/read/write/verify, platform shell for run (the single exception); utility entries carry optional markers + use cases + n/a rules. A registry entry missing a view SHALL be a validation error — uncovered operation classes are structurally impossible.

#### Scenario: Entry completeness is validated

- **WHEN** the registry is validated
- **THEN** every entry SHALL have contract, chain, enforcement, and tier views
- **AND** an entry missing a view SHALL be a validation error

#### Scenario: Core chain length is enforced

- **WHEN** the registry is validated
- **THEN** every core entry SHALL have chain length exactly 1 — serena for serena-backed classes, platform shell for run
- **AND** a core entry with a multi-tool or non-declared chain SHALL be a validation error

### Requirement: Registry Injection SHALL carry the scenario key

Registry Injection blocks SHALL carry the scenario key — `## Registry: <tool> — scenario: <domain> x <operation> -> <adapter>` — so the dispatched node receives adapter assignment with the entry. Undeclared classes SHALL degrade to the SKILL.md core scenario rows. Injection SHALL be the assignment authority; the executor SHALL NOT re-classify by judgment.

#### Scenario: Declared class injection carries scenario key

- **WHEN** a node declares an operation class with a registry entry
- **THEN** the injected `## Registry:` block SHALL include the scenario key (domain x operation -> adapter)
- **AND** the executor SHALL use the injected assignment without re-classification

#### Scenario: Undeclared class degrades to core rows

- **WHEN** a node declares no operation class for an operation it performs
- **THEN** the executor SHALL resolve the adapter from the SKILL.md core scenario rows
- **AND** no cold read SHALL be required for core operations

### Requirement: Hot param surfaces SHALL serve the tool usage check

The Tool usage check SHALL reference the hot parameter surfaces for evidence (chain-head tool calls with hot params resolvable from SKILL.md/injection). Headroom compress evidence SHALL reference the MCP contract.

#### Scenario: Hot param evidence

- **WHEN** a check records a hot tool call as used
- **THEN** the evidence SHALL be verifiable against the hot param surface
- **AND** no cold schemas read SHALL be required

#### Scenario: Compress evidence via MCP contract

- **WHEN** a check records headroom compress evidence
- **THEN** the evidence SHALL reference the MCP contract tools
- **AND** proxy deployment SHALL NOT alter the contract reference
