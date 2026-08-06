---
name: atom-mcp-contract
description: 'MCP tool-call contract — exact parameter schemas for serena, jcodemunch, headroom, graph-scheduler tools; schema-first protocol; failure recovery chain. Use before any MCP tool call: parameter names NEVER guessed; contract-missing tool → read full tool docs first. Trigger: MCP call, serena tool, jcodemunch tool, headroom, graph-scheduler, validation error, invalid args.'
version: 1.1.0
last_updated: '2026-08-06'
user-invocable: false
disable-model-invocation: true
---

> **Runtime constraints** — reference skill; loaded by atom-phase-handler auxiliary layer (same mechanism as atom-kernel, see atom-skill-spec §Invocation injection-only model). Never a channel. Load atom-kernel for graph-scheduler tool detection.

# Atom-MCP-Contract

Tool-call contract for mounted MCP servers. Single source of truth for exact parameter names, required fields, value domains, examples. Pure reference — no wrappers, no tool re-exposure.

## Protocol

1. **Schema-first.** Parameter names NEVER guessed. Contract entry covers tool → use it. No entry → read full tool docs (`xd://<tool>` on OMP) before first call. Docs win over this contract on mismatch.
2. **Required fields always present.** Missing required param = validation error = failed call. Check contract table before writing args.
3. **Failure recovery.** Validation error → read full tool docs → repair args → retry ONCE. Still failing → degrade (see Degradation). Never blind-guess loops.
4. **Cache consistency.** After any file edit → jcodemunch `register_edit` (see section).
5. **Unused fields omitted.** Optional params pass only when needed. Keep args minimal.

## Degradation

|Task class|Order|||
|-|-|-|-|
|Code nav / symbol|jcodemunch|serena (LSP covers language only)|text tools (grep/read)|
|References|jcodemunch `find_references`|serena `find_referencing_symbols` (LSP covers language only)|text search|
|Edit|platform-native edit / lsp rename|serena (replace/rename/insert)|plain edit + jcodemunch `register_edit`|

Third-party servers (serena/jcodemunch/headroom) not project dependencies — contract is best-practice layer. Server unavailable → skip to next tier silently. Serena tier unavailable when its LSP does not cover the file's language — see Availability note.

## serena

LSP-powered code navigation + editing. All paths relative to project root. Symbol address = name path (file-local symbol tree, e.g. `MyClass/my_method`; overloads append `[i]`).

**Availability**: requires a language server for the file's language in `.serena/project.yml` (`languages` list). Missing LSP → symbol queries return empty; treat tier as unavailable, skip to next tier silently. LSP backend initializes at serena process start — config changes need server restart to take effect.

### Navigation

