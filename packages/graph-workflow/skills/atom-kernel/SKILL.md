---
name: atom-kernel
description: Platform primitives - task() dispatch, approval() decision UI (mode-aware, absorbs question(), 8 card rules), interview() consensus, judge(), graph-scheduler tool detection, High-Level Tool Registry (closed scenario-keyed tool set + schemas). Use when dispatching sub-agents, presenting decisions, executing main-phase work, authoring execution skills, or mentions high-level tool, HLT registry, tool call, tool schema, evidence loop, verify loop.
argument-hint: none (reference skill)
disable-model-invocation: true
user-invocable: false
version: 2.15.0
last_updated: '2026-08-09'
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

> `task()`, `judge()` are tool-mapped callables - direct invocation, platform-mapped (see §Platform Spellings). `approval()` and `interview()` are behavior contracts - agent-implemented; calling them like functions fails with `ReferenceError`. `approval()` reads run-mode context (card or auto-execute); `interview()` implements turns via `approval()` WITHOUT recommendation (card in any mode - never auto-gated).

## Platform Spellings

Primitive contracts platform-neutral - never assumed exact; skills reference contract names only. Mapping table: (see HLT-REGISTRY.md §Platform Spellings).

---

# Graph-Scheduler Tool Detection

MCP tool name detection - resolve by substring, never assumed exact. Before any graph operation, scan the tool list; find each substring -> record exact name: `graph_start` / `graph_advance` / `graph_status` / `graph_list` / `graph_force_end` / `graph_jump` / `graph_init` / `graph_clean_completed` / `graph_clean_all`. Use detected names for all subsequent calls.

---

# judge() - One-Shot Judgment

One-shot constrained-answer LLM judgment - gate jump condition evaluation. Failure -> conservative default (gate eval: `'false'` no-match - never auto-decide on uncertainty, falls through). Prompt format + failure table: (see HLT-REGISTRY.md §judge()).

---

# todo() - Boundary Clear

Clears the platform todo list at execution-unit boundaries - per-execution scratchpad, never session-persistent; in-node create/update stays native. Contract + state machine + consumer: (see HLT-REGISTRY.md §todo()).

---

# task() - Dispatch

Dispatch sub-agents. Batch in `tasks[]`, shared `context`.

```
task({ i, context, tasks })
```

- `i` - intent. Present participle. 2-6 words.
- `context` - shared constraints. Format: `# Goal`, `# Constraints`, `# Contract`.
- `tasks` - array. Each: `name` (CamelCase <=32), `agent` (specialist type), `task` (self-contained).

`agent` takes one concrete type. Graph main-phase context may carry `## Agent hints: [<type-1>, …]` (from atom-phase-handler, priority-ordered). Pick the **first** hint available in the current platform (§Platform Spellings); none -> platform default. Hints advisory; batch may mix types.

Capture agent ID via the platform's artifact mechanism.

**Output contract (receipt contract)** - every task SHALL declare its return fields (in the task text or an outputSchema). Sub-agents yield a compact structured receipt: status + the declared fields + artifact references (`agent://<id>` / file paths), compressed, no process narrative. Results enter the main context ONCE as the receipt; full transcripts stay addressable via the platform artifact/history mechanisms — never re-injected wholesale.

**Zero on-disk writes** - sub-agents SHALL NOT write persistent files (run state, docs, reports). Deliverable-worthy content is returned in the receipt; the owning main node persists durable artifacts per the output model (session + durable artifacts; scheduler holds progress only).

**Decision Request** - verify-style handoff from dispatched work (Context, Auto-recorded debt, Blocking findings, Dispatch record, Suggested advance label); graph review nodes embed it.

---

# approval() - Decision UI

Single decision per call, mode-aware. The one decision primitive - question() absorbed. Cold detail (mode dispatch, 8 format rules): see APPROVAL-CARDS.md.

```
approval({ header, options, custom, recommendation?, rationale? }) → decision
```

Decision shape: (see sibling APPROVAL-CARDS.md §IApprovalDecision Shape).

