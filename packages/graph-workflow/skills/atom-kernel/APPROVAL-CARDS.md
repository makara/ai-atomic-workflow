# approval() - Card Format

Detail companion to atom-kernel §approval() (cold sections - SKILL.md body stays within the reference-skill length band).

## Contract Shape

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

- `header` - noun phrase. <=30 chars. Topic, not outcome.
- `options` - `[{ label, description }]`. Label: concrete answer phrase. Description: single line.
- `custom` - free-text input, mandatory `true`.
- `recommendation` - the AI's proposed option (label or index). Shown as a marked option on the card - a suggestion the user picks or overrides; never auto-executed.
- `rationale` - one-line basis for the recommendation (observable fields / decision values). Displayed with the recommendation.
- Returns `decision` - `{ label?, value?, note?, custom? }`: the chosen option + free text.

## IApprovalDecision Shape (single home)

Collected choice + custom text -> `IApprovalDecision` JSON. ONE authoritative definition site (ADR 0141 single-home governance) - consumers (atom-phase-handler NODE-SCHEMA.md, DECISION-CARDS.md, atom-pilot SKILL.md) reference by name, never restate.

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue'`|Chosen decision action. Node decisions are always `'continue'` (condition-matched advance — the backend routes via the flow transition table — or dependency activation; no `retry`, no `branchTo`; ADR 0238). Direct end is carried separately (`direct_end: true` -> pilot advances with `end: true`). The backward reset travels via the `graph_advance` `jump` parameter (graph-internal, target ⊆ ancestors ∪ `__handoff`) or the operator `graph_jump` tool (PCL, graph-external).|
|`target?`|string|Target nodeId. `'jump'` is NOT a node decision action — the operator `graph_jump` tool (PCL, graph-external) and the advance `jump` channel (graph-internal forced rework) take their targets directly. Node decisions carry no target.|
|`note?`|string|Free-text from approval() custom input - semantics vary by action.|
|`rationale?`|string|Recommendation basis summary - the auditable why behind a decision. Optional; manual choices omit it (the human IS the basis). Never replaces note/label semantics.|
|`label?`|string|Chosen option label - distinguishes same-action options. Direct-end option: the declared `direct end` label.|
|`value?`|string|Chosen option `value` - stable machine identifier; downstream conditions and AI recommendations consume the decision value.|

### Card-Selection Mapping (dual-shape reconciliation)

approval() returns `{ label?, value?, note?, custom? }` (card surface); the pilot persists `IApprovalDecision` (decision surface). Mapping:

|Card field|Decision field|Rule|
|-|-|-|
|`label`|`label`|copied - chosen option label|
|`value`|`value`|copied - stable machine identifier|
|`note`|`note`|copied - free text|
|`custom`|`note`|copied - free text becomes `note`|
|none|`action`|decision action chosen on the card (`'continue'` only — ADR 0238)|
|none|`target?`|reserved — node decisions carry no target (operator `graph_jump` takes its own target; no branchTo)|
|none|`rationale?`|optional - recommendation basis one-liner|

### JSON Shapes

- continue: `{ "action": "continue", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }` (no target — ADR 0238)
- direct end: `{ "action": "continue", "direct_end": true, "value": "<chosen value>", "label": "<direct end label>" }` (pilot advances with `end: true`)

## Single-Form Presentation

The card is ALWAYS presented - options + custom free input + the recommendation marked. No mode dispatch, no auto-execution: see atom-kernel §approval() - single assembly site.

**Router template selection (graph-router-template)** — the one auto-selection carve-out, and it is NOT an approval() bypass: router template nodes (`NodeDetail.template_args.paths` present) present the card ONLY when the selection is genuinely ambiguous — exactly one candidate or a satisfied hard criterion completes the node self-decided (zero card, per the router template's own instruction, not an approval() rule change). The ambiguous-case card is a normal approval() card whose options are the machine-declared candidate graphs (`template_args.paths`) with the recommendation marked. The selected graph then runs as a sibling run inside the node (atom-phase-handler §Dispatch Rules main + atom-pilot §Main Decision Routing).

## 8 Format Rules

1. Header: noun phrase <=30 chars. Topic, not outcome.
2. Label: concrete answer phrase. Recommended first.
3. Description: single line. May note next step.
4. Pre-call text: background + option meanings + recommendation, same message.
5. Body: forbidden.
6. Custom: mandatory `true`.
7. One question per call.
8. No control chars (`\r`, `\t`, `\n`).
