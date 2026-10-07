# `agentic-graphjs` — API reference

> ⚠️ AI-generated README — edit [docs/readme-blueprint.md](../../../docs/readme-blueprint.md) instead. **Languages**: English (this file) · [中文](api.zh-CN.md)

The API reference for the graph runtime. The fast face (what / why / how) lives in [README.md](../README.md); the schema reference lives in [schema.md](schema.md).

## Runtime methods (seven)

The entry `createRuntime(deps)` resolves the capability tokens and hands back a `Runtime`; every method is async and answers either its result shape or a `rejected` refusal carrying a refusal payload. One driver at a time per thread: every call queues behind the thread's own previous call.

|Method|Signature|Answers|
|-|-|-|
|`take`|`take(input: { graph: string })`|`TakeResult` — `issued` (the planned tasks) · `unserved` (the lane is drained) · `rejected`|
|`report`|`report(input: ReportInput)`|`ReportResult` — `settled` (the checkpoint id, plus replay warnings) · `rejected`|
|`rewind`|`rewind(input: { to: string; retained?: readonly string[] })`|`RewindResult` — `rewound` (the position, plus what stayed settled) · `rejected`|
|`history`|`history(input: { graph: string })`|`readonly Checkpoint[]` — the chain, newest first (the saver's list order)|
|`getState`|`getState(input: { graph: string; at?: string })`|`StateSnapshot` — the state rebuilt from the chain|
|`status`|`status(input: { graph: string; at?: string })`|`RunStatus` — the chain window: steps, settlements, receipts not yet `settled`, artifacts in object form|
|`boundGraph`|`boundGraph(at?: string)`|`string|undefined`— the graph name the chain's newest step recorded;`undefined` = no binding yet (the empty view, not an error)|

**Refusal surface**: the write faces (`take` / `report` / `rewind`) answer `rejected` with a payload from the twelve-code table below. The read faces (`history` / `getState` / `status`) answer their empty view when the chain itself is unreadable, and **raise** (throw) on a call they cannot answer at all — `CHECKPOINT_UNKNOWN` (an `at` the chain does not hold) or `CAPABILITY_MISSING` (a port the runtime never carried). `boundGraph` never raises — an unbound thread is its `undefined`.

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

`PORTS` carries the same table row-for-row; `runtimeRegistrations` / `runtimeContainer` render it as the Awilix convenience face.

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

## Types (by face)

Every root export, grouped by the face it belongs to — one clause per face, the exact shapes in the source pointer.

|Face|Names|Clause|Source|
|-|-|-|-|
|Build|`StateGraph` · `Annotation` · `Command` · `GraphBuildError` · `ChannelAnnotation` · `CommandInit` · `GraphBuildCode` · `InterruptCall` · `LoopDeclaration` · `NodeDeclaration` · `RouterMap` · `StateShape`|Declare channels and nodes, compile, resume a suspension; the build-error codes ride `GraphBuildCode`.|`src/build/graph.ts`|
|Checkpoint contract|`Checkpoint` · `CheckpointMetadata` · `CheckpointTuple` · `CheckpointListOptions` · `PendingWrite` · `ThreadConfig`|The ledger record: the tuple carries the writes that followed it; `metadata` carries `structureHash` / `source` / `step` / `graph`.|`src/contract/checkpoint.ts`|
|Receipts & log|`Receipt` · `ArtifactRef` · `LogEntry` · `OutcomeEntry` · `ProgressEntry` · `ClockPort` · `IdentityPort`|The settlement receipts (three values), artifact references, and the log/outcome/progress entries the ports write.|`src/contract/log.ts`|
|Ports contract|`PORTS` · `PortRow` · `PortToken` · `RuntimeDeps` · `RuntimeContext` · `GraphSource` · `StorePort` · `WriterPort` · `LoggerPort`|The seven-token table and the deps/context shapes the entry resolves against.|`src/contract/ports.ts`|
|Records contract|`CheckpointSaver` · `RecordLogPort` · `LogRecord`|The state-provider interface ("derive or store" is the implementation's call) and the record-log port.|`src/contract/records.ts`|
|Report contract|`ReportInput`|What one settlement reports: outcome, key, result, receipts, outputs, taskId.|`src/contract/report.ts`|
|Entry & status|`createRuntime` · `runtimeContainer` · `runtimeRegistrations` · `Runtime` · `TakeResult` · `ReportResult` · `RewindResult` · `emptyStatus` · `statusOf` · `RunStatus` · `StatusReceipt` · `StatusSettlement` · `StatusStep` · `PortFactory` · `PortType` · `RuntimeCradle`|The entry face, the seven methods, their result shapes, and the chain-window status readers.|`src/entry/`|
|IR|`START` · `END` · `IR_VERSION` · `validateGraph` · `CompiledGraph` · `ChannelSpec` · `ChannelSource` · `EdgeSpec` · `EdgeKind` · `KeySpec` · `LoopSpec` · `NodeSpec` · `NodeRef` · `NodeType` · `PermissionMode` · `PermissionModel` · `ReducerId` · `ValidationCode` · `ValidationFault` · `Json`|The compiled-graph IR: nodes and edges, channels and reducers, permissions, validation codes — `validateGraph` checks a source before compile.|`src/ir.ts`|
|Memory ports|`createMemoryLog` · `createMemorySaver` · `MemorySaverPorts`|The in-memory checkpointer: the saver reads `log` / `identity` / `clock` from its ports object.|`src/persist/memory-saver.ts`|
|Refusals|`INFRA` · `REFUSALS` · `REFUSAL_CODES` · `refuse` · `RefusalCode` · `RefusalInfo` · `RefusalPayload`|The twelve-code table and the payload constructor (`{code, note, keys?}`).|`src/refusals.ts`|
|Judge & settle|`JudgePort` · `JudgeRequest` · `StateSnapshot` · `SettleWarning`|The key-production port (nodes are stubs, so judgement is externalized), the request it answers, the state snapshot the reads return, and the settlement warning shape.|`src/settle/`|
|Interrupt|`Suspended` · `interrupt` · `Suspension`|The node-stub suspension point: `interrupt` suspends, `Suspended` carries the payload.|`src/step/interrupt.ts`|

## Machinery face

The machinery rides `agentic-graphjs/internal` — for in-repo consumers and package tests. It is the internal exports minus the root re-exports, by family:

- **Channel face** — `ChannelState` · `ChannelValue` · `ChannelWrite` · `ChannelError` · `ChannelFaultCode` · `applyWrite` · `applyWrites` · `foldWrites` · `initialState`
- **Reducer face** — `REDUCERS` · `REDUCER_EMPTY` · `ReducerError` · `ReducerFaultCode` · `Reducer` · `reduce` · `sameValue`
- **Saver face** — `SaverPorts` · `SaverError` · `SaverFaultCode` · `createCheckpointSaver` · `stateOf` · `serialize` · `mechanicalKey` · `readsOf`
- **Settle face** — `settle` · `SettleAnswer` · `SettlePorts` · `runNode` · `Settlement`
- **Plan & run face** — `plan` · `Task` · `run` · `start` · `RunEvent` · `RunResult` · `RunState` · `RuntimeError` · `RuntimeFaultCode`

## Further reading

- [README.md](../README.md) — the fast face (what / why / how)
- [schema.md](schema.md) — the schema reference
- [CHANGELOG.md](../CHANGELOG.md) — the package changelog
