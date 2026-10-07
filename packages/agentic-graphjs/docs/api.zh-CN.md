# `agentic-graphjs` — API 参考

> ⚠️ AI 生成的 README —— 请改 [docs/readme-blueprint.md](../../../docs/readme-blueprint.md)。 **Languages**: [English](api.md) · 中文（本文件）

图运行时的 API 参考。快面（what / why / how）见 [README.md](../README.md)；schema 参考见 [schema.md](schema.md)。

## 运行时方法（七）

入口 `createRuntime(deps)` 解析能力 token 并交回一个 `Runtime`；每个方法都是 async，答复要么是其结果形状，要么是携带拒绝载荷的 `rejected`。同一 thread 一次一个驱动：每个调用都排在该 thread 自己上一个调用的后面。

|方法|签名|答复|
|-|-|-|
|`take`|`take(input: { graph: string })`|`TakeResult` —— `issued`（计划出的任务）· `unserved`（lane 已空）· `rejected`|
|`report`|`report(input: ReportInput)`|`ReportResult` —— `settled`（checkpoint id，外加重放警告）· `rejected`|
|`rewind`|`rewind(input: { to: string; retained?: readonly string[] })`|`RewindResult` —— `rewound`（位置，外加保持已结算的部分）· `rejected`|
|`history`|`history(input: { graph: string })`|`readonly Checkpoint[]` —— 整条链，最新在前（按 saver 的列表序）|
|`getState`|`getState(input: { graph: string; at?: string })`|`StateSnapshot` —— 从链上重建的状态|
|`status`|`status(input: { graph: string; at?: string })`|`RunStatus` —— 链窗口：步、结算、未到 `settled` 的收据、对象形的产物|
|`boundGraph`|`boundGraph(at?: string)`|`string|undefined` —— 链最新步记录的图名；`undefined` = 尚无绑定（空视图，非错误）|

**拒绝面**：写面（`take` / `report` / `rewind`）以 `rejected` 答复，载荷取自下方十二码表。读面（`history` / `getState` / `status`）在链本身不可读时答复其空视图，而对**根本无法答复**的调用**抛出**（raise）—— `CHECKPOINT_UNKNOWN`（链上不存在的 `at`）或 `CAPABILITY_MISSING`（运行时从未携带的端口）。`boundGraph` 从不抛出 —— 未绑定的 thread 就是它的 `undefined`。

## 端口（七 token）

|token|必需|生命周期|缺省|
|-|-|-|-|
|`checkpointer`|是|每调用（state provider）|—|
|`context`|是|每调用|空对象|
|`graphs`|是|单例|—|
|`judge`|否|`scoped`（每超步一个，超步界 dispose，同名重入复用实例）|机械默认：单键取该键；多键缺 `judge` ⇒ `infra`（缺端口通道，非设计码）|
|`store`|否|单例|无跨运行记忆|
|`writer`|否|每调用|无增量面|
|`logger`|否|每调用|沉默（发射是观察面：改不了路由，也改不了结果）|

`PORTS` 逐行携带同一张表；`runtimeRegistrations` / `runtimeContainer` 把它渲染成 Awilix 便利面。

## 拒绝码（十二）

|码|含义|下一步|
|-|-|-|
|`BAD_CALL`|调用不符合工具唯一形态|按工具的单一形态重发（形态即 schema）|
|`CAPABILITY_MISSING`|运行时缺该能力（读面所需端口从未注册）|注册运行时所需端口，再重新发起同一次调用|
|`GRAPH_UNREADABLE`|图名无法加载为文档|从答复所带的可用图名表取名|
|`STRUCTURE_DRIFT`|绑定的图结构与账本不再一致（资产轴）|换一个新 thread 重绑，或恢复资产|
|`NO_OUTSTANDING_TASK`|lane 上没有待结算的任务|先 `take`|
|`KEY_UNDECLARED`|回报的键不在节点声明键集内|从声明键集里选（载荷携带候选键集）|
|`KEY_UNMATCHED`|回报的键不匹配节点声明的任何路由|从答复携带的候选键集里选一个|
|`SETTLEMENT_UNANCHORED`|报告既无结果文字也无能够解析的指针|把结果与其所依据的指针一并重新上报|
|`TASK_AMBIGUOUS`|多个任务同时在途且未给出 taskId|在 taskId 里指名任务后重新上报|
|`CHECKPOINT_UNKNOWN`|checkpoint id 不在当前链上|用 `history()` 取合法 id|
|`infra`|引擎侧状态，调用方不能作用（缺端口，键集漂移，fold 失败）|修引擎侧，再重新发起同一次调用|
|`input-missing`|`take` 输入缺图级 `input` 声明的键|补齐输入的键，或者修改图级的声明|

## 类型（按面）

全部根导出的按面分组 —— 每面一句说明，确切形状见源指针。

