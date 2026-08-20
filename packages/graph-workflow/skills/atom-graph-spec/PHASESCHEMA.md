> Reference sibling of `atom-graph-spec` (SKILL.md) - PhaseSchema field tables and format rules, moved verbatim from SKILL.md. Internal §-pointers resolve within the skill package.

## Top-Level Fields

|Field|Type|Required|Purpose|
|-|-|-|-|
|`name`|string|yes|Graph identifier - the identity field (schema-determined identity: any YAML passing WorkflowSchema validation IS a graph; the declared name is the identity, never the file name). Kebab-case. Non-empty - a document without a valid `name` does not load.|
|`$schema`|string (URI)|no|Self-description header - URI reference to the derived JSON Schema document (`workflow.schema.json`, draft 2020-12). Optional: absent documents validate against the default WorkflowSchema (backward compatible). Malformed (whitespace-containing) values fail at load.|
|`version`|string (semver)|no|Self-description header - format version of the document (semver, e.g. `1.0.0`). Non-semver fails schema validation; a major mismatch vs the engine's supported format major fails load with a loud rejection (never silent degradation).|
|`description`|string|no|Purpose-focused free text - ONE concise intent line stating what the graph does/produces (identity metadata, displayed in the pilot banner before the first node; carried by `graph_start`; the catalog single source — ADR 0235). Optional, non-enumerated, zero behavior branching - a description is identity for humans, never a machine-consumed directive. The topology is declared in `phases` + `flow` + `inventory`, never restated in the description (F2 dedup, ADR 0244); header/per-phase comments duplicating it SHALL NOT be written.|
|`inventory`|Inventory[]|no|Node overview table - dedicated schema key for the atom list (the term "atom" does NOT name the key). Each entry `{ id, type, goal, constraints? }`: `id` must exist in `phases`; `type` must match the phase declaration - mismatch = load warning via the contract pass (per source graph), never blocking, never silent. No `skill` field - the phase-level `skill` field is the single source; a legacy `skill` key is ignored (stripped at parse, no rejection). The execution mechanism lives in the goal: skill-bound main nodes name the executing skill in verb form ("Executes atom-scope-interview to acquire scope"); router entries state "Launches the <graph> graph as a sibling run (router template — single path auto-select)". `goal` = bounded compound intent sentence (what the atom accomplishes): connectors AND/THEN/IF-ELSE/OR - structural keywords SHALL be ALL-CAPS (`AND`, `OR`, `IF`, `THEN`, `ELSE`), distinct from ordinary prose `and`/`or`; conditional phrases use IF; ordinary nodes ≤ 5 steps; gates ≤ 3 AND/OR operands (retryCount bound NOT counted); conditional paths ≤ 3 - bounds are convention. `constraints` (optional) = array of one-sentence prose rules - general boundaries plus explicit non-goals ("does not X" / "avoids Y"); at most 5 per atom (convention bound, user-calibratable); general rules prefer positive framing, non-goals state the negation directly; prose only - no structural keywords, no new word-list members; content is never machine-validated (zero validation axis - discipline lives at generation time and review). The former `description` key is NOT accepted (no backward compatibility - stale entries fail schema validation). Bounds are convention, user-calibratable. Case discipline binds LLM-produced inventories (writer/design MUST comply at generation); user-hand-written entries are exempt - no machine validation axis. Router entries: single entry stating "Launches the <graph> graph as a sibling run (router template — single path auto-select)". The launched graph is a sibling run, not a composition - it carries its own inventory in its own file (no child entries are duplicated in the parent). Ownership: AI MAY generate when absent (writer tooling emits at creation); once present, user-only maintenance (or user-requested change - never silent); any graph-maintenance operation follows the inventory.|
|`constraints`|string[]|no|Graph-level constraints - graph content behavior rules (same self-containment family as `inventory`: both travel with the graph file). One-sentence prose rules - general boundaries + explicit non-goals ("does not X" / "avoids Y"); ≤ 10 entries per graph (convention bound, user-calibratable); prose only, no structural keywords; content never machine-validated (zero validation axis - discipline at generation + review). Absent field = empty set (no warning, no error). Constraints load per-graph only. Injected into EVERY dispatched node as `[graph]`-prefixed `NodeDetail.constraints` entries (scheduler dispatch facts - unbypassable, works without a pilot), merged by the dispatch handler with `[project]`-prefixed project rules (activation session copy - see ROUTING.md §Constraint Layering). Phase-level `constraints` YAML field remains rejected (removed field).|
|`phases`|Phase[]|yes|Phase list. Declaration order cosmetic - execution order resolved exclusively by dependsOn edges. List in dependency order for readability.|
|`interaction`|`none` \| `enabled`|no|Graph interaction declaration - asserts AND forbids user-interaction features for THIS graph file (same self-containment family as `constraints`/`inventory`: travels with the graph file). `none` declares the graph has no user-interaction features and is not allowed to have any; `enabled` (absent = `enabled`) permits them. Zero backend behavior branching - no load-time enforcement, no content judgment (interaction lives in agent-side task prose and skills; the backend reads zero prose). The declaration constrains only the declaring graph's own file and is NOT aggregated into any effective view. Compliance is audited by graph-maintain (non-interactive compliance scan - task-text interaction tokens, interaction skills `atom-scope-interview`/`grilling`, `direct end:` declarations - plus LLM semantic review; violations convert to fix proposals under the approval gate).|
|`flow`|string[]|no|Flow transitions - the graph's conditional-routing edges (mermaid subset: `A --> B` unlabeled sequence default, `A -->|condition|B` condition-matched). Compiled into the per-node transition table (node × condition → target) at load; condition values are flow-defined vocabulary (zero machine validation axis — governance is the graph-maintain flow audit + user maintenance, mirroring the inventory regime). Loop/rework semantics are self-edges (`A -->|fail|A`) — inline bounded loops, never a subgraph/task-template mechanism. Malformed entries and undeclared endpoints fail load loudly (never silent drop). Absent field = no flow edges — the node's advance defaults to its dependsOn-derived successor set. See §Flow Transitions.|

