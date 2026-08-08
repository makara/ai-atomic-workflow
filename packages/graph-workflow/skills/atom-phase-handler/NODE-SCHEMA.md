# NodeDetail (primary - always present)

`node` = primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete - no next node.

## Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`type`|string|yes|Phase type - determines dispatch routing: `main`, `approval`, `gate`|
|`handlerSkill`|string|yes|Handler skill name - the named handler skill for {node, snapshot?} dispatch|
|`skill`|string?|all|Execution skill - phase `skill` field; the skill that executes this phase's work (main type)|
|`agent`|string[]?|main|Agent hints - priority-ordered sub-agent type preferences. Advisory: consumed by skills when they dispatch sub-agents (first available wins, fallback platform default). Arrives as `## Agent hints:` block.|
|`operations`|string[]?|main|Operation classes - phase `operations:` declaration (HLT closed set). Union with the skill's `Operation classes` default feeds SKILL.md §Registry Injection + class-based verification.|
|`retryAttempt`|number|yes|Current retry count, 0-based - the node's own jump re-execution count (never zeroed). Gate jump bounds reference the TARGET node's `retryCount` from the snapshot (single counter - atom-graph-spec §Gate Jump Conditions).|
|`dependsOn`|string[]?|all|Upstream node IDs - scheduling only (topological order, JUMP closure, join resolution). Direct dependsOn outputs arrive as context for ALL types (main parity - gate/approval judgment context included)|

## Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`, `approval`|Task instruction text (main - executed inline) / full card prompt (approval - first line = header, rest = card body; schema removed `topic`/`preText`, loud rejection)|
|`channels`|string[]?|all|Effective channel patterns (global channel + phase channels - scheduler-side merge of config `context:` default layer + graph top-level `context:` prepended to phase `channels:`, dedup outer-first; carries the merged list, agent-side never re-merges) - main: skill names, file globs, or node IDs against the execution skill contract (deterministic); gate/approval: all entry kinds (uniform - same rule as main); node: entries are read edges to node streams, promotion self-skip already applied|
|`topic`|string?|`approval`|Synthesized decision-card header - NOT a YAML-layer field; approval-handler builds it from the task's first line (`phase.task?.split('\n')[0] ?? 'Decision Required'`). Used as question() header|
|`routingActions`|IApprovalAction[]?|`approval`|Decision routing actions - declared ONLY in branch-route scenarios; drives those question() options (see §IApprovalAction). Otherwise the card is Accept (AI recommendation) + free input + AI-generated contextual options|
|`jumps`|IJumpCondition[]?|`gate`|Rework jumps - `[{when, to}]`; the agent evaluates conditions, a hit -> backward jump to `to`, no hit -> pass through. Required non-empty - a gate without rework jumps is a silent pass-through|
|`route`|string?|all|Route membership - declared route id (absent = implicit default route, always active)|

Judgment context (gate/approval) = direct dependsOn outputs (`## Upstream:` blocks) + effective `channels` targets (`node:` outputs, reference skills, files - full-type inheritance) - assembled by the same pipeline as main nodes. The `reads` field is removed (schema field convergence); cross-level references declare `channels: [node:<id>]`.

## IJumpCondition

|Field|Type|Purpose|
|-|-|-|
|`when`|string|Natural-language condition - evaluated by the agent against the judgment context (direct dependsOn outputs + node: channels) + snapshot + run mode (judgment stays agent-side). Min 1 char.|
|`to`|string|Explicit BACKWARD jump target node ID - an upstream terminal node (validator-enforced). A hit resets target + downstream terminal nodes (JUMP); upstream is kept.|

## IApprovalAction

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Routing semantics - continue (advance; branch-route target = node or route id), retry (re-execute target), jump (go to target node), end (complete the run - `graph_advance` `endRun`)|
|`target?`|string|Branch-route option target (`continue` - node or route id) or re-run target (`retry`/`jump` - node id). Routing targets SHALL be explicit (PHASESCHEMA.md §Approval Routing Actions).|
|`value`|string|Stable kebab-case machine identifier - carried in the persisted decision; gate jump conditions and AI recommendations reference `decision value`, never label text|
|`label`|string|Option label - displayed in question() options[].label|
|`description`|string|Option description - displayed in question() options[].description|

