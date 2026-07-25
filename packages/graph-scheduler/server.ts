/**
 * Graph-Scheduler MCP Server — stdio transport entry point.
 *
 * Exposes 9 MCP tools (One-Per-Action pattern) wrapping SchedulerRuntime.
 * Lifecycle managed by OMP platform via ~/.omp/agent/mcp.json.
 *
 * Environment variables:
 *   GS_DB_PATH      — SQLite database path (default: ":memory:")
 *   GS_TASKFLOW_DIR — taskflow graph directory (default: "graphs")
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Effect } from 'effect';
import { z } from 'zod/v4';

import { createRuntime, type SchedulerRuntime } from './src/scheduler-runtime.js';

// ── Runtime state (initialized once at startup) ─────────────────────

let runtime: SchedulerRuntime | null = null;

async function getRuntime(): Promise<SchedulerRuntime> {
  if (runtime) return runtime;
  runtime = await Effect.runPromise(createRuntime());
  return runtime;
}

// ── Error helper ────────────────────────────────────────────────────

/** Structured error info with MCP error code derived from _tag. */
interface McpErrorInfo {
  readonly message: string;
  readonly code: string;
}

/** Map SchedulerRuntime._tag to MCP error code. */
const TAG_TO_CODE: Record<string, string> = {
  NotFoundError: 'RUN_NOT_FOUND',
  InvalidStateError: 'INVALID_STATE',
  GraphDefinitionError: 'GRAPH_NOT_FOUND',
  PersistenceError: 'PERSISTENCE_ERROR',
  RunNotFound: 'RUN_NOT_FOUND',
  GraphNotFound: 'GRAPH_NOT_FOUND',
  PhaseHandlerError: 'PHASE_HANDLER_ERROR',
  UnknownPhaseTypeError: 'UNKNOWN_PHASE_TYPE',
};

/** Extract _tag from a tagged error object. */
function extractTag(err: unknown): string | undefined {
  if (err && typeof err === 'object' && '_tag' in err) {
    const tag = (err as Record<string, unknown>)._tag;
    if (typeof tag === 'string') return tag;
  }
  return undefined;
}

/** Convert unknown error to MCP-friendly error info with typed code. */
function toMcpError(err: unknown): McpErrorInfo {
  const tag = extractTag(err);
  const code = tag ? (TAG_TO_CODE[tag] ?? 'INTERNAL_ERROR') : 'INTERNAL_ERROR';
  let message: string;
  if (err instanceof Error) {
    message = err.message;
  } else if (err && typeof err === 'object' && 'message' in err) {
    message = String((err as Record<string, unknown>).message);
  } else {
    message = String(err);
  }
  return { message, code };
}

// ── Zod schemas (mirrors 05-interfaces.md §一 tool inputSchema) ──────

const GraphStartSchema = z.object({
  graphName: z.string().min(1).describe('图名称——对应 .taskflow.yaml 的 name 字段或 registry entry'),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('可选——图调用参数。值可在 task 模板中通过 {args.key} 引用'),
});

const GraphAdvanceSchema = z.object({
  runId: z.string().min(1).describe('图运行 ID——graph_start 返回的 UUID'),
  nodeId: z.string().min(1).describe('完成的节点 ID'),
  durationMs: z.number().int().min(0).describe('执行耗时（毫秒）'),
});

const GraphJumpSchema = z.object({
  runId: z.string().min(1).describe('图运行 ID'),
  targetPhaseId: z.string().min(1).describe('目标 phase ID——跳转后从此节点开始执行'),
});

const GraphForceEndSchema = z.object({
  runId: z.string().min(1).describe('图运行 ID——要强制终止的 run'),
});

const GraphStatusSchema = z.object({
  runId: z.string().min(1).describe('图运行 ID'),
});

const GraphListSchema = z.object({});

const GraphInitSchema = z.object({});

const GraphCleanCompletedSchema = z.object({
  before: z.string().optional().describe('ISO 8601 时间戳——清理此时间之前完成的 run。不传则清理全部已完成'),
});

