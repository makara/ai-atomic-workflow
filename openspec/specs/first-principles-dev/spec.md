# first-principles-dev Specification

## Purpose

Built-in graph `first-principles-dev` — first-principles-prerequisite development flow: confirm the fundamental requirement (or diff), run the architecture review with that requirement as input, reason from first principles, write the report, implement per the report, then re-review implementation results against the approved report and fold the requirement back into the first-principles document.

## Requirements

### Requirement: first-principles-dev — fp-prerequisite development flow graph

MODIFIED: `first-principles-dev` SHALL be an independently executable built-in graph producing the fp-prerequisite development flow, with framework-hosted interactive entry/acceptance, expressing nested stages with `template: router` single-path nodes (subgraph composition via `use` is deleted — stage graphs run as sibling runs launched by the frontend). Topology: framework-owned `scope-entry` (main, atom-scope-interview; topics: scope + requirement/diff input + report input fresh|existing + user-owned output path; output contract includes `requirement_input`) → router node `template: router` with `template_args.paths: [arch-review]` + `template_args.questions` (accept/revise loop — revise re-enters via the flow self-edge, accept exits the sequence) → `adopting` (main, grilling — the grilling consensus IS the adoption confirmation; the adoption goal + trace intent are confirmed in the grilling first-round frontier, absorbing the deleted adopt-scope interview, ADR 0247) → `adopt` (router `paths: [adopt-with-docs]`) → `implement` (router `paths: [spec-implement]`) → `fp-doc-update` (fold-back) → re-review loop (flow self-edge `fp-doc-update -->|remaining| scope-entry`, bounded). The adopt-scope phase is removed (adopt-scope-and-handler-blocks, ADR 0247): the adoption goal is the round scope + the accepted report's Top Recommendation, already confirmed by scope-entry and the requirement accept loop.

#### Scenario: Full flow run

- **WHEN** the graph runs with a confirmed requirement/diff
- **THEN** framework scope-entry confirms scope + requirement/diff, the arch-review sibling run (explore → first-principles → present-candidates) produces the report, the requirement accept loop on the router node approves (accept → adopting; revise → re-run), adopt + implement execute as sibling runs, fp-doc-update folds the requirement back, and the rework cycle evaluates

#### Scenario: Standalone requirement/diff input

- **WHEN** the user provides a diff (changes on top of an existing document) instead of a fresh idea
- **THEN** framework scope-entry captures the diff reference in `requirement_input` and the arch-review sibling consumes it (via `graph_start` args) as the review and reasoning input

#### Scenario: Shared chain single-sourced

- **WHEN** the graph's shared-chain nodes are read
- **THEN** their task text SHALL reference the parameterized template content (`template: scope-entry` / `template: adopting`) — not byte-duplicated from `arch-review-loop`, and no `template: adopt-scope` declaration exists

#### Scenario: Stage activation is the sibling run

- **WHEN** a stage router node executes
- **THEN** the selected stage graph SHALL run as a sibling run (`graph_start` → drive to `node: null` → collect handoff result)
- **AND** the router SHALL NOT activate composing phases and SHALL NOT pass `branchTo` — every stage graph is standalone

#### Scenario: Subgraph declaration does not constrain the framework

- **WHEN** graph-maintain audits `first-principles-dev`
- **THEN** the framework's interactive nodes (scope-entry, requirement accept loop) SHALL NOT be flagged — stage graphs (arch-review / adopt-with-docs / spec-implement) declare `interaction: none` on their own files only; no declaration propagates (composition is deleted)

#### Scenario: Framework chain runs without accept nodes

- **WHEN** the first-principles-dev graph runs
- **THEN** the executed chain SHALL NOT contain review-accept / adopt-accept / adopt-scope phases; the requirement node SHALL present the accept/revise prompt and the revise choice SHALL re-enter the requirement node (flow self-edge), the accept choice SHALL proceed directly to adopting (no adopt-scope phase between)

#### Scenario: Adoption goal confirmed by grilling

- **WHEN** the adopting node executes after requirement accept
- **THEN** the grilling first-round frontier SHALL include the adoption-goal topics (idea_goal + doc_trace_intent) confirmed by the user — no separate adopt-scope interview exists

