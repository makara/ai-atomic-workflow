---
name: atom-kernel
description: Platform primitives - task() dispatch, approval() decision UI (mode-aware single decision — absorbs question(), 8 card rules), interview() consensus (single contract, consensus + solve modes), judge(), graph-scheduler tool detection, High-Level Tool Registry (closed tool set, two-plane structure - jcodemunch query plane locate/search/analyze first-class read-only, serena mutation + ground-truth plane write/verify sole, run platform shell exception; utility classes optional; tool schemas for serena/jcodemunch/headroom/graph-scheduler). Use when dispatching sub-agents or presenting decisions, executing main-phase work, authoring execution skills, or mentions high-level tool, HLT registry, tool call, tool schema, evidence loop, verify loop.
argument-hint: none (reference skill)
disable-model-invocation: true
user-invocable: false
version: 2.14.0
last_updated: '2026-08-08'
---

> **Runtime constraints** - **Layer**: atom - runtime primitives.

Platform primitives - task()/judge()/approval()/interview()/todo() contracts + HLT registry, single source for graph-node execution.

# Atom-Kernel

## Callable vs Behavior Contract

|Primitive|Type|Maps to|
|-|-|-|
|`task()`|**Callable**|platform `task` tool - dispatches sub-agents|
|`judge()`|**Callable**|platform one-shot LLM judgment - when/eval evaluation|
|`approval()`|**Behavior Contract**|Agent-implemented - mode-aware single decision; card branch invokes the platform's decision-UI tool, auto branch executes the recommendation in-context|
|`interview()`|**Behavior Contract**|Agent-implemented - multi-turn consensus conversation, two modes (consensus / solve)|

> `task()`, `judge()` are tool-mapped callables - agent invokes directly, gets result. Mappings vary per platform (see §Platform Spellings). `approval()` and `interview()` are behavior contracts - agent implements manually. `approval()` reads the run-mode context and either presents a decision card (platform decision-UI tool) or executes the recommendation; `interview()` implements its turns via `approval()` WITHOUT recommendation (card in any mode - interviews are never auto-gated). Calling `approval({goal, context})` or `interview({goal, context})` fails with `ReferenceError`.

## Platform Spellings

Primitive contracts platform-neutral. Mappings vary per platform - never assumed exact. Skills reference contract names only.

|Primitive|Contract|Mapping|
|-|-|-|
|`task()`|Sub-agent dispatch - batch in `tasks[]`, shared `context`, agent-hint selection|platform's sub-agent dispatch tool|
|`judge()`|One-shot lightweight-model judgment - constrained answer (`'true'`/`'false'`), conservative failure|platform's one-shot completion primitive|
|`approval()`|Mode-aware single decision - header/options/custom + recommendation/rationale; manual/absent/no-recommendation -> decision card, auto + recommendation -> execute it (recorded)|platform's decision-UI tool (card branch)|
|`interview()`|Multi-turn consensus conversation - single contract, two modes (consensus / solve), turns via approval() without recommendation|agent-implemented using approval() turns|
|`todo()`|State-machine task list - pending/in_progress/completed; boundary clear at execution-unit boundaries; no-todo platform -> no-op|platform's todo tool|

---

# Graph-Scheduler Tool Detection

Runtime MCP tool name detection - names resolve by substring, never assumed exact. Before any graph operation, scan the tool list; find tool with each substring -> record exact name:

|Tool substring|
|-|
|`graph_start`|
|`graph_advance`|
|`graph_status`|
|`graph_list`|
|`graph_force_end`|
|`graph_jump`|
|`graph_init`|
|`graph_clean_completed`|
|`graph_clean_all`|

Use detected names for all subsequent calls.

---

# judge() - One-Shot Judgment

Single constrained-answer LLM judgment per call - gate jump condition evaluation.

```
judge({ prompt }) → 'true' | 'false'
```

- `prompt` - evaluation question. MUST demand constrained answer: `Answer ONLY 'true' or 'false'`.
- Returns single token answer; anything else -> conservative default per caller context.

