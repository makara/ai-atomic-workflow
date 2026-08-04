# 更新日志

> ai-atomic-workflow 发布历史 — monorepo，两个包共用一条发布线。内容依据代码状态（技能、图、schema 特性）推导，非 git 提交。Caveman 风格。

## [v0.2.0]

The arch-review-loop。

### 新增

- **Gate 阶段类型** — 纯返工节点，`jumps` `[{when, to}]`；命中跳回，否则流过。
- **分支路线** — 阶段 `route` 归属，经 `graph_advance` `branchTo` 激活；未选路线永不运行。
- **激活前置流程** — 每次激活确认 run mode（manual/auto，缺省绝不 auto），每轮加载约束；auto 模式执行审批，访谈永不跳过。
- **4 个新图**（12 → 15）— arch-review-loop、openspec-engineer、implement、grill-with-docs。
- **atom-mcp-contract 技能**（13 → 14）— MCP 工具调用契约。
- **OpenSpec 输入源检测** — wayfinder-map / arch-review / grill-consensus / direct；内联 ADR 判定。
- **审批卡重设计** — 决策确认式：接受 + 自由输入 + 上下文选项；卡面文本并入 `task`。
- **`graph_advance` 路由** — 新增 `branchTo` + `endRun`，移除 `skip`。
- **Flow 组合** — 加载期合并展平（深度上限 5），通道传播至入口节点。
- **Schema 收敛** — 移除 `reads`/`preText`/`eval` 与顶层 `when`；`join` 仅限 `any`。
- **文档发布修正** — CONTEXT.md 重写，README + blueprint 同步，引入双语 changelog。

### 移除

- 顶层 `when` 跳过守卫 — 条件移至 gate `jumps[].when`。
- `preText`、`eval`、`reads` 阶段字段。

## [v0.1.0]

初始发布。

### 新增

- **graph-scheduler** — DAG 执行引擎 + MCP 服务器（9 个工具，stdio），纯函数 FSM 内核，libsql 持久化。
- **`.taskflow.yaml` 图格式** — main/approval 阶段、`dependsOn`、`task`、`skill`、`channels`、`join`、`when` 守卫。
- **审批关卡** — 阶段间不可绕过的审批决策卡。
- **graph-workflow 技能系统** — 13 个内置技能：atom-pilot、atom-phase-handler、atom-kernel、入口技能、参考规格、setup-atomic-workflow。
- **12 个内置图** — e2e-minimal、arch-review、arch-review-to-spec（后被取代）、openspec-create、openspec-apply、openspec-pipeline、plan-generate、skill-author、skill-delete、skill-change-workflow、graph-generate、doc-update。
- **初始化技能** — setup-atomic-workflow 生成 `.graph-scheduler/`，幂等。
