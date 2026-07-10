# AI 规范复用指南 (REUSE-GUIDE)

> **适用范围**：在支持 OpenCode 的 AI 化环境中复用本仓库的 skill 和规范资产。
> **前提**：假定 skills 已部署。如尚未部署，先运行 `scripts/deploy-global.sh --apply`。

---

## 快速启动

```bash
# 1. 安装 mattpocock/skills（一次性）
npx skills add mattpocock/skills

# 2. 部署自有 skill（一次性）
scripts/deploy-global.sh --apply
```

详见 `guides/mattpocock-skills-setup.md`。

---

## 模板 A：加载 Skill 执行任务

适用场景：使用当前架构的 skill 执行具体任务。

```
使用 <skill-name> skill [参数]
```

**常用 skill 快速引用表**：

| 场景 | Skill（自有） | Skill（父） |
|------|-------------|------------|
| 入口编排（自动检测场景，路由到对应工作流） | `orchestrate` | — |
| idea→ship 主流程（需求澄清→原型验证→产出转换→收尾审查） | `main-flow` | — |
| 需求澄清（无代码库） | — | `grilling` |
| 需求澄清（有代码库） | — | `grilling` + `domain-modeling` |
| 原型验证 | — | `prototype` |
| 生成 Spec | — | `to-spec` |
| 拆分 Issue | — | `to-tickets` |
| 单 issue 实施（implement → review → compress 闭环） | `execute` | — |
| 底层实施 | — | `implement` |
| 三轴代码审查（Standards + Spec + Best-practice） | `review` | — |
| 架构级质量门控 + 文档同步 | `finalize` | — |
| 资产盘点 | `asset-inventory` | — |
| 约束配置 | `constraint-configuration` | — |
| 内容起草 | `content-authoring` | — |

---

## 模板 B：入口引导新工作

适用场景：开始新项目或大变更前，使用 `orchestrate` 编排执行路径。

```
Use orchestrate skill
Goals:
- <自然语言目标 1>
- <自然语言目标 2>
Rules:
- <自然语言约束 1>
- <自然语言约束 2>
```

orchestrate 自动检测场景（idea / bug / triage），注入语言和 git 策略，路由到对应工作流 skill。详见 `skills/orchestrate/SKILL.md`。

---

## 模板 C：部署到下游项目

```bash
# 部署自有 skill 到全局
scripts/deploy-global.sh --dry-run   # 预览
scripts/deploy-global.sh --apply     # 执行

# 部署 OpenCode 配置到目标项目
scripts/deploy-project.sh <target> --dry-run
scripts/deploy-project.sh <target> --apply
```

---

## 模板 D：终端操作

```
请执行：<命令描述>
```

**约束**：
- 使用 `rtk` 前缀过滤 shell 输出——避免 token 暴涨
- 对可能修改文件的操作，先说明影响范围再执行

---

> 约束层叠规则和 Skill 链式调用规则详见 `standards/common/instructions.md`。
