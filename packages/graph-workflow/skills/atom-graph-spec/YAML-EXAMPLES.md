> Reference sibling of `atom-graph-spec` (SKILL.md) - all YAML examples, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Router Nesting Example

```yaml
# Parent graph — skill-change-workflow.yaml
name: skill-change-workflow
phases:
  - id: plan
    type: main
    dependsOn: []
    task: |
      Analyze requirements.
  - id: skill-ops
    type: main
    template: router
    template_args:
      paths:
        - skill-author
    dependsOn: [plan]
  - id: review
    type: main
    dependsOn: [skill-ops]
    channels: [node:skill-ops]
    task: |
      Review the launched graph's report.
```

## Inventory Example

```yaml
# Node overview table — one entry per phase (atom). Entry shape
# { id, type, goal, constraints? }: id must exist in phases, type must
# match the phase declaration (mismatch = load warning, never blocking).
# No skill field — the phase-level skill is the single source; the
# mechanism lives in the goal (skill-bound mains name it in verb form;
# router entries state "Launches the <graph> graph as a sibling run (router template — single path auto-select)"). Structural keywords ALL-CAPS
# (AND/OR/IF/THEN/ELSE) — LLM-produced inventories MUST comply; prose
# and/or lowercase. constraints: one-sentence prose rules — general
# boundaries + explicit non-goals, ≤ 5 per atom, never machine-validated.
# Graph-level constraints — optional top-level field (same self-containment
# family as inventory): one-sentence prose rules — general boundaries +
# explicit non-goals, ≤ 10 per graph, never machine-validated. Injected into
# every dispatched node as [graph]-prefixed entries.
constraints:
  - reports and plans in Chinese
  - does not modify files outside packages/ — proposal only
name: inventory-demo
inventory:
  - id: plan
    type: main
    goal: Executes sk-plan to analyze requirements THEN write the plan
    constraints:
      - does not implement the plan — writes it only
  - id: skill-ops
    type: main
    goal: Launches the skill-author graph as a sibling run (router template — single path auto-select)
    constraints:
      - router only — the launched graph's rules live in its own file
  - id: review
    type: main
    goal: Reviews the plan against the judgment criteria THEN reports verdict fields
phases:
  - id: plan
    type: main
    dependsOn: []
    skill: sk-plan
    task: |
      Analyze requirements.
  - id: skill-ops
    type: main
    template: router
    template_args:
      paths:
        - skill-author
    dependsOn: [plan]
  - id: review
    type: main
    dependsOn: [skill-ops]
    task: |
      Review the plan output.
```

## Rework/Loop Pattern (flow self-edge)

Bounded rework/loop is a top-level `flow` self-edge — `A -->|condition| A` (inline bounded loop, condition-matched re-entry; never a subgraph/task-template mechanism). The loop-head phase's task text evaluates the loop condition inline and reports the condition value; the pilot advances with `graph_advance(runId, nodeId, condition)` — the transition table routes:

```yaml
flow:
  - change-review -->|fail| change-review # self-edge — re-run the review until pass (bounded in the node task)
  - change-review -->|pass| change-accept
phases:
  - id: change-review
    type: main
    dependsOn: []
    task: |
      Review the body round; when the body fails the review, re-run it
      (report condition: fail), bounded to 2 rounds — past the bound report
      condition: pass (the human decides downstream).
      Output contract: review_overall (pass | fail), condition (pass | fail)
  - id: change-accept
    type: main
    dependsOn: [change-review]
    channels: [node:change-review]
    task: |
      Confirm acceptance
      Recommendation follows the review verdict: pass → accept; the
      exhausted bound routes here for the human decision.
```

No in-run rework decision exists — node decisions are `continue` only (no retry/jump action, no `branchTo`); loop re-entry is the flow condition on advance; backward rework to an ancestor rides the advance `jump` channel (backward-only); the operator `graph_jump` (PCL, graph-external) is the operator-level backward reset.

## Branch Decisions

- Branch cases are subgraph selections via `template: router` — the task text evaluates the criterion (IF/ELSE over the output contract) inline, and the chosen graph (from `template_args.paths`) launches as a sibling run via `graph_start`; loop/rework = top-level `flow` self-edges (`A -->|condition| A` inline bounded loops, condition-matched re-entry); branch options surface at dispatch via the machine-declared `completion` block on NodeDetail (choices / direct_end — see atom-phase-handler NODE-SCHEMA.md §NodeDetail). The phase schema is strict — ANY key outside the declared surface (`id`/`type`/`dependsOn`/`operations`/`agent`/`skill`/`channels`/`task`/`template`/`template_args`) is rejected at load with the key named; never declare removed fields (`route`/`routing`/`join`/`mode`/`run…

## Acceptance Dependency Rule

```yaml
# Correct — review converges over both writer paths (AND); acceptance waits for the review conclusion
- id: review
  type: main
  dependsOn: [write-a, write-b]
- id: accept
  type: main
  dependsOn: [review]
```

```yaml
# Wrong — writers listed alongside review: redundant deps (review already converges over them)
- id: accept
  type: main
  dependsOn: [review, write-a, write-b]
```

## Acceptance Redundancy Rule

```yaml
# Redundant — interview confirmed the scope; card has nothing new to review
- id: scope
  type: main
  skill: atom-scope-interview
- id: scope-accept # ✗ double confirmation — remove
  type: main
  dependsOn: [scope]
- id: generate
  type: main
  dependsOn: [scope-accept] # → dependsOn: [scope]
```

```yaml
# Valid — card is the FIRST review point of an artifact the human has not seen
- id: plan
  type: main # synthesizes PRD inside the interview node
- id: plan-accept # ✓ first PRD artifact review — keep
  type: main
  dependsOn: [plan]
```

## Block Scalars

```yaml
task: |
  Multi-line task instruction.
  Indent preserved — leading spaces kept.
  Blank lines OK.
```

## Flow Sequences

```yaml
dependsOn: [scope-confirm, requirement-analysis]
channels:
  - skill:atom-graph-spec
  - docs/standards/
```

## Comments

```yaml
- id: graph-review
  type: main # main — inline execution
  dependsOn: [graph-write]
```
