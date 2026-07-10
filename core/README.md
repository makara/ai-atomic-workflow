# core/ — 规范定义

> `core/` 为项目级规范目录——存放平台无关的规范定义、设计目标和约定文档。

## 索引

| 文件 | 角色 | 读取时机 |
|------|------|---------|
| `design-goals.md` | 最高优先级设计目标 G1–G3 | **方案仲裁**时——规则存在歧义以此为准 |
| `design-philosophy.md` | 设计哲学 P1–P6 | **方案设计**时——原则指导具体决策 |
| `layered-workflow.md` | 三层工作流约定（编排 + 拆解 + 执行） | **编排引导文件**时——格式约定和衔接规则 |
| `feedback-architecture.md` | F1–F5 反馈通道定义 + 格式模板 | **AI 会话加载**——`.opencode/instructions.md` 引用 |
| `constraint-layers.md` | 三层约束模型（全局/项目指令/项目规范） | **约束配置**时——层归属判断 |
| `deploy-conventions.md` | 部署分层约定（全局 skills + 项目配置） | **部署脚本执行**时——全局/项目层行为 |
| `step-granularity.md` | 步骤粒度设计标准（边界/拆分/独立性） | **步骤/skill 设计**时——非 AI 执行时加载 |
| `REQUIREMENTS.md` | 平台无关功能需求 | **需求追溯**时——架构决策的验收依据 |

## 按场景分组

### 设计仲裁（歧义时优先）

- `design-goals.md` — G1 工程化 / G2 双向沟通 / G3 Context 管控

### 设计时参考

- `design-philosophy.md` — P1–P6
- `step-granularity.md` — 步骤边界判定

### AI 会话加载

- `feedback-architecture.md` — F1–F5 格式模板

### 部署时参考

- `constraint-layers.md` — 约束层归属
- `deploy-conventions.md` — 部署脚本行为

### 编排时参考

- `layered-workflow.md` — 三层工作流衔接 + 引导文件格式

### 需求追溯

- `REQUIREMENTS.md` — 功能与非功能需求验收标准
