# activation-prologue Specification

## Purpose

The prologue node (run-mode confirmation + constraints loading). Asset: `packages/graph-scheduler/src/prologue.ts`.

## Requirements

### Requirement: Graph-aware synthesis — confirm only where consumed

When the flattened graph contains approval nodes, `$run-mode-confirm` SHALL be synthesized; with no approval nodes, synthesis SHALL be skipped (the mode has no consumption point). `$load-constraints` SHALL always be synthesized.

#### Scenario: No approval graph skips confirm

- **WHEN** the flattened graph contains no approval nodes (e.g. arch-review)
- **THEN** P contains only `$load-constraints` — no mode question, no `## Run Mode:` block injection

#### Scenario: Gate references mode in approval-less graph

- **WHEN** an approval-less graph declares a gate condition referencing run mode
- **THEN** the missing `## Run Mode:` block causes the condition to evaluate to false and flow through conservatively (validate warns the author)

### Requirement: Built-in `$run-mode-confirm` behavior

The built-in confirm node SHALL: ① when `args.mode` is set (`{args.mode}` interpolation; kept as a literal when unset) → emit that value; ② otherwise ask via approval() — decision card, Manual recommended — absence never auto; ③ execute ① and ② on every activation (including round restarts) — no echo mechanism. The output SHALL be JSON `{ "mode": "manual" | "auto" }` written to the output file.

#### Scenario: args.mode short-circuits

- **WHEN** graph_start creates a run with `args: { mode: "auto" }`
- **THEN** the confirm node does not ask and outputs `{ "mode": "auto" }`

#### Scenario: Round restart re-asks

- **WHEN** a round restart activates the confirm node and args.mode is unset
- **THEN** it asks via approval() again — the mode may change between rounds, never silently carried over

### Requirement: Built-in `$load-constraints` behavior

The built-in load node SHALL follow the compiled artifact protocol (see capability `activation-prologue/constraints-json`): when `.graph-scheduler/constraints.json` exists → read and emit its `constraints` array (constraints.md is not read); when missing → compile the `## Rules` of constraints.md (organized at caveman full level — condensed, deduplicated, wording corrected, order unified) → write the JSON → emit. The output SHALL be JSON `{ "constraints": [...] }` written to the output file (format unchanged). When both files are missing → an empty array (no failure).

#### Scenario: Per-activation reload

- **WHEN** a round restart activates the load node and constraints.json exists
- **THEN** the output carries the array from the JSON — zero markdown reads, zero recompilation; editing the source files only takes effect after constraints.json is deleted (the previous verbatim-copy semantics are removed)

#### Scenario: Missing file yields empty

- **WHEN** neither `.graph-scheduler/constraints.json` nor `.graph-scheduler/constraints.md` exists
- **THEN** the load node outputs an empty constraints array and the run continues normally (no constraint block injection)

### Requirement: Round-level freeze

All dispatches of the current round SHALL consume the P outputs of the current round's activation (confirm/load output files) — frozen within the round; refreshed across rounds via re-activation. When P outputs are missing or corrupted, the consuming side SHALL degrade (missing confirm → manual + warning; missing load → empty constraints + warning), never blocking.

#### Scenario: Mid-round file edit ignored

- **WHEN** the project constraint file is edited mid-round
- **THEN** subsequent dispatches of this round still carry this round's load output snapshot — the within-round freeze contract

#### Scenario: Missing P output degrades

- **WHEN** the confirm output file is missing (e.g. the P node failed to execute)
- **THEN** the consuming side presents the approval card in manual mode and injects a warning — absence never auto

### Requirement: Mode scope — approvals only

Run Mode controls decision presentation: approval nodes AND approval() checkpoints inside main nodes — main nodes SHALL never auto-execute or be skipped outside approval() checkpoints. Interviews are never gated — structurally, approval() without a recommendation always presents a card.

#### Scenario: Grill interview runs in auto mode

- **WHEN** a main interview node (grill/scope) runs in auto mode
- **THEN** the interview still conducts its conversation — Run Mode never bypasses interviews (no recommendation → card)

#### Scenario: Gate eval unchanged

- **WHEN** a gate runs in auto mode
- **THEN** gate jump evaluation is unchanged by Run Mode (agent judges; mode does not affect gates)

#### Scenario: Main-node checkpoint auto-executes in auto mode

- **WHEN** a main node calls approval() with a recommendation in auto mode
- **THEN** the recommendation executes without a card

#### Scenario: Interview never auto-executed

- **WHEN** a main interview node runs in auto mode
- **THEN** the interview still conducts its conversation (graph dispatch override); Run Mode never bypasses it

### Requirement: Run-level mode field

Run Mode SHALL be decided by the built-in `$run-mode-confirm` node on every activation (run start and round restarts): when `args.mode` is set (`{args.mode}` interpolation short-circuits) → emit; otherwise ask via approval() — decision card, Manual recommended — absence never auto. The mode SHALL NOT be persisted in the run record and SHALL NOT appear in NodeDetail fields; the consuming side reads the confirm node's output file. Graphs without approval/gate nodes SHALL skip confirm synthesis (no mode consumption point — gate `jumps[].when` conditions also consume the mode).

