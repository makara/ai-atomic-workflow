> Reference sibling of `atom-graph-spec` (SKILL.md) - PhaseSchema field tables and format rules, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Top-Level Fields

|Field|Type|Required|Purpose|
|-|-|-|-|
|`name`|string|yes|Graph identifier - resolved by scheduler registry. Kebab-case.|
|`description`|string|no|Purpose-focused free text - states what the graph does/produces (identity metadata, displayed in the pilot banner before the first node; carried by `graph_start`). Optional, non-enumerated, zero behavior branching - a description is identity for humans, never a machine-consumed directive.|
|`phases`|Phase[]|yes|Phase list. Declaration order cosmetic - execution order resolved exclusively by dependsOn DAG. List in dependency order for readability.|

## Phase Fields

YAML field names shown below. Scheduler resolves to internal NodeDetail fields at runtime - see `atom-phase-handler` NODE-SCHEMA.md §NodeDetail for full schema. Field names in `.taskflow.yaml` differ from NodeDetail for some fields - table maps both.

|Field (YAML)|NodeDetail|Type|Required|Purpose|
|-|-|-|-|-|
|`id`|`nodeId`|string|yes|Unique phase identifier. Kebab-case.|
|`type`|`type`|string|yes|Phase type - closed enum: dispatch types `main`/`approval`/`gate` + composition type `flow` expanded at load time. See §Type Ownership Layers.|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
|`skill`|`skill`|string?|`main`|Execution skill - the skill that runs this phase's work; serves as the channels contract source (dual-track). Registry `skill` is the handler, never a dispatch target.|
|`agent`|`agent`|string[]?|`main`|Agent hints - priority-ordered sub-agent type preferences (e.g. `[reviewer, task]`). Advisory: skills pick the first available type when they dispatch; absent -> platform default. Arrays may carry multi-platform spellings (e.g. `[reviewer, explore, task, general]`) - availability and the platform default resolve per atom-kernel §Platform Spellings. Arrives as `## Agent hints:` block.|
|`operations`|`operations`|string[]?|`main`|Operation classes - closed-set members of the High-Level Tool Registry (atom-kernel §High-Level Tool Registry). Phase declaration overrides/complements the dispatched skill's `Operation classes` default (union semantics; phase wins on conflict). Absent = skill default. Values validated against the closed set at graph load - unknown class -> loud rejection. Declarative only: scheduler passes through to NodeDetail; verification handler-side. See §HLT Operations Declaration.|
|`use`|-|string|`flow` type|Referenced graph name. Static constant - merge-at-load flattens. `{...}` dynamic expression -> error (Phase 2 deferred). Required for flow - the only flow field (def/with/maxDepth removed).|
|`task`|`task`|string?|`main`, `approval`|Task instruction - executed inline (main) / full card prompt (approval - first line = header <=30 chars, remaining lines = card body; handler truncates as fallback and appends the generic "Free input overrides." sentence). Use block scalar `|` per §YAML Format Rules.|
|`channels`|`channels`|string[]?|all|Phase-level context additions - uniform across main/approval/gate (all entry kinds legal, no per-type rules). Entry type derived from the dispatched skill's `## Context Requirements` contract when one exists (`skill:<name>` reference, `node:<id>` read edge to a node report, bare contract-table match, or file glob); no `skill` -> explicit `skill:`/`node:`/glob only, bare name errors. `node:<id>` entries are read edges to non-`dependsOn` node reports (delivered from the executing agent's session — the scheduler never stores content). Flow phases SHALL NOT declare `channels` (loud rejection). Ambient context lives in the graph top-level `context:` (global channel). Resolved deterministically (validate + runtime same implementation). See §YAML channels Field.|
|`route`|`route`|string?|all|Route membership - declared route id. Flows propagate their id to children (flatten); absent = implicit default route (always active). See §Routes.|
|`jumps`|`jumps`|Jump[]?|`gate`|Rework jumps - `[{when, to}]`: `when` is a natural-language condition (agent-judged), `to` an explicit BACKWARD target node id (upstream terminal - validator-enforced). Required non-empty on gate; forbidden on all other types (loud rejection).|
|`routing`|`routingActions`|Route[]?|`approval`|Decision routing with nested `actions` array - declared ONLY in branch-route scenarios; each action declares `target` (node or route id) + `value` (stable machine id) + label/description. See §Approval Routing Actions. Approval card header derives from `task`'s first line (fallback `Decision Required`) - no separate topic field.|
|`join`|`join`|`'any'` literal|any phase|`join: any` - phase fires when any upstream completes. Existence of `join` IS the any-mode declaration; absent = all. Schema + validator rules: see ROUTING.md §Join Mode Rules (single home).|