**Canonical top-level key order** — `name → description → $schema → version → interaction → flow → inventory → constraints → context → phases`: the `flow` block SHALL be declared BEFORE the `inventory` block and the `constraints` block SHALL be declared AFTER the `inventory` block (graph-flow-layout rule; the derived JSON Schema mirrors the order). Builtin graphs SHALL declare a `flow` block (their transition surface — sequence/rework/self edges); graph-maintain audits flow presence + layout order.

## Phase Fields

YAML field names shown below. Scheduler resolves to internal NodeDetail fields at runtime - see `atom-phase-handler` NODE-SCHEMA.md §NodeDetail for full schema. Field names in workflow YAML differ from NodeDetail for some fields - table maps both.

|Field (YAML)|NodeDetail|Type|Required|Purpose|
|-|-|-|-|-|
|`id`|`nodeId`|string|yes|Unique phase identifier. Kebab-case.|
|`type`|`type`|string|yes|Phase type - closed enum: `main` only (the `flow` type is removed). See §Type Ownership Layers.|
|`dependsOn`|`dependsOn`|string[]|yes|Upstream phase IDs. Empty `[]` for entry nodes.|
|`skill`|`skill`|string?|`main`|Execution skill - the skill that runs this phase's work; serves as the channels contract source (dual-track). Optional: skill-less phases omit the field (no `skill: none` convention). Registry `skill` is the handler, never a dispatch target.|
|`operations`|`operations`|string[]?|`main`|Operation classes - declared execution classes (union of phase declaration and the dispatched skill's `Operation classes` default). Absent = skill default. Declarative only: scheduler passes through to NodeDetail; Tool usage check verification handler-side (evidence-only). See §Operations Declaration...|
|`agent`|`agent`|string[]?|main|Agent hints - priority-ordered sub-agent type preferences for the node's own task() dispatch (advisory; first available wins, fallback platform default).|
|`task`|`task`|string?|`main`|Task instruction - executed inline (main). Use block scalar `|` per §YAML Format Rules.|
|`channels`|`channels`|string[]?|main|Phase-level context additions - uniform across main (all entry kinds legal, no per-type rules). Entry type derived from the dispatched skill's `## Context Requirements` contract when one exists (`skill:<name>` reference, `node:<id>` read edge to a node report, bare contract-table match, or file glob); no `skill` -> explicit `skill:`/`node:`/glob only, bare name errors. `node:<id>` entries are read edges to non-`dependsOn` node reports (delivered from the executing agent's session — the scheduler never stores content). Ambient context lives in the graph top-level `context:` (global channel). Resolved deterministically (validate + runtime same implementation). See §YAML channels Field.|
|`template`|-|string?|main|Builtin task-template reference - closed enum (`startup` \| `router` \| `scope-entry` \| `adopting`). The node's task text is injected from the template registry at load time (same mechanism as the handoff template family). Mutually exclusive with `task` (the use field no longer exists); `router` is the nested-execution declaration (subgraph-only — graph names, never in-run targets); the per-node templates (`scope-entry` / `adopting`) carry the framework-graph shared-chain texts (arch-review-loop / first-principles-dev dedup — one template one file, ADR 0245; `scope-entry` consumes `template_args.terminal`, see §Node Templates). The `review-accept` / `adopt-accept` templates are deleted (accept-node consolidation — the adopting grilling consensus IS the adoption confirmation; the requirement confirmation is a caller-declared accept loop on the requirement router node via `template_args.questions`). The `framework-chain` factory template is DELETED — the `node` discriminator shape does not exist. The `loop` template is REMOVED — loop/rework semantics are flow self-edges (top-level `flow` field, §Flow Transitions). Template types: `startup` - graph entry (`dependsOn` SHALL be empty; the startup template loads the constraints session copy every downstream node's context is assembled from - it must run first; graph declares `template: startup` on its entry -> full startup (constraints load + serena `activate_project` + jcodemunch `index_folder`); absent -> bare startup (the pilot never runs the heavy steps on its own)); `router` - path-selection node (MAY declare `dependsOn` — sits mid-graph; REQUIRES `template_args.paths`; the paths are graphs started as sibling runs — see §Router Template); `scope-entry` - framework entry interview (REQUIRES `template_args.terminal`); `adopt-scope` / `adopting` - framework shared-chain nodes (zero-param, no template_args; `adopting` declares the nothing-to-adopt direct end).|
|`template_args`|-|object?|main|Template parameters - machine-declared arguments applied to the template task text at load time, per-template: `template: router` consumes `{ paths: [<graph-name>, ...] }` = the candidate graphs (one-shot selection — sibling inputs pass via `graph_start` args; a non-graph path entry fails load); `template: scope-entry` consumes `{ terminal: <node-id> }` = the graph's terminal node name (round-report|fp-doc-update — interpolated data, never a variant-selection discriminator, ADR 0245); `template: router` MAY additionally consume `{ questions: [{ prompt, condition }] }` = caller-declared extra judgment entries — the node has additional judgment and corresponding flow edges; prompt content and condition vocabulary come from the calling graph, never template semantics (accept-node consolidation). Required with `template: router` (`paths`) / `template: scope-entry` (`terminal`); rejected without the matching template. The framework-chain `node` discriminator shape and the loop `{ graph, until }` shape do not exist — loops are flow self-edges (top-level `flow` field, §Flow Transitions). Carried on the NodeDetail (`template_args`) so the frontend assembles machine-declared options - never parsed from task text.|