#### find_symbol — find by name path pattern

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path_pattern`|yes|string|Simple name, relative path `class/method`, or absolute `/path`; `[i]` overload index|
|`depth`|no|number|Descendants depth. 1 = children. Default 0|
|`relative_path`|no|string|Restrict to file or directory|
|`include_body`|no|boolean|Include source. Use judiciously|
|`include_info`|no|boolean|Hover-like info. Ignored when include_body|
|`include_kinds`/`exclude_kinds`|no|number[]|LSP symbol kind filters|
|`substring_matching`|no|boolean|Substring match last pattern element|
|`max_matches`|no|number|-1 = no limit. 1 for single-symbol search|

Example: `{"name_path_pattern": "resolveChannels", "relative_path": "packages/graph-scheduler/src", "max_matches": 5}`

#### find_declaration — declaration lookup from call site

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File containing the call|
|`regex`|yes|string|Regex with EXACTLY ONE group matching the symbol. Python syntax, MULTILINE+DOTALL|
|`containing_symbol_name_path`|no|string|null|Search symbol body instead of full file|
|`include_body`/`include_info`|no|boolean|Default false|

Example: `{"relative_path": "src/app.ts", "regex": "obj\\.(process)\\(process_input_arg=37\\)"}`

#### find_referencing_symbols — cross-file references

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol name path|
|`relative_path`|yes|string|File containing the symbol. External deps: `<ext` identifier — never guess|
|`include_kinds`/`exclude_kinds`|no|number[]|LSP kind filters|
|`max_answer_chars`|no|number|-1 default|

Example: `{"name_path": "Order/process", "relative_path": "src/order.ts"}`

#### find_implementations — interface/abstract impls

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol name path|
|`relative_path`|yes|string|FILE, not directory|
|`include_info`|no|boolean|Default false|
|`include_kinds`/`exclude_kinds`|no|number[]|
|`max_answer_chars`|no|number|

Example: `{"name_path": "Repository", "relative_path": "src/repository.ts"}`

#### get_symbols_overview — file structure first read

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to overview|
|`depth`|no|number|Descendants depth. Default 0|
|`max_answer_chars`|no|number|-1 default. Don't adjust unless forced|

Example: `{"relative_path": "packages/graph-scheduler/src/fsm-transition.ts", "depth": 1}`

#### get_diagnostics_for_file — LSP errors/warnings

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to inspect|
|`start_line`/`end_line`|no|number|0-based range. end -1 = EOF|
|`min_severity`|no|number|1=Error … 4=Hint|
|`max_answer_chars`|no|number|

Example: `{"relative_path": "src/app.ts", "min_severity": 2}`

#### search_for_pattern — regex across project

|Param|Req|Type|Notes|
|-|-|-|-|
|`substring_pattern`|yes|string|Regex to search|
|`context_lines_before`/`after`|no|number|
|`paths_include_glob`/`paths_exclude_glob`|no|string|Glob restrict/exclude; exclude wins|
|`relative_path`|no|string|Restrict to file/subdir|
|`restrict_search_to_code_files`|no|boolean|
|`multiline`|no|boolean|Default true (DOTALL+MULTILINE)|
|`max_answer_chars`|no|number|

Prefer symbolic ops over pattern search when symbols known.

Example: `{"substring_pattern": "register_edit\\(\\)", "paths_include_glob": "src/**/*.ts", "context_lines_before": 1}`

#### find_file — file mask lookup

|Param|Req|Type|Notes|
|-|-|-|-|
|`file_mask`|yes|string|Name or mask with `*`/`?`|
|`relative_path`|yes|string|Directory to scan; `"."` = project root|

Example: `{"file_mask": "*.taskflow.yaml", "relative_path": "packages/graph-scheduler/graphs"}`

### Editing

#### replace_content — pattern replace in file

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to edit|
|`needle`|yes|string|Search string or regex|
|`repl`|yes|string|Replacement verbatim; `$!1` backrefs in regex mode|
|`mode`|yes|`"literal"` \| `"regex"`|Interprets needle|
|`allow_multiple_occurrences`|no|boolean|false + multiple matches = error (safe retry signal)|

Preferred edit tool. Regex mode with wildcards = economical for large spans: `beginning.*?end` form. Match ambiguity = error, revise needle, retry.

Example: `{"relative_path": "src/app.ts", "needle": "TODO.*?FIXME", "repl": "FIXED", "mode": "regex"}`

#### replace_symbol_body — body swap

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol to replace|
|`relative_path`|yes|string|Containing file|
|`body`|yes|string|New full definition incl. signature line|

PRECONDITION: prior retrieval with `include_body: true` — never blind body replace.

Example: `{"name_path": "Order/process", "relative_path": "src/order.ts", "body": "process(input: Input): Output {\n  return transform(input);\n}"}`

#### rename_symbol — codebase-wide semantic rename

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol to rename|
|`relative_path`|yes|string|Containing file|
|`new_name`|yes|string|New symbol name|

Example: `{"name_path": "Order/process", "relative_path": "src/order.ts", "new_name": "handle"}`

#### insert_before_symbol / insert_after_symbol

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Anchor symbol|
|`relative_path`|yes|string|Containing file|
|`body`|yes|string|Content to insert|

Not for assignments/constants/fields after. Import insert = before first symbol.

Example (after): `{"name_path": "Order/process", "relative_path": "src/order.ts", "body": "validate(input: Input): void {}"}`

#### safe_delete_symbol — reference-checked delete

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path_pattern`|yes|string|Symbol to delete|
|`relative_path`|yes|string|Containing file|

Deletes only when zero references; else returns reference list.

Example: `{"name_path_pattern": "Order/deprecatedHelper", "relative_path": "src/order.ts"}`

#### create_text_file — new file

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to create/overwrite|
|`content`|yes|string|File content|

Example: `{"relative_path": "src/lib.ts", "content": "export const VERSION = 1;\n"}`

## jcodemunch

Index-backed code intelligence. `repo` required on nearly every call — repository identifier (owner/repo or repo name).

### register_edit — post-edit cache invalidation

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repo identifier|
|`file_paths`|yes|string[]|Edited files|
|`reindex`|no|boolean|Also reindex files|

MANDATORY after every file edit. Skipping = stale BM25/search caches = wrong results downstream.

Example: `{"repo": "ai-atomic-workflow", "file_paths": ["src/app.ts", "src/lib.ts"]}`

### search_symbols — symbol search

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|
|`query`|yes|string|Matches names, signatures, summaries, docstrings|
|`kind`|no|string enum|function/class/method/constant/type/template/import|
|`file_pattern`|no|string|Glob filter|
|`language`|no|string enum|~70 languages|
|`max_results`|no|number|Ignored when token_budget set|
|`token_budget`|no|number|Greedy pack by score; overrides max_results|
|`detail_level`|no|`compact` \| `standard` \| `full`|compact = id/name/kind/file/line; full = source inlined|
|`fuzzy`/`fuzzy_threshold`/`max_edit_distance`|no|—|Fuzzy fallback on low BM25|
|`sort_by`|no|`relevance` \| `centrality` \| `combined`|Default relevance|
|`semantic`/`semantic_only`/`semantic_weight`|no|—|Embedding search; needs provider config|
|`fqn`|no|string|PHP PSR-4 alternative to query|