const GraphCleanAllSchema = z.object({});

// ── MCP Server ───────────────────────────────────────────────────────

const server = new McpServer({
  name: 'graph-scheduler',
  version: '0.0.0',
});

// Tool 1: graph_start — create run + return first node
server.tool(
  'graph_start',
  '启动新图执行 run。创建 run + 初始化所有节点状态 + 返回第一个待执行节点。',
  GraphStartSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphStart(args.graphName, args.args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_start failed: ${message}` }],
      };
    }
  },
);

// Tool 2: graph_advance — report completion + get next node
server.tool(
  'graph_advance',
  '汇报 agent 节点完成——并获取下一个待执行节点。一步完成 notify + askNext。始终分发 COMPLETE 事件。',
  GraphAdvanceSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphAdvance(args.runId, args.nodeId, args.durationMs);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_advance failed: ${message}` }],
      };
    }
  },
);

// Tool 3: graph_jump — directed jump to target phase
server.tool(
  'graph_jump',
  '定向跳转到指定节点——用于 approval REWORK 决策后重跑特定 phase。重置目标节点及其上游依赖为 pending。',
  GraphJumpSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphJump(args.runId, args.targetPhaseId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_jump failed: ${message}` }],
      };
    }
  },
);

// Tool 4: graph_force_end — force terminate a run
server.tool(
  'graph_force_end',
  '强制终止图运行。所有未完成节点标记为 skipped，run status 设为 terminated。不可逆。',
  GraphForceEndSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const snapshot = await rt.graphForceEnd(args.runId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(snapshot) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_force_end failed: ${message}` }],
      };
    }
  },
);

// Tool 5: graph_status — query run state
server.tool(
  'graph_status',
  '查询 run 完整状态快照——含所有节点状态、retry 计数。',
  GraphStatusSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const snapshot = await rt.graphStatus(args.runId);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(snapshot) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_status failed: ${message}` }],
      };
    }
  },
);

// Tool 6: graph_list — list all runs
server.tool('graph_list', '列出所有 run——按创建时间倒序。', GraphListSchema.shape, async (_args) => {
  const rt = await getRuntime();
  try {
    const runs = await rt.graphList();
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(runs) }],
    };
  } catch (err) {
    const { message, code } = toMcpError(err);
    return {
      isError: true,
      code,
      content: [{ type: 'text' as const, text: `graph_list failed: ${message}` }],
    };
  }
});

// Tool 7: graph_init — initialise database schema
server.tool(
  'graph_init',
  '初始化数据库——创建表 + 执行 migration。幂等——重复调用安全。',
  GraphInitSchema.shape,
  async (_args) => {
    const rt = await getRuntime();
    try {
      await rt.graphInit();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ ok: true }) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_init failed: ${message}` }],
      };
    }
  },
);

// Tool 8: graph_clean_completed — clean completed runs
server.tool(
  'graph_clean_completed',
  '清理已完成的 run 记录。可指定截止时间。',
  GraphCleanCompletedSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphCleanCompleted(args.before);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_clean_completed failed: ${message}` }],
      };
    }
  },
);

// Tool 9: graph_clean_all — clean all runs
server.tool(
  'graph_clean_all',
  '清理全部 run 记录——含 running/blocked/terminated。危险操作——需确认。',
  GraphCleanAllSchema.shape,
  async (_args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphCleanAll();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (err) {
      const { message, code } = toMcpError(err);
      return {
        isError: true,
        code,
        content: [{ type: 'text' as const, text: `graph_clean_all failed: ${message}` }],
      };
    }
  },
);

// ── Bootstrap ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Eagerly initialize runtime so first tool call is fast
  await getRuntime();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr so stdout (stdio transport) stays clean for JSON-RPC
  console.error('graph-scheduler MCP server running on stdio');
}

main().catch((err) => {
  console.error('graph-scheduler fatal:', err);
  process.exit(1);
});