- Mode source: `## Run Mode: <mode>` block (every dispatch; absent -> `manual` - absence never auto).
- Manual / absent / no recommendation -> decision card (options + custom). Return the user's choice.
- Auto + recommendation -> execute the recommendation: no card; record the decision + rationale (observability). Return it.
- Auto without recommendation -> decision card (never guess; card line per APPROVAL-CARDS.md).

---

# interview() - Consensus Interview (Behavior Contract - NOT a callable function)

Single conversation contract, two modes - **consensus** + **solve** - one rule set; every rule applies on every call, both modes.

```
interview({ goal, context?, research?, design? }) → consensus | solution
```

- `goal` - interview goal. First consensus point.
- `context` - background. Discoverable facts - look up, do not ask.
- `research?` - solve mode only. Research before think; default `true`.
- `design?` - solve mode only; design/solution marker.
- Returns `consensus` `{ decisions: [{ decision, rationale }] }` or `solution` `{ goal, findings?, design, consensus }`.

## Mode Selection

- **Consensus mode** - confirm goal -> decision rounds -> `{ decisions }`. Default.
- **Solve mode** - complete solution -> `{ goal, findings?, design, consensus }`. Use when `research: true` or goal produces a design/plan; chain per sibling INTERVIEW-DETAIL.md §Internal Flow.

## Behavior Contract

1. **Comprehensive coverage** - cover every aspect of goal topic.
2. **Decision tree traversal** - walk down each branch; exhaust all paths.
3. **Dependency resolution** - prerequisite before dependent.
4. **Recommendation first** - recommended answer first option, from context analysis.
5. **Single question discipline** - one question per turn; wait for response.
6. **Fact lookup** - discoverable facts looked up, never asked.
7. **Decision gate** - decisions belong to user; each submitted, wait.
8. **Shared understanding gate** - no action until user confirms shared understanding.

**Goal consensus**: even when explicitly given, the goal itself is confirmed first.

**Turn mechanics**: each turn presents via `approval()` WITHOUT recommendation - card in any run mode (never auto-gated; mode never skips a turn).

**Zero-question degradation**: context covers all aspects of goal -> return consensus directly.

## Solve-Mode Additions

Solve-mode rules 9-11 + internal flow: see sibling INTERVIEW-DETAIL.md (cold branch - `research: true` / design goals only).

---

# High-Level Tool Registry

Closed set of high-level tools - the single execution contract for main-phase work. An execution = registered call `{ intent, tool, args, bound }`: registry entry supplies I/O contract, chain, verify + index obligations. Unknown tool names fail at analyze (candidate list). Legacy 8-field protocol fields REJECTED (details: HLT-REGISTRY.md §Protocol). Read-only calls end without writes; write calls verify per `Entry: verify` BEFORE reporting success.

**Scenario structure**: key = scenario `(target domain x operation)` -> exactly one adapter + obligations + n/a rules. Core rows (hot - every dispatch):

|Target domain x operation|Adapter|n/a|
|-|-|-|
|in-project code x locate|jcodemunch -> serena LSP ground-truth|-|
|in-project code x read/write/verify|serena|-|
|in-project text (indexed) x locate|jcodemunch (dict-walkers); register_edit per JCODEMUNCH-SCHEMAS|-|
|in-project text (unindexed) x locate|serena search_for_pattern|jcodemunch `not indexed`|
|in-project text x read|platform-native read (permissive cell)|-|
|in-project text x write|platform-native write (permissive cell; register_edit per JCODEMUNCH-SCHEMAS)|-|
|in-project text x verify|serena re-read|diagnostics `no LSP coverage`|
|in-project special types x read|platform-native read|serena `UTF-8 text only`; jcodemunch `not indexed`|
|out-of-project x locate|platform-native search|serena `project-root-bound`; jcodemunch `not indexed`|
|out-of-project x read/write|platform-native read/write|serena `project-root-bound`; jcodemunch `not indexed`|
|any x run|platform shell (`bash`, rtk)|-|
|any x compress|headroom-ai (platform-neutral)|proxy down|