|面|名|说明|源|
|-|-|-|-|
|构建|`StateGraph` · `Annotation` · `Command` · `GraphBuildError` · `ChannelAnnotation` · `CommandInit` · `GraphBuildCode` · `InterruptCall` · `LoopDeclaration` · `NodeDeclaration` · `RouterMap` · `StateShape`|声明通道与节点、编译、恢复挂起；构建错误码骑 `GraphBuildCode`。|`src/build/graph.ts`|
|checkpoint 契约|`Checkpoint` · `CheckpointMetadata` · `CheckpointTuple` · `CheckpointListOptions` · `PendingWrite` · `ThreadConfig`|账本记录：元组携带其后的写块；`metadata` 携带 `structureHash` / `source` / `step` / `graph`。|`src/contract/checkpoint.ts`|
|收据与日志|`Receipt` · `ArtifactRef` · `LogEntry` · `OutcomeEntry` · `ProgressEntry` · `ClockPort` · `IdentityPort`|结算收据（三值）、产物引用，以及端口写入的日志 / 结果 / 进度条目。|`src/contract/log.ts`|
|端口契约|`PORTS` · `PortRow` · `PortToken` · `RuntimeDeps` · `RuntimeContext` · `GraphSource` · `StorePort` · `WriterPort` · `LoggerPort`|七 token 表，以及入口据以解析的 deps / context 形状。|`src/contract/ports.ts`|
|记录契约|`CheckpointSaver` · `RecordLogPort` · `LogRecord`|state provider 接口（「派生 or 存储」由实现决定）与记录日志端口。|`src/contract/records.ts`|
|报告契约|`ReportInput`|一次结算上报什么：outcome、key、result、receipts、outputs、taskId。|`src/contract/report.ts`|
|入口与状态|`createRuntime` · `runtimeContainer` · `runtimeRegistrations` · `Runtime` · `TakeResult` · `ReportResult` · `RewindResult` · `emptyStatus` · `statusOf` · `RunStatus` · `StatusReceipt` · `StatusSettlement` · `StatusStep` · `PortFactory` · `PortType` · `RuntimeCradle`|入口面、七方法、其结果形状，以及链窗口状态读面。|`src/entry/`|
|IR|`START` · `END` · `IR_VERSION` · `validateGraph` · `CompiledGraph` · `ChannelSpec` · `ChannelSource` · `EdgeSpec` · `EdgeKind` · `KeySpec` · `LoopSpec` · `NodeSpec` · `NodeRef` · `NodeType` · `PermissionMode` · `PermissionModel` · `ReducerId` · `ValidationCode` · `ValidationFault` · `Json`|编译后图的 IR：节点与边、通道与归约器、权限、校验码 —— `validateGraph` 在编译前检查源。|`src/ir.ts`|
|内存端口|`createMemoryLog` · `createMemorySaver` · `MemorySaverPorts`|内存 checkpointer：saver 从其端口对象读取 `log` / `identity` / `clock`。|`src/persist/memory-saver.ts`|
|拒绝|`INFRA` · `REFUSALS` · `REFUSAL_CODES` · `refuse` · `RefusalCode` · `RefusalInfo` · `RefusalPayload`|十二码表与载荷构造器（`{code, note, keys?}`）。|`src/refusals.ts`|
|判定与结算|`JudgePort` · `JudgeRequest` · `StateSnapshot` · `SettleWarning`|键生产端口（节点是桩，故判定外置）、它所答复的请求、读面返回的状态快照，以及结算警告形状。|`src/settle/`|
|中断|`Suspended` · `interrupt` · `Suspension`|节点桩挂起点：`interrupt` 挂起，`Suspended` 携带载荷。|`src/step/interrupt.ts`|

## 机械面

机械面骑 `agentic-graphjs/internal` —— 供同仓消费者与包内测试。它 = 内部导出减去根再导出，按族列出：

- **通道面** —— `ChannelState` · `ChannelValue` · `ChannelWrite` · `ChannelError` · `ChannelFaultCode` · `applyWrite` · `applyWrites` · `foldWrites` · `initialState`
- **归约面** —— `REDUCERS` · `REDUCER_EMPTY` · `ReducerError` · `ReducerFaultCode` · `Reducer` · `reduce` · `sameValue`
- **持久化面** —— `SaverPorts` · `SaverError` · `SaverFaultCode` · `createCheckpointSaver` · `stateOf` · `serialize` · `mechanicalKey` · `readsOf`
- **结算面** —— `settle` · `SettleAnswer` · `SettlePorts` · `runNode` · `Settlement`
- **计划与运行面** —— `plan` · `Task` · `run` · `start` · `RunEvent` · `RunResult` · `RunState` · `RuntimeError` · `RuntimeFaultCode`

## 延伸阅读

- [README.md](../README.md) —— 快面（what / why / how）
- [schema.md](schema.md) —— schema 参考
- [CHANGELOG.md](../CHANGELOG.md) —— 包级 changelog
