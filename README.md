# ai-atomic-workflow

> AI 辅助开发工作流规范项目——纯文档仓库，仅本地 Git 管理。

---

## 目录结构

```
ai-atomic-workflow/
├── core/              ← 平台无关规范（设计目标、哲学、反馈架构、三层工作流、约束等）
├── skills/            ← 8 自有 skill（英文编写）+ 12 父 skill（mattpocock/skills）
├── standards/         ← AI 行为基线（通用 + JS/TS + Python）
├── templates/         ← standards/ 部署模板（中文/英文各一套）
├── scripts/           ← deploy-global.sh / deploy-project.sh / validate.sh
├── guides/            ← 安装和配置指南
├── docs/              ← agents/ 领域文档 + adr/ 架构决策 + skill-design-reference.md
├── .scratch/          ← Issue 追踪（本地 markdown，gitignored）
├── plans/             ← 运行时计划草稿（gitignored）
└── archive/           ← 已归档产物（gitignored）
```

---

## 三层架构

```
顶层编排（orchestrate → main-flow → finalize）    ← 入口路由 + idea 四步流程 + 质量门控
中层拆解（to-spec → to-tickets）                  ← 需求综合为 spec，拆分为独立 issue
底层执行（execute → implement → review → compress） ← 单 issue 实施 + 三轴审查 + 返工路由
```

详见 `core/layered-workflow.md`。

---

## Skill 体系

### 自有 skill（8 个，英文编写）

| 层级 | Skill | 角色 |
|------|-------|------|
| 顶层编排 | `orchestrate` | 入口路由——场景检测 + 约束注入 + 引导文件头部 |
| 顶层编排 | `main-flow` | idea→ship 主流程——四步工作流（需求澄清→原型验证→产出转换→收尾审查） |
| 底层执行 | `execute` | 执行闭环——implement → review → compress，用户三选一门控 |
| 底层审查 | `review` | 三轴审查——Standards + Spec + Best-practice + 返工路由 |
| 顶层收尾 | `finalize` | 架构级质量门控 + 文档同步 |
| 自有工具 | `asset-inventory` | 资产盘点 + gap 分析 |
| 自有工具 | `constraint-configuration` | 约束配置管理 |
| 自有工具 | `content-authoring` | 非代码内容起草 |

### 父 skill（12 个，mattpocock/skills）

`grilling`、`domain-modeling`、`prototype`、`to-spec`、`to-tickets`、`implement`、`tdd`、`code-review`、`diagnosing-bugs`、`improve-codebase-architecture`、`codebase-design`、`triage`

---

## 核心目录说明

| 目录 | 内容 | 用途 |
|------|------|------|
| `core/` | 10 个规范文件：设计目标、设计哲学、反馈架构、三层工作流约定、约束分层、部署约定、步骤粒度、需求等 | 平台无关规范——人类维护者阅读，AGENTS.md 引用 |
| `skills/` | 8 个 SKILL.md（英文编写） | 步骤类型定义——每个 skill 即为该步骤类型的规范文档 |
| `standards/` | 通用 AI 行为基线 + JS/TS + Python 补充 | AI 运行时指令——通过 opencode.json 加载 |
| `templates/` | standards-zh/ + standards-en/（各 6 文件） | 部署模板——deploy-project.sh 按 --lang 参数选择 |
| `scripts/` | deploy-global.sh / deploy-project.sh / validate.sh | 部署和校验——`--dry-run` / `--apply` 门控 |
| `guides/` | 12 个安装和配置指南 | OpenCode 工具链环境搭建 |
| `docs/` | agents/（3 文件）+ adr/（5 ADR）+ skill-design-reference.md | 领域文档 + 架构决策记录 + skill 设计参考 |

---

## 快速开始

1. **安装父 skill**：`npx skills add mattpocock/skills` → 详见 `guides/mattpocock-skills-setup.md`
2. **部署自有 skill**：`scripts/deploy-global.sh --apply`
3. **引导新工作**：使用 `orchestrate` skill（自动检测场景，路由到 main-flow / diagnosing-bugs / triage）

---

## 关键约定

- **语言**：中文——AI 对话界面和产出
- **无 git**：AI 会话和脚本中不涉及 git 操作
- **用户驱动**：用户显式触发每个步骤，AI 不自动推进
- **三层架构**：编排 → 拆解 → 执行，详见 `core/layered-workflow.md`
- **Skill 体系**：8 自有 skill + 12 父 skill（mattpocock/skills），英文编写，无 zh/en wrapper
