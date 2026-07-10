# 三层工作流约定

> **来源**：R1.4 工作流模型需求
> **角色**：项目级规范文件——定义三层架构（顶层编排 / 中层拆解 / 底层执行）的关系、衔接方式和适用场景
> **受众**：人类维护者；AGENTS.md 引用本文档但不重复维护
> **参照**：`core/design-goals.md`（G1–G3）、`core/design-philosophy.md`（P1–P6）、`core/constraint-layers.md`（语言/git/执行纪律标准条目）

---

## 一、三层架构概述

本项目采用三层架构组织 AI 辅助开发工作流：

```
顶层编排（orchestrate → finalize）             ← 入口路由 + 质量门控
        │
中层拆解（to-spec + to-tickets）                 ← PRD 分解为独立 issue
        │
底层执行（execute = implement + review）       ← 单 issue 实施→审查→压缩闭环
        │                                    ↑
        └── 返工路由 ────────────────────┘
```

| 层 | 职责 | 关键 skill | 产出 |
|---|------|-----------|------|
| **顶层编排** | 入口场景路由 + 约束注入 + 流程引导 + 最终质量门控 | orchestrate, finalize | 引导文件, 质量门控报告 |
| **中层拆解** | 将需求转化为独立可执行的 issue | to-spec, to-tickets | PRD, issue 列表 |
| **底层执行** | 单个 issue 的实施→审查→压缩闭环，含返工路由 | execute（包装 implement + 调用 review） | 代码变更, 审查报告, 债务记录 |

### 1.1 顶层编排层

**orchestrate**：入口编排 skill——取代原 phase-bootstrap。负责四件事：

1. **入口场景检测**：根据用户输入判定场景类型（idea / bug / triage），路由到对应流程
2. **约束注入**：从项目规范（AGENTS.md、instructions.md）读取 `lang` 和 `git` 策略，通过 A+C 模式（显式传参 + context 继承）传递给所有子 skill
3. **场景路由**：idea → 委托给 `main-flow`（四步工作流）、bug → 委托给 `diagnosing-bugs`（6 阶段调试）、triage → 暂不支持
4. **引导文件**：产出 entry metadata header（场景 + 语言 + git）写入引导文件头部；`main-flow`（idea 场景）在 header 后追加四步状态内容

**finalize**：收尾审查 skill——取代原 phase-closure。在全部 issue 执行完成后：
- 收集所有 review 报告 + TODO 债务清单
- 执行架构级三轴审查（Standards 架构合规 / Spec 功能完整性 / Best-practice 架构优化 + 第三方模块审查）
- 用户三选一：接受 / 退回重做 / 基于 TODO 清单新建改进任务
- 若接受：同步受影响文档、验证完整性、归档过期文件

### 1.2 中层拆解层

**to-spec**：将需求转化为 PRD——含问题陈述、解决方案、用户故事、实施决策。

**to-tickets**：将 PRD 拆分为独立可承接的 issue——每个 issue 为 tracer bullet 垂直切片。

### 1.3 底层执行层

**execute**：执行闭环 skill——取代独立的 implement 调用。每个 issue 经过三步内置链：

```
execute（单 issue）
  ├── implement    ← 父 skill，基于 PRD/issue 实施代码
  ├── review       ← 自有 skill，三轴审查 + scope 标注
  └── compress     ← 平台映射（OpenCode → dcp-compress）
```

**review** 完成后，用户三选一：

| 选择 | 行为 | compress 是否执行 |
|------|------|------------------|
| 接受 | issue 完成，输出验收清单 + 下一步建议 | 是 |
| 返工 | 重回 implement → review 循环 | 否 |
| 记录 TODO | issue 标记通过，债务落盘，finalize 时汇总 | 是 |

#### review 返工路由

review（三轴审查）完成后，AI 标注每个 Best-practice 发现问题的 scope 等级和建议方向，由用户决策：

```
review 三轴审查
        │
        ▼
  问题 scope 标注
        │
   ┌────┼────┐
   ▼         ▼         ▼
≤ issue   > issue     TODO
   │         │         │
   ▼         ▼         ▼
回底层      回中层      记债
重执行      新建 PRD     passed
implement   → issues     │
   │         │         ▼
   ▼         ▼       finalize
 review    implement   （汇总）
（重新审查） + review
```

- **scope ≤ issue**：问题可在一个 issue 范围内修复 → 回到底层，重新执行 implement → review
- **scope > issue**：问题涉及架构调整或新增功能 → 回到中层，新建 PRD → to-tickets → execute
- **TODO**：问题确认但暂不修复 → 记录债务（问题描述 + scope + 影响范围），finalize 时汇总

