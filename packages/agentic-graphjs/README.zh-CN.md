# `agentic-graphjs`

> ⚠️ AI 生成的 README —— 请改 [docs/readme-blueprint.md](../../docs/readme-blueprint.md)。 **Languages**: [English](README.md) · 中文（本文件）

**面向 agent 的图工程（graph engineering for agents）** —— 一个可以用任何 agent 驱动的框架，以纯图运行时的形态骑在会话之内。

> 独立实现（independent implementation, not affiliated with LangChain）：仅以公开文档与行为为参照，不复制源码。

## 目录

- [它是什么](#它是什么)
- [为什么](#为什么)
- [怎么用](#怎么用)
- [它不是什么](#它不是什么)
- [与 LangGraph 的关系](#与-langgraph-的关系)
- [面（导出）](#面导出)
- [端口（七 token）](#端口七-token)
- [拒绝码（十二）](#拒绝码十二)
- [兼容矩阵](#兼容矩阵)
- [约定](#约定)
- [延伸阅读](#延伸阅读)

## 它是什么

一个把 agent 工作流工程化为图的框架。图以声明式资产书写（state / nodes / flow）；运行时驱动**任意 agent** 逐步（super-step）走完 —— 发任务、收结果、每超步落一个 checkpoint。

- **面向任意 agent** —— 执行者就是 agent 本身：带上你自己的（Claude Code、Codex、自定循环，或人），或构建一个。运行时协议中立；每个任务由宿主渲染成 agent 自己的语言。
- **纯运行时** —— 零 I/O、零执行。节点是桩：只声明「要什么」；活儿由 agent 干；账本由运行时记。
- **概念同构** —— channels、reducers、super-step、task、checkpoint、interrupt：LangGraph 的词汇，外加三处显式差异。

## 为什么

LangGraph 很好 —— 但它为服务器而设：你要部署一个进程，节点在那里调模型、调工具，状态活在那个服务里。agent 翻转了这个假设：**agent 本身就是执行环境** —— 工具、模型，以及一个会被中断、压缩、续起的会话。agent 需要的不是一个可调用的服务器，而是一个**与 agent 深度集成的驱动**：图骑在会话之内，活儿由 agent 干，账本扛得住重启。

三个后果成为设计本身：

1. **执行者是 agent。** 节点是桩 —— agent 看不见的工作对它不存在。
2. **上下文稀缺。** 每个任务投影只携带该步所需 —— 不多一个字。
3. **会话会结束。** 每超步一个 checkpoint；重放逐字节相同；`rewind` 可回到任一步并从其前沿继续。

## 怎么用

1. **绑定** —— 用七个端口创建运行时：`checkpointer`、`context`、`graphs`（必需）+ `judge`、`store`、`writer`、`logger`（可选）。端口是普通对象；Awilix 便利面随包提供、从不强求。
2. **take / report** —— `take({ graph })` 发任务；agent 用 `report(...)` 逐任务结算。每超步落一个 checkpoint。
3. **rewind / 读面** —— `history()` · `getState()` · `status()` · `boundGraph()` 读账本；`rewind({ to, retained })` 回到任一步继续。

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

两个可跑示例（`bun run example`）用两种注册面驱动同一张图 —— `examples/memory-e2e.ts`（functional 路线）与 `examples/awilix-e2e.ts`（Awilix 便利面）；包内测试断言两者转录逐行相等。

## 它不是什么

不是执行器（什么都不跑）· 不是服务器 · 不是资产格式 · 不是工具层 · 不是 agent 协议（任务渲染是宿主的事）· 不要求任何容器 / 装配框架。

## 与 LangGraph 的关系

概念同构；三处显式差异：无存储式 saver 强制（由你的 `checkpointer` 决定）· 无并行 fork（单链账本）· 不复刻生态耦合面（模型 / 工具 / Platform / Studio）。完整矩阵见下。

## 面（导出）

根面 = 契约面：入口、七方法运行面、构建面、中断面、拒绝面、内存端口实现与端口表。机械面骑 `agentic-graphjs/internal`，供同仓消费者与包内测试 —— 全表见 `docs/api.md`。

|导出|形状|作用|
|-|-|-|
|`createRuntime`|`(deps: RuntimeDeps) → Runtime`|入口面：解析能力、绑定七方法；缺必需能力即拒|
|`Runtime` 七方法|`take` / `report` / `rewind` / `history` / `getState` / `status` / `boundGraph`|计划（产 `Task[]` —— `issued` / `unserved` / `rejected`）· 结算（键校验 → 判定 → 路由 → 写通道 → 每超步一 checkpoint）· 回溯 · 链面 · 最小视图 · 只读视图（账本重建；收据未结 + 产物引用）· 绑定读点（`boundGraph` 读链最新步记录的图名；单读点；未绑定 = `undefined`，空视图非错误）|
|`StateGraph` / `Annotation` / `Command`|构建面|通道与节点声明 · 编译 · 中断恢复命令|
|`START` / `END` / `IR_VERSION` / `validateGraph`|常量 + 校验|显式端点 · IR 版本 · 编译期校验|
|`interrupt` / `Suspended` / `GraphBuildError`|中断 / 构建错误面|节点桩挂起点与负载 · 构建错误码|
|`runtimeContainer` / `runtimeRegistrations`|Awilix 便利面|`Resolver` 输出与 `PORTS` 逐行一致（七 token · lifetime 建议）|
|`PORTS`|七 token 表|token / 必需性 / 缺省 / lifetime 建议|
|`createMemoryLog` / `createMemorySaver`|端口实现|内存 checkpointer（`MemorySaverPorts`：`log` / `identity` / `clock`）|
|`REFUSALS` / `REFUSAL_CODES` / `refuse`|表 + 构造器|十二码拒绝面 · 载荷 `{code, note, keys?}`|

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

## 兼容矩阵

分级口径：**T1** = 概念同名同义 · **T2** = 同名降级（声明但语义子集）· **T3** = 明确不提供；映射以本表为准。

**T1 完全同构（概念同名同义）**

|LangGraph|本模块|
|-|-|
|`StateGraph` / `Annotation`|资产 `state:` 块 → `channels`（声明位在资产）|
|`addNode` / `addEdge` / `addConditionalEdges`|`nodes` / `flow:` 箭头 / 条件边逐键行（`map` 派生）|
|reducers|`replace` / `append` / `merge`（`append` 内含结构去重）|
|`BaseCheckpointSaver`|`CheckpointSaver`（state provider ——「派生 or 存储」由实现决定）|
|`Checkpoint` / `CheckpointTuple`|同名（含 `parentConfig` 父链）|
|`thread_id` / `configurable`|`RuntimeContext.threadId`|
|`Task`|`Task`|
|`interrupt` / `Command(resume)`|节点桩 + `take` / `report`|
|`Runtime.writer`|`WriterPort`|
|`BaseStore`|`StorePort`（可选）|
|`getState` / `getStateHistory`|`getState` / `history` / `boundGraph`（绑定读点归入链面读组）|

**T2 同名降级（声明但语义子集）**

|LangGraph|本模块|降级点|
|-|-|-|
|`updateState`|`rewind(to)`|fork / 并行分支**不提供**（单链账本）|
|`Send` / 动态扇出|—|不提供（单车道；设计期只给形状）|
|`CachePolicy` / `RetryPolicy` / `TimeoutPolicy`|—|不复刻（本仓禁缓存；重入由超步边界承担）|

**T3 明确不提供（not provided）**：LangChain 模型 / 工具集成 · `BaseMessage` 系列 reducer · 远程 SDK / Platform / Studio · delta channel / barrier 通道 · `pushMessage` / `getStore` / `getPreviousState` 等生态耦合面。

**本仓扩展（LangGraph 无对应）**：`JudgePort`（节点是桩 ⇒ 键的生产外置为端口）· Awilix 便利面（`runtimeRegistrations` / `runtimeContainer` —— 只承载七 token 与 lifetime 建议）。

## 约定

- 每超步一个 checkpoint（含计划步）：结算与计划步各自落账，`metadata` 只含 `structureHash` / `source` / `step` / `graph`。
- 同前缀重放逐字节相同：序列化按键码序（`serialize`），id / ts 由 checkpointer 赋予。
- 同 thread 一次一个驱动：`Runtime` 实例内按 `threadId` 串行（promise 链），同一 thread 的调用按到达序排队（读面同队）—— 两条并发 `report` 不会读到同一位置、写出两条同父 checkpoint（单链不分叉）。跨实例或跨进程的并发不由本模块保证（无锁 / 无租约 / 无 CAS）。
- `getState` / `history` 为纯读；状态不缓存，按账本链重建。
- 通道面：`append` / `merge` / `replace` 三种归约；`source` 取 `input` / `node`。
- 零包外引用：本 README 与全部源码只引用本包导出。
- 收据与产物（v7）：`report` 的 `receipts`（三值 `reserved | settled | ambiguous`）与 `outputs`（对象形 `{ref, mediaType?, bytes?, sha256?}` + 字符串简写）随结算落账；外部节点（能力 ∩ `{tool, command}` ≠ ∅）的 `succeeded` 缺收据、或产物对象缺 `ref` ⇒ 报 `failed`；`status()` 把未到 `settled` 的收据显示为 `unsettled`，产物按对象形原样呈现。

## 延伸阅读

- `docs/api.md` —— API 参考（导出、端口、拒绝码、机械面名表）
- `docs/schema.md` —— schema 参考（IR、资产声明、checkpoint、收据与产物、事件、拒绝载荷）
- `CHANGELOG.md` —— 包级 changelog
- `agentic-graphjs/internal` —— 机械面（供同仓消费者与包内测试）