No `default` field exists - Run Mode auto executes the AI recommendation, never a declared action.

## IApprovalDecision

|Field|Type|Purpose|
|-|-|-|
|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Chosen routing action. Gate path: hit -> `'jump'` (target carries the rework target); no hit -> `'continue'` (pass through, no target).|
|`target?`|string|Target nodeId or route id. Gate hit -> the matched jump's `to` - pilot passes it as `graph_advance` `branchTo` (backward reset). Approval branch-route -> the chosen option's target (node or route id) - pilot passes it as `branchTo` (route activation). Approval retry/jump -> selected option target - pilot routes via `graph_jump`.|
|`note?`|string|Free-text from question() custom:true text box - semantics vary by action. Run Mode auto path sets `'run mode: auto'`.|
|`rationale?`|string|Recommendation basis summary - the auditable why behind a decision. Run Mode auto path: one-line judgment-context basis (observable output fields / decision values that drove the recommendation). Manual choices omit it (the human IS the basis). Never replaces note/label semantics.|
|`label?`|string|Chosen routing option label - distinguishes same-action options. Gate path: the jump's `when` text (observability). Run Mode auto path = the recommendation's label.|
|`value?`|string|Chosen routing option `value` - stable machine identifier; downstream gate jump conditions and AI recommendations consume the decision value. Absent on gate decisions (jumps carry no value).|

---

# GraphSnapshot (optional - progress info)

`snapshot` optional. Present in `graph_start`, `graph_advance`, `graph_jump`, `graph_force_end` responses - uniform API self-containment. For jump navigation + progress display - never triggers execution. Run Mode consumption does NOT use the snapshot (mode comes from the `$run-mode-confirm` prologue output file; the prologue nodes appear in `nodes` like any run member).

|Field|Type|Purpose|
|-|-|-|
|`runId`|string|Graph run unique identifier|
|`graphName`|string|Graph name|
|`fsmState`|string|FSM state - `idle`, `running`, `completed`, `terminated`|
|`status`|string|Alias of `fsmState` - spec-compliant run status field (graph-mcp-api)|
|`currentPhaseId`|string \| null|Currently active phase node ID - `null` when none|
|`nodeCount`|number|Total node count|
|`completedCount`|number|Completed node count|
|`createdAt`|string|ISO 8601 run creation timestamp|
|`updatedAt`|string|ISO 8601 update timestamp|
|`nodes`|ISnapshotNode[]|Per-node states `{nodeId, status, retryCount, startedAt, completedAt, durationMs}` - jump-target enumeration data source (M2). Node status values: `pending` \| `active` \| `done` \| `aborted` - runtime FSM produced set; `completed` is a run-level fsmState, NOT a node status. Unselected route members and pass-through targets stay `pending` (never activated).|

## fsmState Logic

|fsmState|Meaning|Action|
|-|-|-|
|`idle`|Run created, no nodes started|Wait for first node|
|`running`|Nodes executing|Normal - continue loop|
|`completed`|Run drained (no active, no eligible) or approval `end` action|`node` = null - exit loop, build result report|
|`terminated`|Run force-ended (irreversible)|Exit loop with error report|

## Progress Fields

- `completedCount` / `nodeCount` -> display progress: `[completedCount/nodeCount]`
- `currentPhaseId` -> highlight which node is active in UI

---

# IApprovalDecision JSON Shapes

Collected user choice + custom text -> `IApprovalDecision` JSON (incl. chosen action `value`):

- continue: `{ "action": "continue", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }` (branch-route may add `"target": "<node-or-route id>"`)
- retry: `{ "action": "retry", "target": "<from option target if present>", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
- jump: `{ "action": "jump", "target": "<nodeId>", "value": "<chosen value>", "label": "<chosen option label>" }`
- end: `{ "action": "end", "value": "<chosen value>", "note": "<custom text if any>", "label": "<chosen option label>" }`
  - If custom text resolves to valid nodeId -> override target with it, `note` unset.
  - Otherwise -> custom text becomes `note`.