Example: `{"repo": "ai-atomic-workflow", "query": "resolveReady", "kind": "function", "detail_level": "compact"}`

### get_symbol_source — full source by symbol_id

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|
|`symbol_id`|no|string|Single; flat object return|
|`symbol_ids`|no|string[]|Batch; {symbols, errors} return|
|`verify`|no|boolean|Content-hash drift check|
|`context_lines`|no|number|Before/after context|
|`fqn`|no|string|PHP PSR-4 alternative|
|`source_start_line`/`source_end_line`/`max_source_lines`/`max_source_bytes`|no|number|Bounded slice mode|

Exactly one of symbol_id / symbol_ids / fqn required in practice.

Example: `{"repo": "ai-atomic-workflow", "symbol_id": "packages/graph-scheduler/src/fsm-transition.ts:resolveReady", "context_lines": 2}`

### find_references — import-graph references

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|
|`identifier`|no|string|Single; not with identifiers|
|`identifiers`|no|string[]|Batch mode|
|`max_results`|no|number|
|`include_call_chain`|no|boolean|Singular only; adds calling_symbols|

Example: `{"repo": "ai-atomic-workflow", "identifier": "resolveChannels", "max_results": 20}`

### check_references — dead-code probe

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|
|`identifier`|no|string|Single|
|`identifiers`|no|string[]|Batch grouped results|
|`search_content`|no|boolean|File content scan; false = import-only fast|
|`max_content_results`|no|number|

Example: `{"repo": "ai-atomic-workflow", "identifier": "atom-dual-review"}`

### plan_turn — opening move

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|
|`query`|yes|string|Task description or symbol|
|`max_recommended`|no|number|
|`model`|no|string|Active model id; triggers tier switch side effect|

Example: `{"repo": "ai-atomic-workflow", "query": "context resolution channels"}`

## headroom

Context compression. Use on large tool output / search results / file content before reasoning.

|Tool|Req params|Notes|
|-|-|-|
|`compress`|`content` (string)|Returns compressed text + hash. Original stored|
|`retrieve`|`hash` (string)|Restore original by hash|
|`stats`|—|Session compression stats|

Compress big output (>500 grep lines, >10K token tool results). Retrieve when full detail needed.

Example (compress): `{"content": "<large tool output>"}` → hash `abc123`; retrieve: `{"hash": "abc123"}`

## graph-scheduler

Graph lifecycle CRUD. Tool names detected at runtime per atom-kernel §Graph-Scheduler Tool Detection (substring match on mounted tool list — `graph_start`, `graph_advance`, `graph_status`, `graph_list`, `graph_force_end`, `graph_jump`, `graph_init`, `graph_clean_completed`, `graph_clean_all`).

|Tool|Params|Returns|
|-|-|-|
|`graph_start`|`graphName` (req), `args?` (graph_start args; `args.mode` short-circuits run-mode confirm)|`{runId, node, snapshot, resolvedFrom, resolvedPath, description?}` — resolvedFrom: project\|builtin\|fallback; description = graph top-level identity text (absent when undeclared)|
|`graph_advance`|`runId`, `nodeId`, `durationMs`, `branchTo?`, `endRun?`|`{snapshot, node}`; node null = complete|
|`graph_status`|`runId`|Full run snapshot|
|`graph_list`|—|Runs, newest first|
|`graph_force_end`|`runId`|Terminated run snapshot|
|`graph_jump`|`runId`, `targetPhaseId`|`{snapshot, node}`; resets target + downstream terminals|
|`graph_init`|—|Init DB + health check. Idempotent|
|`graph_clean_completed`|`before?` (cutoff timestamp)|Cleans completed runs|
|`graph_clean_all`|—|Destructive; confirmation required|

Examples:

- start: `{"graphName": "arch-review-loop"}`
- advance: `{"runId": "6e51a7a1", "nodeId": "loop-entry", "durationMs": 58000, "branchTo": "detailed-track"}`
- status: `{"runId": "6e51a7a1"}`
- force_end: `{"runId": "6e51a7a1"}`
- jump: `{"runId": "6e51a7a1", "targetPhaseId": "loop-entry"}`
- clean_completed: `{"before": "2026-08-01T00:00:00Z"}`

Output stays in session — never passed to graph_advance. Approval/gate decisions persist to `.taskflow/outputs/<runId>/<nodeId>.output.txt` (run-scoped streams).
