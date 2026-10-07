# `agentic-graphjs` — schema 参考

> ⚠️ AI 生成的 README —— 请改 [docs/readme-blueprint.md](../../../docs/readme-blueprint.md)。 **Languages**: [English](schema.md) · 中文（本文件）

运行时读写的数据与资产形状。API 参考见 [api.md](api.md)；快面见 [README.md](../README.md)。

## 编译后图（IR）

`IR_VERSION` = `1` —— IR 契约版本，与包版本解耦，使形状变更与发版各按自己的节奏走。`validateGraph` 在任何人踩上去之前，按闭合故障集检查源。

|字段|形状|含义|
|-|-|-|
|`version`|`string`|编译打上的 IR 版本。|
|`id`|`string`|图身份。|
|`start` / `end`|`string`|两个哨兵：`START` 命名运行可起始的节点；`END` 结束运行。|
|`channels`|`readonly ChannelSpec[]`|每通道一条：`name` + `source`（`input` / `node`）+ `reducer`（`append` / `replace` / `merge`）。|
|`nodes`|`Readonly<Record<string, NodeSpec>>`|节点 id → spec：`task`（执行者看到的投影）、`keys`（每个 `KeySpec` = `name` + 可选 `criteria`）、`read`（所读通道）、`capabilities`、可选 `nodeType`（`agent` / `checkpoint` / `compute` / `action`）、可选 `timeoutMs` / `heartbeatMs` / `statusDetail`。|
|`edges`|`readonly EdgeSpec[]`|`from` → `to`；`kind` 取 `static` 或 `router`；router 边携带 `key`（其结算键）与 `map`（键 → 目标）。|
|`loops`|`readonly LoopSpec[]`|`id` + `budget` + `onExhausted`（预算耗尽后的落点节点）。|
|`permissions`|`PermissionModel?`|`requiredMode`（`approve-all` / `approve-reads` / `deny-all`）外加可选 `requireExplicitGrant` / `reason`；缺省 = 未声明权限面。|
|`input`|`readonly string[]?`|调用必须提供的输入键；缺省 = 无必需键。|

**校验故障** —— 闭合的 `ValidationCode` 集：`duplicate-channel` · `duplicate-node` · `node-id-mismatch` · `unknown-channel` · `unknown-node` · `missing-start` · `missing-end` · `edge-kind` · `key-set-mismatch` · `loop-budget`。每个故障携带自描述 `message`（`ValidationFault`）。

## 声明面

图文档以其自己的源形态声明上述事实；编译器交给模块的是编译产物，从不是源文档。声明面覆盖：通道（各带 `source` 与 `reducer`）、节点（task、keys、reads、capabilities 及可选声明字段）、边（静态跳与 router 映射）、循环，以及可选的 `permissions` 门与 `input` 键。模块只读编译后的形状：`CompiledGraph` 是其唯一输入契约，节点携带自己声明的投影、只命名通道。

## 加载面

`graphs` token 以加载判别式答复编译产物，从不给一个需要试探的形状：

- `{ ok: true, graph, structureHash }` —— 加载出的图，外加账本记录的结构哈希（绑定的资产轴）。
- `{ ok: false, code, message? }` —— 携带宿主所选码的拒绝；运行时按该码原样拒绝，给出 `message` 时以之为注。

当加载的哈希与链上记录的 `structureHash` 不再一致，调用拒 `STRUCTURE_DRIFT`。

## checkpoint 与链

|类型|形状|含义|
|-|-|-|
|`ThreadConfig`|`thread_id` + 可选 `checkpoint_id`|哪个 thread，以及其中的哪个 checkpoint。|
|`Checkpoint`|`v` · `id` · `ts` · `channel_values` · `channel_versions` · `versions_seen` · 可选 `parent_config`|链上的一个位置：折叠后的值与它们背后的版本。字段名镜像相邻框架的 `snake_case` —— 这种对齐是刻意的；模块自己的行保持 `camelCase`。`parent_config` 是该步运行的位置（thread 头缺省），故链可向后走、重放重导出同一父子关系。|
|`CheckpointMetadata`|`graph` · `structureHash` · `source` · `step`|一步记录自身的什么：图名是绑定事实（链是其唯一权威），哈希是资产轴，`source` 是写源，`step` 是序号。|
|`CheckpointTuple`|`config` · `checkpoint` · `metadata` · 可选 `pendingWrites`|一个 checkpoint，连同寻址它的 config 与其后的写块。|
|`PendingWrite`|`taskId` · `writes` · 可选 `key` / `fact` / `attempt` / `receipts` / `outputs`|一个待写块：任务、它贡献的写映射、路由键、种类（`failed` / `retry`，成功时缺省）、尝试序号，以及报告随手上交的证据（收据与产物引用）。|
|`CheckpointListOptions`|可选 `limit` / `before`|列表读多远：最新在前，至多 `limit` 条，自 `before` 之前起。|

