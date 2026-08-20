# NodeDetail (primary - always present)

`node` = primary return field. Present in `graph_start`, `graph_advance`, `graph_jump`. `null` = graph complete - no next node.

## Base Fields (all phase types)

|Field|Type|Required|Purpose|
|-|-|-|-|
|`nodeId`|string|yes|Phase node identifier|
|`type`|string|yes|Phase type - determines dispatch: `main`|
|`skill`|string?|all|Execution skill - phase `skill` field; the skill that executes this phase's work (main type)|
|`operations`|string[]?|main|Operation classes - phase `operations:` declaration (evidence-only Tool usage check). Union with the skill's `Operation classes` default feeds the class-based verification (no registry injection exists).|
|`agent`|string[]?|main|Agent hints - peer-level advisory sub-agent type preferences (priority-ordered, first available wins, fallback platform default). Main phases only - every dispatched node is a root-graph phase (subgraph composition is deleted), node ids are plain phase ids. Consumed by the handler `## Agent hints:` block + task() dispatch preference.|
|`constraints`|string[]?|all|Graph-level constraints - `[graph]`-prefixed dispatch facts from the loaded graph definition (unbypassable; absent graph field → empty). Project-level rules are NOT carried here - they arrive via the agent-side activation session copy and are merged into the block by the dispatch handler.|
|`completion`|CompletionInfo|yes|Machine-declared decision options `{default, choices?, direct_end?}` - `default`: `'continue'`; `choices`: explicit branch options (rendered directly as card options); `direct_end`: declared `direct end: <label>` label. No `rework` field (in-run rework removed — ADR 0238; loop/rework semantics are flow self-edges — top-level `flow` field, condition-matched transition-table re-entry; branch semantics are `template: router` subgraph selection). Compiled from branch choices + direct-end declarations; consumers route from this block, never task-text parsing.|
|`retryCount`|number|yes|Current retry count, 0-based. Incremented at jump reset (the operator `graph_jump` PCL and the advance `jump` channel — backward rework) and on flow re-entry (condition-matched: each pass through a re-entry edge — matched target equal to the reported node, or a target already completed — increments the re-entered node's counter) — never zeroed. The loop bound = constraint prose + retryCount (engine-incremented).|
|`dependsOn`|string[]?|all|Upstream node IDs - scheduling only (topological order, rework closure). Direct dependsOn outputs arrive as context for the main dispatch|

The dispatch handler skill is the constant `atom-phase-handler` for main - agent-side knowledge, never carried in the payload (no `handlerSkill` NodeDetail field). Graph-level constraints ARE carried: `NodeDetail.constraints` = `[graph]`-prefixed dispatch facts from the loaded graph definition (unbypassable; every dispatched node is a root-graph phase — composition is deleted, no subgraph constraint union); project-level constraints arrive via the pilot-loaded activation session copy.

## Type-Specific Fields

|Field|Type|Phase type|Purpose|
|-|-|-|-|
|`task`|string?|`main`|Task instruction text (main - executed inline).|
|`template_args`|{paths: string[]}? \| {terminal: string}? \| {questions: [{prompt, condition}]}?|`main`|Template parameters — machine-declared, per-template: router template nodes (`template: router`) carry `paths` = the candidate graphs (the ONLY path form — paths are graphs); the frontend selection card's options come from this field, never parsed from task text. Scope-entry template nodes (`template: scope-entry`) carry `terminal` = the graph's terminal node name (round-report|fp-doc-update — interpolated data, never a variant-selection discriminator, ADR 0245). Router template nodes MAY carry `questions` = caller-declared extra judgment entries `[{ prompt, condition }]` — the node has additional judgment and corresponding flow edges; prompt content and condition vocabulary come from the calling graph, never template semantics (accept-node consolidation, ADR 0246). The framework-chain `node` discriminator shape and the loop template_args shape (`graph` + `until`) do not exist — loops are flow self-edges (top-level `flow` field, condition-matched re-entry). Startup / adopt-scope / adopting template nodes carry no `template_args`.|
|`channels`|string[]?|all|Effective channel patterns (global channel + phase channels - scheduler-side merge of config `context:` default layer + graph top-level `context:` prepended to phase `channels:`, dedup outer-first; carries the merged list, agent-side never re-merges) - main: skill names, file globs, or node IDs against the execution skill contract (deterministic); node: entries are read edges to node reports (delivered from the agent session), promotion self-skip already applied|

Judgment context = direct dependsOn reports (the `upstream:` sub-section of the `## Context` block from the agent session) + effective `channels` targets (`node:` reports, reference skills, files). The `reads` field is removed (schema field convergence); cross-level references declare `channels: [node:<id>]`. Node decisions carry `action: 'continue'` only (no `branchTo`, no retry — ADR 0238) + the flow condition value on advance; card options come from `completion` (never task-text parsing). Subgraph composition is deleted (graph-subgraph-route-unify) — every dispatched node is a root-graph phase with a plain phase id (no namespacing); nested execution is the router sibling run launched inside the node; loops are flow self-edges — loop-head nodes dispatch as plain main nodes, the loop is the transition-table re-entry on the condition value reported on advance.

## IApprovalDecision

Field list + JSON shapes + card-selection mapping: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home - ADR 0141). Never restated here.

---

# GraphSnapshot (optional - progress info)

`snapshot` optional. Present in `graph_start`, `graph_advance`, `graph_jump`, `graph_force_end` responses - uniform API self-containment. Compact on hot-path dispatches (`progress` + `changed`, no `nodes` array); the full `nodes` array is served by `graph_status` only. Never triggers execution.

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
|`progress`|string|Single-line progress, e.g. `3/23 · requirement/present-candidates`|
|`nodes`|one-line rows|Optional - full delivery only via `graph_status`; hot-path snapshots omit it. Per-node one-line states `{nodeId, status, retryCount}` - rework-target + jump-target enumeration data source + progress display. Node status values: `pending` \| `active` \| `done` - runtime produced set; `completed` is a run-level fsmState, NOT a node status. No `aborted` value exists (force-end writes no per-node status, ADR 0223). Unselected branch members stay `pending` (never activated).|
|`changed`|ISnapshotNode[]|Delta rows - full-field states `{nodeId, status, retryCount, startedAt, completedAt, durationMs}` for nodes whose state changed since the previous dispatch (signature-compared against the caller-passed prevState); empty when nothing changed. A status query passes no prevState, so every row is emitted as changed.|

## fsmState Logic

Run-level FSM status values (FsmStatus) - mechanism detail: atom-graph-spec ROUTING §Completion + atom-pilot §Run Completion.

|fsmState|Meaning|
|-|-|
|`idle`|Run created, no node dispatched yet|
|`running`|Nodes dispatching; run in progress|
|`completed`|Run finished (natural drain)|
|`terminated`|Run force-ended (`graph_force_end`)|

## Progress Fields

- `progress` -> single-line run progress segment (e.g. `3/23 · requirement/present-candidates`)
- `completedCount` / `nodeCount` -> display progress: `[completedCount/nodeCount]`
- `currentPhaseId` -> highlight which node is active in UI

---

# IApprovalDecision JSON Shapes

Collected choice + custom text -> `IApprovalDecision` JSON (incl. chosen action `value`): see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home).
