# SERENA Schemas - atom-kernel

Serena tool parameter tables + examples. Pure reference - loaded via pointer from atom-kernel SKILL.md §Tool Schemas. All paths relative to project root. Symbol address = name path (file-local symbol tree, e.g. `MyClass/my_method`; overloads append `[i]`).

**Availability**: LSP per `.serena/project.yml` `languages`; missing LSP -> symbol tier unavailable, use FS tier silently. LSP initializes at server start.

## Navigation

### find_symbol - find by name path pattern

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

### find_declaration - declaration lookup from call site

`find_declaration({relative_path, regex, containing_symbol_name_path?})` - regex with EXACTLY ONE group matching the symbol; Python syntax, MULTILINE+DOTALL. Example: `{"relative_path": "src/app.ts", "regex": "obj\\.(process)\\(process_input_arg=37\\)"}`

### find_referencing_symbols - cross-file references

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol name path|
|`relative_path`|yes|string|File containing the symbol. External deps: `<ext` identifier - never guess|
|`include_kinds`/`exclude_kinds`|no|number[]|LSP kind filters|
|`max_answer_chars`|no|number|-1 default|

Example: `{"name_path": "Order/process", "relative_path": "src/order.ts"}`

### find_implementations - interface/abstract impls

`find_implementations({name_path, relative_path, include_info?, include_kinds?/exclude_kinds?, max_answer_chars?})` - `relative_path` is a FILE, not directory. Example: `{"name_path": "Repository", "relative_path": "src/repository.ts"}`

### get_symbols_overview - file structure first read

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to overview|
|`depth`|no|number|Descendants depth. Default 0|
|`max_answer_chars`|no|number|-1 default. Don't adjust unless forced|

Example: `{"relative_path": "packages/graph-scheduler/src/fsm-transition.ts", "depth": 1}`

### get_diagnostics_for_file - LSP errors/warnings

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to inspect|
|`start_line`/`end_line`|no|number|0-based range. end -1 = EOF|
|`min_severity`|no|number|1=Error ... 4=Hint|
|`max_answer_chars`|no|number|

Example: `{"relative_path": "src/app.ts", "min_severity": 2}`

### search_for_pattern - regex across project

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

### find_file - file mask lookup

`find_file({file_mask, relative_path})` - mask with `*`/`?`; `"."` = project root. Example: `{"file_mask": "*.yaml", "relative_path": "packages/graph-scheduler/graphs"}`

### list_dir - directory listing

`list_dir({relative_path, recursive?, skip_ignored_files?})` - gitignore-aware by default. Example: `{"relative_path": "packages/graph-scheduler", "recursive": true}`

## File read

#### read_file - sliced file read

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to read|
|`start_line`/`end_line`|no|number|Line range; end -1 = EOF|
|`max_answer_chars`|no|number||

Sliced reads preferred over whole-file. No LSP required - covers all languages.

Example: `{"relative_path": "src/app.ts", "start_line": 50, "end_line": 200}`

## Editing

### replace_content - pattern replace in file

|Param|Req|Type|Notes|
|-|-|-|-|
|`relative_path`|yes|string|File to edit|
|`needle`|yes|string|Search string or regex|
|`repl`|yes|string|Replacement verbatim; `$!1` backrefs in regex mode|
|`mode`|yes|`"literal"` \| `"regex"`|Interprets needle|
|`allow_multiple_occurrences`|no|boolean|false + multiple matches = error (safe retry signal)|

Preferred edit tool. Regex mode with wildcards = economical for large spans: `beginning.*?end` form. Match ambiguity = error, revise needle, retry.

Example: `{"relative_path": "src/app.ts", "needle": "TODO.*?FIXME", "repl": "FIXED", "mode": "regex"}`

#### replace_in_files - multi-file replace (one call)

|Param|Req|Type|Notes|
|-|-|-|-|
|`needle`|yes|string|Search string or regex|
|`repl`|yes|string|Replacement verbatim; `$!1` backrefs in regex mode|
|`mode`|yes|`"literal"` \| `"regex"`|Interprets needle|
|`relative_path`|no|string|Restrict to file/subdir|
|`paths_include_glob`/`paths_exclude_glob`|no|string|Glob restrict/exclude; exclude wins|
|`dry_run`|no|boolean|Preview with occurrence ids - no write|
|`occurrence_ids`|no|string[]|Select occurrences from dry-run|
|`expected_count`|no|number|Guard: mismatch -> error|
|`max_answer_chars`|no|number||

Multi-file surgical replace in ONE call. Dry-run preview + expected_count guard = safe bulk edits.

Example: `{"needle": "legacyCall\\(\\)", "repl": "modernCall()", "mode": "regex", "paths_include_glob": "src/**/*.ts", "dry_run": true}`

### replace_symbol_body - body swap

|Param|Req|Type|Notes|
|-|-|-|-|
|`name_path`|yes|string|Symbol to replace|
|`relative_path`|yes|string|Containing file|
|`body`|yes|string|New full definition incl. signature line|

PRECONDITION: prior retrieval with `include_body: true` - never blind body replace.

Example: `{"name_path": "Order/process", "relative_path": "src/order.ts", "body": "process(input: Input): Output {\n  return transform(input);\n}"}`

### rename_symbol - codebase-wide semantic rename

`rename_symbol({name_path, relative_path, new_name})`. Example: `{"name_path": "Order/process", "relative_path": "src/order.ts", "new_name": "handle"}`

### insert_before_symbol / insert_after_symbol

`insert_before_symbol/insert_after_symbol({name_path, relative_path, body})` - anchor symbol; import insert = before first symbol. Example (after): `{"name_path": "Order/process", "relative_path": "src/order.ts", "body": "validate(input: Input): void {}"}`

### safe_delete_symbol - reference-checked delete

`safe_delete_symbol({name_path_pattern, relative_path})` - deletes only when zero references; else returns reference list. Example: `{"name_path_pattern": "Order/deprecatedHelper", "relative_path": "src/order.ts"}`

### create_text_file - new file

`create_text_file({relative_path, content})` - creates/overwrites. Example: `{"relative_path": "src/lib.ts", "content": "export const VERSION = 1;\n"}`