## 收据、产物与日志条目

|类型|形状|含义|
|-|-|-|
|`Receipt`|`ref` + `state`|宿主在一次外部动作旁交来的一条收据：宿主可读回的引用（调用 id、日志锚、日志键 —— 从不是路径猜测）与动作留下的状态。状态词表闭合 —— `reserved` / `settled` / `ambiguous` —— 词表之外一律按节点失败处理。|
|`ArtifactRef`|`ref` + 可选 `mediaType` / `bytes` / `sha256`|任务产出的一个产物，按账本与视图携带的对象形。报告也可以裸字符串简写交来引用；结算会把它规范化为 `{ ref }`。|
|`LogEntry`|`taskId` · `writes` · 可选 `key` / `attempt` / `receipts` / `outputs`|一次已结算任务施加的写块，键与证据随工作同行（冷重放从不重算键）。|
|`OutcomeEntry`|`taskId` · `outcome`（`failed` / `retry`）· 可选 `reason` / `key` / `writes` / `attempt` / `receipts` / `outputs`|一次报告的非成功结局，记在工作旁边：`retry` 要求重铸任务，`failed` 为终局。|
|`ProgressEntry`|`node` · `detail` · 可选 `at`|宿主写在链旁的一条标记：对引擎惰性、不动状态 —— 携带标记的重放与不带标记的重放折叠逐字节相同。|
|`IdentityPort` / `ClockPort`|`nextId()` / `now()`|宿主供给的两个面，使包免于自铸 id 与自读时钟：id 与时间戳来自宿主，故重放铸造出相同的值。|

## 运行面（机械面）

运行面骑 `agentic-graphjs/internal`：`RunState`（lane 持有的状态）、`RunEvent` 与 `RunResult`（一次运行发出什么、答复什么），以及 `RuntimeError` / `RuntimeFaultCode` 对 —— 形状见 `src/step/run.ts`。

## 拒绝载荷

|类型|形状|含义|
|-|-|-|
|`RefusalPayload`|`{code, note, keys?}`|被拒调用携带的东西：码、自描述注，以及拒绝指名候选时携带的键集。|
|`RefusalInfo`|`code` + `note`|表行携带的两字段面。|
|`RefusalCode`|十二个码|闭合的码联合；`INFRA` 是引擎侧码的导出常量。|

## 端口形状

|类型|形状|含义|
|-|-|-|
|`RuntimeDeps`|`checkpointer` · `context` · `graphs` + 可选 `judge` / `store` / `writer` / `logger`|宿主解析并注入的东西 —— 三个必需能力、四个可选。|
|`RuntimeContext`|`threadId` + 可选 `checkpointId` + 索引签名|每调用上下文：本次调用所答复的 thread。|
|`GraphSource`|`load(name)` → 加载判别式|图资产面（见上）。|
|`CheckpointSaver`|state provider 接口|「派生 or 存储」由实现决定。|
|`StorePort`|`get` / `search` / `put` / `delete` / `listNamespaces`|跨运行记忆面；本版本只固定形状。|
|`WriterPort`|`write(chunk)`|增量输出面 —— 每次写一个 chunk。|
|`LoggerPort`|`info` / `warn` / `error` + 可选 `debug`|四个朴素方法，无流、无路由 —— 级别落在哪里是宿主的决定。未注入端口即不发射：沉默是声明的缺省。|
|`PortRow` / `PortToken`|行形状 / token 联合|已发布的 `PORTS` 表与由它派生的联合 —— 表是唯一来源。|

## 延伸阅读

- [api.md](api.md) —— API 参考
- [README.md](../README.md) —— 快面（what / why / how）
- [CHANGELOG.md](../CHANGELOG.md) —— 包级 changelog
