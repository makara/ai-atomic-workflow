# 部署分层约定

> **角色**：项目级规范——定义 skills 和 OpenCode 配置的部署方式和层级
> **参照**：`plans/requirements.md` §R4、§R5

---

## 一、两层部署模型

| 部署层 | 目标 | 内容 | 脚本 |
|--------|------|------|------|
| **全局层** | `~/.agents/skills/` | 自有补充 skills + 薄封装 skills | `deploy-global.sh` |
| **项目层** | 目标项目的 `.opencode/` | OpenCode 配置文件 | `deploy-project.sh` |

两个部署层互不重叠——同一 artifact 不存在于两层。Skills 是跨项目共享的工具能力，仅部署于全局。OpenCode 配置是项目级行为基线，按需部署到各项目。

> `~/.agents/skills/` 为 OpenCode 内置默认技能路径——skills 部署至此后自动生效，`opencode.json` 中不需要 `skills` 字段。

---

## 二、deploy-global.sh（全局层）

**用途**：将 `skills/` 下所有 SKILL.md 部署到 `~/.agents/skills/<name>/SKILL.md`。

**参数**：
- `--dry-run` — 预览复制操作，不实际执行
- `--apply` — 执行部署
- `--help` — 显示用法

**行为**：
- 遍历 `skills/<name>/SKILL.md`
- 目标目录不存在则创建
- 覆盖同名 SKILL.md；不删除目标目录中的其他文件
- 输出统计：新建 / 覆盖 / 跳过计数

---

## 三、deploy-project.sh（项目层）

**用途**：从 `opencode/templates/` 部署 OpenCode 配置到目标项目。

**参数**：
- `<目标项目路径>` — 必填，目标项目的根目录
- `--dry-run` — 预览操作
- `--apply` — 执行部署
- `--help` — 显示用法

**行为**：

| 文件 | 目标不存在 | 目标已存在 |
|------|-----------|-----------|
| `opencode.json` | 直接复制 | JSON 字段级合并——保留目标已有字段，确保 `instructions` 引用正确 |
| `instructions.md` | 直接复制到 `.opencode/instructions.md` | 跳过并警告——纯文本无法安全合并 |
| `agents/`（可选） | 复制整个目录 | 跳过并警告 |

合并策略：仅覆盖 `instructions` 字段，保留用户配置的其他字段。

> `~/.agents/skills/` 是 OpenCode 技能加载的默认路径——无需在 `opencode.json` 中显式配置。deploy-global.sh 将 skills 部署至此目录后，OpenCode 自动加载。

---

## 四、部署模版目录

```
opencode/templates/
├── opencode.json          ← 零替换——直接复制即可使用
└── instructions.md        ← 零替换——无 {{placeholder}} 占位符
```

模版文件不嵌入任何 `{{project_name}}` 等占位符——复制即用。这与 R4.4 "模版零替换" 约束一致。

---

## 五、内部维护脚本

| 脚本 | 用途 |
|------|------|
| `validate.sh` | 只读校验：skills/ 结构、core/ 引用、AGENTS.md 一致性、脚本 git 检查、薄封装描述检查 |

内部脚本不涉及部署逻辑——仅用于 repo 自身的一致性维护。

---

## 六、门控约定

所有脚本遵循统一门控：

| 模式 | 标志 | 说明 |
|------|------|------|
| 预览 | `--dry-run` | 仅输出将要执行的操作，不做任何修改 |
| 写入 | `--apply` | 执行实际部署 |
| 帮助 | `--help` | 显示用法，不执行操作 |
| 缺省 | 无参数 | 显示帮助——防止意外执行 |

所有脚本不含 git 命令。
