# HLT Registry - atom-kernel

High-Level Tool Registry entries - views contract/chain/scenario per entry (+ enforcement deferred). Pure reference - loaded via pointer from atom-kernel SKILL.md §High-Level Tool Registry. Execution contract: registered tool call `{ intent, tool, args, bound }`; caller chooses tool + args; entry supplies I/O contract, chain, obligations + n/a rules.

## Scenario structure

Registry key = **scenario** `(target domain x operation)` -> exactly one adapter + chain + obligations + n/a rules. One-adapter rule per scenario - no fallback, no judgment surface. Target domains:

- **In-project code** - LSP/index-covered source files (70+ jcodemunch languages, serena LSP).
- **In-project non-code text** - UTF-8 text, two subtypes: **indexed** (yaml/toml/json/OpenAPI/Ansible - jcodemunch dict-walkers) vs **unindexed** (markdown/plain text - never indexed). Read/write are **permissive cells**: platform-native is the adapter, never denied; serena/jcodemunch remain available.
- **In-project special types** - sqlite/image/PDF/archive/notebook/non-UTF-8 - serena/jcodemunch structurally cannot serve; platform-native read is the only capable adapter.
- **Out-of-project** - any path outside project root, any type - serena project-root-bound, jcodemunch repo-indexed; platform-native read/write passthrough.
- **Run** - arbitrary shell.
- **Compress** - headroom-ai platform-neutral contract.

Domain chains: in-project code keeps the two-plane chain (jcodemunch query head + serena mutation sole) - demoted from global mandate to this domain's chain. In-project text: platform-native read/write (permissive) + jcodemunch locate for indexed subtypes. Obligations travel with the scenario row - never inherited from another domain's default. n/a rules name the structural cause (`not indexed`, `project-root-bound`, `no LSP coverage`, `proxy down`).

## Evidence Loop

- The tool's evidence rules drive the read loop; the loop re-enters while unsatisfied AND loop count < bound (default 3, per-call override allowed).
- Predicate satisfied -> proceed to reason.
- bound exceeded -> call fails with the evidence-gap list (missing files/symbols); no write applied. Graph layer routes rework on the gap list.
- Loop layering: call-internal = this contract, bounded; cross-call rework = graph gates (atom-graph-spec) - never unbounded call-internal loops.

## Fault Tolerance

- **Adapter-down semantics**: the scenario's designated adapter unavailable (server down, unindexed, proxy unreachable) -> the scenario call fails loudly naming the adapter + reason. Scope is the scenario - never silent degrade, never cross-adapter fallback. Permissive cells (non-code text read/write) have no mandatory adapter.
- Locate failure: retry once within the scenario's adapter -> still failing: call fails loudly with error + evidence-gap list. Never silent skip, never unbounded blind retry.
- LSP index lag (fresh files): symbol locate may fail right after create - the ground-truth confirmation retries; the query-plane locate may report low freshness - consume the metadata, do not fabricate certainty.
- Index staleness window: reads of just-created files may lag the index - the read flow's locate step degrades to mutation-plane overview-first reads when the index has no entry.
- Visibility: the tool's declared I/O is checked at analyze against the accessible tree. Gitignored/invisible paths (serena refuses them for safety) -> rejected at analyze with visibility error naming the path. Never discovered mid-call.
- Tier availability: per-tier precondition (e.g. LSP coverage per language) gates the intra-serena tier; precondition false -> use the serena FS tier. Serena itself unavailable -> in-project scenarios fail loudly.

## Protocol

1. **Schema-first.** Parameter names NEVER guessed. Contract entry covers tool -> use it. No entry -> read the platform's full tool docs before first call. Docs win over this contract on mismatch.
2. **Required fields always present.** Missing required param = validation error = failed call. Check contract table before writing args.
3. **Failure recovery.** Validation error -> read full tool docs -> repair args -> retry ONCE. Still failing -> degrade within the entry's chain (serena FS tier within the in-project domain; utility: declared n/a). Never blind-guess loops.
4. **Cache consistency.** After any file edit -> `jcodemunch register_edit` while the index is mounted **and the target is indexed** (mutation obligation - §Entry: register_edit); unindexed target -> `n/a: not indexed`.
5. **Unused fields omitted.** Optional params pass only when needed. Keep args minimal.
6. **Legacy shape rejected.** Legacy 8-field protocol fields (`read_set`, `evidence`, `write_set`, `apply`, `verify`) are REJECTED - a registered call carries exactly `{ intent, tool, args, bound }`.

## Registry Entries

Every entry has three views (enforcement deferred per-entry):

|View|Carries|
|-|-|
|`contract`|Declared I/O, obligations, n/a rules|
|`chain`|Execution order - the scenario's designated adapter; in-project code: two-plane chain; in-project text: platform-native (permissive) + jcodemunch locate for indexed; special types/out-of-project: platform-native; run: platform shell; compress: headroom-ai; utility: declared tools with n/a rules|
|`scenario`|Target domain x operation key - `in-project code` / `in-project non-code text (indexed|unindexed)`/`in-project special`/`out-of-project`/`run`/`compress`/`utility`|

