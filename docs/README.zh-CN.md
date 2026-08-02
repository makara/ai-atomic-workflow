# Atomic Workflow ![alpha](https://img.shields.io/badge/status-alpha-orange)

> ⚠️ AI 生成的 README — 修改请编辑 [readme-blueprint.md](readme-blueprint.md)。

**Languages**: [English](../README.md) · 中文（本文件）

**Graph is just a tool; Attention is all you need.**

面向 AI 智能体的图驱动工作订单系统：显式阶段、作用域上下文与不可绕过的审批关卡。

![alpha](https://img.shields.io/badge/status-alpha-orange) ![license](https://img.shields.io/badge/license-MIT-blue) ![platform](https://img.shields.io/badge/platform-OMP%20%7C%20OpenCode-lightgrey)

---

## 问题（The Problem）

AI 智能体会悄悄跳过步骤、在阶段之间丢失上下文、无法表达条件分支、缺少结构化的审批关卡。这些失败的共同根源是：**智能体没有工作订单系统（work-order system）**。它被告知"构建这个功能"，然后即兴发挥。当它漏掉评审步骤或忘记更新文档时，执行模型里没有任何机制阻止它——因为根本不存在执行模型。Atomic Workflow 给了智能体一个：显式阶段、声明的依赖、运行时上下文注入，以及不可绕过的审批关卡。

---

## 工作原理（How It Works）

**基于图的运行时工作订单。** 每个阶段都是一份自包含的工作订单。你的智能体拉取下一个就绪订单，执行它，回报结果；调度器推进图。图只跟踪进度、提醒下一步——它不执行任何东西。DAG 能表达线性链做不到的事：条件分支、审批关卡、并行扇出。

**基于通道的上下文隔离。** 每份工作订单携带精确的提示词、正确的技能，以及一个由上游阶段输出构建的上下文"通道"——按阶段声明为通道模式：技能名、文件 glob，或上游节点引用，按执行技能的上下文契约解析。通道只是一个概念：一份聚焦的相关决策与产物切片，不重。不再有"我们在哪？"或"之前决定过什么？"——你的智能体精确拿到_这一步_需要的东西。

**提示而非控制——图从不派发。** 图说明每个阶段_需要什么_——技能、上下文，以及（可选的）按优先级排列的智能体类型偏好。派发本身留在你的智能体手里：当技能扇出子智能体时，它遵循的是提示，而不是图的指令。图是工作订单看板，不是管理者。

**你的智能体仍然做所有事。** 没有代码执行，没有隐藏引擎，没有新的运行时语言。智能体保留完整工具箱——技能、工具、文件——并完成所有工作。图只下发订单、跟踪进度。这就是全部机制。

**Attention is all you need.** 智能体的失败源于注意力涣散，而非能力不足。"构建这个功能"太大；"给定上一步的 schema，编写 User 模型类型定义"刚刚好。一份边界清晰的工作订单消除了导致跳步、漏评审和范围漂移的歧义。

---

## 安装（Installation）

### graph-scheduler

一个包、两种能力：**MCP Server**（9 个工具，stdio 传输）和 `atom-graph-scheduler` bin。两条安装路线——**运行时与安装器匹配**：

**路线 A：npm + Node 运行时**

```bash
npm install -g @ai-atomic-workflow/graph-scheduler
```

运行时：[Node](https://nodejs.org) ≥ 22。包从编译产物运行——先解析全局路径再注册：

```bash
npm root -g   # → <npm-root>，例如 /usr/local/lib/node_modules
```

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "node",
      "args": ["<npm-root>/@ai-atomic-workflow/graph-scheduler/dist/server.js"]
    }
  }
}
```

**路线 B：bun**

```bash
bun add -g @ai-atomic-workflow/graph-scheduler
```

运行时：[bun](https://bun.sh) ≥ 1。bun 直接执行 TypeScript 入口：

```bash
bun pm root -g   # → <bun-root>，例如 ~/.bun/install/global/node_modules
```

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "bun",
      "args": ["<bun-root>/@ai-atomic-workflow/graph-scheduler/server.ts"]
    }
  }
}
```

