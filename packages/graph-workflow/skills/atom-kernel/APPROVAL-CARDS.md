# approval() - Card Format, Mode Dispatch

Detail companion to atom-kernel §approval() (cold sections - SKILL.md body stays within the reference-skill length band).

## Contract Shape

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

- `header` - noun phrase. <=30 chars. Topic, not outcome.
- `options` - `[{ label, description }]`. Label: concrete answer phrase. Description: single line.
- `custom` - free-text input, mandatory `true`.
- `recommendation` - the AI's proposed option (label or index). The discriminator: present -> auto mode may execute it; absent -> ALWAYS a card (interviews, consensus turns).
- `rationale` - one-line basis for the recommendation (observable fields / decision values). Recorded when the recommendation is auto-executed.
- Returns `decision` - `{ label?, value?, note?, custom? }`: the chosen option + free text; auto-executed decisions carry note `'run mode: auto'` + rationale.

## IApprovalDecision Shape (single home)

Collected choice + custom text -> `IApprovalDecision` JSON. ONE authoritative definition site (ADR 0141 single-home governance) - consumers (atom-phase-handler NODE-SCHEMA.md, DECISION-CARDS.md, atom-pilot SKILL.md) reference by name, never restate.

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Chosen routing action. Gate path: hit -> `'jump'` (target carries the rework target); no hit -> `'continue'` (pass through, no target).|
|`target?`|string|Target nodeId or route id. Gate hit -> the matched jump's `to` - pilot passes it as `graph_advance` `branchTo` (backward reset). Approval branch-route -> the chosen option's target (node or route id) - pilot passes it as `branchTo` (route activation). Approval retry/jump -> selected option target - pilot routes via `graph_jump`.|
|`note?`|string|Free-text from approval() custom input - semantics vary by action. Run Mode auto path sets `'run mode: auto'`.|
|`rationale?`|string|Recommendation basis summary - the auditable why behind a decision. Run Mode auto path: one-line judgment-context basis (observable output fields / decision values that drove the recommendation). Manual choices omit it (the human IS the basis). Never replaces note/label semantics.|
|`label?`|string|Chosen routing option label - distinguishes same-action options. Gate path: the jump's `when` text (observability). Run Mode auto path = the recommendation's label.|
|`value?`|string|Chosen routing option `value` - stable machine identifier; downstream gate jump conditions and AI recommendations consume the decision value. Absent on gate decisions (jumps carry no value).|

### Card-Selection Mapping (dual-shape reconciliation)

approval() returns `{ label?, value?, note?, custom? }` (card surface); the pilot persists `IApprovalDecision` (routing surface). Mapping:

|Card field|Decision field|Rule|
|-|-|-|
|`label`|`label`|copied - chosen option label|
|`value`|`value`|copied - stable machine identifier|
|`note`|`note`|copied - free text; auto path sets `'run mode: auto'`|
|`custom`|`note` / `target`|free text becomes `note`; on `end` action, custom text resolving to a valid nodeId overrides `target` instead|
|none|`action`|routing action chosen by the mode branch (card) or the recommendation (auto)|
|none|`target?`|branch-route / retry / jump target from the chosen option or gate jump|
|none|`rationale?`|auto path only - recommendation basis one-liner|

### JSON Shapes

- continue: `{ "action": "continue", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }` (branch-route may add `"target": "<node-or-route id>"`)
- retry: `{ "action": "retry", "target": "<from option target if present>", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
- jump: `{ "action": "jump", "target": "<nodeId>", "value": "<chosen value>", "label": "<chosen option label>" }`
- end: `{ "action": "end", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
  - If custom text resolves to valid nodeId -> override target with it, `note` unset.
  - Otherwise -> custom text becomes `note`.

## Mode Dispatch

Mode branch (manual/absent/no-recommendation -> card; auto + recommendation -> execute; auto without recommendation -> card, never guess): see atom-kernel §approval() - single assembly site.

## 8 Format Rules

1. Header: noun phrase <=30 chars. Topic, not outcome.
2. Label: concrete answer phrase. Recommended first.
3. Description: single line. May note next step.
4. Pre-call text: background + option meanings + recommendation, same message.
5. Body: forbidden.
6. Custom: mandatory `true`.
7. One question per call.
8. No control chars (`\r`, `\t`, `\n`).
