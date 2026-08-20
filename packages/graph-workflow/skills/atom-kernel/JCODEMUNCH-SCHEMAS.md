# JCODEMUNCH Schemas - atom-kernel

Jcodemunch tool parameter tables. Pure reference - loaded via pointer from atom-kernel SKILL.md §Tool Schemas. Query-plane engine - index-backed code intelligence, read-only by charter. `repo` required on nearly every call - repository identifier (owner/repo or repo name).

## register_edit - post-edit cache invalidation

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repo identifier|
|`file_paths`|yes|string[]|Edited files|
|`reindex`|no|boolean|Also reindex files|

Required after every mutation on indexed targets (in-project code + indexed non-code-text subtypes) while the index is mounted - unconditional within scope; skipping = stale BM25/search caches. Executed as the MCP tool call `mcp__jcodemunch_register_edit` with `{repo, file_paths, reindex?}`; the graph-fidelity discipline module emits the post-edit reminder hint on every serena write-tool result (ADR 0194). Unindexed target (markdown/plain text, out-of-project) -> `n/a: not indexed`; index unmounted -> `n/a: jcodemunch not in use` (never silent).

Example: `{"repo": "ai-atomic-workflow", "file_paths": ["src/app.ts", "src/lib.ts"]}`

## search_symbols - symbol search

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string||
|`query`|yes|string|Matches names, signatures, summaries, docstrings|
|`kind`|no|string enum|function/class/method/constant/type/template/import|
|`file_pattern`|no|string|Glob filter|
|`language`|no|string enum|~70 languages|
|`max_results`|no|number|Ignored when token_budget set|
|`token_budget`|no|number|Greedy pack by score; overrides max_results|
|`detail_level`|no|`compact` \| `standard` \| `full`|compact = id/name/kind/file/line; full = source inlined|
|`fuzzy`/`fuzzy_threshold`/`max_edit_distance`|no|-|Fuzzy fallback on low BM25|
|`sort_by`|no|`relevance` \| `centrality` \| `combined`|Default relevance|
|`semantic`/`semantic_only`/`semantic_weight`|no|-|Embedding search; needs provider config|
|`fqn`|no|string|PHP PSR-4 alternative to query|

Example: `{"repo": "ai-atomic-workflow", "query": "resolveReady", "kind": "function", "detail_level": "compact"}`

## find_references - import-graph references

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string||
|`identifier`|no|string|Single; not with identifiers|
|`identifiers`|no|string[]|Batch mode|
|`max_results`|no|number|
|`include_call_chain`|no|boolean|Singular only; adds calling_symbols|

Example: `{"repo": "ai-atomic-workflow", "identifier": "resolveChannels", "max_results": 20}`

## Registry-referenced tools - compact tables

Compact param tables (key params only). Full docs: platform tool docs (Protocol: schema-first - no entry -> read platform docs).

### check_edit_safe - edit-safety preflight

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`symbol`|yes|string|Symbol ID or name to evaluate|
|`cross_repo`|no|boolean|Include other indexed repos (default true)|
|`include_runtime`|no|boolean|Consult runtime_calls for production evidence (default true)|

### check_delete_safe - delete-safety preflight

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`symbol`|yes|string|Symbol ID or name to evaluate|
|`cross_repo`|no|boolean|Include other indexed repos (default true)|
|`include_runtime`|no|boolean|Consult runtime_calls for production evidence (default true)|

### check_references - identifier referenced anywhere

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`identifier`|no|string|Single identifier to check|
|`identifiers`|no|string[]|Multiple identifiers in one call; grouped results|
|`search_content`|no|boolean|Also search file contents (not just imports)|
|`max_content_results`|no|number|Max files per identifier for content search|

### get_blast_radius - files affected by symbol change

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`symbol`|yes|string|Symbol name or ID to analyse|
|`depth`|no|number|Import hops (1 = direct, max 3). Default 1|
|`include_depth_scores`|no|boolean|Adds impact_by_depth + per-depth risk|
|`cross_repo`|no|boolean|Consumers in other indexed repos|
|`call_depth`|no|number|Call-level analysis (max 3). Default 0|
|`fqn`|no|string|PHP PSR-4 alternative to symbol|
|`decorator_filter`|no|string|Filter confirmed results by decorator|
|`include_source`|no|boolean|Source snippets at each reference site|
|`source_budget`|no|number|Max tokens for snippets (default 8000)|
|`include_decisions`|no|boolean|Decision-bearing commits + volatility read|

### get_impact_preview - what breaks if symbol removed/renamed

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`symbol_id`|yes|string|Symbol name or full ID (use search_symbols to find IDs)|
|`include_decisions`|no|boolean|Decision-bearing commits + volatility read|

### plan_turn - plan next turn

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`query`|yes|string|Task description or symbol name|
|`max_recommended`|no|number|Max symbols to recommend|
|`model`|no|string|Active model identifier; triggers tier-switch side effect when adaptive_tiering enabled|

### get_repo_health - one-call repo triage snapshot

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`days`|no|number|Churn look-back window (default 90)|

### get_pr_risk_profile - unified PR/branch risk assessment

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`base_ref`|no|string|Base SHA/ref to compare from (default: index-time SHA)|
|`head_ref`|no|string|Head SHA/ref to compare to (default HEAD)|
|`days`|no|number|Churn look-back window (default 90)|

### get_dependency_cycles - circular import chains

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|

### find_dead_code - zero-importer files/symbols

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`granularity`|no|`symbol` \| `file`|symbol default; file = dead files only|
|`min_confidence`|no|number|Threshold 0.0-1.0. Default 0.8|
|`include_tests`|no|boolean|Treat test files as live roots (default false)|
|`entry_point_patterns`|no|string[]|Glob patterns treated as live roots|

### get_hotspots - top-N highest-risk symbols

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`top_n`|no|number|Results to return (default 20)|
|`days`|no|number|Churn look-back window (default 90)|
|`min_complexity`|no|number|Min cyclomatic complexity (default 2)|

### search_text - full-text search over indexed corpus

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`query`|yes|string|Regex or literal pattern (<=500 chars, ReDoS-guarded)|
|`is_regex`|no|boolean|Treat query as regex|
|`context_lines`|no|number|Lines of context per match|
|`limit`|no|number|Max results|

### get_file_content - cached content reads

|Param|Req|Type|Notes|
|-|-|-|-|
|`repo`|yes|string|Repository identifier|
|`path`|yes|string|File path within indexed repo|
|`start_line`|no|number|0-based slice start|
|`end_line`|no|number|Inclusive slice end|

Non-indexed file -> `File not found` + verdict (never silent).
