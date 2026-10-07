# Changelog

> `agentic-graphjs` 的发布历史 —— 面向 agent 的图运行时内核。内容取自代码状态，不取 git 提交。电报风格 —— 一行一变更，最新状态为准。 **Languages**: [English](CHANGELOG.md) · 中文（本文件）

## [0.1.0]

"首发：面向 agent 的图运行时内核。"

### Added

- 运行时：入口 `createRuntime` 与七端口表（`checkpointer` / `context` / `graphs` 必需；`judge` / `store` / `writer` / `logger` 可选）、七方法面（`take` / `report` / `rewind` / `history` / `getState` / `status` / `boundGraph`），以及 Awilix 便利面（`runtimeRegistrations` / `runtimeContainer`）与端口表逐行一致。
- 执行：每超步一个 checkpoint（含计划步）· 同前缀重放逐字节相同 · 每 thread 单链账本（同时一个驱动）· 十二码拒绝面（`REFUSALS` / `REFUSAL_CODES` / `refuse`）。
- 构建面：`StateGraph` / `Annotation` / `Command` · 编译期校验（`validateGraph`）· IR 契约（`IR_VERSION` = `1`）· 中断面（`interrupt` / `Suspended`）。
- 内存端口：`createMemoryLog` / `createMemorySaver`（固定 identity 与 clock —— 重放的转录铸造相同的 id）。
- 示例：`memory-e2e`（功能面）· `awilix-e2e`（Awilix 便利面）· `read-face-e2e`（账本回读）—— `bun run example` 一次打印三份。
- 文档：`README.md` + `README.zh-CN.md`（快面）· `docs/api.md` + `docs/schema.md`（+ zh 镜像）。
