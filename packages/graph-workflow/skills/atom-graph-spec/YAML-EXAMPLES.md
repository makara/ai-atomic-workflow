> Reference sibling of `atom-graph-spec` (SKILL.md) - all YAML examples, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Flow Phase Example

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
    type: flow
    use: skill-author
    dependsOn: [plan]
  - id: review
    type: approval
    dependsOn: [skill-ops]
    channels: [node:skill-ops/plan-parse]
    task: |
      Accept change
      Recommendation follows the plan-parse judgment.
```

## Inventory Example

```yaml
# Node overview table — one entry per phase (atom). Entry shape
# { id, type, goal, constraints? }: id must exist in phases, type must
# match the phase declaration (mismatch = load warning, never blocking).
# No skill field — the phase-level skill is the single source; the
# mechanism lives in the goal (skill-bound mains name it in verb form;
# flows state "expands <use> subgraph"). Structural keywords ALL-CAPS
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
    type: flow
    goal: Expands skill-author subgraph
    constraints:
      - composition only — child rules live in the subgraph
  - id: review
    type: approval
    goal: Accept the change IF the plan judgment passes
    constraints:
      - routes only — never edits the plan
  - id: rework-gate
    type: gate
    goal: Jump back to plan IF review fails OR retry bound reached
    constraints:
      - machine judgment only — never decides beyond declared jump conditions
phases:
  - id: plan
    type: main
    dependsOn: []
    skill: sk-plan
    task: |
      Analyze requirements.
  - id: skill-ops
    type: flow
    use: skill-author
    dependsOn: [plan]
  - id: review
    type: approval
    dependsOn: [skill-ops]
    task: |
      Accept change
      Recommendation follows the plan-parse judgment.
  - id: rework-gate
    type: gate
    dependsOn: [review]
    jumps:
      - when: 'review output shows overall: fail AND plan retryCount < 3'
        to: plan
```

## Gate+Approval Pair Pattern

```yaml
- id: change-gate
  type: gate
  dependsOn: [change-review]
  jumps:
    - when: 'change-review output shows overall: fail AND apply-change retryCount < 2'
      to: apply-change
- id: change-accept
  type: approval
  dependsOn: [change-gate]
  channels: [node:change-review]
  task: |
    Accept change
    Recommendation follows the review verdict: pass → accept; fail past the
    rework bound → escalate for human decision.
```

## Loop Router Pattern

```yaml
# arch-review-loop tail — loop-gate jump + loop-accept (decision confirmation)
- id: loop-gate
  type: gate
  dependsOn: [implement]
  channels: [node:review/arch-review]
  jumps:
    - when: 'run mode is auto AND review/arch-review output shows top_rec_remaining: true AND loop-entry retryCount < 8'
      to: loop-entry
- id: loop-accept
  type: approval
  dependsOn: [loop-gate]
  channels: [node:review/arch-review]
  task: |
    End the review loop?
    Recommendation follows the report state: Top Rec remains AND bound not
    exhausted → loop again (retry loop-entry); nothing remains → end action
    (auto mode ends automatically).
```

## Branch-Route Actions

```yaml
routing:
  actions:
    - action: continue
      target: minimal-track
      value: minimal-track
      label: 'Minimal track — apply directly'
      description: 'No ADR created — implement the change without engineering ceremony'
    - action: continue
      target: detailed-track
      value: detailed-track
      label: 'Detailed track — engineer'
      description: 'ADR created — full spec-to-tickets engineering workflow'
```

## Approval Dependency Rule

```yaml
# Correct — review joins both writer paths; approval waits for review conclusion
- id: review
  type: main
  dependsOn: [write-a, write-b]
  join: any
- id: accept
  type: approval
  dependsOn: [review]
```

```yaml
# Wrong — writer listed alongside review: join:any fires approval before review concludes
- id: accept
  type: approval
  dependsOn: [review, write-a, write-b]
  join: any
```

## Approval Redundancy Rule

```yaml
# Redundant — interview confirmed the scope; gate checks completeness; card has nothing new to review
- id: scope
  type: main
  skill: atom-scope-interview
- id: scope-gate
  type: gate
  dependsOn: [scope]
  jumps:
    - when: 'scope output shows scope_complete: false AND scope retryCount < 1'
      to: scope
- id: scope-accept # ✗ double confirmation — remove
  type: approval
  dependsOn: [scope-gate]
- id: generate
  type: main
  dependsOn: [scope-accept] # → dependsOn: [scope-gate]
```

```yaml
# Valid — card is the FIRST review point of an artifact the human has not seen
- id: plan
  type: main # synthesizes PRD inside the interview node
- id: plan-gate
  type: gate
  dependsOn: [plan]
  jumps:
    - when: 'plan output shows prd_complete: false AND plan retryCount < 2'
      to: plan
- id: plan-accept # ✓ first PRD artifact review — keep
  type: approval
  dependsOn: [plan-gate]
```

## Auto-Rework Anti-Pattern

```yaml
# Wrong — unbounded free-text condition targeting the reviewer
- id: gate
  type: gate
  dependsOn: [review]
  jumps:
    - when: 'review output contains FAIL verdict'
      to: review
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
  type: main # main — inline execution, review skill may dispatch axis sub-agents per hints
  dependsOn: [graph-write]
```
