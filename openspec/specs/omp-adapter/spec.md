# omp-adapter Specification

## Purpose

Prototype-level enforcement-lifecycle contract for the OMP adapter: scenario-table enforcement of HLT-registry restrictions applies at all times — not scoped to graph lifecycle, including sub-agents, and is not disableable. Enforcement covers only scenarios with a designated adapter row; platform-native tools on in-project non-code text targets are never denied (permissive cells). Caveman + rtk prompts are injected once per agent start. The `.omp/extensions` prototype stays a validation-only seam artifact.

## Requirements

### Requirement: Enforcement SHALL be always-on

Constraints and tool-surface enforcement SHALL apply at all times — not scoped to graph lifecycle — including sub-agents, and SHALL NOT be disableable. The armed-window state machine (arm on dispatch, disarm on terminal signals) SHALL be deleted. Enforcement SHALL be scenario-table-driven: each tool call resolves (target path + type) -> scenario -> designated adapter; calls whose tool is not the scenario's designated adapter SHALL be denied naming the designated adapter. Enforcement SHALL cover only scenarios with a designated adapter row: platform-native tool calls on in-project non-code text targets SHALL NOT be denied (adapter = platform-native read/write per hlt-heat-layering In-project non-code text read/write); target types outside the domain enumeration SHALL pass through, never denied. Designated adapter families (serena/jcodemunch/headroom) SHALL never be denied.

#### Scenario: Always-on deny

- **WHEN** a tool call violates the scenario table outside graph execution
- **THEN** the call SHALL be denied naming the designated adapter
- **AND** no disarm mechanism SHALL exist

#### Scenario: Code-only native-tool denial

- **WHEN** a platform-native tool call targets an in-project code file
- **THEN** the call SHALL be denied naming the scenario's designated adapter (serena/jcodemunch)

#### Scenario: Text native-tool passthrough

- **WHEN** a platform-native tool call targets an in-project non-code text file
- **THEN** the call SHALL NOT be denied — the platform-native tool SHALL be allowed

#### Scenario: Unknown target passthrough

- **WHEN** a tool call targets a file type outside the domain enumeration
- **THEN** the call SHALL NOT be denied

#### Scenario: Sub-agent coverage

- **WHEN** a sub-agent executes a tool call
- **THEN** the scenario-table enforcement SHALL apply (where platform hooks reach; otherwise the sub-agent prompt carries the discipline)

### Requirement: Prompt injection SHALL be one-time

Caveman + rtk prompts SHALL be injected into the system prompt ONCE per agent start via before_agent_start — `{ systemPrompt: [...base, CAVEMAN_PROMPT, RTK_PROMPT] }` — including sub-agents (detected via the OMP subagent marker). Per-LLM-call prompt append (before_provider_request) SHALL NOT exist (provider cache prefix stays stable).

#### Scenario: One-time inject

- **WHEN** an agent starts (main or subagent)
- **THEN** the system prompt SHALL include the caveman + rtk prompts once
- **AND** no per-LLM-call append SHALL occur

#### Scenario: Sub-agent prompt carries discipline

- **WHEN** a sub-agent's system prompt is built
- **THEN** it SHALL include the caveman + rtk prompts
- **AND** platform-hook enforcement gaps SHALL be covered by the prompt

### Requirement: Prototype SHALL stay validation-only

The .omp/extensions prototype SHALL remain a seam-validation artifact: it SHALL NOT enter packages, formal specs, ADRs' normative text, skills, or constraints as authoritative design. Formal documentation SHALL reference the platform-neutral contracts, never the prototype's implementation.

#### Scenario: Formal docs cite contracts not prototype

- **WHEN** a formal document describes enforcement or prompts
- **THEN** it SHALL reference the platform-neutral contracts
- **AND** SHALL NOT cite .omp/extensions as authoritative

#### Scenario: Prototype stays unmodified by implementation

- **WHEN** the enforcement surface is implemented
- **THEN** the implementation SHALL NOT modify or inherit code from the .omp/extensions prototype
- **AND** the prototype SHALL remain a validation artifact