## Router Template (template: router)

A `template: router` phase is a **path-selection node** (graph-router-template): it declares candidate paths as graphs and the executing agent selects and STARTS one. The router is the one-shot SELECTION nested-execution declaration — no in-run branch targets exist (branchTo removed; branching is subgraph selection).

### Declaration

```yaml
- id: track-accept
  type: main
  template: router
  template_args:
    paths:
      - openspec-apply
      - openspec-engineer
  dependsOn: [spec-extract]
```

### Semantics

1. **Paths ARE graphs** - `template_args.paths` entries are graph names (registry-resolved). The ONLY one-shot selection form: paths are graph names (subgraph composition deleted). Non-graph path entries fail load.
2. **Mid-graph allowed** - a router MAY declare `dependsOn` (it needs upstream context to decide — e.g. an echoed adoption judgment). The `startup` template's entry-only constraint does NOT apply.
3. **Mutually exclusive** - `template` × `task` is rejected (the template is the single source of the node's work; the use field no longer exists).
4. **Selection is agent-side** - the compiled task text instructs: exactly one candidate or a satisfied hard criterion (from the node context) → auto-select, zero card; otherwise → approval() card whose options are the candidate graphs (machine-declared `template_args.paths`, never task-text parsing) with the recommended graph marked.
5. **Activation = sibling run** - the chosen graph starts via `graph_start` with the required args (report path / change name / adoption echo) from the node's context (driven to completion, result collected, reported). NO `branchTo` — router paths are never in-run branch targets. Downstream nodes depend on the router node and read its report via `channels: [node:<router>]`.
6. **Caller-declared extra judgment (`questions`)** - when `template_args.questions` is present, the compiled task text additionally instructs: after collecting the sibling-run result, present each caller-provided prompt to the user; the user's choice is reported as the declared flow `condition` value on advance (transition-table routed — the edge vocabulary lives in the calling graph's `flow` block; a revise-style choice re-enters via the flow self-edge, bounded by the graph constraints prose + retryCount). The template encodes zero accept semantics — the node only knows it has additional judgment and corresponding flow edges. Absent `questions` → pure router behavior (selection + launch only). Example (requirement accept loop):

