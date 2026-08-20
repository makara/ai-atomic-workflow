---
name: atom-kernel
description: Platform primitives - task() dispatch, approval() decision UI (8 card rules), interview() consensus, graph-scheduler tool detection, tool schemas (serena/jcodemunch/graph-scheduler). Use when dispatching sub-agents, presenting decisions, executing main-phase work, authoring execution skills, or mentions tool schema, tool call, evidence loop, verify loop.
argument-hint: none (reference skill)
disable-model-invocation: true
user-invocable: false
version: 2.17.0
last_updated: '2026-08-19'
---

> **Runtime constraints** - **Layer**: atom - runtime primitives.

Platform primitives - task()/approval()/interview()/todo() contracts + tool schemas (tool discipline pointer in §Tool Discipline), single source for graph-node execution.

# Atom-Kernel

## Callable vs Behavior Contract

|Primitive|Type|Maps to|
|-|-|-|
|`task()`|**Callable**|platform `task` tool - dispatches sub-agents|
|`approval()`|**Behavior Contract**|Agent-implemented - single-form decision card; invokes the platform's decision-UI tool|
|`interview()`|**Behavior Contract**|Agent-implemented - confirmation conversation, explicit participation (mandatory \| as-needed); turns via approval() without recommendation|

> `task()` is a tool-mapped callable - direct invocation, platform-mapped (see §Platform Spellings). `approval()` and `interview()` are behavior contracts - agent-implemented; calling them like functions fails with `ReferenceError`. `approval()` presents the single-form decision card (always shown); `interview()` implements turns via `approval()` WITHOUT recommendation (card always - never auto-gated).

## Platform Spellings

Primitive contracts platform-neutral. Mappings vary per platform - never assumed exact. Skills reference contract names only.

|Primitive|Contract|Mapping|
|-|-|-|
|`task()`|Sub-agent dispatch - batch in `tasks[]`, shared `context`, agent-hint selection|platform's sub-agent dispatch tool|
|`approval()`|Single-form decision card - header/options/custom + recommendation/rationale; card always presented (options + custom free input, recommendation marked)|platform's decision-UI tool|
|`interview()`|Confirmation conversation - explicit participation (mandatory \| as-needed), turns via approval() without recommendation|agent-implemented using approval() turns|
|`todo()`|State-machine task list - pending/in_progress/completed; boundary clear at execution-unit boundaries; no-todo platform -> no-op|platform's todo tool|

Platform rows (extension point — one row per platform, no skill changes):

|Platform|task()|approval()|Default agent (hint fallback)|
|-|-|-|-|
|opencode|Task tool — agent vocabulary `build` / `plan` / `general` / `explore` / `scout`|decision-UI primitive|`general`|
|OMP|`task` tool|decision-UI primitive|`task`|

---

# Graph-Scheduler Tool Detection

MCP tool name detection - resolve by exact-name set, never substring matching. Before any graph operation, scan the tool list; find the exact names: `graph_start` / `graph_advance` / `graph_status` / `graph_list` / `graph_assets` / `graph_force_end` / `graph_jump` / `graph_init` / `graph_clean_completed` / `graph_clean_all`. Use detected names for all subsequent calls.

---

# todo() - Boundary Clear

Clear the platform todo list at execution-unit boundaries - per-execution scratchpad, never session-persistent. In-node create/update stays native platform tooling; skills reference the `todo()` contract.

- **Semantics**: unconditional clear. No-todo platform -> no-op, no error.
- **State machine**: pending -> in_progress -> completed (+ optional blocked/cancelled) - state-machine semantics + per-platform spellings in §Platform Spellings; the contract is the state machine, never the op names.
- **Consumer**: atom-phase-handler enforces the node-boundary lifecycle (dispatch + completion clears) - the only caller.

---

# task() - Dispatch

Dispatch sub-agents. Batch in `tasks[]`, shared `context`.

```
task({ i, context, tasks })
```