### Requirement: re-review — implementation-result re-review node

The graph SHALL include a `re-review` main node implementing dual-axis review of the implementation results against the approved report, per the code-review contract: Spec axis (report requirements vs implementation results, evidence-backed) + Standards axis (repo coding standards + smell baseline). The node SHALL consume the approved report via `node:` stream and the implementation output (adopt/implement artifacts) from the session, emit a machine-parseable report (`overall: pass | fail`) plus findings, AND fold the findings + implementation marks back into the report at `report_path` in place (implemented Top Rec items marked evidence-backed, re-review findings appended, round marker incremented) — the report is the single source of truth for later `report_input: existing` rounds; findings are never left session-only.

#### Scenario: Implementation matches the report

- **WHEN** re-review finds every report requirement implemented correctly per both axes
- **THEN** re-review reports `overall: pass`, folds the marks into the report in place, and the loop proceeds to decision

#### Scenario: Implementation deviates from the report

- **WHEN** re-review finds missing, partial, or incorrect implementation (Spec axis) or standard violations (Standards axis)
- **THEN** re-review reports `overall: fail` with findings and folds them into the report in place (implementation marks + findings, round marker incremented); the follow-up decision routes rework through adopt/implement or ends the run

### Requirement: fp-doc-update — first-principles document fold-back node

The graph SHALL include an `fp-doc-update` main node that folds the requirement/diff and the reasoning conclusions (assumption list, law-vs-convention verdicts, atomic components) into the first-principles document per `docs/first-principles/README.md` update-maintenance contract: rewrite "问题与根本需求" (problem + fundamental requirements + implementation requirements), correct "当前假设", update "根本事实" verdicts and "原子拆解"; deviations recorded in Appendix A. The node SHALL run after implementation (flow step: requirement/diff updated to the first-principles document) and SHALL target the document declared at activation (default `docs/first-principles/development-flow.md`).

#### Scenario: Fold-back after implementation

- **WHEN** the implementation round completes and the run reaches fp-doc-update
- **THEN** the requirement/diff and reasoning conclusions are folded into the first-principles document per the README contract, and the document revision is incremented

#### Scenario: First run creates the document

- **WHEN** the target first-principles document does not exist
- **THEN** fp-doc-update creates it per the README initial-generation contract (head block + 问题与根本需求 + 当前假设 + 根本事实 + 原子拆解; no Step 4/5 sections)

### Requirement: implementation stage reuse

MODIFIED: the implementation stage SHALL reuse the existing stage graphs via router launches: `adopt` (router `paths: [adopt-with-docs]`) then `implement` (router `paths: [spec-implement]`), activated serially after the framework-hosted adoption interaction (`adopting` — the grilling consensus IS the acceptance; adopt-scope and the accept nodes are deleted, ADR 0247). No implementation node SHALL be duplicated inside the graph.

#### Scenario: Adopt then implement activate

- **WHEN** the framework adopting node completes with a non-empty change_name (grilling consensus)
- **THEN** adopt (adopt-with-docs, interaction: none — self-deciding spec production) and implement (spec-implement, interaction: none) execute as sibling runs in order, launched by their router nodes

#### Scenario: Inputs pass via graph_start args

- **WHEN** the adopt or implement router launches its stage graph
- **THEN** the report path / change name + adoption echo SHALL pass via `graph_start` args
- **AND** no composed-member channel carries them (composition is deleted)

#### Scenario: Adoption activates without a separate accept node

- **WHEN** the adopting node completes with a non-empty change_name
- **THEN** the adopt router SHALL activate directly (no adopt-scope or adopt-accept phase between); the adoption consensus echo (change_name + adr_created + decisions) SHALL pass via graph_start args

### Requirement: graph registration

`first-principles-dev` SHALL be registered in `packages/graph-scheduler/graphs/registry.json` with a description naming only real phases, load-probe validated (graph_start + graph_force_end), and covered by the registry-completeness test.

#### Scenario: Registration completeness

- **WHEN** the registry-completeness test runs
- **THEN** `first-principles-dev.yaml` SHALL be listed in the builtin registry with its description naming only existing phases
