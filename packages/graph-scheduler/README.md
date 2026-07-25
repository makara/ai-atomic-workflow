# Graph-Scheduler

Taskflow DAG 执行引擎——独立 MCP Server 进程（stdio 传输），提供 9 个 MCP tools。

Graph-Scheduler 是 ai-atomic-workflow 的核心域，负责加载 `.taskflow.yaml` 图定义、按拓扑顺序调度节点执行、管理 approval 决策、持久化运行状态。通过 MCP JSON-RPC 2.0 over stdio 与 Skills 域和 Platform-Adapter 域交互——OMP 平台管理其进程生命周期。

**技术栈**：bun · Effect-TS · zod v4（数据校验）· libsql（持久化）· MCP SDK

## 前置条件

- [bun](https://bun.sh) ≥ 1.x（运行时）
- [npm](https://nodejs.org) ≥ 9.x（包管理）
- 本地已克隆 `ai-atomic-workflow` 仓库

## 安装

从本地源码全局安装：

```bash
npm install -g ./packages/graph-scheduler
```

验证：

```bash
npm list -g graph-scheduler
# 输出: graph-scheduler@0.0.0 -> ./packages/graph-scheduler
```

> 包无 `bin` 入口——全局安装后不创建 shell 命令。启动通过 npm 执行脚本或 bun 直接运行。

## 配置

### MCP 注册

在 `~/.omp/agent/mcp.json`（用户级）或 `.omp/mcp.json`（项目级）中注册：

```json
{
  "mcpServers": {
    "graph-scheduler": {
      "command": "bun",
      "args": ["run", "/path/to/ai-atomic-workflow/packages/graph-scheduler/server.ts"]
    }
  }
}
```

OMP 平台自动管理 Graph-Scheduler 进程生命周期：discover → spawn → connect → health check → reconnect。崩溃不影响 OMP session——自动重连。

### 环境变量

|变量|默认值|说明|
|-|-|-|
|`GRAPH_SCHEDULER_DB_PATH`|`.graph-scheduler/data.db`|libsql 数据库文件路径——存储 graph_runs 和 node_states 表|

## 启动

Graph-Scheduler 使用 **stdio 传输**——通过 stdin/stdout 通信，**不监听网络端口**。

```bash
# 全局安装后，在包目录内
cd packages/graph-scheduler
npm start

# 或直接运行（任意目录）
bun run packages/graph-scheduler/server.ts
```

启动后，MCP client（如 OMP 平台）通过 stdio pipe 建立 JSON-RPC 连接。无需配置端口或防火墙。生产环境中由 OMP 平台通过 `mcp.json` 自动 spawn 进程——无需手动启动。

## MCP Tools

9 个 tools——One-Per-Action 模式。每 tool 有独立 JSON Schema inputSchema。

|Tool|参数|说明|
|-|-|-|
|`graph_start`|`graphName: string`, `args?: object`|创建新 run，立即返回首个待执行节点（NextNode）|
|`graph_advance`|`runId`, `nodeId`, `durationMs`|汇报节点完成。output 不传入——留存在 agent 会话或落盘文件——并获取下一个待执行节点。一步完成 notify + askNext|
|`graph_jump`|`runId: string`, `targetPhaseId: string`|定向跳转到指定节点——用于 approval REWORK 决策后重跑特定 phase|
|`graph_force_end`|`runId: string`|强制终止图运行——所有未完成节点标记为 skipped，run status 设为 terminated。**不可逆**|
|`graph_status`|`runId: string`|查询 run 完整状态快照——各 phase 状态、重试次数、时间戳|
|`graph_list`|无|列出全部 run 摘要（runId、graphName、status、startedAt），最新在前|
|`graph_init`|无|初始化数据库——创建表 + 执行 migration。幂等|
|`graph_clean_completed`|`before?: string`|清理已完成的 run 记录。可指定截止时间（ISO 8601）|
|`graph_clean_all`|无|清理全部 run 记录——含 running/blocked/terminated。**危险操作**|

### NextNode 类型

`graph_start` / `graph_advance` 返回的 NextNode 包含两种类型：

|type|含义|agent 行为|
|-|-|-|
|`agent`|普通执行节点|执行 task 字段指定的 sub-agent（含已插值模板）|
|`approval`|人工决策节点|呈现 Decision Card 给用户并收集选择|

### 典型调用流程

```
graph_start({ graphName: "ci-pipeline" })
  → NextNode { nodeId: "lint", type: "agent" }
  → agent 执行 lint
  → graph_advance({ runId, nodeId: "lint", durationMs: 1234 })
  → NextNode { nodeId: "test", type: "agent" }
  → agent 执行 test
  → graph_advance({ runId, nodeId: "test", durationMs: 5678 })
  → ...循环至 NextNode 返回 null（图完成）
```

## 开发

```bash
cd packages/graph-scheduler

# 安装依赖
npm install

# 构建（tsup）
npm run build

# 运行测试（vitest）
npm test

# 类型检查
npm run typecheck

# 启动开发模式
npm start
```

测试文件位于 `tests/` 目录，覆盖 types、topology、state-persistence、scheduler-runtime、graph-execution、graph-definition 及集成测试。`src/schemas/` 目录下的 zod v4 schema 均有独立单元测试（合法/非法/边界）。

## FAQ

### graph_start 返回 NextNode 后 agent 无响应？

检查 MCP 连接状态。确认 `mcp.json` 中 `command` 和 `args` 路径正确。确认 Graph-Scheduler 进程未崩溃——检查 OMP 平台 MCP health check 日志。

### 如何查看运行历史？

使用 `graph_list` 获取全部 run 摘要，再用 `graph_status({ runId })` 查看具体 run 的 phase 级详情。

### 如何中止卡住的 run？

使用 `graph_force_end({ runId })`。**注意**——此操作不可逆，run 状态标记为 `terminated` 后无法恢复。

### libsql 数据库文件在哪？

默认路径：`packages/graph-scheduler/.graph-scheduler/data.db`（相对于 server.ts 工作目录）。可通过环境变量 `GRAPH_SCHEDULER_DB_PATH` 自定义。

数据库包含两张表：

- `graph_runs`——run 级元数据（runId、graphName、status、timestamps）
- `node_states`——节点级状态记录（nodeId、status、retry count、duration）。output 不持久化——留存在 agent 会话或落盘文件