```yaml
- id: requirement
  type: main
  template: router
  template_args:
    paths: [arch-review]
    questions:
      - prompt: 'Requirement ready? accept: proceed to adoption; revise: adjust the requirement input and re-run the arch-review review.'
        condition: revise
  dependsOn: [scope-entry]
```

## Node Templates (template: scope-entry / adopting)

The per-node templates carry the framework-graph shared-chain node texts (arch-review-loop / first-principles-dev dedup — the scope-entry / adopting shared chain is single-sourced in the template registry). **One template one file**: each node template is a standalone module exporting exactly one template function; the factory pattern is banned (no single-file switch dispatch, no `node` discriminator). The `review-accept` / `adopt-accept` templates are deleted (accept-node consolidation — the adopting grilling consensus IS the adoption confirmation; the requirement confirmation is a caller-declared accept loop on the requirement router node); the `adopt-scope` template is deleted (adopt-scope-and-handler-blocks — the adoption goal is already confirmed by scope-entry + the requirement accept loop + the adopting grilling; the second atom-scope-interview node is pure redundancy, and the adopting grilling absorbs the adoption-goal topics into its first-round frontier). The per-graph divergence — the terminal node name referenced by scope-entry (round-report vs fp-doc-upd…

### Declaration

```yaml
- id: scope-entry
  type: main
  dependsOn: [startup]
  skill: atom-scope-interview
  template: scope-entry
  template_args:
    terminal: round-report
```

Zero-param nodes declare the template only:

```yaml
- id: adopting
  type: main
  dependsOn: [requirement]
  skill: grilling
  template: adopting
```

### Semantics

1. **One template one file** - `scope-entry` → `src/task-templates/scope-entry.ts`, `adopting` → `adopting.ts`; each module exports exactly one template function. The `framework-chain` factory and its `template_args.node` discriminator do not exist; the `review-accept` / `adopt-accept` / `adopt-scope` modules are deleted (accept-node consolidation + adopt-scope removal).
2. **Data parameters only** - `template_args.terminal` (required with `template: scope-entry`) names the graph's terminal node (round-report | fp-doc-update) for scope-entry's round-input clause — interpolated data, never a variant-selection discriminator. `adopting` takes no template_args.
3. **Mutually exclusive with `task`** - same rule as all templates: the template is the single source of the node's work.
4. **Mid-graph allowed** - node-template phases sit mid-graph (`dependsOn` declared), like the router template.
5. **Skill field stays** - the node keeps its `skill` (atom-scope-interview / grilling) — the template injects the task text; the skill drives execution.

## Flow Transitions (top-level `flow`)

The top-level `flow` array declares the graph's conditional-routing edges (graph-flow capability) — the transition table (node × condition → target). Subset grammar (deterministic, two written forms):

- `A --> B` — unlabeled edge, the sequence default
- `A -->|label| B` — labeled edge, condition-matched transition; the label is the flow-defined condition value

### Declaration

```yaml
flow:
  - spec-accept -->|pass| change-body
  - spec-accept -->|fail| spec-accept # self-edge — inline bounded loop (condition-matched re-entry)
  - change-body --> review
```

### Semantics

1. **Transition table** - every labeled edge registers `(source × label → target)`; unlabeled edges are the source's sequence default; a node without flow edges routes by its dependsOn-derived successor set.
2. **Condition advance** - the pilot advances with `graph_advance(runId, nodeId, condition: <value>)`; the value resolves via the node's transition table — no match is a loud error (missed-condition guard). No condition / no flow edges → sequence default.
3. **Self-edge loop** - `A -->|fail| A` is the inline bounded loop (loop/rework semantics — never a subgraph/task-template mechanism): NOT satisfied → the node reports the re-entry condition (e.g. `fail`), the transition table re-enters `A`; satisfied → the node reports the exit condition (e.g. `pass`) routing downstream. The bound lives in the loop-head node's task text / the graph's constraints prose (engine-incremented — each re-entry edge pass increments the re-entered node's `retryCount` (never zeroed), the machine signal the agent-side bound check observes; see ROUTING.md §Rework Decisions).
4. **Endpoint validation** - every edge's source and target MUST be declared phase ids — undeclared endpoints fail load loudly (compile-time, naming the edge).
5. **Malformed entries fail load** - a line outside the subset grammar is a load error, never a silent drop.
6. **Condition vocabulary** - labels are flow-defined vocabulary; zero machine validation axis on the vocabulary (governance = the graph-maintain flow audit + user maintenance, mirroring the inventory regime).
7. **Mermaid-format compliance (ADR 0242)** - the subset grammar is a strict subset of the mermaid flowchart grammar: every edge form the engine accepts parses under the real mermaid parser. Compliance is verified two-track: builtin graphs — the suite regression test parses every builtin flow block with the real mermaid parser (dev axis, fails the suite on drift); project graphs — the load-time contract pass parses the flow block with the real mermaid parser; a non-conformant block surfaces as a load-time problem (never a load failure — the run is not blocked; the frontend sees it via `graph_assets` `problems`). Authoring guidance: flow edges SHALL be written in mermaid-valid subset form (`A --> B` unlabeled, `A -->|label| B` labeled, self-edges for loops) — chained edges (`A --> B --> C`) are mermaid-valid but outside the engine subset and SHALL NOT be authored.

## Auto-Supplied Fields

Auto-supplied fields (NEVER write in YAML):

- `skill` (string) - resolved from `skill` field; the execution skill for the phase's work.
- `retryCount` (number) - runtime counter. 0-based. Incremented at jump reset only — the operator `graph_jump` and the advance `jump` channel — never zeroed. Incremented on flow re-entry (condition-matched): each pass through a re-entry edge (matched target equal to the reported node, or a target already completed) increments the re-entered node's `retryCount` — the bounded-loop counter (constraint prose + retryCount).

The dispatch handler skill is the constant `atom-phase-handler` for main — agent-side knowledge, never carried in the payload (no `handlerSkill` NodeDetail field). Graph-level constraints ARE carried (`NodeDetail.constraints` — `[graph]`-prefixed dispatch facts); project constraints arrive via the pilot-loaded activation session copy. Unknown phase keys reject uniformly at schema parse (PhaseSchema `.strict()` — no per-field removed-field declarations remain, no migration hints, no silent stripping: removed fields like `route`/`routing`/`join`/`mode`/`jumps`/`reads` and legacy fields like `topic`/`maxDepth` are treated alike, the error naming the key); the `flow` phase type is removed (`type` accepts `main` only); `$`-prefixed ids -> schema rejection (activation prologue removed).

## Operations Declaration

A main phase MAY declare `operations: [<class>, ...]` - declared execution classes. Semantics: union with the dispatched skill's `Operation classes` default (phase wins on conflict); absent = skill default alone. Scheduler behavior: pass-through into NodeDetail - no scheduling effect; the Tool usage check performs evidence-only verification per declared class (no registry injection).

## YAML channels Field - three-tier context model

Context delivery has three tiers, one field each:

- **Convention layer** (platform-shipped, NO declaration) - exact files `CONTEXT.md` + `docs/domains.md`, default-loaded into every phase, absence-tolerant (missing -> empty + warning, never fail). No directory-class entries, no glob entries.
- **Project layer** - `.graph-scheduler/config.json` `context:` - project-declared layout, existence-validated (exact-file missing -> load error; glob zero-match -> warning - lazy doc creation legal).
- **Graph channels** - graph top-level `context:` + phase `channels:`. Graph-level file globs target workflow runtime artifacts (`.graph-scheduler/`, `.taskflow/`) ONLY - project file globs belong in config.json, conventions are never hand-declared. `node:<id>` entries are read edges to non-`dependsOn` node reports (dependsOn remains the scheduling edge; direct outputs arrive as context). Delivery form: the scheduler delivers channel DECLARATIONS with the dispatch payload; upstream CONTENT is assembled by the executing agent from its own session (platform-persisted — the agent produced those reports earlier in the run; after compaction, platform history addressing restores them). No payload content, no files.

```
effective = [convention layer, config `context:` defaults, graph `context:`, phase `channels:`] - dedup, order preserved
```

A phase-level `channels` entry type derives from the dispatched skill's contract - type comes from the contract tables, never guessed (main; the same resolution path serves every type - uniform, no per-type rules):

|YAML channel entry|Type|Example|
|-|-|-|
|`skill:<name>` (explicit prefix)|Reference skills|`skill:atom-graph-spec`|
|`node:<id>` (explicit prefix)|From upstream - cross-level legal|`node:plan-parse`|
|bare entry in contract From upstream table|From upstream|`scope-confirm` (only when also a `dependsOn` node - else migrate to `node:` prefix)|
|bare entry in contract Reference skills table|Reference skills|`atom-graph-spec`|
|bare entry in contract Files table or glob shape (`*`, `?`, `[`, `/`)|Files|`.graph-scheduler/graphs/x.yaml` (workflow artifact glob only; project globs -> config.json context)|
|entry duplicating a `dependsOn` node|redundant declaration -> warning|-|
|entry matching nothing|error - no fallback search|-|

**Graph/config-level entries** (`context:`) require an explicit `skill:`/`node:` prefix or a file-glob shape - a bare name is a load-time error (no execution-skill contract exists at those scopes). `node:` targets validate against the flattened node set at load; run-scope gating still applies at dispatch. A `node:` entry in `context:` **promotes** the named node's report into the global channel - every phase receives it as an ambient upstream block; the owning node skips its own promoted stream (self-read undefined). A launched graph's `context:` applies to its own phases; the launching router passes inputs via `graph_start` args - no cross-run channel propagation exists.

The removed `preText`/`reads` fields are rejected globally - see §Auto-Supplied Fields (removed-fields list).

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

Phase types belong to a single layer (documented ownership model - the composition layer was removed with the use field and the agent type):

|Layer|Types|Dispatch|Disability|
|-|-|-|-|
|Base|`main`|Static handler resolved by type (schema-enforced enum)|Never - dispatch and run completion marking depend on it|

No custom project types - `type` is a closed enum (`main`); unknown types fail schema parse.

## YAML Format Rules

### Block Scalars

`task` field uses literal block scalar `|`:

YAML: see YAML-EXAMPLES.md §Block Scalars.

### Flow Sequences

`dependsOn`, `channels` use flow sequence `[...]` for inline lists:

YAML: see YAML-EXAMPLES.md §Flow Sequences.

### Comments

`#` comments document intent - rework conditions, phase purpose, rework rationale:

YAML: see YAML-EXAMPLES.md §Comments.

### File Location

Graph YAML files live in the scheduler's graphs directory. Any YAML file (`<name>.yaml`) is a candidate — no suffix convention; graph identity is the declared `name` field (schema-validated). `graph_start({ graphName })` resolves against the declared name.

### Registry

Register new graphs in the scheduler's graph registry. Without registration, `graph_start` fails with unknown graph name.

## Language Constraints

1. **Graph YAML** - field names lowercase, values per project language conventions. Phase IDs kebab-case.
2. **task content** - per project language conventions. References to skills use plain skill names (content-dependency declarations). References to phase outputs use nodeId names (from upstream outputs). Declared-inputs contract:
   - **Input references covered** - every phase-output reference in task text must be covered by `dependsOn` (implicit) or `channels` (explicit `node:` entry).
   - **No runtime paths** - the `.taskflow/outputs/` form no longer exists (content flows via the agent session). References to it in task text are inert text — no validation check exists (path is gone); upstream arrives via declared inputs (dependsOn/channels).
   - **Claims match declarations** - upstream-reference wording must correspond to an actual declared channel or dependsOn edge (undeclared claims warn).
3. **Rework conditions** - per project language conventions, referencing observable facts in phase outputs (output contract fields, decision values, target-node retryCount) and the graph's flow condition vocabulary (edge labels — consistent spelling across edges and the loop-head task text).

## Task Content Spec

Normative content rules for `task` text and graph comments - the structure a task SHALL have and what it SHALL NOT repeat. Consumers: graph authors, code-review, graph-contracts validation.

### Mandatory Task Structure

Main phase tasks SHALL contain exactly three content classes, in order:

1. **Directive** - what to execute/produce, referencing the phase `skill`. One line suffices: `Execute <skill> graph mode per <skill> skill` or the produce-verb for skill-less phases.
2. **Phase-local invariants** - facts the dispatched skill cannot know: consumed output fields by name, retry bounds, phase MUST/NEVER rules (e.g. workflow-done's incomplete-judgment check).
3. **Output contract** - machine-parseable emission fields. Exactly one block, canonical spelling:

```yaml
Output contract: field_a, field_b (meaning)
```

### Skill Dedup Deletion Test

Task text SHALL NOT contain content present in the dispatched skill, the handler defaults, or atom-graph-spec conventions. Delete the sentence - nothing lost? Delete it. Prohibited content classes:

- **Skill protocol steps** - interview() mechanics (confirm/research/think/interview), grilling rules (one question per turn, recommendation first), openspec CLI resolution (change-name 1-2-3), archive flows (Step 0-3), doc-maintenance pipelines.
- **Handler-default card mechanics** - "free input overrides", "dynamic options include", "recommendation follows X" (the handler judges recommendations from judgment context itself).
- **Upstream references** - "read X output", "via dependsOn implicit context", "via node:X channel". Upstream availability arrives as `## Upstream:` blocks; tasks name consumed FIELDS, never files or mechanisms.

### Comment Rule

Graph YAML comments SHALL declare topology intent only - one line per phase block, stating structural purpose (stage role, why a rework decision exists). Prose narration of phase behavior, graph flow, or task content SHALL NOT appear; ADR/doc references are prohibited (mirrors the why-only comment policy).

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