## Flow Phase Fields

`type: flow` references a saved sub-graph via `use` (inline `def`, `with` params, `maxDepth` removed). Phase 1 (merge-at-load): loader flattens flow phases at graph load time. Zero runtime overhead - flow type invisible to FSM/API/agent after load.

### Constraints

1. **use required** - flow phases SHALL declare `use`; schema rejects flow without it.
2. **Static only** - `use: "graph-name"` - no `{...}` runtime expressions (Phase 2 deferred). Dynamic expression -> `FlowPhaseError`.
3. **Depth cap** - constant 5 (field removed). One flow referencing another -> depth counter increments. Level 6 -> error.
4. **Name collision** - child node ID prefixed with `<parentId>/`. Parent graph MUST NOT have existing `parentId/childId` nodes - detected at load time.
5. **dependsOn semantics** - parent phase downstream depends on child graph terminals (nodes with no downstream in the child graph). Loader rewrites after flatten.
6. **Registry required** - `use` name MUST exist in graph registry (`registry.json`). Unregistered graph -> load error.
7. **Route propagation** - a flow declared as a route (`route: <id>`) propagates its id to children (children without their own `route` inherit the flow's). Branch-route flows MUST declare `route:` (see ROUTING.md §Routes). Children with their own `route` keep theirs.

### Example

YAML: see YAML-EXAMPLES.md §Flow Phase Example.

After merge-at-load, `skill-ops` replaced by `skill-ops/scope-confirm` through `skill-ops/output-examples`. `review` depends on child terminals - `skill-ops/output-examples` (final child node).

## Auto-Supplied Fields

Auto-supplied fields (NEVER write in YAML):

- `skill` (string) - resolved from `skill` field; the execution skill for the phase's work.
- `retryCount` (number) - runtime counter. 0-based. The node's own jump re-execution count; gate jump bounds reference the TARGET node's `retryCount` (single counter - see §Gate Jump Conditions).

The dispatch handler skill is the constant `atom-phase-handler` for main/approval/gate — agent-side knowledge, never carried in the payload (no `handlerSkill` NodeDetail field). Run mode and project constraints are NOT NodeDetail fields - they arrive at activation (graph_start `args.mode`; pilot-loaded constraints, §Activation). `constraints`/`runMode` declared in YAML -> schema rejection with migration hints; `$`-prefixed ids -> schema rejection (activation prologue removed).

## Route Field (all phase types)

`route: <id>` marks phase membership in a named route. Routes are explicit route-first constructs - zero inference.

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`route`|`route`|string?|Route membership - declared route id. Absent = implicit default route (always active, never stored).|

## Approval Routing Actions (branch-route only)

YAML format uses `routing` with nested `actions` array. Each action maps to one approval() option. Written actions are declared ONLY for explicit branch-route selection - default card composition: see ROUTING.md §Approval Decision Confirmation (single home).

|Field (YAML)|NodeDetail|Type|Purpose|
|-|-|-|-|
|`action`|`action`|`'continue' \| 'retry' \| 'jump' \| 'end'`|Routing semantics - continue (advance; branch-route target = node or route id), retry (re-execute target), jump (go to target node), end (complete the run - `graph_advance` `endRun`).|
|`target?`|`target?`|string|Branch-route option target (`continue` - node or route id) or re-run target (`retry`/`jump` - node id). Routing targets SHALL be explicit.|
|`value`|`value`|string|Stable kebab-case machine identifier - persisted decision output carries it; gate jump conditions and AI recommendations reference `decision value`, never label text.|
|`label`|`label`|string|Option label displayed in approval()|
|`description`|`description`|string|Option description displayed in approval()|

No static default field exists - Run Mode auto executes the AI recommendation (judgment basis: §Jump Semantics + snapshot + run mode), never a declared action.

## HLT Operations Declaration

A main phase MAY declare `operations: [<tool-name>, ...]` - closed-set members of the HLT Registry. Semantics: union with the dispatched skill's `Operation classes` default (phase wins on conflict); absent = skill default alone. Validation: unknown class name -> loud rejection at graph load (no runtime fallback). Scheduler behavior: pass-through into NodeDetail - no scheduling effect; the handler assembles registry entries and performs class-based Tool usage verification per declared class.

## YAML channels Field - three-tier context model

Context delivery has three tiers, one field each:

- **Convention layer** (platform-shipped, NO declaration) - exact files `CONTEXT.md` + `docs/domains.md`, default-loaded into every phase, absence-tolerant (missing -> empty + warning, never fail). No directory-class entries, no glob entries.
- **Project layer** - `.graph-scheduler/config.json` `context:` - project-declared layout, existence-validated (exact-file missing -> load error; glob zero-match -> warning - lazy doc creation legal).
- **Graph channels** - graph top-level `context:` + phase `channels:`. Graph-level file globs target workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`) ONLY - project file globs belong in config.json, conventions are never hand-declared. `node:<id>` entries are read edges to non-`dependsOn` node reports (dependsOn remains the scheduling edge; direct outputs arrive as context). Delivery form: the scheduler delivers channel DECLARATIONS with the dispatch payload; upstream CONTENT is assembled by the executing agent from its own session (platform-persisted — the agent produced those reports earlier in the run; after compaction, platform history addressing restores them). No payload content, no files.

```
effective = [convention layer, config `context:` defaults, graph `context:`, phase `channels:`] - dedup, order preserved
```

A phase-level `channels` entry type derives from the dispatched skill's contract - type comes from the contract tables, never guessed (main; the same resolution path serves approval/gate - uniform, no per-type rules):

|YAML channel entry|Type|Example|
|-|-|-|
|`skill:<name>` (explicit prefix)|Reference skills|`skill:atom-graph-spec`|
|`node:<id>` (explicit prefix)|From upstream - cross-level legal|`node:plan-parse`|
|bare entry in contract From upstream table|From upstream|`scope-confirm` (only when also a `dependsOn` node - else migrate to `node:` prefix)|
|bare entry in contract Reference skills table|Reference skills|`atom-graph-spec`|
|bare entry in contract Files table or glob shape (`*`, `?`, `[`, `/`)|Files|`.graph-scheduler/docs/x.md` (workflow artifact glob only; project globs -> config.json context)|
|entry duplicating a `dependsOn` node|redundant declaration -> warning|-|
|entry matching nothing|error - no fallback search|-|

**Graph/config-level entries** (`context:`) require an explicit `skill:`/`node:` prefix or a file-glob shape - a bare name is a load-time error (no execution-skill contract exists at those scopes). `node:` targets validate against the flattened node set at load; run-scope gating still applies at dispatch. A `node:` entry in `context:` **promotes** the named node's report into the global channel - every phase receives it as an ambient upstream block; the owning node skips its own promoted stream (self-read undefined). Flow phases SHALL NOT declare `channels` (schema rejection - move ambient entries to graph `context:`, data reads to the consuming phase). A child graph's `context:` applies to its own flattened phases; the parent's global channel reaches child phases via the dispatch merge - no flow-level propagation exists.

The removed `preText`/`reads` fields are rejected globally - see §Gate Type (single home).

## Skill-Contract Channel Derivation

Phases whose work consumes a spec skill SHALL declare the executing `skill:` (e.g. graph production: spec -> `atom-graph-design`, implement -> `atom-graph-writer`); the agent reads the skill's `## Context Requirements` reference tables when assembling context and derives the phase's spec channels (`skill:atom-graph-spec`) from the declared `skill:` entries. Graph-level `context:` remains the ambient fallback layer. This is the systematic replacement for per-graph hand-declared spec channels - a phase with a declared skill keeps its task text to Directive + output contract (see §Skill Dedup Deletion Test). The engine never parses the contract — channel _shape_ is machine-validated, contract _content_ is agent-side knowledge.

## Constraints

1. Channel entries are shape-validated by the engine at load (explicit prefixes, glob namespaces, run-scope); `skill:` entries pass through to the agent, which reads the skill itself.
2. File globs truncated to reasonable size before delivery.
3. Upstream outputs arrive as `## Upstream: <nodeId>` blocks in the sub-agent prompt.
4. Reference skills arrive as `## Reference: <skill-name>` blocks.
5. File contents arrive as `## File: <path>` blocks.
6. Contract Reference skills / Files entries missing from graph channels -> flagged by the agent-side consistency gate (estate-maintain Contract alignment — channel deletion is never silent; the engine holds no contract machinery).
7. Skill `## Context Requirements` is the agent-side single source of truth for context assembly — consumed when the handler reads the dispatched skill; the engine never parses it.

> **Terminology**: context contract = skill `## Context Requirements`; context channels = graph `channels` field; context = `## Upstream:` / `## Reference:` / `## File:` prompt blocks assembled at dispatch.

## Type Ownership Layers

Phase types belong to one of two layers (documented ownership model - optional layer removed with the agent type, registry mechanism removed):

|Layer|Types|Dispatch|Disability|
|-|-|-|-|
|Base|`main`, `approval`, `gate`|Static handlers resolved by type (schema-enforced enum)|Never - FSM jump protocol, decision-card flow, gate rework jumps, and run completion marking depend on them|
|Composition|`flow`|Load-time expansion (merge-at-load) - not a dispatch type|N/A - dispatch has no meaning for it|

No custom project types - `type` is a closed enum (`main`/`approval`/`gate`/`flow`); unknown types fail schema parse.

## Gate Type

Gate phase (`type: gate`) = **pure rework node** - machine counterpart of `approval` (human card). Authority split: gate evaluates rework conditions (agent judgment), reports backward jump; approval asks the human. Both produce the same `IApprovalDecision` protocol; a gate hit carries `action: jump`, `target: <jump to>`, `label: <jump when>` (pilot routes it via `graph_advance` `branchTo` - the scheduler applies the reset); no hit carries `action: continue` with no target - pass through, zero forward effect.

### Field Closure

Gate SHALL declare exactly: `id`, `type`, `dependsOn`, `route?`, `jumps` (required, non-empty), `channels` (all entry kinds - uniform, same rule as every type; judgment context per §Jump Semantics), `join?`. Forbidden fields (`task`/`preText`/`routing`/`agent`/`skill`/`use`) SHALL be rejected by schema (loud rejection - superRefine pattern). `preText` and `reads` are rejected globally (removed fields - schema field convergence): approval card text lives in `task`; judgment references migrate to `channels: [node:<id>]`. `jumps` required and non-empty - a gate without rework jumps is a silent pass-through; delete the gate or declare when/to pairs.

## YAML Format Rules

### Block Scalars

`task` field uses literal block scalar `|`:

YAML: see YAML-EXAMPLES.md §Block Scalars.

### Flow Sequences

`dependsOn`, `channels` use flow sequence `[...]` for inline lists:

YAML: see YAML-EXAMPLES.md §Flow Sequences.

### Comments

`#` comments document intent - jump conditions, phase purpose, routing rationale:

YAML: see YAML-EXAMPLES.md §Comments.

### File Location

Graph YAML files live in the scheduler's graphs directory. File name `<name>.taskflow.yaml` maps to graph `name` for `graph_start({ graphName })` resolution.

### Registry

Register new graphs in the scheduler's graph registry. Without registration, `graph_start` fails with unknown graph name.

## Language Constraints

1. **Graph YAML** - field names lowercase, values per project language conventions. Phase IDs kebab-case.
2. **task content** - per project language conventions. References to skills use plain skill names (content-dependency declarations). References to phase outputs use nodeId names (from upstream outputs). Declared-inputs contract:
   - **Input references covered** - every phase-output reference in task text must be covered by `dependsOn` (implicit) or `channels` (explicit `node:` entry).
   - **No runtime paths** - the `.taskflow/outputs/` form no longer exists (content flows via the agent session). References to it in task text are inert text — no validation check exists (path is gone); upstream arrives via declared inputs (dependsOn/channels).
   - **Claims match declarations** - upstream-reference wording must correspond to an actual declared channel or dependsOn edge (undeclared claims warn).
3. **Gate jump conditions and approval recommendation criteria** - per project language conventions, referencing observable facts in phase outputs (output contract fields, approval decision values, target-node retryCount).

## Task Content Spec

Normative content rules for `task` text and graph comments - the structure a task SHALL have and what it SHALL NOT repeat. Consumers: graph authors, code-review, graph-contracts validation.

### Mandatory Task Structure

Main phase tasks SHALL contain exactly three content classes, in order:

1. **Directive** - what to execute/produce, referencing the phase `skill`. One line suffices: `Execute <skill> graph mode per <skill> skill` or the produce-verb for skill-less phases.
2. **Phase-local invariants** - facts the dispatched skill cannot know: consumed output fields by name, routing/route semantics, retry bounds, phase MUST/NEVER rules (e.g. pipeline-done's incomplete-judgment check).
3. **Output contract** - machine-parseable emission fields. Exactly one block, canonical spelling:

```yaml
Output contract: field_a, field_b (meaning)
```

Approval tasks SHALL contain: header line (<=30 chars, card topic) + decision topic + phase-local criteria only. Gate tasks SHALL have no task (schema-enforced).

### Skill Dedup Deletion Test

Task text SHALL NOT contain content present in the dispatched skill, the handler defaults, or atom-graph-spec conventions. Delete the sentence - nothing lost? Delete it. Prohibited content classes:

- **Skill protocol steps** - interview() mechanics (confirm/research/think/interview), grilling rules (one question per turn, recommendation first), openspec CLI resolution (change-name 1-2-3), archive flows (Step 0-3), doc-maintenance pipelines.
- **Handler-default card mechanics** - "free input overrides", "dynamic options include", "recommendation follows X" (the handler judges recommendations from judgment context itself).
- **Upstream references** - "read X output", "via dependsOn implicit context", "via node:X channel". Upstream availability arrives as `## Upstream:` blocks; tasks name consumed FIELDS, never files or mechanisms.

### Comment Rule

Graph YAML comments SHALL declare topology intent only - one line per phase block, stating structural purpose (stage role, why a gate/route exists). Prose narration of phase behavior, DAG flow, or task content SHALL NOT appear; ADR/doc references are prohibited (mirrors the why-only comment policy).

### Output Contract Spelling

Exactly one canonical `Output contract:` prefix per main task. The spellings `Output:`, `Emit:`, `Output (main agent collects):`, `Write output (main agent collects):` SHALL NOT appear - all four converged onto the canonical form (deterministic validation error).

#### Entry-Skill Contract Declarations

Entry phases dispatching an entry skill (e.g. atom-scope-interview) SHALL declare the skill's caller contract in task text - the parameter channel (callee contract pattern). Spellings:

|Declaration|Shape|Rule|
|-|-|-|
|`Topics:`|comma list line|Interview decision points. Absent or empty = classification-only mode (no interview, no questions)|
|`Behavior:`|key=value lines|Flags per the dispatched skill's Input contract: confirm: mandatory\|as-needed; output path: user_owned\|derived; dual-name check: <field>\|none; context: required\|optional|
|`Output contract:`|canonical spelling (per §Task Content Spec)|Exact fields the skill emits - no implicit fields|

Rules:

1. Declarations are phase-local invariants - the skill's Input contract (SKILL.md) is the single source of flag semantics; meanings never restated in task text (skill dedup deletion test).
2. Caller knowledge stays in the caller - task text may reference graph nodes/outputs; the skill body never names graphs (zero reverse references).
3. The skill's procedure is fixed; task text declares WHAT, never re-implements HOW (protocol restatement is a heuristic warning).

### Enforcement

Deterministic rules (forbidden alternate spellings, legacy `Output:` form) -> validation errors. Heuristic rules (output-contract presence on substantive tasks, protocol restatement, injection-mechanics wording) -> validation warnings. Same scan layer as the declared-inputs task-text checks. Comment terseness is enforced by review, not scan - YAML comments are dropped at parse, unavailable to validation.
