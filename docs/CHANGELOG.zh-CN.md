# 更新日志

> ai-atomic-workflow 发布历史 — monorepo，两个包共用一条发布线。内容依据代码状态（技能、图、schema 特性）推导，非 git 提交。Caveman 风格 — 每条一句话，最新状态为准。

## [v0.6.0]

"LangGraph 运行时、flow 转移、自包含图"。

### 新增

- 引擎：LangGraph 运行时适配器 + 编译管线（adapter.ts / compile.ts / flow.ts）；顶层 flow 转移表（条件匹配推进、backward-only jump 通道）；inventory schema（每阶段目标 + 约束）；内置任务模板（startup / router / scope-entry / adopting / handoff）；__handoff 结果报告终节点（两元素会话报告）；严格 workflow schema（未知 phase 键响亮拒绝）；graph_assets 感知列表；mermaid 合规 + interaction 扫描机器审计。
- 图：12 个内置图重写为 workflow YAML（flow 块全覆盖 — 转移表面单一来源）。
- 技能：first-principles（vendored）。

### 变更

- 引擎：调度器重建于内嵌 LangGraph 运行时（自研 FSM / state-machine / flow-flatten / topology 替换）；advance 通道 = condition / jump / end（direct-end；branchTo 删除）；子图组合删除 — 嵌套执行为 router 兄弟运行；518 测试可观测契约重写。
- 技能：graph-workflow 大改（atom-pilot / atom-phase-handler / atom-scope-interview / spec 技能）；HLT 指令层移除 — scenario-keyed 提示。

### 移除

- .taskflow.yaml 图格式（→ workflow YAML）；自研 FSM 机制；approval + gate 节点类型（→ 内联访谈 + flow 自环）；loop 模板（→ flow 自环）；HLT registry 指令层；cross-run delegation + use 组合。

## [v0.5.0]

"信号纪律模块"。

### 新增

- 包：graph-fidelity（信号纪律模块 — core chain/echo-line/runframe/pcl/resident + interfaces + OMP/opencode 适配器 + 测试套件）、prompt-assembly-probe（探针测试套件）、scripts/gen-manifests.mjs + marketplace graph-fidelity 条目。
- spec：graph-fidelity 家族（12 个子 spec）、signal-distribution、token-lifecycle、display-minimalism、questioning-primitives。

### 变更

- 引擎：激活前置流程移除（graph_start args.mode 转必填）、fsm/transition、context 契约 + resolve-channels、snapshot + api 重构；10 图 + 测试更新。
- 技能：atom-kernel、atom-pilot、atom-phase-handler、atom-graph-spec、atom-doc-maintain、atom-graph-design、atom-scope-interview、atom-skill-spec、setup-atomic-workflow 更新。
- 文档：CONTEXT.md 术语表（seam 图、信号分发、token 生命周期、显示极简）、domains.md 域索引 67 域。
- 配置：package.json、yarn.lock。

### 移除

- 引擎：prologue.ts、atom-kernel INTERVIEW-DETAIL.md。
- spec：activation-prologue、atomic-step-flows、hlt-heat-layering、mutation-plane、query-plane、omp-adapter、opencode-hlt-policy。
- 测试：constraints、defaults-single-source、init-repro（×3）。

## [v0.4.0]

"High-level tools".

### 新增

- 图：estate-maintain、release-prep。
- 技能：release-prep-analyze/release-prep-apply；文档资产技能族（atom-adr-maintain、atom-doc-lifecycle、atom-doc-maintain、atom-domain-spec、atom-spec-maintain）；HLT 注册表。
- 引擎：三层 channels + track-closure（channel 上下文模型 + 运行闭合）。
- 文档：51 份 openspec specs；docs/domains.md + CONTEXT.md（域索引 + 术语表）；技能参考文档；execution-output + opencode-hlt-policy 域。

### 变更

