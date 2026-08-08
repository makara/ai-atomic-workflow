# HLT Registry - atom-kernel

High-Level Tool Registry entries - views contract/chain/plane per entry (+ enforcement deferred). Pure reference - loaded via pointer from atom-kernel SKILL.md §High-Level Tool Registry. Execution contract: registered tool call `{ intent, tool, args, bound }`; caller chooses tool + args; entry supplies I/O contract, chain, verify + index obligations.

## Two-plane structure

Entries carry a `plane` marker - `query` (locate/search/analyze), `mutation` (write/verify), `run`, or `utility` (compress/review/archive/graph-ops/register_edit).

- **Query plane (jcodemunch)** - locate/search/analyze chains head with jcodemunch index tools (search_symbols, find_references, check_references, get_blast_radius, plan_turn - confidence/freshness metadata on every result). Read-only by charter. Repository-scale questions (where, who references, dead-code, blast radius, health/risk/cycles analytics) are query-plane-owned; serena has no such capability.
- **Mutation + ground-truth plane (serena)** - write/verify chains name serena as the sole tool, zero fallback: create_text_file, replace_content, replace_in_files, replace_symbol_body, rename_symbol, insert_before/after_symbol, safe_delete_symbol, get_diagnostics_for_file, read_file. LSP-accurate, safety-guarded editing (ambiguity guards, dry-run + expected_count, reference-checked delete). Serena unavailable (server down, project unactivated) -> serena-backed calls FAIL loudly naming serena; query plane down (jcodemunch unreachable) -> locate/search/analyze fail naming jcodemunch. Never silent degrade, never cross-plane fallback. Intra-serena tiering (symbol tier needs LSP; FS tier needs none) is one dependency, not a chain.
- **Ground-truth confirmation** - index results are candidates, never action-authority. Before a mutation based on a query-plane result, confirm critical symbols with serena LSP tools (find_symbol, find_referencing_symbols); index/LSP mismatch stops the mutation.
- **Run class** - platform shell (`bash`, rtk prefix) - the single class for arbitrary shell commands; utility CLI classes (archive: openspec CLI) keep their declared tools.
- **Utility classes** - optional by declaration: use cases + n/a rules listed per entry; utility tools never appear in a query/mutation chain. `register_edit` is a mutation-plane obligation: unconditional while the index is mounted (index freshness is a query-plane correctness property).

## Evidence Loop

- The tool's evidence rules drive the read loop; the loop re-enters while unsatisfied AND loop count < bound (default 3, per-call override allowed).
- Predicate satisfied -> proceed to reason.
- bound exceeded -> call FAILS with evidence-gap list naming missing files/symbols. No write applied. Graph layer routes rework on the gap list.
- Loop layering: call-internal = this contract, bounded; cross-call rework = graph gates (atom-graph-spec) - never unbounded call-internal loops.

## Fault Tolerance

- **Plane-down semantics**: Query plane down (jcodemunch unreachable) -> locate/search/analyze fail naming jcodemunch. Mutation plane down (serena down, project unactivated) -> write/verify fail naming serena. Never silent degrade, never cross-plane fallback. Run class unaffected.
- Locate failure: retry once within the query plane -> still failing: call fails loudly with error + evidence-gap list. Never silent skip, never unbounded blind retry (cross-plane fallback ban).
- LSP index lag (fresh files): symbol locate may fail right after create - the ground-truth confirmation retries; the query-plane locate may report low freshness - consume the metadata, do not fabricate certainty.
- Index staleness window: reads of just-created files may lag the index - the read flow's locate step degrades to mutation-plane overview-first reads when the index has no entry.
- Visibility: the tool's declared I/O is checked at analyze against the accessible tree. Gitignored/invisible paths (serena refuses them for safety) -> rejected at analyze with visibility error naming the path. Never discovered mid-call.
- Tier availability: per-tier precondition (e.g. LSP coverage per language) gates the intra-serena tier; precondition false -> use the serena FS tier. Serena itself unavailable -> call fails loudly (mutation plane has no non-serena tier).

## Protocol

1. **Schema-first.** Parameter names NEVER guessed. Contract entry covers tool -> use it. No entry -> read the platform's full tool docs before first call. Docs win over this contract on mismatch.
2. **Required fields always present.** Missing required param = validation error = failed call. Check contract table before writing args.
3. **Failure recovery.** Validation error -> read full tool docs -> repair args -> retry ONCE. Still failing -> degrade within the entry's chain (serena FS tier within the mutation plane; utility: declared n/a). Never blind-guess loops.
4. **Cache consistency.** After any file edit -> `jcodemunch register_edit` while the index is mounted (unconditional - mutation-plane obligation); index unmounted -> `n/a: jcodemunch not in use` (see Entry: write).
5. **Unused fields omitted.** Optional params pass only when needed. Keep args minimal.

## Registry Entries

Every entry has three views (enforcement deferred per-entry):

|View|Carries|
|-|-|
|`contract`|Declared I/O, verify obligations, index-registration obligations (unconditional while index mounted), n/a rules|
|`chain`|Execution order - query plane: jcodemunch head (+ serena ground-truth confirmation step); mutation plane: serena only; run: platform shell; utility: declared tools with n/a rules. Never fixed-first across planes|
|`plane`|`query` (jcodemunch head)|`mutation` (serena sole)|`run` (platform shell)|`utility` (optional, declared use cases)|

