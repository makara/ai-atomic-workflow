# tool-usage-contract Specification

## Purpose

MCP tool usage is a first-class observable contract with deterministic triggers: output size drives headroom compression, edits register cache invalidation while jcodemunch is in use, core task classes execute via serena only, and each main node self-reports its usage in a `Tool usage check:` section with violation markers aggregated through the constraint pipeline. Headroom infrastructure health is a three-state gate (down / cold / ok) surfaced honestly.

## Requirements

### Requirement: Compression before reasoning follows class-driven contract with direct-surface sub-clause

MODIFIED: compression before reasoning SHALL NOT be a tool-usage contract rule. The `headroom_compress`/`headroom_retrieve`/`headroom_stats` MCP tools are removed from the runtime surface; the >8KB direct-surface compression sub-clause is deleted. Compression SHALL be the graph-fidelity-context module's domain (its classification/reduction contract, spec'd in openspec/specs/graph-fidelity-context/spec.md) — the tool-usage contract carries no compression mandate and no compression tool reference.

#### Scenario: Class standard applies

- **WHEN** the graph-fidelity-context seam is live (mechanical tier)
- **THEN** compression decisions follow the context module's class-driven contract (unconditional by class, protection list, engine-arbitrated no-op) — no tool-usage rule states it

#### Scenario: Direct-surface sub-clause applies

- **WHEN** a bash/artifact scenario surfaces a raw tool result larger than 8KB directly in the agent context
- **THEN** the tool-usage contract SHALL NOT mandate a headroom call — no compression tool reference exists in the contract

#### Scenario: Sub-clause n/a reason

- **WHEN** a direct-surface tool result is at or below 8KB
- **THEN** no compression SHALL be required — the `n/a: <threshold not met>` reporting line is removed with the sub-clause

### Requirement: Every file edit SHALL register cache invalidation while jcodemunch is in use

MODIFIED: Every file edit SHALL be followed by the `mcp__jcodemunch_register_edit` tool call with the edited paths **while jcodemunch is in use by the execution**; the write scenario hint block SHALL carry the post-edit register_edit reminder (the former standalone write-reindex hint folds into the write scenario block). Executions that do not use jcodemunch SHALL report `n/a: jcodemunch not in use`; missing registration while jcodemunch is in use is a `violated` entry in the self-report.

#### Scenario: Edit registers immediately while jcodemunch in use

- **WHEN** an agent edits one or more files and the execution uses jcodemunch
- **THEN** a `mcp__jcodemunch_register_edit` call SHALL follow with the edited `file_paths`

#### Scenario: Unregistered edits are violations while jcodemunch in use

- **WHEN** the self-report lists edits without a corresponding `register_edit` and jcodemunch is in use
- **THEN** the entry SHALL be `violated: register_edit — <N> edits unregistered`
- **AND** the violation marker SHALL prefix the node output

#### Scenario: No jcodemunch use means n/a

- **WHEN** the execution does not use jcodemunch
- **THEN** the register_edit line SHALL report `n/a: jcodemunch not in use`
- **AND** no violation SHALL be recorded for missing registration

#### Scenario: Post-edit reminder + call

- **WHEN** a serena write-tool result arrives while jcodemunch is in use
- **THEN** the discipline hint names the register_edit MCP tool and the agent executes `mcp__jcodemunch_register_edit` for the edited paths

#### Scenario: Write scenario block carries registration reminder

- **WHEN** the write scenario hint block is emitted
- **THEN** it includes the register_edit obligation for edited paths while jcodemunch is in use

### Requirement: Main nodes SHALL self-report tool usage

Every main node output SHALL end with a Tool usage check section — one line per declared operation class (phase `operations:` ∪ skill `Operation classes`): the executed chain-head tool-call evidence or a named `n/a: <structural reason>` line. n/a reasons SHALL name the cause (`not indexed` / `project-root-bound` / `no LSP coverage` / `proxy down` / `threshold not met`). The section SHALL be evidence-only — the HLT Registry Injection and adapter-rule enforcement are removed (ADR 0194); no registered adapter assignment is injected. The channel-consumption scenario names ("per the HLT read chain", "via verbatim or HLT read chain") keep their historical names (HLT deleted, ADR 0194); their content describes the current read-chain obligations without HLT registry machinery. The contract carries no compression tool reference — `headroom_compress` is removed from every scenario; compression decisions belong to the graph-fidelity-context module contract.

#### Scenario: Clean usage reports used lines

- **WHEN** a node complied with every declared class
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
- **THEN** all declared classes SHALL be counted as violations
- **AND** the output SHALL be prefixed with `[TOOL USAGE VIOLATION: <N>]`

#### Scenario: Structural n/a satisfies the check

- **WHEN** a declared class's execution is structurally impossible for the target (unindexed, project-root-bound, no LSP coverage, proxy down)
- **THEN** the check SHALL record `n/a` with the named reason
- **AND** no violation SHALL be recorded

#### Scenario: Large channel entries consume per the HLT read chain

- **WHEN** a main node's channels include file entries (globs / bare paths) aggregating ≥ 8KB
- **THEN** the dispatched NodeDetail SHALL NOT carry map headers (materialization removed)
- **AND** the agent SHALL consume per the read chain (overview-first, sliced reads, compress-after-read)

#### Scenario: Channel file entries consume via verbatim or HLT read chain

- **WHEN** a main node's channels include file entries (globs / bare paths)
- **THEN** entries aggregating < 8KB SHALL be injected verbatim as `## File:` blocks
- **AND** entries aggregating ≥ 8KB SHALL NOT arrive as scheduler-side map headers (removed)
- **AND** the agent SHALL read file content on demand (structural overviews, sliced reads)
- **AND** the contract SHALL NOT mandate a compression tool call — no `headroom_compress` reference exists in the contract

#### Scenario: No condense-context invocation

- **WHEN** a node consumes channel file entries
- **THEN** the `condense-context` CLI SHALL NOT be invoked (removed)
- **AND** the Tool usage check channel-file row SHALL report consumption obligations (overview-first, sliced reads, compress-after-read) with evidence

#### Scenario: Declared class covered by registry

- **WHEN** a declared operation class maps to a scenario registry key
- **THEN** the check SHALL verify evidence against the declared class

#### Scenario: Declared class without scenario coverage

- **WHEN** a declared operation class does not resolve to a scenario registry key
- **THEN** the check SHALL report `n/a: no scenario coverage` — never silent
