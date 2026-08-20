# todo-lifecycle Specification

## Purpose

Platform todo lists are execution scratchpads scoped to the currently executing graph node: cleared at every node boundary, used on demand inside a node, never representing graph structure and never persisting across nodes. Graph progress is displayed exclusively via the run snapshot.

## Requirements

### Requirement: Node boundary SHALL be the todo boundary

Every main node dispatch SHALL clear the platform todo list before execution begins; every node completion SHALL clear it again after the node output write and before `graph_advance` — unconditional on success or failure. The dispatch-type enumeration is narrowed to the single main path (approval/gate/activation-prologue nodes are deleted, ADR 0215/0216/0148). Nodes SHALL use todo on demand as a disposable scratchpad; no node SHALL be required to create one.

#### Scenario: Dispatch starts with an empty todo

- **WHEN** the handler receives a node for execution and a todo list exists from a previous node
- **THEN** the todo list SHALL be cleared before the node's task executes
- **AND** the node SHALL start with an empty scratchpad

#### Scenario: Completion clears regardless of outcome

- **WHEN** a node completes — whether status is done or failed
- **THEN** the todo list SHALL be cleared before the run advances
- **AND** no todo item SHALL survive into the next node

#### Scenario: Zero-use nodes are unaffected

- **WHEN** a node never touches the todo tool during execution
- **THEN** the boundary clears SHALL be no-ops at both ends
- **AND** the node's behavior SHALL be identical to a graph run without the rule

### Requirement: Todo SHALL never represent graph structure

Todo items SHALL NOT mirror graph phases, node ids, or run progress. The run snapshot is the only representation of graph progress; node output files are the only cross-node contract. The graph runtime SHALL stay todo-ignorant — no scheduler fields, tools, or persistence for todo.

#### Scenario: Todo contains no graph mirror

- **WHEN** a node creates todo items during execution
- **THEN** the items SHALL describe the node's own execution steps only
- **AND** no item SHALL reference a node id or phase of the graph

#### Scenario: Scheduler exposes no todo surface

- **WHEN** a graph run executes
- **THEN** none of the graph-scheduler MCP tools SHALL accept or return todo data
- **AND** run records SHALL contain no todo state

### Requirement: Todo SHALL NOT propagate to subagents

A node's todo list SHALL NOT be forwarded to subagents the node dispatches; subagent todo usage SHALL be private to that subagent's execution and cleared at its yield. Parent sessions SHALL NOT read child todo state.

#### Scenario: Subagent receives no parent todo

- **WHEN** a node dispatches a subagent with an active todo scratchpad
- **THEN** the subagent SHALL NOT inherit or see the parent's todo items
- **AND** any todo the subagent creates SHALL be scoped to the subagent's own execution

### Requirement: Projection use clause — multi-step nodes SHALL project

The boundary rule (node boundary = todo boundary; dispatch/completion clears unconditional) SHALL remain in force and is the ONLY system-level todo governance. Todo usage SHALL be agent-discretionary within the node boundary — no content contract (no plan projection, no done gate, no step plan mandate). The «on demand» usage clause is restored: the agent MAY use the todo list as its execution scratchpad within the node; the system does not dictate item semantics. A todo list SHALL never outlive its node — the boundary clears remain the structural guarantee that todo never mirrors graph state.

#### Scenario: Multi-step node todo is node-scoped

- **WHEN** a multi-step main node uses its todo scratchpad and completes
- **THEN** the completion clear SHALL remove the list before the next node dispatches
- **AND** no trace of the list SHALL appear in the next node's todo

#### Scenario: Boundary clears still prevent graph mirroring

- **WHEN** a node's todo contains agent-managed items
- **THEN** the dispatch clear of the next node SHALL start from an empty list
- **AND** graph progress SHALL continue to display exclusively via the run snapshot
