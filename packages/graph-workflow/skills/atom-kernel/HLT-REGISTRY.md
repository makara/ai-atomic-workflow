# HLT Registry - atom-kernel

High-Level Tool Registry - rule-first adapter resolution. Pure reference - loaded via pointer from atom-kernel SKILL.md §High-Level Tool Registry. Execution contract: registered tool call `{ intent, tool, args, bound }`; caller chooses tool + args; the entry supplies I/O contract, chain, obligations + n/a rules.

## Core Requirement

The distilled must-follow contract (single source — byte-equal to the atom-kernel hot surface box; the graph-fidelity resident block carries a compressed copy). Distillation judgment: load-bearing = violation cost × frequency — the rest of this file is operational detail.

```text
HLT core requirement (must-follow on every call):
- State-changing work executes as registered calls {intent, tool, args, bound} — declared scope, no overreach
- In-project code → serena (locate may route through jcodemunch); single engine, no fallback
- Verify after every write (verify-after-write)
- Code cells fail loudly — never silent degrade
- Registered tool capability is never restricted (deny covers redundant platform paths only)
- Detail: HLT-REGISTRY.md (cold-read)
```

## Adapter Rule

The adapter for an HLT registered call is resolved by **one static rule** - target domain decides the adapter family, operation decides the chain:

|Target domain|locate|read|write|verify|run|compress|review/archive/graph-ops/register_edit|
|-|-|-|-|-|-|-|-|
|in-project code|jcodemunch → serena|serena|serena|serena|—|—|—|
|in-project text-indexed|jcodemunch|platform-native (permissive)|platform-native (permissive)|platform-native (permissive)|—|—|—|
|in-project text-unindexed / special / out-of-project|platform-native (permissive)|platform-native (permissive)|platform-native (permissive)|platform-native (permissive)|—|—|—|
|run|—|—|—|—|shell|—|—|
|compress|—|—|—|—|—|headroom (DISABLED — R2, ADR 0175)|—|
|utility|—|—|—|—|—|—|platform-native (permissive)|

- Target domain: in-project code (LSP/index-covered source); in-project text - indexed (yaml/toml/json/OpenAPI/Ansible) vs unindexed (markdown/plain); in-project special (sqlite/image/PDF/archive/notebook/non-UTF-8); out-of-project; run; compress.
- One adapter per cell - no fallback, no judgment surface. In-project code keeps the two-plane chain (jcodemunch query head + serena mutation sole). Permissive cells have no mandatory adapter.
- n/a rules name the structural cause: `not indexed`, `project-root-bound`, `no LSP coverage`, `proxy down`.

## Operation Obligations

Every operation class carries its obligations regardless of adapter (single home):

|operation|obligations|failure|
|-|-|-|
|locate|two-plane chain on code; index metadata consumed, not fabricated|loud (code) / pass (permissive)|
|read|read chain (structural overview → sliced reads)|loud (code) / pass (permissive)|
|write|preflight + verify after write + `register_edit` while jcodemunch in use and target indexed (`n/a: not indexed` otherwise)|loud (code) / pass (permissive)|
|verify|evidence-only - verification of a prior write|degrade|
|run|platform shell (`bash`, rtk prefix per project constraints)|pass|
|compress|DISABLED — R2 cost economy suspended (ADR 0175); headroom contract (class-driven unconditional + protection list below) retained as redesign reference|degrade|
|review|evidence-only (review findings over declared inputs)|degrade|
|archive|evidence-only (archive/estate closure)|degrade|
|graph-ops|reach: run (graph lifecycle tools)|degrade|
|register_edit|jcodemunch cache invalidation after edits|degrade|

Evidence loop: the tool's evidence rules drive the read loop; re-enter while unsatisfied AND count < bound (default 3, per-call override); exceeded → call FAILS with evidence-gap list, no write. Cross-call rework = graph gates (atom-graph-spec) - never unbounded call-internal loops.

## Fault Tolerance

- **Adapter-down semantics**: the cell's designated adapter unavailable (server down, unindexed, proxy unreachable) → the call fails loudly naming the adapter + reason. Scope is the cell - never silent degrade, never cross-adapter fallback. Permissive cells have no mandatory adapter.
- Locate failure: retry once within the cell's adapter → still failing: fail loudly with error + evidence-gap list. Never silent skip, never unbounded blind retry.
- LSP index lag (fresh files): symbol locate may fail right after create - the ground-truth confirmation retries; the query-plane locate may report low freshness - consume the metadata, do not fabricate certainty.
- Index staleness window: reads of just-created files may lag the index - the read flow's locate step degrades to mutation-plane overview-first reads when the index has no entry.
- Visibility: the tool's declared I/O is checked at analyze against the accessible tree. Gitignored/invisible paths (serena refuses them for safety) → rejected at analyze with visibility error naming the path. Never discovered mid-call.
- Tier availability: per-tier precondition (e.g. LSP coverage per language) gates the intra-serena tier; precondition false → use the serena FS tier. Serena itself unavailable → in-project code cells fail loudly.

