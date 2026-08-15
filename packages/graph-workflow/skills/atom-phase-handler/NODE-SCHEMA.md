# NodeDetail (primary - always present)

`node` = primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete - no next node.

## Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`type`|string|yes|Phase type - determines dispatch routing: `main`, `approval`, `gate`|
|`skill`|string?|all|Execution skill - phase `skill` field; the skill that executes this phase's work (main type)|
|`agent`|string[]?|main|Agent hints - priority-ordered sub-agent type preferences. Advisory: consumed by skills when they dispatch sub-agents (first available wins, fallback platform default). Arrives as `## Agent hints:` block.|
|`operations`|string[]?|main|Operation classes - phase `operations:` declaration (HLT closed set, 10 classes). Union with the skill's `Operation classes` default feeds SKILL.md §Registry Injection + class-based verification.|
|`retryCount`|number|yes|Current retry count, 0-based - the node's own jump re-execution count (never zeroed). Gate jump bounds reference the TARGET node's `retryCount` from the snapshot (single counter - atom-graph-spec §Gate Jump Conditions).|
|`dependsOn`|string[]?|all|Upstream node IDs - scheduling only (topological order, JUMP closure, join resolution). Direct dependsOn outputs arrive as context for ALL types (main parity - gate/approval judgment context included)|

The dispatch handler skill is the constant `atom-phase-handler` for main/approval/gate - agent-side knowledge, never carried in the payload (no `handlerSkill` NodeDetail field). Run mode is NOT a NodeDetail field - it arrives at activation (graph_start `args.mode`) as a session fact. Graph-level constraints ARE carried: `NodeDetail.constraints` = `[graph]`-prefixed dispatch facts from the loaded graph definition (unbypassable); project-level constraints arrive via the pilot-loaded activation session copy.

## Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`, `approval`|Task instruction text (main - executed inline) / full card prompt (approval - first line = header, rest = card body; schema removed `topic`/`preText`, loud rejection)|
|`channels`|string[]?|all|Effective channel patterns (global channel + phase channels - scheduler-side merge of config `context:` default layer + graph top-level `context:` prepended to phase `channels:`, dedup outer-first; carries the merged list, agent-side never re-merges) - main: skill names, file globs, or node IDs against the execution skill contract (deterministic); gate/approval: all entry kinds (uniform - same rule as main); node: entries are read edges to node reports (delivered from the agent session), promotion self-skip already applied|
|`topic`|string?|`approval`|Synthesized decision-card header - NOT a YAML-layer field; approval-handler builds it from the task's first line (`phase.task?.split('\n')[0] ?? 'Decision Required'`). Used as approval() header|
|`routingActions`|IApprovalAction[]?|`approval`|Decision routing actions - declared ONLY in branch-route scenarios; drives those approval() options (see §IApprovalAction). Otherwise the card is Accept (AI recommendation) + free input + AI-generated contextual options|
|`jumps`|IJumpCondition[]?|`gate`|Rework jumps - `[{when, to}]`; the agent evaluates conditions, a hit -> backward jump to `to`, no hit -> pass through. Required non-empty - a gate without rework jumps is a silent pass-through|
|`route`|string?|all|Route membership - declared route id (absent = implicit default route, always active)|

Judgment context (gate/approval) = direct dependsOn reports (`## Upstream:` blocks from the agent session) + effective `channels` targets (`node:` reports, reference skills, files - full-type inheritance) - assembled by the same pipeline as main nodes. The `reads` field is removed (schema field convergence); cross-level references declare `channels: [node:<id>]`.

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
|`label`|string|Option label - displayed in approval() options[].label|
|`description`|string|Option description - displayed in approval() options[].description|

No `default` field exists - Run Mode auto executes the AI recommendation, never a declared action.

## IApprovalDecision

Field list + JSON shapes + card-selection mapping: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home - ADR 0141). Never restated here.

---

# GraphSnapshot (optional - progress info)

`snapshot` optional. Present in `graph_start`, `graph_advance`, `graph_jump`, `graph_force_end` responses - uniform API self-containment. For jump navigation + progress display - never triggers execution.

|Field|Type|Purpose|
|-|-|-|
|`runId`|string|Graph run unique identifier|
|`graphName`|string|Graph name|
|`fsmState`|string|FSM state - `idle`, `running`, `completed`, `terminated`|
|`currentPhaseId`|string \| null|Currently active phase node ID - `null` when none|
|`nodeCount`|number|Total node count|
|`completedCount`|number|Completed node count|
|`createdAt`|string|ISO 8601 run creation timestamp|
|`updatedAt`|string|ISO 8601 update timestamp|
|`nodes`|one-line rows|Per-node one-line states `{nodeId, status, retryCount}` - jump-target enumeration data source (M2) + progress display. Node status values: `pending` \| `active` \| `done` \| `aborted` - runtime FSM produced set; `completed` is a run-level fsmState, NOT a node status. Unselected route members and pass-through targets stay `pending` (never activated).|
|`changed`|ISnapshotNode[]?|Delta rows - full-field states `{nodeId, status, retryCount, startedAt, completedAt, durationMs}` for nodes whose state changed since the last dispatch (per-run signature cursor). Present on dispatch responses; absent when nothing changed or on pure status queries.|

## fsmState Logic

Run-level FSM status values (FsmStatus) - mechanism detail: atom-graph-spec ROUTING §Completion + atom-pilot §Run Completion.

|fsmState|Meaning|
|-|-|
|`idle`|Run created, no node dispatched yet|
|`running`|Nodes dispatching; run in progress|
|`completed`|Run finished (natural drain or approval end action)|
|`terminated`|Run force-ended (`graph_force_end`)|

## Progress Fields

- `completedCount` / `nodeCount` -> display progress: `[completedCount/nodeCount]`
- `currentPhaseId` -> highlight which node is active in UI

---

# IApprovalDecision JSON Shapes

Collected choice + custom text -> `IApprovalDecision` JSON (incl. chosen action `value`): see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home).