返工路由**由用户决策**——AI 仅标注 scope 等级和建议方向，不自动执行。

---

## 二、Skill 体系

所有步骤类型以 skill 为定义来源——每个 skill 的 SKILL.md 即为该步骤类型的规范文档。

### 2.1 自有 skill（8 个——本仓库维护）

| 分类 | Skill | 职责 |
|------|-------|------|
| 顶层编排 | `orchestrate` | 入口场景路由 + lang/git 约束注入 + 引导文件 + 平台映射 |
| 顶层编排 | `main-flow` | idea→ship 主流程：四步工作流（需求澄清→原型验证→产出转换→收尾审查） |
| 顶层编排 | `finalize` | 收尾质量门控：架构级三轴审查 + TODO 债务汇总 + 文档同步 |
| 底层执行 | `execute` | 执行闭环：implement → review → compress，用户三选一 |
| 底层执行 | `review` | 三轴审查（基于 code-review 扩展 Best-practice）+ scope 标注 + 返工路由 |
| 自有工具 | `asset-inventory` | 资产盘点：系统性盘点现有资产，对照目标产出差距分析 |
| 自有工具 | `constraint-configuration` | 约束配置：按约束层（全局/项目指令/项目规范）新增或修改配置条目 |
| 自有工具 | `content-authoring` | 内容起草：起草非代码内容产物（文档、演讲稿、分析报告等） |

所有自有 skill 以英文编写，产出语言由 `orchestrate` 传入的 `lang` 参数决定——参见 `core/language-policy.md`。

### 2.2 父 skill（12 个——mattpocock/skills 包管理）

| Skill | 调用者 | 说明 |
|-------|--------|------|
| `grilling` | main-flow（步骤1）/ triage |  relentless interview，一案一问 |
| `domain-modeling` | main-flow（步骤1）/ triage | 维护 CONTEXT.md 词汇表 + ADR |
| `prototype` | main-flow（步骤2） | throwaway code 回答设计问题 |
| `to-spec` | main-flow（步骤3） | 合成对话上下文为 PRD，不采访用户 |
| `to-tickets` | main-flow（步骤3） | tracer bullet 垂直切片拆分 |
| `implement` | execute（步骤1） | 基于 PRD/issue 实施代码 |
| `tdd` | implement 内部 | 测试驱动开发 |
| `code-review` | review 内部（作为 2 轴基座） | Standards + Spec 审查 + 2 并行子代理 |
| `diagnosing-bugs` | orchestrate（bug 场景） | 6 阶段调试循环 |
| `improve-codebase-architecture` | diagnosing-bugs post-mortem | 深化机会扫描 |
| `codebase-design` | improve-codebase-architecture | 深模块设计词汇 |
| `triage` | orchestrate（triage 场景） | issue 分类→验证→grill→agent-ready brief |

> `setup-matt-pocock-skills` 为一次性仓库配置工具，不计入运行时 skill 清单。

### 2.3 约束从何处来

Skill 不硬编码语言或 git 行为。约束通过两条路径传递：

| 路径 | 机制 | 来源 |
|------|------|------|
| **C（context 继承）** | 项目规范文件（instructions.md, AGENTS.md）加载到对话 context，子 skill 从中读取 | `core/constraint-layers.md` §二 |
| **A（显式传参）** | orchestrate 调用子 skill 时显式传入 `lang`、`git` 参数 | 入口参数 > 项目声明 > 全局默认 |

A 和 C 互为冗余——任一有效即可保证约束生效。

---

## 三、入口场景路由

orchestrate 支持四种入口场景，通过 Goals/Rules 格式或自然语言判定。入口格式为：

```
Use orchestrate skill
Goals:
- <自然语言描述的目标>
- <可混合 bug 和 feature>
Rules:
- <自然语言约束>
```

- **Goals**：自然语言列表——每个条目可以是 bug 报告、feature 需求、设计变更等，允许混合不同类型的 Goals
- **Rules**：自然语言约束——lang、git、scope 等，不要求严格的 key=value 格式

自然语言输入兜底——没有结构化格式时整体视为 Goals，模糊时主动提问确认。