## Protocol

1. **Schema-first.** Parameter names NEVER guessed. Contract entry covers tool → use it. No entry → read the platform's full tool docs before first call. Docs win over this contract on mismatch.
2. **Required fields always present.** Missing required param = validation error = failed call. Check contract table before writing args.
3. **Failure recovery.** Validation error → read full tool docs → repair args → retry ONCE. Still failing → degrade within the entry's chain (serena FS tier within the in-project domain; utility: declared n/a). Never blind-guess loops.
4. **Cache consistency.** After any file edit → `jcodemunch register_edit` while the index is mounted **and the target is indexed**; unindexed target → `n/a: not indexed`.
5. **Unused fields omitted.** Optional params pass only when needed. Keep args minimal.
6. **Legacy shape rejected.** Legacy 8-field protocol fields (`read_set`, `evidence`, `write_set`, `apply`, `verify`) are REJECTED - a registered call carries exactly `{ intent, tool, args, bound }`.

**DISABLED — R2 cost economy suspended (ADR 0175). Reference for redesign.** Context-usage contract: class-driven unconditional submission — working-face tool results are submitted to headroom compression by signal class, no size thresholds, no budget gates (the engine's router arbitrates no-op; user directive 5d; REVISED 2026-08-14 by change graph-fidelity-round5cd-notify-classification, replacing the former thresholds JSON >2000 tok / code+logs >8KB / text >8KB); protection: reference-face, task-receipts, skill-injection, node-outputs, decisions, write-results; CCR retrieve-by-hash, TTL-unused = single-consumption; gate ok/cold/down.

**Discipline**: signal distribution - the run frame (assembled by the handler at dispatch) is the single out-of-scope channel; TTSR static rules are platform-native in-band reminders. Guidance is advisory; registered capability never restricted (redundant platform write paths may be denied).

## headroom

> **DISABLED — R2 cost economy suspended (ADR 0175). Reference for redesign.**

Context compression - ad-hoc output + read-file compression (class-driven unconditional: submission by signal class, no size thresholds, no budget gates; the engine's router arbitrates no-op — user directive 5d; REVISED 2026-08-14 by change graph-fidelity-round5cd-notify-classification). Contract platform-neutral (headroom-ai upstream); platform deployment forms are instances. Channel consumption follows the read entry chain - no pipeline. Kept verbatim as the redesign contract record — no runtime consumer while suspended.

|Tool|Req params|Notes|
|-|-|-|
|`compress`|`content` (string)|Returns compressed text + hash. Original stored|
|`retrieve`|`hash` (string)|Restore original by hash|
|`stats`|-|Session compression stats|

**Hash contract**: `compress` returns a hash - `headroom_retrieve(<hash>)` restores the original while the store holds it (TTL = HEADROOM_CCR_TTL_SECONDS, default 1800s session-scale). Retrieval is on-demand: a downstream phase needing original detail retrieves by hash; a hash unused until TTL expiry is single-consumption - no error, no re-compression obligation.

**Protection list** (never compress, never clean): reference-face content (skills, convention files, task text, constraints/run-mode blocks), task() sub-agent results, skill injection results, node outputs and approval/gate decisions, write-operation results. Compression and cleaning apply to working-face content only (volatile tool outputs, stale reads).

**Health gate**: `ok` / `cold` (honest 0%) / `down` - markers `[HEADROOM COLD]` / `[HEADROOM DOWN]` (engine-fault marker when the MCP server backend is unreachable — the proxy deployment is deleted). `down` never fails the node - the node proceeds uncompressed, and the state is recorded (platform events where available; contract check blocks otherwise).

**History-cleaning clauses** (platform adapters implement; agent follows, observability records): nested compression summaries (new summary nests old - information not diluted); stale cleanup (same-args repeats keep latest; errored inputs purged after N turns; superseded reads cleanable); placeholder replacement never mutates session history; protected content enters summaries verbatim.

---

# Platform Spellings

Primitive contracts platform-neutral. Mappings vary per platform - never assumed exact. Skills reference contract names only.

|Primitive|Contract|Mapping|
|-|-|-|
|`task()`|Sub-agent dispatch - batch in `tasks[]`, shared `context`, agent-hint selection|platform's sub-agent dispatch tool|
|`judge()`|One-shot lightweight-model judgment - constrained answer (`'true'`/`'false'`), conservative failure|platform's one-shot completion primitive|
|`approval()`|Mode-aware single decision - header/options/custom + recommendation/rationale; manual/absent/no-recommendation -> decision card, auto + recommendation -> execute it (recorded)|platform's decision-UI tool (card branch)|
|`interview()`|Confirmation conversation - explicit participation (mandatory \| as-needed), turns via approval() without recommendation|agent-implemented using approval() turns|
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