**Enforcement**: deferred per-platform (all entries; per-platform allowed/denied/mandatory sets recorded now, implementation deferred until adaptation modules ship); n/a where evidence-only (verify, compress, archive, graph-ops, register_edit).

Registry validation: every entry has all three views (enforcement deferred); Chain heads SHALL NOT cross planes (query -> jcodemunch, mutation -> serena, run -> shell; intra-entry steps MAY cross by declared design - never fallbacks). query-plane entries SHALL head with jcodemunch; mutation-plane entries SHALL use serena tools only; run entries SHALL use the platform shell; utility entries SHALL carry optional markers + use cases + n/a rules. a locate chain headed by serena symbol tools, a write chain headed by jcodemunch - both validation errors. Plane unavailable -> loud failure (see Two-plane structure).

### Entry: locate

- **plane**: query (jcodemunch head + serena ground-truth confirmation)
- **contract**: target (symbol/pattern/path) -> candidates with file:line + confidence/freshness; no writes
- **chain**: jcodemunch index (`search_symbols`, `find_references`, `check_references`, `get_blast_radius`, `plan_turn`, `check_edit_safe`, `check_delete_safe`, `get_impact_preview`) - repository-scale, all languages, gitignore-aware -> serena ground-truth confirmation (`find_symbol`, `find_referencing_symbols`, `find_implementations`, `find_declaration` - LSP) - confirm critical candidates BEFORE mutation; mismatch stops the mutation

### Entry: read

- **plane**: mutation (serena) + query-plane locate when target unknown
- **contract**: path/symbol -> sliced content; no writes; result >8KB compressed before reasoning (compress entry)
- **chain**: unknown target -> Entry: locate first; then serena `get_symbols_overview` (structural, zero content I/O) -> serena `read_file` (line selectors) -> unavoidable >8KB -> `headroom_compress`, hash retained

### Entry: write

- **plane**: mutation (serena)
- **contract**: target + new content; verify + unconditional index-registration obligations while index mounted
- **chain**: symbol-level (body replace / rename / insert / safe delete) -> serena LSP tools (`replace_symbol_body`, `rename_symbol`, `insert_*_symbol`, `safe_delete_symbol`; precondition: LSP covers language); surgical text -> serena `replace_content` (single file, ambiguity-guarded) / `replace_in_files` (multi-file, dry-run + expected_count guarded); new file -> serena `create_text_file` (diagnostics-wrapped)
- **obligations**: query-plane preflight BEFORE mutation (edit/delete legs: `check_edit_safe`/`get_blast_radius` before edits, `check_delete_safe`/`get_impact_preview` before deletes; atomic-step-flows rule - no step skipped); verify loop after every write (Entry: verify); `jcodemunch register_edit` after every edit while the index is mounted - unconditional (mutation-plane obligation); else `n/a: jcodemunch not in use`

### Entry: verify

- **plane**: mutation (serena)
- **contract**: written files -> diagnostics result + re-read confirmation - machine-parseable facts for downstream gates; register_edit count reported while the index is mounted (obligation)
- **chain**: serena `get_diagnostics_for_file` (min_severity 1, LSP-covered languages) -> re-read the changed region (serena `read_file` - confirm applied state)

### Entry: compress

- **plane**: utility - optional; use case: context budget (>8KB reads, large tool outputs)
- **contract**: content >8KB -> compressed text + hash (retrievable via `headroom_retrieve`)
- **chain**: `headroom_compress` (proxy up); honest 0% fallback with `[HEADROOM COLD]` / `[HEADROOM PROXY DOWN]` markers

### Entry: review

- **plane**: utility - optional; use case: structured review reports (diff/scope -> findings). Analytics query-plane-owned (jcodemunch charter; serena has no aggregation - never forced)
- **contract**: diff/scope -> structured report
- **chain**: jcodemunch analytics (`get_repo_health` / `get_pr_risk_profile` / `get_dependency_cycles` / `find_dead_code` / `get_hotspots`) -> serena evidence reads -> sub-agent review dispatch (§Agent Hints) aggregating evidence

### Entry: run

- **plane**: run (platform shell)
- **contract**: command -> result; rtk prefix per project constraints
- **chain**: platform shell (`bash`) - project cwd, stdout/stderr captured - rtk prefix preserved

### Entry: archive

- **plane**: utility - optional; use case: OpenSpec change lifecycle. Serena has no openspec capability - boundary declared
- **contract**: change name -> archive_status
- **chain**: openspec CLI (`openspec archive`); `n/a: openspec CLI unavailable` - never silent

### Entry: graph-ops

- **plane**: utility - optional; use case: graph-scheduler lifecycle. Serena has no scheduler integration - boundary declared
- **contract**: graph-scheduler MCP call -> snapshot/node
- **chain**: detected graph-scheduler MCP tools (§Graph-Scheduler Tool Detection) -> schema-first per atom-pilot §MCP Tool Reference

### Entry: register_edit

- **plane**: mutation obligation (unconditional while index mounted); query-plane cache consistency. Never part of a write chain
- **contract**: edited file paths -> registration result
- **chain**: jcodemunch `register_edit` (repo indexed); `n/a: jcodemunch not in use` / `n/a: repo unindexed` - never silent