|Caller|Failure default|Rationale|
|-|-|-|
|gate eval (jump conditions)|`'false'` - no-match|Never auto-decide on uncertainty (falls through to downstream)|

Maps to platform's one-shot completion primitive.

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

`agent` field takes one concrete type. Graph main-phase context may carry `## Agent hints: [<type-1>, …]` (from atom-phase-handler, priority-ordered). Pick the **first** hint available in the current platform (availability = membership in the platform's agent vocabulary in §Platform Spellings); none -> platform default. Hints advisory; batch may mix types.

Capture agent ID - result via the platform's sub-agent artifact mechanism.

**Decision Request** - verify-style handoff from dispatched work; sections: Context, Auto-recorded debt, Blocking findings, Dispatch record, Suggested advance label. Graph review nodes embed it.

---

# approval() - Decision UI

Single decision per call, mode-aware. The one decision primitive - question() is absorbed into it. Cold detail (mode dispatch, 8 format rules, card mapping, main-node checkpoints): see APPROVAL-CARDS.md.

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

- Mode source: `## Run Mode: <mode>` block (present on every graph node dispatch; absent -> `manual` - absence never auto).
- Manual / absent / no recommendation -> decision card (options + custom). Return the user's choice.
- Auto + recommendation -> execute the recommendation: no card; record the decision + rationale (observability). Return it.
- Auto without recommendation -> decision card (`Run mode: auto — no recommendation; decide manually`). NEVER guess an action.

---

# interview() - Consensus Interview (Behavior Contract - NOT a callable function)

Single conversation contract, two modes - **consensus** + **solve** - sharing one rule set. Every rule MUST apply on every call, both modes.

```
interview({ goal, context?, research?, design? }) → consensus | solution
```

- `goal` - interview goal. First consensus point.
- `context` - background. Discoverable facts - look up, do not ask.
- `research?` - solve mode only. Research before think; default `true`.
- `design?` - solve mode only; design/solution marker.
- Returns `consensus` - `{ decisions: [{ decision, rationale }] }` (consensus mode), or `solution` - `{ goal, findings?, design, consensus }` (solve mode).

## Mode Selection

- **Consensus mode** - confirm goal -> decision rounds -> `{ decisions }`. Default.
- **Solve mode** - complete solution -> `{ goal, findings?, design, consensus }`. Use when `research: true` or goal produces a design/plan; chain per §Internal Flow.

## Behavior Contract

1. **Comprehensive coverage** - cover every aspect of goal topic. Skip no relevant dimension.
2. **Decision tree traversal** - walk down each branch; exhaust all paths.
3. **Dependency resolution** - resolve dependencies one-by-one; prerequisite before dependent.
4. **Recommendation first** - recommended answer as first option; derived from context analysis.
5. **Single question discipline** - one question per turn; wait for response.
6. **Fact lookup** - discoverable facts - look up. Do not ask user.
7. **Decision gate** - decisions belong to user. Each submitted; wait for answer.
8. **Shared understanding gate** - do not act until user confirms shared understanding.

**Goal consensus**: even when goal explicitly given, interview() confirms shared understanding of goal itself.

**Turn mechanics**: each turn presents via `approval()` WITHOUT recommendation - the card appears in any run mode (interview is never auto-gated). The mode never skips an interview turn.

**Zero-question degradation**: context already covers all aspects of goal - return consensus directly. Consequence of rules 1-8.

## Solve-Mode Additions

9. **Research before think** - when `research: true` (default in solve mode), load skill `research`. Look up specs, patterns, constraints - do not skip, uninformed design wastes rounds.
10. **Think exhaustively** - design complete solution. Cover all dimensions: structure, naming, edges, guards, edge cases.
11. **Re-think on reject** - user rejects any decision -> return to think, revise design, re-interview affected decisions only - do not re-ask confirmed points.

**Internal Flow** - agent-internal loop, no graph-level retry/jump: confirm(goal) -> research -> think -> interview(details) per-round; rejection -> re-think, confirmation -> solution.

---

# High-Level Tool Registry

Closed set of high-level tools - the single execution contract for main-phase work. An execution is a registered tool call `{ intent, tool, args, bound }`: registry entry supplies I/O contract, chain, verify + index obligations. Unknown tool names fail the call at analyze with the candidate list. Legacy 8-field protocol fields (`read_set`, `evidence`, `write_set`, `apply`, `verify`) are REJECTED. Read-only calls end when the tool completes without writes; write calls verify per `Entry: verify` BEFORE reporting success.

**Two-plane structure**: **Query plane (jcodemunch)** - locate/search/analyze chains head with jcodemunch index tools. **Mutation + ground-truth plane (serena)** - write/verify chains name serena as the sole tool, zero fallback. **Run class** - platform shell (`bash`, rtk prefix) - the single class for arbitrary shell commands. Utility tools never appear in a query/mutation chain. Plane down -> loud failure (see ## Fault Tolerance).

**Evidence Loop**: re-enter while unsatisfied AND count < bound (default 3, per-call override allowed); exceeded -> call FAILS with evidence-gap list naming missing files/symbols, no write. Loop layering: call-internal evidence loop = this contract, bounded; Cross-call rework = graph gates (jumps + retryCount, atom-graph-spec).

## Fault Tolerance

Failure semantics: (see HLT-REGISTRY.md §Fault Tolerance).

**Protocol**: schema-first - Parameter names NEVER guessed; read the platform's full tool docs before first call. Errors repair + retry ONCE; after edit -> `register_edit` while index mounted.

## Registry Entries

Closed registry - views `contract`/`chain`/`plane` per entry (+ enforcement deferred - see HLT-REGISTRY.md); entries + validation: (see HLT-REGISTRY.md).

---

# Tool Schemas

## serena

LSP-powered code navigation + editing. All paths relative to project root. Symbol address = name path (e.g. `MyClass/my_method`; overloads append `[i]`). LSP per `.serena/project.yml` `languages`; missing LSP -> FS tier silently. Full tables + examples: (see SERENA-SCHEMAS.md).

- LSP navigation: `find_symbol`, `find_declaration`, `find_referencing_symbols`, `find_implementations`
- Structure/diagnostics/reads: `get_symbols_overview`, `get_diagnostics_for_file`, `search_for_pattern`, `find_file`, `list_dir`, `read_file`
- Edits: `replace_content`, `replace_in_files`, `replace_symbol_body`, `rename_symbol`, `insert_before_symbol`/`insert_after_symbol`, `safe_delete_symbol`, `create_text_file`

## jcodemunch

Query-plane engine - index-backed code intelligence, read-only by charter. `repo` required on nearly every call. Full + compact tables for all registry-referenced tools: (see JCODEMUNCH-SCHEMAS.md).

- `register_edit` - post-edit cache invalidation
- `search_symbols`, `find_references` - symbol search, import-graph references

## headroom

Context compression - ad-hoc output + read-file compression (trigger: >8KB). Channel consumption follows the read entry chain - no pipeline.

|Tool|Req params|Notes|
|-|-|-|
|`compress`|`content` (string)|Returns compressed text + hash. Original stored|
|`retrieve`|`hash` (string)|Restore original by hash|
|`stats`|-|Session compression stats|

**Hash contract**: `compress` returns a hash - `headroom_retrieve(<hash>)` restores the original while the store holds it (TTL = HEADROOM_CCR_TTL_SECONDS).

**Health gate**: `ok` / `cold` (honest 0%) / `down` - markers `[HEADROOM COLD]` / `[HEADROOM PROXY DOWN]`.

## graph-scheduler

Graph lifecycle CRUD - 9 tools, names per §Graph-Scheduler Tool Detection; params/returns/examples: atom-pilot §MCP Tool Reference. Output stays in session - never passed to graph_advance. Approval/gate decisions persist run-scoped (see atom-phase-handler).