#### Scenario: Run created with explicit mode

- **WHEN** `graph_start({ graphName: "...", args: { mode: "auto" } })` is called
- **THEN** the confirm node outputs `{ "mode": "auto" }` and this round's dispatches consume that value — no question, nothing written to the run record

#### Scenario: Gate-only graph synthesizes confirm

- **WHEN** a flattened graph contains only gate nodes (no approval) and declares no `$run-mode-confirm`
- **THEN** `$run-mode-confirm` SHALL be synthesized — gate jump conditions consume the mode

#### Scenario: Mode defaults to manual

- **WHEN** args.mode is unset and the user selects Manual
- **THEN** this round's mode is manual — the confirm question defaults to Manual, never silently Auto (absence never auto)

#### Scenario: Entry interviews never carry the mode topic

- **WHEN** any entry interview node executes
- **THEN** it SHALL NOT include an auto-approve mode topic, echo scanning, or an `auto_approve` output field — the mode is carried by the `$run-mode-confirm` activation-prefix node (re-asked on round restart, no echo)

#### Scenario: Round restart re-decides

- **WHEN** a round restart activates the confirm node
- **THEN** the mode is re-decided (args short-circuit or re-asking) — the mode may change between rounds

### Requirement: Mode consumption — direct branch

When an approval node is dispatched and the confirm output mode is `'auto'`, the AI-recommended action SHALL execute card-free: assemble an IApprovalDecision (action/target/label/note `'run mode: auto'`) and persist the decision file as usual. Missing or corrupted confirm output SHALL degrade to a human card (absence never auto), with the card showing "Run mode: auto — no recommendation; decide manually" or a manual note.

#### Scenario: Auto execution persists decision with label

- **WHEN** the confirm output is auto and an approval node is dispatched
- **THEN** that approval SHALL not present a decision card
- **AND** SHALL assemble the decision from the AI-recommended action (label preserved)
- **AND** the decision file SHALL be persisted as usual — downstream when guards consume it per the existing semantics

#### Scenario: Manual mode always presents the card

- **WHEN** the confirm output is manual and an approval node is dispatched
- **THEN** a human decision card SHALL be presented — no automatic execution path

#### Scenario: Empty routing actions fall back to human card

- **WHEN** the confirm output file is missing (or the graph did not synthesize confirm) and an approval is dispatched
- **THEN** a human decision card SHALL be presented with a warning — never guess the action

### Requirement: Mode propagation — run field by construction

Nested flow composition SHALL propagate the mode naturally through the shared activation's confirm output: subgraphs and the parent graph belong to one activation of one run, and their dispatches read the same confirm output file — no echo scanning, no output-file inheritance, effective uniformly at any nesting depth. Independent runs SHALL decide at their own activation.

#### Scenario: Nested composition inherits by run field

