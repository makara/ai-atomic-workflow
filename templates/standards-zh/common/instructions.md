<!-- layer: common | scope: all-languages -->

# 通用 AI 指令

> 本文件为项目级通用 AI 行为基线——语言特定的指令补充（如包管理器、测试框架）在对应语言层中定义。

---

## 导航：何时读取哪些规范

> 本文件为项目规范的**唯一入口**。AI 在任何操作前**必须先读取本节导航表**，按场景确定需要加载的规范文件，并**显式调用 Read 工具读取对应文件**。

### 编码规范

| 当你处于以下场景 | 必须读取这些文件 |
|---|---|
| 编写/修改/审查任何代码 | `standards/common/CODING-STANDARDS.md` |
| 编写/修改/审查 JS/TS 代码 | 以上 + `standards/js-ts/CODING-STANDARDS.md` |
| 编写/修改/审查 Python 代码 | 以上 + `standards/python/CODING-STANDARDS.md` |

### AI 行为指令

| 当你处于以下场景 | 必须读取这些文件 |
|---|---|
| 进行任何操作 | `standards/common/instructions.md`（本文档） |
| 操作 JS/TS 项目 | 以上 + `standards/js-ts/instructions-supplement.md` |
| 操作 Python 项目 | 以上 + `standards/python/instructions-supplement.md` |

### Skill 调用

| 当你处于以下场景 | 参照规则 |
|---|---|
| 加载任何 skill | 本文档 §四——Skill 依赖声明 |

---

## 一、工作流约束

> **原则**：用户是唯一的阶段触发者和决策者——AI 不主动推进到下一步骤。
> **执行方式**：用户在每个阶段间显式触发，AI 不得自动切换步骤或推进流程。

- 所有正式产出必须写入文件——对话是临时媒介。
- 实施中若偏离计划，必须在产出中显式标注偏差。
- 修改必须重新确认——无论计划修改还是实施修改，都需重走审批/确认流程。

---

## 二、任务执行纪律

- 严格遵守分配的任务范围。不执行未明确请求的操作或冗余操作。
- 任何超出当前范围的改进建议须先征求用户意见，不得直接实施。
- 对用户意图不明确的要求进行澄清确认，避免假设性实施。

---

## 三、反馈通道 (F1–F5)

| 通道 | 时机 | 格式 |
|------|------|------|
| **F1 决策请求** | 发现信息缺口/方案分叉/边界模糊 | `[F1] 待决策：<问题>。方案A: <...>；方案B: <...>。建议: <...>` |
| **F2 进度更新** | 步骤开始 + 任务过半 | `[F2] <步骤名> — <进度>%。已完成: <摘要>。下一步: <...>` |
| **F3 风险预警** | 发现偏差/依赖缺失 | `[F3] ⚠️ 偏差：<描述>。影响: <范围>。建议: <方案>` |
| **F4 完成信号** | 产出落盘后 | `[F4] ✅ 产出就绪：<文件路径>。验收清单：...` |
| **F5 信息告知** | 发现关联影响 | `[F5] 📎 备注：<发现>。相关性: <为何用户关心>` |

### 不可省略的底线

- **F4（完成信号）不可省略** — 产出落盘后必须附带结构化验收清单。
- **F3（偏差标注）不可省略** — 实施中若偏离计划，必须在产出中显式标注。
- **F1（决策请求）不可隐藏** — 不得以"减少交互轮次"为由将待决策点隐藏在计划草案中。

---

## 四、Skill 依赖声明

### 规则正文

**当加载的 skill 声明了从属 skill，必须显式调用从属 skill——不得仅从当前 skill 文本中间接获取规则。**

### 父 skill 依赖表

本仓库的自有 skill 依赖以下 mattpocock/skills 父 skill：

| 自有 skill | 须同时加载的父 skill |
|---|---|
| `orchestrate` | `grilling` + `domain-modeling` + `to-spec` + `to-tickets` + `implement` + `code-review` + `diagnosing-bugs` + `triage` |
| `main-flow` | `grilling` + `domain-modeling` + `prototype` + `to-spec` + `to-tickets` | 拥有 guide file format（idea 场景步骤模板） |
| `execute` | `implement` |
| `review` | `code-review` |
| `finalize` | 声明式引用 `code-review` 三轴框架（非直接加载） |

### 调用模式

- **自有 skill 模式**：加载自有 skill 后立即调用 `skill("父skill")`——父 skill 提供完整工作流规则，自有 skill 仅叠加约束覆盖。
- **语言和 git 约束**：不由 skill 硬编码——由 `orchestrate` 入口参数和项目规范（`AGENTS.md` / `instructions.md`）决定。

---

## 五、写作风格

- 保持代码和文档简洁。匹配已有模块的语言风格，不引入新的语气或结构。
- 产出格式：先给结论，再给细节（O1 原则）。
- 不回答未被问及的问题——避免预判性输出。

---

## 六、规则冲突解决

- 内部规则冲突时以 `design-goals.md` G1–G3 为最高仲裁依据。
- 语言层规则覆盖通用层规则——语言层 file 中的规则优先于 common 层同条目。

---

## 七、步骤类型

> **原则**：步骤类型以完善的 AI 辅助开发技能体系为基础。
> **OpenCode 执行**：步骤类型以 **mattpocock/skills** 和自有 skill 体系为基础，采用三层架构组织：

| 层 | 职责 | Skill |
|---|------|-------|
| 顶层编排 | 入口路由 + 全流程引导 | orchestrate |
| 顶层编排 | idea→ship 主流程 | main-flow |
| 底层执行 | 单 issue 实施（implement → review → compress 闭环） | execute |
| 底层审查 | 三轴审查 + 返工路由 | review |
| 顶层收尾 | 架构级质量门控 + 文档同步 | finalize |
| 中层拆解 | PRD 分解为独立 issue（父 skill） | to-spec, to-tickets |
| 自有工具 | 资产盘点 / 约束配置 / 内容起草 | asset-inventory, constraint-configuration, content-authoring |

共有 8 个自有 skill + 12 个 mattpocock/skills 父 skill（不在此仓库维护）。语言和 git 策略由 `orchestrate` 入口参数和项目规范决定，不在 skill 内硬编码。

详细步骤类型定义参见已部署的 skill 文件（`~/.agents/skills/` 或项目 `skills/` 目录）。

---

## 八、约束

- 输入输出语言：中文。
- 不涉及 git 操作。
- 引导文件必须落盘——引导文件未落盘即视为未产出。
- 约束由 skill 内嵌编码——skill 文件中的规则即为约束来源。