配置文件位置：OMP → `~/.omp/agent/mcp.json`，OpenCode → `opencode.json`。完整细节 → [packages/graph-scheduler/README.md](../packages/graph-scheduler/README.md)。

### graph-workflow

两条安装渠道，任选其一（执行图需要全部 13 个内置技能）：

**选项 A：Claude Code marketplace**

```bash
/marketplace install makara/ai-atomic-workflow
```

**选项 B：skills.sh**（第三方 CLI，支持 76+ 智能体平台——OpenCode / Codex / Cursor 等）

```bash
# 完整安装（13 个 graph-workflow 技能 + 旧技能）
npx skills add makara/ai-atomic-workflow

# 仅 graph-workflow —— 13 个内置技能（tree-subpath 源，不依赖 marketplace.json）
npx skills add https://github.com/makara/ai-atomic-workflow/tree/main/packages/graph-workflow/skills
```

常用参数：`-a <agent>` 选择平台（`-a '*'` 全部），`-g` 全局安装，`-y` 非交互，`-l` 只预览不安装。

### 依赖（Dependencies）

openspec 图和父级技能链的两个前置条件：

- **OpenSpec CLI** — `npm install -g @fission-ai/openspec@latest`，然后在项目内 `openspec init`。→ [安装文档](https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md)
- **mattpocock/skills** — 父级技能（grilling、domain modeling、TDD、code review）：`npx skills add mattpocock/skills`。→ [README](https://github.com/mattpocock/skills/blob/main/README.md)

## 初始化（Setup）

用 **setup-atomic-workflow** 技能初始化项目（已退役的 `graph-config` CLI 不再存在）：

```
Use setup-atomic-workflow to initialize this project
```

它会生成 `.graph-scheduler/` — `config.json`（数据库路径、taskflow 目录、registry 路径）、`graphs/` 和 `constraints.md`。幂等：绝不覆盖已有文件。重复运行不写入任何内容。

---

## 快速开始（Quick Start）

安装 graph-workflow 技能后，用 `atom-pilot` 驱动内置图——它处理完整执行循环（`graph_start` → 阶段派发 → `graph_advance`）并呈现审批关卡。

**本节阅读方式**：代码块是**发送给你的智能体的提示词**（原样使用）；普通文字是说明。所有提示词遵循同一个模板；尖括号 `< >` 里的部分由你填写：

```
Use atom-pilot to run <graph name>: <your goal in plain language>
```

**1. 发现问题或打磨想法** — 运行 arch-review：

```
Use atom-pilot to run arch-review: analyze this codebase for structure, coupling hotspots, and dead code.
```

**2. 把结果变成变更** — 两条路线：

**一步到位** — 运行完整生命周期：

```
Use atom-pilot to run openspec-pipeline: spec creation, human approval, and implementation in one run.
```

**分步组合** — 自己编排流水线：

- `openspec-create` — 把评审报告转成 OpenSpec 变更（spec）
- （可选）`plan-generate` — 从 spec 生成实现工单
- 用你喜欢的方式实现 spec 或工单 — 普通会话、mattpocock/skills、你自己的流程
- `openspec-apply` — 应用变更：双重评审、有界返工、归档

**3. 制作图或技能** — 元工作流本身就是内置图，驱动方式相同：

- `graph-generate` — 把自然语言描述转成 `.taskflow.yaml`：

```
Use atom-pilot to run graph-generate: generate a workflow for release notes from merged PRs.
```

- `skill-author` — 创建或编辑 SKILL.md：

```
Use atom-pilot to run skill-author: make a skill that auto-generates changelogs from git history.
```

**直接用 MCP 工具？** 这一切背后的循环是 `graph_start` → 执行返回的工作订单 → `graph_advance` → 重复直到 null。如果你想绕开 atom-pilot 直接驱动 MCP 工具，参见 [packages/graph-scheduler/README.md](../packages/graph-scheduler/README.md) 中的调用流示例。

**想深入？** → [packages/graph-scheduler/README.md](../packages/graph-scheduler/README.md) 看图格式和全部工具，[packages/graph-workflow/README.md](../packages/graph-workflow/README.md) 看技能系统，[technical-overview.md](technical-overview.md) 看执行模型。

---

## 架构（Architecture）

两个包：

|Package|角色|
|-|-|
|**graph-scheduler**|基础设施。MCP Server（DAG 执行引擎，9 个工具）+ 随包发布的内置图。|
|**graph-workflow**|技能系统。`atom-pilot`（生命周期循环）、`atom-phase-handler`（按阶段类型派发）、入口与参考技能。|

**内置图** — 开箱即用：

|图|作用|
|-|-|
|**arch-review-to-spec**|组合流水线：架构评审 → 决策关卡 → 可选 spec 生成|
|**arch-review**|架构评审：范围探测 → 评审报告|
|**doc-update**|文档更新：访谈 → 分析 → 确认 → 编写 → 评审 → 审批|
|**graph-generate**|元图：从自然语言描述生成 `.taskflow.yaml`|
|**openspec-apply**|OpenSpec 应用：应用变更 → 双重评审 → 有界返工 → 归档|
|**openspec-create**|OpenSpec spec 创建：范围访谈 → 审批 → 架构决策 → propose CLI|
|**openspec-pipeline**|OpenSpec 生命周期：spec 创建 → 人工审批 → 实现|
|**plan-generate**|通用计划生成：范围访谈 → PRD → 可选工单拆分|
|**skill-author**|技能编写：创建或编辑 — 范围 → 编写 → 评审 → 审批|
|**skill-change-workflow**|编排式技能变更：计划 → 编写 + 删除 + 文档 → 交叉评审 → 审批|
|**skill-delete**|技能删除：选择 → 影响分析 → 确认 → 执行 → 评审 → 审批|
|**e2e-minimal**|最小端到端：main → approval 循环，用于学习|

---

## 状态与路线图（Status & Roadmap）

Atomic Workflow 处于 **alpha** 阶段。

**稳定**（已实现，v1.0 前无计划中的破坏性变更）：

- graph-scheduler FSM 引擎与 9 个 MCP 工具
- `.taskflow.yaml` 图格式与阶段 schema（main/approval + flow 组合、when 守卫、join 模式、channels、agent 提示）
- CRUD 执行循环（`graph_start` → `graph_advance` → `graph_jump`，另有 `graph_status` / `graph_list`）
- setup-atomic-workflow 项目初始化
- 12 个内置图与 13 个内置技能

**活跃开发中**（可能变化）：

- 更多控制流特性 — when 守卫、join 模式、routing 动作
- 更多内置图 / 工作流
- 数据维护工具（当前 `graph_clean_*` 很简陋）— MCP 工具接口可能变化

### v1.0 路线图

- [ ] skill-edit 图（alpha）
- [ ] 跨平台 MCP 支持 + phase schema v1 冻结（v1.0）

<!-- → 详见 [ROADMAP.md](../ROADMAP.md)。 -->

---

## 贡献（Contributing）

欢迎提交 bug 报告与 pull request。架构概览见 [CONTEXT.md](../CONTEXT.md)，架构决策记录见 [docs/adr/](adr/)。更多 → [CONTRIBUTING.md](../CONTRIBUTING.md)。

## 依赖（Dependencies）

- [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec/blob/main/docs/installation.md) — openspec 图的 spec 生命周期
- [mattpocock/skills](https://github.com/mattpocock/skills/blob/main/README.md) — grilling、domain modeling、TDD 等父级技能

## 致谢（Thanks）

- [taskflow](https://heggria.github.io/taskflow) — DAG 执行模型灵感
- [Oh My Pi](https://omp.sh/) — 智能体工作台平台

---

## 延伸阅读（Further Reading）

|文档|用途|
|-|-|
|[packages/graph-scheduler/README.md](../packages/graph-scheduler/README.md)|图格式、全部 9 个 MCP 工具、内置图、用图制作技能/图|
|[packages/graph-workflow/README.md](../packages/graph-workflow/README.md)|技能系统、完整技能列表、技能如何驱动图执行|
|[technical-overview.md](technical-overview.md)|图执行模型、阶段类型、when 守卫、技能系统|
|[glossary.md](glossary.md)|术语参考|
|[ROADMAP.md](../ROADMAP.md)|计划里程碑与 v1.0 目标|
|[CONTEXT.md](../CONTEXT.md)|面向贡献者的内部架构参考|
