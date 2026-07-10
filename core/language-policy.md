# 语言策略

> **用途**：定义 AI 对话和文档产出的语言使用规范——按场景分离、默认值、覆盖优先级。
> **来源**：`core/constraint-layers.md` §二（语言策略标准条目）。
> **约束层**：项目指令层（可被入口参数覆盖）。

---

## 一、两个维度

| 维度 | 键名 | 含义 | 默认值 |
|------|------|------|--------|
| 对话语言 | `lang.conversation` | AI 与用户交互时使用的语言 | `zh` |
| 文档语言 | `lang.documents` | PRD、Issue、plans/ 引导文件等独立文档的产出语言 | `zh` |

两个维度独立配置——允许"中文对话 + 英文文档"或"英文对话 + 中文文档"等组合。

---

## 二、覆盖优先级

```
入口参数（orchestrate lang 参数）
    ↓ 覆盖
项目 AGENTS.md / instructions.md 声明
    ↓ 覆盖
全局默认（zh）
```

runtime 解析规则：

**`lang.conversation`**：
1. auto-detect：从 Goals 文本的语言推断——中文 Goals → `zh`，英文 Goals → `en`
2. 若 auto-detect inconclusive，读取 Rules 中的显式 lang 指令
3. 若 orchestrate 调用时显式传入 `lang.conversation`，使用传入值
4. 否则读取项目 `AGENTS.md` 或 `instructions.md` 中的声明
5. 若项目未声明，回退到全局默认 `zh`

**`lang.documents`**：
1. Rules 中的显式指令（如 `lang.documents=en`、`文档用英文`）
2. 若 orchestrate 调用时显式传入 `lang.documents`，使用传入值
3. 否则读取项目 `AGENTS.md` 或 `instructions.md` 中的声明
4. 若项目未声明，回退到全局默认 `zh`

---

## 三、各场景语言决定层

| 场景 | 决定键 | 决定层 | 可否被 orchestrate 覆盖 |
|------|--------|--------|------------------------|
| AI 对话 | `lang.conversation` | 入口参数 > 项目指令层 > 全局默认 | 是 |
| 独立文档（PRD、Issue、plans/、ADR） | `lang.documents` | 入口参数 > 项目指令层 > 全局默认 | 是 |
| 代码注释 | — | 项目规范层 `CODING-STANDARDS.md` | 否 |
| 代码标识符（变量名、函数名、类型名） | — | 固定英文（业界惯例） | 否 |
| Commit message | — | 项目规范层 | 否 |
| CONTEXT.md 术语定义 | `lang.documents` | 入口参数 > 项目指令层 > 全局默认 | 是 |

---

## 四、配置示例

### 中文项目（默认）

```yaml
# AGENTS.md 或 instructions.md
language:
  conversation: zh
  documents: zh
```

### 英文项目

```yaml
# AGENTS.md 或 instructions.md
language:
  conversation: en
  documents: en
```

### 混合项目（中文对话 + 英文文档）

```yaml
# AGENTS.md 或 instructions.md
language:
  conversation: zh
  documents: en
```

### 入口参数覆盖

```
orchestrate lang.conversation=en lang.documents=zh
```

---

## 五、设计决策

- **代码标识符固定英文**：非语言策略问题，是软件工程的跨语言通用约定
- **代码注释和 commit message 由 CODING-STANDARDS.md 决定**：属于项目规范层，与 AI 行为指令层解耦
- **CONTEXT.md 语义上属于文档**：因此跟随 `lang.documents`
- **默认 zh**：本规范体系的源语言为中文，英文项目需显式覆盖
