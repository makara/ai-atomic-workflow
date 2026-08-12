# estate-maintain Specification

## Purpose

The estate maintenance graph — the execution carrier for document estate upkeep. Entry classifies the trigger and selects workstreams; three maintain nodes execute per-workstream maintenance (domains index, openspec/specs sync, ADR align); review runs the consistency gate; accept closes the pass. Activates atom-doc-maintain (round-2 forward item), atom-spec-maintain, atom-adr-maintain.

## Requirements

### Requirement: Trigger classification and workstream selection

The entry phase SHALL classify the trigger (domain-change / skill-change / proactive / user-request) from the event, never from an interview, and select the affected workstreams (domains-index / specs-sync / adr-align). Workstream nodes SHALL dispatch unconditionally in the topology; execution scope SHALL follow the entry output — an unselected workstream reports a no-op scope (zero changes, zero gate checks) and never fabricates work. The user-request trigger SHALL additionally activate the requirement node (grilling confirmation, see estate-maintain/user-request).

#### Scenario: Domain-change trigger

- **WHEN** the trigger is domain-change
- **THEN** domains-index SHALL run, and specs-sync SHALL run when spec mapping is affected

#### Scenario: Proactive trigger

- **WHEN** the trigger is proactive
- **THEN** all three workstreams SHALL run and the consistency gate SHALL check every class

#### Scenario: User-request trigger

- **WHEN** the trigger is user-request
- **THEN** the requirement node SHALL run (grilling confirmation, no ADR) and domains-index SHALL record the confirmed requirements into docs/domains.md

### Requirement: Three workstream nodes

The graph SHALL dispatch three maintain nodes: domains-index via atom-doc-maintain (index class, consulting atom-domain-spec), specs-sync via atom-spec-maintain, adr-align via atom-adr-maintain.

#### Scenario: Workstream dispatch

- **WHEN** a workstream node is active
- **THEN** its skill SHALL be dispatched and the node output SHALL carry the per-workstream change list

### Requirement: Consistency gate in review

MODIFIED: the review node SHALL run the consistency gate (mapping / links / counts / derived / requirements) and reverse-validate changes; gate failures SHALL surface in the report, never silently patched. The requirements class SHALL verify the Design Requirements block format (head position, bullet list, no metadata) and that workstream changes comply with each requirement, with consensus evidence from the requirement node output (node:requirement channel) — never in-file source/date confirmation records. The gate SHALL additionally run graph↔skill contract alignment and entry-skill orphan detection (previously engine load-time machinery): every graph channel declaration SHALL be checked against the dispatched skill's `## Context Requirements` contract, and entry skills declaring graph-callable contracts without a dispatching graph phase SHALL be flagged as orphans.

#### Scenario: Gate failure surfaced

- **WHEN** any gate check fails
- **THEN** the failure SHALL be reported per check with evidence and SHALL block accept until resolved or explicitly waived

#### Scenario: Requirements gate failure surfaced

- **WHEN** the Design Requirements block format is invalid or a workstream change violates a requirement
- **THEN** the failure SHALL be reported per requirement with evidence and SHALL block accept until resolved or explicitly waived
- **AND** the evidence SHALL come from the requirement node output (stream consensus), never from in-file records

#### Scenario: alignment defect flagged

- **WHEN** a graph declares a channel its skill contract does not claim
- **THEN** the consistency gate SHALL flag the mismatch as a defect (agent-side, same evidence base as the removed engine load-time pass)

#### Scenario: orphan entry skill flagged

- **WHEN** a skill declares graph-callable Context Requirements but no graph phase dispatches it
- **THEN** the consistency gate SHALL flag it as an orphan

### Requirement: Deployment mirror read-only check

The graph SHALL include a read-only deployment-mirror check (diff packages/ skill set against the user deployment) that reports drift without editing deployment.

#### Scenario: Deployment drift reported

- **WHEN** deleted skills still exist in the deployment mirror
- **THEN** the check SHALL report the residue as drift and SHALL NOT modify the deployment

### Requirement: Estate journey entry point

When a repo owner maintains the document estate (proactive / domain-change / skill-change / user-request upkeep), the entry point SHALL be the `estate-maintain` graph — trigger classification → per-workstream maintenance (domains index / specs sync / ADR align) → consistency-gate review → accept; the user-request trigger adds grilling confirmation of user-proposed domain-design requirements before workstreams run.

#### Scenario: Estate journey resolves to estate-maintain

- **WHEN** a repo owner runs estate upkeep (drift repair, proactive scan)
- **THEN** estate-maintain SHALL be the entry point and SHALL run the consistency gate before accept

#### Scenario: User-request journey

- **WHEN** a repo owner proposes special requirements for domain design
- **THEN** estate-maintain SHALL classify user-request, run grilling confirmation (no ADR), record confirmed requirements into domains.md, and run the workstreams in compliance with them

### Requirement: Requirement node output shape

The requirement node (user-request trigger) SHALL emit confirmed requirements as a plain list of statements — `[{statement}]` — with no id or status fields.

#### Scenario: Confirmed requirements emitted as statements

- **WHEN** the requirement node completes a user-request pass
- **THEN** its output SHALL carry `requirements` as a list of statement strings
- **AND** the output SHALL NOT carry per-requirement ids or statuses

### Requirement: domains-index record duty

The domains-index workstream SHALL write confirmed requirements into the docs/domains.md Design Requirements block at the file head, as bullets per atom-domain-spec §Design Requirements. Zero confirmed requirements → no block write.

#### Scenario: Recorded as bullets at head

- **WHEN** domains-index executes a user-request pass with confirmed requirements
- **THEN** each requirement SHALL be written as one bullet in the head-position Design Requirements block
- **AND** the write SHALL NOT introduce IDs, status, source, or date columns
