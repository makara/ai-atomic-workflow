# 更新日志

> ai-atomic-workflow 发布历史 — monorepo，两个包共用一条发布线。内容依据代码状态（技能、图、schema 特性）推导，非 git 提交。Caveman 风格 — 每条一句话，最新状态为准。

## [Unreleased]

### 新增

- 双作用域 channels 上下文模型（ADR 0107）— 全局 `context:` + 相级 `channels:`、节点流、单一判断域公式。
- 9 个内置图 — e2e-minimal、arch-review、arch-review-loop、adopt-with-docs、graph-generate、doc-update、spec-implement、openspec-apply、openspec-engineer。
- auto 决策 rationale — Run Mode auto 审批持久化一行推荐依据。
- graph-generate 身份模型（ADR 0108）— 制图旅程图名、可选图描述、registry 项目优先、加载探针验证、runId 隔离输出。
- 按受影响域加载 spec 技能 — 实施按域加载 atom-graph-spec / atom-skill-spec / atom-doc-maintenance。
- setup-atomic-workflow 生成 `.graph-scheduler/docs/` 脚手架。
- atom-doc-maintenance 技能 — 单一 maintain() 契约，取代 atom-doc-spec + atom-doc-writer（ADR 0091）。
- openspec 系图归档后文档维护 — 归档后运行 doc-update。

### 变更

- 采纳阶段访谈边界（ADR 0103）— 约定移出、决策移入、显式收尾。
- README 家族两部分重构 — 第一部分基础与制图、第二部分 arch-review-loop；两幅 mermaid 图在蓝图 + 四份 README 间逐字节一致（ADR 0105）。
- README 家族刷新 — Architecture 讲解图是什么、channel 文案按 ADR 0107、概念图展示 implement 双轨道 + 合并 gate、功能清单只含 packages/（9 图 / 12 技能）。
- Changelog 简化 — 每条一句话、最新状态为准、删除失效历史。
- doc-update 图重塑 — 触发优先流程。

### 移除

- artifact-workflow + skill-workflow 图（ADR 0101）— 技能生产经 arch-review-loop change 流转。
- atom-doc-spec / atom-doc-writer 技能 — 被 atom-doc-maintenance 取代。

## [v0.2.0]

The arch-review-loop。

### 新增

- Gate 阶段类型 — 带 `jumps` 条件的纯返工节点。
- 分支路线 — 阶段 `route` 归属，经 `branchTo` 激活。
- 激活前置流程 — 每次激活确认 run mode（默认 manual），每轮加载约束。
- Flow 组合 — 加载期合并展平（深度上限 5）。
- 审批卡重设计 — 决策确认式：接受 + 自由输入 + 上下文选项。
- atom-mcp-contract 技能 — MCP 工具调用契约。

### 变更

- `graph_advance` 路由 — 新增 `branchTo` + `endRun`，移除 `skip`。
- Schema 收敛 — 移除 `reads` / `preText` / `eval` 与顶层 `when`；`join` 仅限 `any`。
- 引入双语 changelog — CHANGELOG.md + docs/CHANGELOG.zh-CN.md。

### 移除

- 顶层 `when` 跳过守卫 — 条件移至 gate `jumps[].when`。

## [v0.1.0]

初始发布。

### 新增

- graph-scheduler — DAG 执行引擎 + MCP 服务器（9 个工具，stdio），纯函数 FSM 内核，libsql 持久化。
- `.taskflow.yaml` 图格式 — main/approval 阶段、`dependsOn`、`task`、`skill`、`channels`、`join`。
- 审批关卡 — 阶段间不可绕过的审批决策卡。
- graph-workflow 技能系统 — atom-pilot、atom-phase-handler、atom-kernel、入口 + 参考技能、setup-atomic-workflow。
- 初始化技能 — setup-atomic-workflow 生成 `.graph-scheduler/`，幂等。
