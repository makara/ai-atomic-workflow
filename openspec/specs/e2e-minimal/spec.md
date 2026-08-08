# e2e-minimal Specification

## Purpose

Minimal main→approval cycle demo. Asset: `packages/graph-scheduler/graphs/e2e-minimal.taskflow.yaml`.

This domain currently has no registered behavioral-contract requirement; new contracts are added via the OpenSpec change process.

## Requirements

### Requirement: e2e-minimal graph SHALL be loadable and demo the main→approval cycle

The e2e-minimal graph SHALL be a member of the built-in graph registry, startable via graph_start; its topology SHALL demonstrate the minimal main→approval cycle (main node executes → approval node collects the decision → natural drain or end action completes).

#### Scenario: Graph starts and completes

- **WHEN** `graph_start({ graphName: "e2e-minimal" })` is invoked
- **THEN** the graph SHALL load successfully and dispatch the first main node
- **THEN** advancing via graph_advance to the approval node, the run SHALL end as completed after the user decision