- `i` - intent. Present participle. 2-6 words.
- `context` - shared constraints. Format: `# Goal`, `# Constraints`, `# Contract`.
- `tasks` - array. Each: `name` (CamelCase <=32), `agent` (specialist type), `task` (self-contained).

`agent` takes one concrete type. The node's task text names the agent type when a specialist is required; otherwise the platform default applies. Batch may mix types.

**Agent hints preference** - when a main node's dispatch carries a `## Agent hints:` block (from `node.agent` — peer-level advisory, priority-ordered), prefer those types when dispatching sub-agents for that node: first available wins, fallback platform default. Advisory only — never a control.

Capture agent ID via the platform's artifact mechanism.

**Output contract (receipt contract)** - every task SHALL declare its return fields (in the task text or an outputSchema). Sub-agents yield a compact structured receipt: status + the declared fields + output-location pointer(s) + artifact references, compressed, no process narrative. The output-location pointer SHALL follow the typed-pointer contract: file path (cross-run primary carrier) / `agent://<id>` (same-session sub-agent final output) / `artifact://<id>` (overflow tool output) / `history://<id>` (transcript reference) — never plain-text location descriptions. Results enter the main context ONCE as the receipt; full transcripts stay addressable via the platform artifact/history mechanisms — never re-injected wholesale.

**Result report (handoff)** - every graph run produces a unified two-element result report via the single root `__handoff` node (graph-handoff-result-report; subgraph composition is deleted — no per-level `<composing>/__handoff` exists): `tasks_done` = what the run accomplished, `outputs` = a typed pointer to the durable outputs. The result returns to the session — no report file is written (content/accounting separation per R9). Facts with their own single sources (tickets / files / tests) are NOT re-accounted in the report — reachable via the output pointer. The result-report contract wording is SINGLE-SOURCED in `task-templates/handoff.ts` — this skill references it, never re-encodes it (debt Card 15/23).

**Zero on-disk writes** - sub-agents SHALL NOT write persistent files (run state, docs, reports). Deliverable-worthy content is returned in the receipt; the owning main node persists durable artifacts per the output model (session + durable artifacts; scheduler holds progress only).

**Decision Request** - verify-style handoff from dispatched work (Context, Auto-recorded debt, Blocking findings, Dispatch record, Suggested advance label); graph review nodes embed it.

---

# approval() - Decision UI

Single decision per call. The one decision primitive. Cold detail (card rules): see APPROVAL-CARDS.md.

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

Decision shape: (see sibling APPROVAL-CARDS.md §IApprovalDecision Shape).

- Card ALWAYS presented - options + custom free input + recommendation marked. Single-form: no mode dispatch, no auto-execution.
- `recommendation` present -> shown as a marked option (recommendation + rationale); absent -> plain card (interviews, consensus turns). Recommendation is a suggestion - the user chooses.
- Return the user's choice; the recommendation is never executed without the user picking it.

---

# interview() - Confirmation Interview (Behavior Contract - NOT a callable function)

Confirmation contract - multi-round consensus conversation with an explicit participation strategy. Composes `approval()` one turn at a time.

```
interview({ goal, context?, participation: 'mandatory' | 'as-needed' }) → consensus
```

- `goal` - interview goal. First consensus point.
- `context` - background. Discoverable facts - look up, do not ask.
- `participation` - REQUIRED caller-declared strategy: `'as-needed'` (context fully covers the goal -> return consensus directly - explicit strategy, never inferred) | `'mandatory'` (at least one question round regardless of context coverage).
- Returns `consensus` `{ decisions: [{ decision, rationale }] }`.

## Behavior Contract

1. **Comprehensive coverage** - cover every aspect of goal topic.
2. **Fact lookup** - discoverable facts looked up, never asked.
3. **Recommendation first** - recommended answer first option, from context analysis.
4. **Dependency resolution** - prerequisite before dependent.
5. **Single question discipline** - one question per turn; wait for response; each turn via `approval()` WITHOUT recommendation - card always, never auto-gated, no turn skipped.
6. **Shared understanding gate** - no action until user confirms shared understanding.

