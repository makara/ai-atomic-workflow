# Decision Card Composition (main type)

Main nodes execute confirmation points per atom-kernel §approval() (single-form card). When `node.completion` declares options, card options map:

- **Accept** - the AI recommendation (judged from the judgment context + snapshot).
- **`node.completion`** - the machine-declared options (`choices` / `direct_end`) render directly as card options; never parsed from task text.
- **custom:true always present** - free-text text box for user input.
- Collect the approval() decision (choice + custom text) -> output as `IApprovalDecision` JSON - shapes: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape (single home). Node decisions carry `action: 'continue'` (no retry/jump actions, no `branchTo` — ADR 0238); direct end is carried as `direct_end: true` (pilot advances with `end: true`).

# Router Template Selection (graph-router-template)

Router template nodes (`NodeDetail.template_args.paths` present — machine-declared candidate graphs) select a path to START, not a branch to activate:

1. Selection input: the candidate graphs' metadata (`graph_assets` — `description` + `run_conditions`, on demand) + the node context (hard criterion stated in the task text, e.g. an echoed adoption judgment) + the candidate count.
2. Auto-select (NO card): exactly one candidate exists, OR a hard criterion is satisfied — complete the node self-decided.
3. Selection card (ambiguity): present the approval() card whose options ARE the candidate graphs (`NodeDetail.template_args.paths` — machine-declared; never parsed from task text), with the agent's recommended graph marked (judged from the criterion/context).
4. After selection: start the chosen graph as a sibling run (`graph_start`), drive its loop to completion (`graph_advance` until `node: null`), collect the result — then report the node with `chosen_graph` / `run_id` / result fields. The path activation is the sibling run itself: NO `branchTo`, NO composing-phase activation.

# Flow Self-Edge Loop (graph-flow capability)

Loop/rework is a top-level `flow` self-edge (`A -->|condition| A` — inline bounded loop, condition-matched re-entry). The loop-head node dispatches as a plain main node (no template — the `loop` template is removed); its task text evaluates the loop condition inline per the flow declaration:

1. NOT satisfied → the node report / decision output carries the re-entry condition value (e.g. `fail`); the pilot advances with `graph_advance(runId, nodeId, condition: 'fail')` — the transition table re-enters the node (missed-condition guard: a condition matching no outgoing flow edge is a loud error).
2. Satisfied → the node report / decision output carries the exit condition value (e.g. `pass`); the advance routes downstream (labeled edge or sequence default).
3. The bound lives in the loop-head node's task text / the graph's constraints prose (`at most 2 rounds`) — agent-enforced; the engine increments the re-entered node's `retryCount` on each re-entry edge pass (never zeroed) — the machine counter the bound check observes.
4. Honor a declared `direct end` (user termination) when the bound is exhausted and the human decides to stop.

No `branchTo`, no in-run target routing — the loop IS the transition-table re-entry on the condition value (ADR 0238).

# Rework Decision (removed)

In-run rework decisions no longer exist — loop/rework semantics are flow self-edges (top-level `flow`: `A -->|condition| A` inline bounded loops; see Flow Self-Edge Loop above); backward rework to an ancestor rides the advance `jump` channel (graph-internal forced rework — backward-only, engine-guarded); branch semantics are subgraph selection via `template: router` (see Router Template Selection). The operator `graph_jump` (PCL, graph-external) is the operator-level backward reset and takes its target directly — never a node decision action.

# Keep Decision In-Session

The decision lives in the agent session (platform-persisted) — no scheduler persistence, no files. The pilot routes node decisions via `graph_advance` (continue / condition / jump / end: true); `graph_jump` routes operator jumps (PCL). Downstream nodes judge from the session.

- **Main** - full decision JSON (shape + field semantics: see atom-kernel APPROVAL-CARDS.md §IApprovalDecision Shape - single home); `action: 'continue'` always, `direct_end: true` when the direct-end option was chosen, the chosen option's stable `value` carrying the flow condition reported on advance (flow-defined vocabulary).
- **Direct end** - decision JSON incl. `direct_end: true`; the pilot advances the node with `end: true` (run drains to completed via natural drain).