- 引擎：crud/loader/maintenance/snapshot/contracts/resolve-channels/transition/prologue/scheduler-runtime/phase schemas 重构（approval() 取代 question()；channel 契约简化；prologue 改为会话内报告）。
- 技能：atom-graph-spec、atom-kernel、atom-phase-handler、atom-pilot、atom-scope-interview、atom-skill-spec、setup-atomic-workflow、atom-graph-design、atom-graph-writer 优化。
- 图：adopt-with-docs、arch-review、graph-generate、openspec-apply、openspec-engineer、registry.json 重建。
- 文档：README 家族 + marketplace.json 规范描述 + blueprint 事实 0.4.0；域索引 57 域；ADR 引用重指（0097→0099、0116、index 0142）。
- 配置：package.json、skills.sh.json、marketplace.json。

### 移除

- 图：doc-update（并入 estate-maintain）。
- 技能：atom-doc-maintenance（更名 atom-doc-maintain）、atom-mcp-contract（并入 atom-kernel）、atom-openspec-archive、atom-pilot MCP-REFERENCE.md。
- spec：readme-family（退役 — 无 Doc-Family 域类）。

## [v0.3.1]

Channels 重构 + 图资产重建。

### 新增

- 图：adopt-with-docs、spec-implement。
- 技能：atom-doc-maintenance（单一 maintain() 契约）。
- 引擎：config-service（`.graph-scheduler/config.json` + schema 校验）。
- 文档：readme-blueprint（README 家族再生成源）；identity + adopt-with-docs 图测试。

### 变更

- 引擎：channels 双作用域上下文模型（全局 context + 相级 channels、节点流）；approval-handler、prologue、flow-flatten、registry-loader、scheduler-runtime、schemas、filesystem。
- 图：全部重建（arch-review(-loop)、doc-update、e2e-minimal、graph-generate、openspec-apply、openspec-engineer、registry）。
- 技能：atom-graph-design/-spec/-writer、atom-mcp-contract、atom-openspec-archive、atom-phase-handler、atom-pilot、atom-scope-interview、setup-atomic-workflow 更新。
- 文档：README 家族 + 双语 changelog 结构。
- 配置：package.json、marketplace.json、skills.sh.json、.gitignore。

### 移除

- 图：8 个旧图（grill-with-docs、implement、openspec-create、openspec-pipeline、plan-generate、skill-author、skill-change-workflow、skill-delete）。
- 技能：atom-doc-spec / atom-doc-writer（被 atom-doc-maintenance 取代）、atom-skill-writer。
- 测试：e2e-skill-change-workflow + pipeline-v2-flatten-smoke（流程移除/重构）。

## [v0.2.0]

The arch-review-loop。

### 新增

- 引擎：gate 阶段类型（带 `jumps` 条件的纯返工节点）、分支路线（`branchTo` 激活 route 归属）、激活前置流程（每激活确认 run mode、每轮加载约束）、flow 组合（加载期合并展平、深度上限 5）、审批卡重设计（自由输入 + 上下文选项）。
- 技能：atom-mcp-contract（MCP 工具调用契约）。

### 变更

- 引擎：`graph_advance` 路由（新增 `branchTo` + `endRun`、移除 `skip`）；schema 收敛（移除 `reads`/`preText`/`eval` 与顶层 `when`；`join` 仅限 `any`）。
- 文档：双语 changelog（CHANGELOG.md + docs/CHANGELOG.zh-CN.md）。

### 移除

- 引擎：顶层 `when` 跳过守卫（移至 gate `jumps[].when`）。

## [v0.1.0]

初始发布。

### 新增

- 引擎：graph-scheduler 图执行引擎 + MCP 服务器（9 工具、stdio）、纯函数 FSM 内核、libsql 持久化；审批关卡（阶段间不可绕过的决策卡）。
- 图：`.taskflow.yaml` 格式（main/approval、`dependsOn`、`task`、`skill`、`channels`、`join`）。
- 技能：graph-workflow 技能系统（atom-pilot、atom-phase-handler、atom-kernel、入口 + 参考技能）；setup-atomic-workflow（生成 `.graph-scheduler/`、幂等）。