**Goal consensus**: even when explicitly given, the goal itself is confirmed first.

**Participation semantics**: `as-needed` -> context covers all aspects of goal -> return consensus directly (explicit strategy, never inferred from context); `mandatory` -> at least one question round always - no zero-question degradation.

**Direct end** - optional caller-declared end capability, available on ANY main confirmation interview whose gated content can be empty (nothing to adopt / accept / confirm / review). Declared via node task text (`direct end: <label>`, entry case: atom-scope-interview §Input). The final confirm card options follow the gated-content state: content EMPTY → the card SHALL offer `nothing to adopt (recommended)` and `<label>` (e.g. "end this round (direct end)"); content NON-EMPTY → the card SHALL offer the adoption/confirmation action as the recommended option and `<label>` as the alternative — the `nothing to adopt` wording SHALL NOT appear when content exists. Choosing EITHER direct-end option (`nothing to adopt` or the `<label>`) SHALL end the round directly: the node report carries `direct_end: true` and the pilot advances the node with the end decision (`graph_advance(runId, nodeId, end: true)`) - the run drains via natural drain to `completed`; never a normal loop advance, never `graph_force_end` (that tool serves abnormal termination only). The end options share one semantics: directly end. The end option is an extra choice on the final card - it NEVER replaces a mandatory turn (mandatory rounds still run first).

**Design flows**: solve-style goals (research -> think -> confirm) are flow composition by the CALLER - research/design steps run outside interview(); interview() confirms decisions only. No contract mode, no research/design parameters.

---

# Tool Discipline

Tool discipline is delivered by the resident Tool Discipline prompt - scenario-keyed hints (find/read/write/verify/run), post-hoc primary, zero deny. Kernel §Tool Schemas are the parameter reference. Kernel primitives (task / approval / interview / todo) are platform contracts - unaffected by the tool-discipline layer.

## Fault Tolerance

Schema-first - parameter names NEVER guessed; read full tool docs first. Errors repair + retry ONCE; after edit -> `mcp__jcodemunch_register_edit` while index mounted AND target indexed (else `n/a: not indexed`).

---

# Tool Schemas

## serena

LSP-powered code navigation + editing. All paths relative to project root. Symbol address = name path (e.g. `MyClass/my_method`; overloads append `[i]`). LSP per `.serena/project.yml` `languages`; missing LSP -> FS tier silently.

Compact params (hot tools; full tables + examples: see SERENA-SCHEMAS.md):

|Tool|Key params|Guard|
|-|-|-|
|`replace_content`|relative_path, needle, repl, mode (literal\|regex)|ambiguity -> error, revise needle|
|`replace_in_files`|needle, repl, mode, paths_include/exclude_glob, dry_run, occurrence_ids, expected_count|dry-run preview + expected_count mismatch -> error|
|`read_file`|relative_path, start_line, end_line, max_answer_chars|sliced reads|
|`get_diagnostics_for_file`|relative_path (or symbol), min_severity|LSP-covered languages only|
|`search_for_pattern`|pattern, relative_path, paths_include/exclude_glob|project-internal regex, FS tier|

## jcodemunch

Index-backed code intelligence, read-only by charter - adapter for locate/search/analyze on in-project indexed targets. `repo` required on nearly every call; unindexed target -> `n/a: not indexed`.

Compact params (hot tools; full tables: see JCODEMUNCH-SCHEMAS.md):

|Tool|Key params|Guard|
|-|-|-|
|`register_edit`|repo, file_paths, reindex|indexed targets only; unindexed -> n/a|
|`search_symbols`|repo, query, kind, language, max_results, token_budget, detail_level|confidence/freshness metadata|
|`find_references`|repo, identifier\|identifiers, max_results, include_call_chain|import-graph refs|
|`get_file_content`|repo, path, start_line, end_line|non-indexed -> File not found + verdict|
