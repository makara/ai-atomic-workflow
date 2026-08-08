# omp-adapter Specification

## Purpose

Prototype-level enforcement-lifecycle contract for the OMP adapter: HLT-registry restrictions exist only while a graph run dispatches main-node work in the main agent, and never outlive the driving run — zero impact on normal user usage.

## Requirements

### Requirement: Restriction scope SHALL be the driving run lifecycle

While a graph main node executes, the adapter SHALL enforce the HLT registry on the main agent's repo-file core-class tool calls (fail-closed deny with reason, serena-only mandate for locate/read/write). Run-class tools (`bash`/`debug`/`eval` — platform shell chain head) SHALL be allowed during the armed window. The restriction SHALL end when the run terminates — via a dispatch result without a main node, via graph_force_end, or via agent_end (run settle on normal completion, error, or abort). Outside that window the adapter SHALL NOT alter the user's tool surface and SHALL NOT deny any call.

#### Scenario: Main-node dispatch arms the restriction

- **WHEN** graph_start/graph_advance/graph_jump returns a main node
- **THEN** the adapter SHALL deny repo-file core-class tool calls (read/write/edit/grep/glob/lsp/ast_edit on repo files) with the serena-mandate reason
- **AND** run-class tools (`bash`/`debug`/`eval` — platform shell chain head) SHALL be allowed
- **AND** serena, utility MCP tools, and pilot machinery SHALL remain allowed

#### Scenario: Non-main dispatch result disarms

- **WHEN** a dispatch returns an approval node, a gate node, or no node
- **THEN** the adapter SHALL restore the full tool surface

#### Scenario: Force-end terminates the restriction

- **WHEN** graph_force_end is called while armed
- **THEN** the adapter SHALL disarm and restore the full tool surface

#### Scenario: Agent-end fail-safe restores after abnormal termination

- **WHEN** the driving run settles (error or abort) while armed
- **THEN** the adapter SHALL disarm and restore the full tool surface

#### Scenario: Normal usage outside graph runs is unaffected

- **WHEN** no graph run is executing
- **THEN** the adapter SHALL NOT alter the tool surface and SHALL NOT deny any call

### Requirement: Lifecycle signals SHALL be a narrowed set

Only dispatch carriers — graph_start, graph_advance, graph_jump (calls whose result carries a dispatched node) — SHALL trigger arm/disarm transitions. graph_force_end SHALL explicitly disarm (run terminated). graph_status, graph_list, graph_init, graph_clean_completed, graph_clean_all SHALL NOT migrate adapter state.

#### Scenario: Status query does not migrate state

- **WHEN** graph_status (or graph_list/graph_init/graph_clean_*) is called while armed
- **THEN** the adapter state SHALL remain unchanged (no disarm, no re-arm)

#### Scenario: Force-end is the explicit terminal signal

- **WHEN** graph_force_end returns while armed
- **THEN** the adapter SHALL disarm exactly once

### Requirement: Surface replay SHALL be compare-based

Surface application SHALL be transition-guarded: the adapter SHALL compare the live active tool surface (getActiveTools) against the target surface before applying; an equal comparison SHALL be a no-op (no setActiveTools call). MCP reconnect drift SHALL be re-applied at the next dispatch transition only.

#### Scenario: Replay with unchanged surface is a no-op

- **WHEN** a dispatch transition would re-apply the surface and the live surface equals the target
- **THEN** the adapter SHALL NOT call setActiveTools

#### Scenario: Drift is re-applied at the next dispatch transition

- **WHEN** MCP reconnection re-activated cropped tools and the next dispatch transition occurs
- **THEN** the adapter SHALL re-apply the target surface

### Requirement: Subagent delegation SHALL be a recorded boundary

The adapter SHALL NOT gate tool calls made by task()-spawned subagents (platform hooks are main-agent-scoped). The boundary SHALL be recorded in the adapter's status output. The adapter SHALL NOT gate or wrap the task tool.

#### Scenario: Subagent calls pass and the boundary is recorded

- **WHEN** a subagent calls a repo-file core-class tool while armed
- **THEN** the call SHALL pass unblocked
- **AND** the adapter status SHALL record the subagent-delegation boundary

### Requirement: OMP adapter SHALL attach RTK_PROMPT during the armed window

While the adapter is armed (graph main node executing), every provider request SHALL carry the RTK_PROMPT text appended to the system blocks of the payload (per-LLM-call payload rewrite). When disarmed, provider payloads SHALL be returned unchanged. The RTK_PROMPT text SHALL match the reference `.refs/oh-my-pi-supreme-token-saver` extension (verbatim: rtk command preference, no-RTK exceptions, specialized-tools-win clause).

#### Scenario: Armed attach

- **WHEN** the adapter is armed and a provider request is dispatched
- **THEN** the request payload's system blocks SHALL include the RTK_PROMPT text
- **AND** the base prompt SHALL be preserved (append semantics)

#### Scenario: Disarmed no-op

- **WHEN** the adapter is disarmed and a provider request is dispatched
- **THEN** the request payload SHALL be returned unchanged
- **AND** no RTK_PROMPT SHALL be attached

#### Scenario: Lifecycle consistency

- **WHEN** a graph run terminates (approval/gate/null dispatch, force_end, agent_end fail-safe)
- **THEN** the adapter SHALL disarm
- **AND** subsequent provider requests SHALL carry no RTK_PROMPT