| 类型 | 触发条件 | 路由 |
|------|---------|------|
| `idea` | 用户有新功能/变更需求 | `main-flow` skill — 四步工作流（grilling+domain-modeling → prototype → to-spec → to-tickets → execute per issue → finalize） |
| `bug` | 用户报告单个 bug | `diagnosing-bugs` skill — 完整 6 阶段调试流程（feedback loop → reproduce → hypothesize → instrument → fix + regression test → post-mortem）；完成后走 execute + finalize |
| `triage` | 用户有一批未分类的 issue/request | 暂不支持 — 告知用户并跳过 |
| 中断 | execute/review 中发现 bug | [F3] 预警 → 用户决策 → diagnosing-bugs 或直接修复 |

---

## 四、审批位置

审批不独立成为步骤——融入各 skill 的验收环节。用户审视产出后：

- **接受** → 当前步骤完成
- **退回重做** → 修正后重新提交验收
- **新建任务** → 对审查中发现的问题，回到中层拆解新建 PRD → issues

execute 的 review 步骤额外提供 **记录 TODO** 选项：issue 标记通过但债务留待 finalize 汇总。

---

## 五、引导文件格式约定

引导文件由两部分构成——entry metadata header 由 `orchestrate` 写入，步骤内容由各场景的 workflow skill（如 `main-flow`）追加。

### 5.1 Entry metadata header（orchestrate 写入）

```markdown
# 阶段引导 — <目标>
> **日期**：YYYY-MM-DD
> **Entry scenario**: <idea | bug | interrupt>
> **Language**: conversation=<zh|en>, documents=<zh|en>
> **Git policy**: <allowed | not-allowed>

<!-- steps below written by the workflow skill -->
```

### 5.2 Idea 场景步骤内容（main-flow 写入）

四步流程的步骤状态由 `main-flow` 的 Guide File Format 定义（见 `skills/main-flow/SKILL.md`）。其他场景的 workflow skill（如未来的 bug-flow）可定义自己的跟踪格式。

---

## 六、三层衔接

### 6.1 标准流程（idea 场景）

```
orchestrate（顶层）
  ├── 步骤1: grilling + domain-modeling → 需求澄清
  ├── 步骤2: prototype → 原型验证（可选）
  ├── 步骤3: to-spec → to-tickets → execute per issue（中层 + 底层）
  │         └── execute = implement → review → compress
  │                      └── 返工路由: ≤issue→回底层 / >issue→回中层 / TODO→记债
  └── 步骤4: finalize → 质量门控 + 债务汇总（顶层）
```

### 6.2 Bug 场景

```
orchestrate → diagnosing-bugs → execute → finalize
```

### 6.3 Triage 场景

```
orchestrate → triage → execute per issue → finalize
```

### 6.4 中断场景

```
execute/review 中发现 bug
  → [F3] 预警 → 用户决策
      ├── diagnosing-bugs → 修复 → 继续 execute
      ├── 新建 issue → 并入 issue 列表 → 后续 execute
      └── 记录 TODO → 继续当前 execute → finalize 汇总
```

### 6.5 依赖处理

- **无依赖**：可独立或并行执行
- **有依赖**：必须在前序步骤完成（验收通过）后执行
- 依赖仅关注文件落盘产出——不依赖对话历史（G3）

### 6.6 产出传递

| 产出类型 | 落盘路径 | 示例 |
|---------|---------|------|
| 引导文件 | `plans/` | `plans/skills-system-review.md` |
| PRD | `.scratch/<feature>/PRD.md` | `.scratch/skills-consolidation/PRD.md` |
| Issue | `.scratch/<feature>/issue-N.md` | `.scratch/skills-consolidation/issue-1.md` |
| 代码变更 | skill 文件中指定的目标路径 | `skills/*/SKILL.md` |
| 审查报告 | execute → review 产出 | 三轴审查结果 + scope 标注 |
| 债务记录 | execute → review（TODO 选项）产出 | 问题描述 + scope + 影响范围 |
| 质量门控报告 | finalize 产出 | 追加至引导文件或独立文件 |

---

## 七、与 AGENTS.md 的关系

| 维度 | `core/layered-workflow.md` | `AGENTS.md` |
|------|---------------------------|-------------|
| **性质** | 项目级规范文件 | AI 运行时行为基线 |
| **受众** | 人类维护者——理解 repo 的工作流设计 | AI——加载到 context 后的行为约束 |
| **内容** | 三层模型定义、衔接方式、格式约定、产出传递规范 | 架构概览、skill 列表、脚本门控、语言/git/平台约束 |
| **维护** | 独立维护——工作流模型变更时更新 | 独立维护——引用本文件但不重复其中的细节 |
| **加载** | 人类阅读——不被 AI 自动加载 | `opencode.json` 配置后 AI 会话自动加载 |