Full table + entries + validation + edge n/a: (see HLT-REGISTRY.md §Registry Entries). Adapter unavailable -> loud failure (see ## Fault Tolerance).

**Evidence Loop**: re-enter while unsatisfied AND count < bound (default 3, per-call override); exceeded -> call FAILS with evidence-gap list (missing files/symbols), no write. Layering: call-internal = this contract; cross-call rework = graph gates (atom-graph-spec).

## Fault Tolerance

Failure semantics: (see HLT-REGISTRY.md §Fault Tolerance). Schema-first - parameter names NEVER guessed; read full tool docs first. Errors repair + retry ONCE; after edit -> `register_edit` while index mounted AND target indexed (else `n/a: not indexed`).

## Registry Entries

Closed registry - views + validation: (see HLT-REGISTRY.md).

---

# Tool Schemas

## serena

LSP-powered code navigation + editing. All paths relative to project root. Symbol address = name path (e.g. `MyClass/my_method`; overloads append `[i]`). LSP per `.serena/project.yml` `languages`; missing LSP -> FS tier silently. Full tables + examples: (see SERENA-SCHEMAS.md).

- LSP navigation: `find_symbol`, `find_declaration`, `find_referencing_symbols`, `find_implementations`
- Structure/diagnostics/reads: `get_symbols_overview`, `get_diagnostics_for_file`, `search_for_pattern`, `find_file`, `list_dir`, `read_file`
- Edits: `replace_content`, `replace_in_files`, `replace_symbol_body`, `rename_symbol`, `insert_before_symbol`/`insert_after_symbol`, `safe_delete_symbol`, `create_text_file`

Compact params (full: SERENA-SCHEMAS.md):

|Tool|Key params|Guard|
|-|-|-|
|`replace_content`|relative_path, needle, repl, mode (literal\|regex)|ambiguity -> error, revise needle|
|`replace_in_files`|needle, repl, mode, paths_include/exclude_glob, dry_run, occurrence_ids, expected_count|dry-run preview + expected_count mismatch -> error|
|`create_text_file`|relative_path, content|diagnostics-wrapped|
|`read_file`|relative_path, start_line, end_line, max_answer_chars|sliced reads; >8KB -> compress|
|`get_diagnostics_for_file`|relative_path (or symbol), min_severity|LSP-covered languages only|
|`search_for_pattern`|pattern, relative_path, paths_include/exclude_glob|project-internal regex, FS tier|

## jcodemunch

Index-backed code intelligence, read-only by charter - adapter for locate/search/analyze on in-project indexed targets. `repo` required on nearly every call; unindexed target -> `n/a: not indexed`. Full + compact tables for all registry-referenced tools: (see JCODEMUNCH-SCHEMAS.md).

- `register_edit` - post-edit cache invalidation
- `search_symbols`, `find_references` - symbol search, import-graph references

Compact params (full: JCODEMUNCH-SCHEMAS.md):

|Tool|Key params|Guard|
|-|-|-|
|`search_symbols`|repo, query, kind, language, max_results, token_budget, detail_level|confidence/freshness metadata|
|`find_references`|repo, identifier\|identifiers, max_results, include_call_chain|import-graph refs|
|`check_references`|repo, name (or symbol path)|referenced anywhere?|
|`get_blast_radius`|repo, symbol or file|files affected by change|
|`register_edit`|repo, file_paths, reindex|indexed targets only; unindexed -> n/a|
|`search_text`|repo, query, is_regex, context_lines, limit|ReDoS-guarded, indexed corpus only|
|`get_file_content`|repo, path, start_line, end_line|non-indexed -> File not found + verdict|

## headroom

Context compression - contract (MCP authoritative), trigger (>8KB), proxy forms, schema + health gate: see HLT-REGISTRY.md §headroom (single home).

## graph-scheduler

Graph lifecycle CRUD - 9 tools, names per §Graph-Scheduler Tool Detection; params/returns/examples: atom-pilot SKILL.md §MCP Reference. Output stays in session - never passed to graph_advance (main-node default; approval/gate output is parsed by the pilot and drives routing). Approval/gate decisions persist run-scoped (see atom-phase-handler).