- **WHEN** a nested graph entry executes (this round's confirm output is auto)
- **THEN** its dispatched nodes consume the same confirm output as `'auto'`
- **AND** SHALL NOT run any mode scanning or inheritance protocol

#### Scenario: Same-session consecutive runs do not leak

- **WHEN** two independent runs are created consecutively in the same session
- **THEN** the second run's mode SHALL be decided by its own confirm node's activation — the first run's output has no effect (activation ordering guarantees write-before-read)

### Requirement: Auto mode SHALL execute the declared default action

Auto mode SHALL execute the AI-recommended action — the recommendation is judged dynamically by the AI from the context at execution time; when the AI has no recommendation, the card is shown as a fallback (never act on its own).

#### Scenario: Dynamic recommendation

- **WHEN** an approval executes in auto mode and the AI judges a recommendation (e.g. implement when top_rec remains, end when none)
- **THEN** the recommended action executes without a card; the decision persists with the action value + note 'run mode: auto'

#### Scenario: End happens to be the recommendation

- **WHEN** the AI recommendation is the `end` action
- **THEN** the workflow ends automatically in auto mode

#### Scenario: No recommendation — human card

- **WHEN** the AI cannot form a recommendation in auto mode
- **THEN** the human card is presented (Accept + free input + AI-generated options), never an arbitrary auto-execution

#### Scenario: Auto executes declared default

- **WHEN** an approval runs in auto mode and the AI forms a recommendation
- **THEN** the recommended action executes without a card (dynamic recommendation — no declared default exists)

#### Scenario: No default falls back to human card

- **WHEN** auto mode has no AI recommendation
- **THEN** the human card presents (Accept + free input + AI options)

### Requirement: Recommendation SHALL be agent-judged

The recommendation SHALL be judged by the agent reading the judgment context + snapshot + confirm mode output (the judgment authority stays with the agent; the backend purely executes). The judgment context = direct dependsOn outputs (auto-injected) + declared `channels` `node:` target outputs; the `reads` field has been removed.

#### Scenario: Branch-route recommendation

- **WHEN** an approval declares branch-route options (minimal/detailed) and the context indicates one (e.g. no ADR created)
- **THEN** the AI recommends that option; auto executes it, manual shows it marked as recommended

#### Scenario: Judgment context source

- **WHEN** an approval dispatches and the agent judges the recommendation
- **THEN** the judgment context SHALL be the direct dependsOn outputs plus the declared `channels` `node:` outputs plus snapshot plus confirm mode — never a `reads` field (removed)

#### Scenario: Missing channel output noted

- **WHEN** a declared `channels` `node:` target has no output file (pending/unactivated node)
- **THEN** the context SHALL note `<id> has no output` and the judgment SHALL treat references to it conservatively (never fabricate)

### Requirement: Activation prologue — reserved synthesis

The activation prefix SHALL be graph-external built-in nodes with reserved `$` ids — `$run-mode-confirm` (run mode confirmation, synthesized only when the flattened graph contains approval/gate nodes consuming mode) and `$load-constraints` (project constraints loading, always) — not author-declared `input: true` phases. The `$` prefix SHALL be reserved: PhaseSchema SHALL reject any other `$` id; authors override a built-in by declaring the same id with `dependsOn: []`. The prefix SHALL be excluded from the author DAG (topology, contract checks, jump-closure) and SHALL re-run on backward resets targeting an entry node.

#### Scenario: Run starts with prologue prefix

- **WHEN** a run starts
- **THEN** `$run-mode-confirm` and `$load-constraints` are the first dispatched nodes (mode node only when the graph consumes mode), author nodes wait behind them

#### Scenario: Author overrides a prologue id

- **WHEN** an author declares `$run-mode-confirm` or `$load-constraints` with `dependsOn: []`
- **THEN** the declared node replaces the default protocol; any other `$` id SHALL fail validation

#### Scenario: Reset to entry re-runs prologue

- **WHEN** graph_jump or gate branchTo targets an entry node
- **THEN** the prologue prefix SHALL reset and re-dispatch first (mode re-confirmed, constraints re-loaded) — mid-graph rework resets never touch the prologue

### Requirement: Phase schema without input field

The phase schema SHALL NOT carry an `input` boolean field. Entry phases are ordinary `dependsOn: []` nodes; activation-prefix membership is the prologue's concern, not a phase property. A leftover `input` key SHALL be treated as an unknown field (schema strips it) — the revert needs no compatibility shim.

#### Scenario: No input field in schema

- **WHEN** a graph is validated
- **THEN** the `input` key SHALL not be part of the schema (unknown fields strip silently), and no graph SHALL declare run-mode/constraints as ordinary ids without the `$` prefix

### Requirement: Clean no-content exit

When the review report has no remaining Top Recommendation, the loop SHALL end via the approval end action without forcing adopt/implement machinery into blocked spins. The adopt stage SHALL NOT run when there is nothing to adopt.

#### Scenario: No Top Rec ends the loop

- **WHEN** the report reports `top_rec_remaining: false`
- **THEN** the loop completes via the approval end action; no spec-propose/spec-extract/apply nodes spin in blocked state

### Requirement: Activation order — constraints load before run-mode confirm

The activation-prefix synthesis order SHALL place `$load-constraints` before `$run-mode-confirm` (the synthesis array order is the dispatch order). When confirm is dispatched, the load output already exists — the `## Constraints` block is injected normally and the mode decision card carries the canonical context. Confirm dispatch no longer has a "constraints missing → degraded empty block + warning" path.

#### Scenario: Confirm dispatch carries constraints block

- **WHEN** the activation prefix of a graph containing approvals dispatches the confirm node
- **THEN** the confirm decision card already has the `## Constraints` block injected (the load output was written first)

#### Scenario: Gate-only graph unchanged

- **WHEN** a graph has no approvals (only load is synthesized)
- **THEN** the dispatch order is unchanged — load remains the only prefix node, author nodes come after it

### Requirement: Constraints artifact reset contract

The validity of `.graph-scheduler/constraints.json` SHALL be determined by existence; the `compiled_at` metadata is audit-only and does not participate in invalidation. Deleting the file SHALL reset the cache — recompiled on the next activation. A JSON parse failure (corrupted by manual edits) SHALL be treated as missing → recompile and overwrite.

#### Scenario: Deletion resets the cache

- **WHEN** the user deletes constraints.json and the load node is activated
- **THEN** the load node recompiles constraints.md and overwrites constraints.json (including a new compiled_at)

#### Scenario: Invalid JSON recompiles

- **WHEN** the constraints.json content is invalid JSON
- **THEN** the load node recompiles constraints.md and overwrites the corrupted file

#### Scenario: Mid-round artifact edit ignored

- **WHEN** constraints.json is edited mid-round
- **THEN** subsequent dispatches of this round still carry this round's load output snapshot — the round-level freeze contract is unchanged (edits take effect at the next round's activation)
