# `agentic-graphjs`

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../docs/readme-blueprint.md) instead. **Languages**: English (this file) · [中文](README.zh-CN.md)

**Graph engineering for agents** — a framework you can drive with any agent, riding as a pure graph runtime inside the session.

> Independent implementation: built from public documentation and behavior only; not affiliated with LangChain.

## Table of Contents

- [What it is](#what-it-is)
- [Why](#why)
- [How it works](#how-it-works)
- [What it is not](#what-it-is-not)
- [Relationship to LangGraph](#relationship-to-langgraph)
- [Faces (exports)](#faces-exports)
- [Ports (seven tokens)](#ports-seven-tokens)
- [Refusal codes (twelve)](#refusal-codes-twelve)
- [Compatibility matrix](#compatibility-matrix)
- [Conventions](#conventions)
- [Further reading](#further-reading)

## What it is

A framework for engineering agent workflows as graphs. You author graphs as declarative assets (state, nodes, flow); the runtime drives **any agent** through them super-step by super-step — issuing tasks, taking results back, and writing one checkpoint per step.

- **For any agent** — the executor is the agent itself: bring your own (Claude Code, Codex, a custom loop, or a human), or build one. The runtime is protocol-agnostic; the host renders each task in the agent's own language.
- **Pure runtime** — zero I/O, zero execution. Nodes are stubs that declare _what is wanted_; the agent does the work; the runtime keeps the ledger.
- **Isomorphic concepts** — channels, reducers, super-steps, tasks, checkpoints, interrupts: the LangGraph vocabulary, with three explicit differences.

## Why

LangGraph is excellent — but it is built for servers. You deploy a process, your nodes call models and tools, and the state lives in that service. An agent flips the assumption: **the agent is the execution environment**. It holds the tools, the model, and a session that gets interrupted, compacted, and resumed. What an agent needs is not a server to call, but a **driver deeply integrated with the agent**: the graph rides inside the session, the agent does the work, and the ledger survives restarts.

Three consequences become the design:

1. **The executor is the agent.** Nodes are stubs — work the agent cannot see does not exist.
2. **Context is scarce.** Each task projection carries exactly what the step needs — nothing more.
3. **Sessions end.** Every super-step is a checkpoint; replay is byte-identical; `rewind` returns to any step and continues from its frontier.

## How it works

1. **Bind** — create a runtime from seven ports: `checkpointer`, `context`, `graphs` (required) plus `judge`, `store`, `writer`, `logger` (optional). Ports are plain objects; an Awilix convenience face is included, never required.
2. **Take / report** — `take({ graph })` issues tasks; the agent settles each one with `report(...)`. Every super-step lands one checkpoint.
3. **Rewind / inspect** — `history()` · `getState()` · `status()` · `boundGraph()` read the ledger; `rewind({ to, retained })` returns to any step and continues.

```ts
import { createMemoryLog, createMemorySaver, createRuntime } from 'agentic-graphjs';

const runtime = createRuntime({
  checkpointer: createMemorySaver({ log: createMemoryLog(), identity, clock }),
  context: { threadId: 't' },
  graphs,
});
const taken = await runtime.take({ graph: 'first-principles' });
if (taken.kind === 'issued') {
  await runtime.report({
    graph: 'first-principles',
    taskId: taken.tasks[0].id,
    outcome: 'succeeded',
    key: 'complete',
    result: '…',
  });
}
```

Two runnable examples (`bun run example`) drive the same graph through both registration faces — `examples/memory-e2e.ts` (functional) and `examples/awilix-e2e.ts` (Awilix convenience); the package tests assert their transcripts equal.

## What it is not

Not an executor (it runs nothing) · not a server · not an asset format · not a tool layer · not an agent protocol (task rendering belongs to the host) · requires no container or assembly framework.

## Relationship to LangGraph

Concept-isomorphic; three explicit differences: no storage-forced saver (your `checkpointer` decides) · no parallel fork (single-chain ledger) · no ecosystem-coupled surfaces (models / tools / Platform / Studio). The full matrix is below.

## Faces (exports)

The root face is the contract face: entry, seven-method runtime, build face, interrupt face, refusal face, in-memory port implementations, and the port table. The machinery face rides `agentic-graphjs/internal` for in-repo consumers and package tests — its full list lives in `docs/api.md`.

|Export|Shape|Role|
|-|-|-|
|`createRuntime`|`(deps: RuntimeDeps) → Runtime`|Entry: resolves capabilities, binds the seven methods; a missing required capability refuses|
|`Runtime` seven methods|`take` / `report` / `rewind` / `history` / `getState` / `status` / `boundGraph`|Plan (`Task[]` — `issued` / `unserved` / `rejected`) · settlement (key check → judge → route → channel write → one checkpoint per super-step) · rewind · chain face · minimal view · read-only view (ledger rebuild; receipts not yet settled + artifact refs) · bound read point (`boundGraph` reads the graph name of the chain's latest step; a single read point; unbound = `undefined`, an empty view — not an error)|
|`StateGraph` / `Annotation` / `Command`|Build face|Channel and node declaration · compile · resume command|
|`START` / `END` / `IR_VERSION` / `validateGraph`|Constants + validation|Explicit endpoints · IR version · compile-time validation|
|`interrupt` / `Suspended` / `GraphBuildError`|Interrupt / build-error face|Node-stub suspension point and payload · build error code|
|`runtimeContainer` / `runtimeRegistrations`|Awilix convenience face|`Resolver` output, row-for-row with `PORTS` (seven tokens · lifetime advice)|
|`PORTS`|Seven-token table|Token / requiredness / default / lifetime advice|
|`createMemoryLog` / `createMemorySaver`|Port implementations|In-memory checkpointer (`MemorySaverPorts`: `log` / `identity` / `clock`)|
|`REFUSALS` / `REFUSAL_CODES` / `refuse`|Table + constructor|Twelve-code refusal face · payload `{code, note, keys?}`|

## Ports (seven tokens)

|Token|Required|Lifetime|Default|
|-|-|-|-|
|`checkpointer`|yes|Per call (state provider)|—|
|`context`|yes|Per call|Empty object|
|`graphs`|yes|Singleton|—|
|`judge`|no|`scoped` (one per super-step, disposed at the super-step boundary; same-name re-entry reuses the instance)|Mechanical default: single-key steps take that key; multi-key steps without `judge` ⇒ `infra` (a missing-port channel, not a design code)|
|`store`|no|Singleton|No cross-run memory|
|`writer`|no|Per call|No increment face|
|`logger`|no|Per call|Silent (emission is an observation face: it changes neither routing nor results)|

## Refusal codes (twelve)

|Code|Meaning|Next step|
|-|-|-|
|`BAD_CALL`|The call does not fit the tool's single shape|Re-issue against the tool's one shape (the schema is the shape)|
|`CAPABILITY_MISSING`|The runtime lacks that capability (a port a read face needs was never registered)|Register the port the runtime needs, then re-issue the same call|
|`GRAPH_UNREADABLE`|The graph name loads as no document|Take a name from the available-graph table the answer carries|
|`STRUCTURE_DRIFT`|The bound graph's structure no longer matches the ledger (asset axis)|Rebind on a fresh thread, or restore the asset|
|`NO_OUTSTANDING_TASK`|No outstanding task on the lane|`take` first|
|`KEY_UNDECLARED`|The reported key is not one the node declares|Report a declared one (the payload carries the declared key set)|
|`KEY_UNMATCHED`|The reported key matches none of the node's declared routes|Take one of the candidate keys the answer carries|
|`SETTLEMENT_UNANCHORED`|The report carries neither result text nor a resolving pointer|Re-report with the result and the pointers that back it|
|`TASK_AMBIGUOUS`|Several tasks are in flight and no taskId was given|Name the task in taskId and report again|
|`CHECKPOINT_UNKNOWN`|The checkpoint id is not on the current chain|Take a legal id from `history()`|
|`infra`|An engine-side state the caller cannot act on (missing port, key-set drift, fold failure)|Fix the engine side, then re-issue the same call|
|`input-missing`|The `take` input lacks a key the graph's `input` declares|Fill the input key, or change the graph's declaration|

## Compatibility matrix

Levels: **T1** = same name, same meaning · **T2** = same name, reduced semantics (declared subset) · **T3** = explicitly not provided; this table is the mapping authority.

**T1 — isomorphic (same name, same meaning)**

|LangGraph|This module|
|-|-|
|`StateGraph` / `Annotation`|Asset `state:` block → `channels` (declaration lives in the asset)|
|`addNode` / `addEdge` / `addConditionalEdges`|`nodes` / `flow:` arrows / per-key conditional rows (`map` derivation)|
|reducers|`replace` / `append` / `merge` (`append` carries structural dedup)|
|`BaseCheckpointSaver`|`CheckpointSaver` (state provider — "derive or store" is the implementation's call)|
|`Checkpoint` / `CheckpointTuple`|Same names (including `parentConfig` parent chain)|
|`thread_id` / `configurable`|`RuntimeContext.threadId`|
|`Task`|`Task`|
|`interrupt` / `Command(resume)`|Node stubs + `take` / `report`|
|`Runtime.writer`|`WriterPort`|
|`BaseStore`|`StorePort` (optional)|
|`getState` / `getStateHistory`|`getState` / `history` / `boundGraph` (the bound read point joins the chain read group)|

**T2 — same name, reduced semantics**

|LangGraph|This module|Reduction|
|-|-|-|
|`updateState`|`rewind(to)`|fork / parallel branches are **not provided** (single-chain ledger)|
|`Send` / dynamic fan-out|—|Not provided (single lane; design-time shapes only)|
|`CachePolicy` / `RetryPolicy` / `TimeoutPolicy`|—|Not replicated (this repository forbids caching; re-entry rides super-step boundaries)|

**T3 — explicitly not provided**: LangChain model / tool integrations · `BaseMessage` reducer family · remote SDK / Platform / Studio · delta channels / barrier channels · ecosystem-coupled faces such as `pushMessage` / `getStore` / `getPreviousState`.

**Repository extensions (no LangGraph counterpart)**: `JudgePort` (nodes are stubs ⇒ key production is externalized as a port) · the Awilix convenience face (`runtimeRegistrations` / `runtimeContainer` — carrying only the seven tokens and lifetime advice).

## Conventions

- One checkpoint per super-step (plan steps included): settlement and plan steps each land a record; `metadata` carries only `structureHash` / `source` / `step` / `graph`.
- Same-prefix replay is byte-identical: serialization follows key-code order (`serialize`); ids and timestamps are assigned by the checkpointer.
- One driver per thread at a time: a `Runtime` instance serializes by `threadId` (a promise chain); calls on the same thread queue in arrival order (read faces share the queue) — two concurrent `report` calls never read the same position and never write two same-parent checkpoints (the single chain does not fork). Cross-instance or cross-process concurrency is not guaranteed by this module (no lock / no lease / no CAS).
- `getState` / `history` are pure reads; state is not cached — it is rebuilt from the ledger chain.
- Channel face: `append` / `merge` / `replace` reductions; `source` is `input` / `node`.
- Zero package-external references: this README and all source reference only this package's exports.
- Receipts and artifacts (v7): a `report`'s `receipts` (three values `reserved | settled | ambiguous`) and `outputs` (object form `{ref, mediaType?, bytes?, sha256?}` plus the string shorthand) land with the settlement; an external node (capability ∩ `{tool, command}` ≠ ∅) whose `succeeded` lacks receipts, or whose artifact object lacks `ref`, is reported `failed`; `status()` shows receipts that have not reached `settled` as `unsettled`, and presents artifacts in their object form.

## Further reading

- `docs/api.md` — the API reference (exports, ports, refusal codes, the machinery name list)
- `docs/schema.md` — the schema reference (IR, asset declaration, checkpoints, receipts and artifacts, events, refusal payloads)
- `CHANGELOG.md` — the package changelog
- `agentic-graphjs/internal` — the machinery face for in-repo consumers and package tests
