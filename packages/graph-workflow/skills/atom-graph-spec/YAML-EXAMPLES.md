> Reference sibling of `atom-graph-spec` (SKILL.md) - all YAML examples, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Flow Phase Example

```yaml
# Parent graph — skill-change-workflow.taskflow.yaml
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
      description: 'ADR created — full spec-to-tickets engineering pipeline'
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