**Enforcement**: deferred per-platform (all entries; per-platform allowed/denied/mandatory sets recorded now, implementation deferred until adaptation modules ship); n/a where evidence-only (verify, compress, archive, graph-ops, register_edit).

Registry validation: every entry has all three views (enforcement deferred); each scenario key has exactly one adapter - zero or multiple adapters per cell = validation error (permissive cells excepted). In-project-code chains SHALL keep the two-plane shape (jcodemunch locate head + serena ground-truth; serena sole mutator). Indexed-target entries SHALL carry the register_edit obligation; unindexed/out-of-project entries SHALL declare `n/a: not indexed`. Adapter unavailable -> loud failure (see Fault Tolerance).

### Entry: locate

- **scenario**: in-project code x locate (jcodemunch head + serena ground-truth); in-project non-code text x locate (indexed: jcodemunch; unindexed: serena search_for_pattern); out-of-project x locate (platform-native search)
- **contract**: target (symbol/pattern/path) -> candidates with file:line + confidence/freshness; no writes
- **chain**: in-project code: jcodemunch index (`search_symbols`, `find_references`, `check_references`, `get_blast_radius`, `plan_turn`, `check_edit_safe`, `check_delete_safe`, `get_impact_preview`) - repository-scale, all languages, gitignore-aware -> serena ground-truth confirmation (`find_symbol`, `find_referencing_symbols`, `find_implementations`, `find_declaration` - LSP) - confirm critical candidates BEFORE mutation; mismatch stops the mutation. In-project text indexed: jcodemunch `search_symbols`/`search_text`/`get_file_content` -> platform-native read (permissive; parameter tables: see JCODEMUNCH-SCHEMAS.md; `search_text`/`get_file_content` compact tables included). In-project text unindexed: serena `search_for_pattern` (project-internal regex, FS tier); jcodemunch `n/a: not indexed`. Out-of-project: platform-native search; serena `n/a: project-root-bound`, jcodemunch `n/a: not indexed`

### Entry: read

- **scenario**: in-project code x read (serena); in-project non-code text x read (platform-native, permissive cell); in-project special types x read (platform-native); out-of-project x read (platform-native)
- **contract**: path/symbol -> sliced content; no writes; result >8KB compressed before reasoning (compress entry)
- **chain**: unknown target -> Entry: locate first; in-project code: serena `get_symbols_overview` (structural, zero content I/O) -> serena `read_file` (line selectors) -> unavoidable >8KB -> `headroom_compress`, hash retained. In-project text: platform-native read (permissive cell; serena/jcodemunch remain available). Special types: platform-native read (sqlite selectors, archive members, image, PDF, notebook dispatch); serena `n/a: UTF-8 text only`, jcodemunch `n/a: not indexed`. Out-of-project: platform-native read (absolute-path passthrough); serena `n/a: project-root-bound`, jcodemunch `n/a: not indexed`

### Entry: write

- **scenario**: in-project code x write (serena sole); in-project non-code text x write (platform-native, permissive cell); out-of-project x write (platform-native)
- **contract**: target + new content; verify + registration obligations per scenario
- **chain**: in-project code: symbol-level (body replace / rename / insert / safe delete) -> serena LSP tools (`replace_symbol_body`, `rename_symbol`, `insert_*_symbol`, `safe_delete_symbol`; precondition: LSP covers language); surgical text -> serena `replace_content` (single file, ambiguity-guarded) / `replace_in_files` (multi-file, dry-run + expected_count guarded); new file -> serena `create_text_file` (diagnostics-wrapped). In-project text: platform-native write (permissive cell; serena FS tools `replace_content` / `replace_in_files` / `create_text_file` remain available); symbol tools `n/a: no symbols`. Out-of-project: platform-native write; serena `n/a: project-root-bound`, jcodemunch `n/a: not indexed`
- **obligations**: query-plane preflight BEFORE mutation (edit/delete legs: `check_edit_safe`/`get_blast_radius` before edits, `check_delete_safe`/`get_impact_preview` before deletes - in-project code only; atomic-step-flows rule - no step skipped); verify loop after every write (Entry: verify); register_edit per §Entry: register_edit (mutation obligation on indexed targets)

### Entry: verify

- **scenario**: in-project code x verify (serena diagnostics + re-read); in-project non-code text x verify (re-read only)
- **contract**: written files -> diagnostics result + re-read confirmation - machine-parseable facts for downstream gates; register_edit obligation per §Entry: register_edit
- **chain**: in-project code: serena `get_diagnostics_for_file` (min_severity 1, LSP-covered languages) -> re-read the changed region (serena `read_file` - confirm applied state). In-project text: serena `read_file` re-read of the changed region; diagnostics `n/a: no LSP coverage`

### Entry: compress

- **scenario**: compress (any domain) - headroom-ai platform-neutral contract
- **contract**: content >8KB -> compressed text + hash (retrievable via `headroom_retrieve`); TTL = HEADROOM_CCR_TTL_SECONDS (default 1800s session-scale). Tool contract: §headroom (single home)
- **chain**: `headroom_compress` (MCP) -> hash; honest 0% fallback with `[HEADROOM COLD]`; backend unreachable -> `n/a: [HEADROOM PROXY DOWN]` (deployment-fault marker)

### Entry: review

- **scenario**: utility - optional; use case: structured review reports (diff/scope -> findings). Analytics query-plane-owned (jcodemunch charter; serena has no aggregation - never forced)
- **contract**: diff/scope -> structured report
- **chain**: jcodemunch analytics (`get_repo_health` / `get_pr_risk_profile` / `get_dependency_cycles` / `find_dead_code` / `get_hotspots`) -> serena evidence reads -> sub-agent review dispatch (§Agent Hints) aggregating evidence; unindexed target -> `n/a: not indexed`

### Entry: run

- **scenario**: run (platform shell)
- **contract**: command -> result; rtk prefix per project constraints
- **chain**: platform shell (`bash`) - project cwd, stdout/stderr captured - rtk prefix preserved

### Entry: archive

- **scenario**: utility - optional; use case: OpenSpec change lifecycle. Serena has no openspec capability - boundary declared
- **contract**: change name -> archive_status
- **chain**: openspec CLI (`openspec archive`); `n/a: openspec CLI unavailable` - never silent

### Entry: graph-ops

- **scenario**: utility - optional; use case: graph-scheduler lifecycle. Serena has no scheduler integration - boundary declared
- **contract**: graph-scheduler MCP call -> snapshot/node
- **chain**: detected graph-scheduler MCP tools (§Graph-Scheduler Tool Detection) -> schema-first per atom-pilot SKILL.md §MCP Reference

### Entry: register_edit

- **scenario**: mutation obligation on indexed targets (in-project code + indexed non-code-text subtypes) - unconditional while index mounted; query-plane cache consistency. Never part of a write chain
- **contract**: edited file paths -> registration result
- **chain**: jcodemunch `register_edit` (repo indexed); `n/a: jcodemunch not in use` / `n/a: repo unindexed` / `n/a: not indexed` (unindexed target) - never silent
- **params + notes**: JCODEMUNCH-SCHEMAS.md §register_edit (single home)

---

## headroom

Context compression - ad-hoc output + read-file compression (trigger: >8KB). Contract platform-neutral (headroom-ai upstream); platform deployment forms are instances. Channel consumption follows the read entry chain - no pipeline.

|Tool|Req params|Notes|
|-|-|-|
|`compress`|`content` (string)|Returns compressed text + hash. Original stored|
|`retrieve`|`hash` (string)|Restore original by hash|
|`stats`|-|Session compression stats|

**Hash contract**: `compress` returns a hash - `headroom_retrieve(<hash>)` restores the original while the store holds it (TTL = HEADROOM_CCR_TTL_SECONDS, default 1800s session-scale).

**Health gate**: `ok` / `cold` (honest 0%) / `down` - markers `[HEADROOM COLD]` / `[HEADROOM PROXY DOWN]` (deployment-fault marker when the MCP server backend is unreachable).

---

# Platform Spellings

Primitive contracts platform-neutral. Mappings vary per platform - never assumed exact. Skills reference contract names only.

|Primitive|Contract|Mapping|
|-|-|-|
|`task()`|Sub-agent dispatch - batch in `tasks[]`, shared `context`, agent-hint selection|platform's sub-agent dispatch tool|
|`judge()`|One-shot lightweight-model judgment - constrained answer (`'true'`/`'false'`), conservative failure|platform's one-shot completion primitive|
|`approval()`|Mode-aware single decision - header/options/custom + recommendation/rationale; manual/absent/no-recommendation -> decision card, auto + recommendation -> execute it (recorded)|platform's decision-UI tool (card branch)|
|`interview()`|Multi-turn consensus conversation - single contract, two modes (consensus / solve), turns via approval() without recommendation|agent-implemented using approval() turns|
|`todo()`|State-machine task list - pending/in_progress/completed; boundary clear at execution-unit boundaries; no-todo platform -> no-op|platform's todo tool|

# judge() - One-Shot Judgment

Single constrained-answer LLM judgment per call - gate jump condition evaluation.

```
judge({ prompt }) -> 'true' | 'false'
```

- `prompt` - evaluation question. MUST demand constrained answer: `Answer ONLY 'true' or 'false'`.
- Returns single token answer; anything else -> conservative default per caller context.

|Caller|Failure default|Rationale|
|-|-|-|
|gate eval (jump conditions)|`'false'` - no-match|Never auto-decide on uncertainty (falls through to downstream)|

Maps to platform's one-shot completion primitive.

# todo() - Boundary Clear

Clear the platform todo list at execution-unit boundaries - per-execution scratchpad, never session-persistent. In-node create/update stays native platform tooling; skills reference the `todo()` contract.

- **Semantics**: unconditional clear. No-todo platform -> no-op, no error.
- **State machine**: pending -> in_progress -> completed (+ optional blocked/cancelled) - state-machine semantics + per-platform spellings in §Platform Spellings; the contract is the state machine, never the op names.
- **Consumer**: atom-phase-handler enforces the node-boundary lifecycle (dispatch + completion clears) - the only caller.
