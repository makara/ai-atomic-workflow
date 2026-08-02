/**
 * Graph-Scheduler MCP Server — stdio transport entry point.
 *
 * Exposes 9 MCP tools (One-Per-Action pattern) wrapping SchedulerRuntime.
 * Lifecycle managed by platform MCP infrastructure (configured via mcp.json).
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
  FlowPhaseError: 'FLOW_PHASE_ERROR',
  PersistenceError: 'PERSISTENCE_ERROR',
  FileSystemError: 'FILE_SYSTEM_ERROR',
  RegistryLoadError: 'REGISTRY_LOAD_ERROR',
  DispatchConfigError: 'DISPATCH_CONFIG_ERROR',
  ConfigError: 'CONFIG_ERROR',
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

// ── Zod schemas for MCP tool inputSchema ──────────────────────────

const GraphStartSchema = z.object({
  graphName: z.string().min(1).describe('Graph name — matches the name field of .taskflow.yaml or a registry entry'),
  args: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Optional — graph invocation arguments. Values are referenced as {args.key} in task templates'),
});

const GraphAdvanceSchema = z.object({
  runId: z.string().min(1).describe('Graph run ID — UUID returned by graph_start'),
  nodeId: z.string().min(1).describe('ID of the completed node'),
  durationMs: z.number().int().min(0).describe('Execution duration in milliseconds'),
  skip: z
    .boolean()
    .optional()
    .describe('Optional — pass true when the when-guard evaluates false; node is marked skipped'),
});

const GraphJumpSchema = z.object({
  runId: z.string().min(1).describe('Graph run ID'),
  targetPhaseId: z.string().min(1).describe('Target phase ID — execution starts from this node after the jump'),
});

const GraphForceEndSchema = z.object({
  runId: z.string().min(1).describe('Graph run ID — the run to force-terminate'),
});

const GraphStatusSchema = z.object({
  runId: z.string().min(1).describe('Graph run ID'),
});

const GraphListSchema = z.object({});

const GraphInitSchema = z.object({});

const GraphCleanCompletedSchema = z.object({
  before: z
    .string()
    .optional()
    .describe('ISO 8601 timestamp — clean up runs completed before this time. Omit to clean all completed runs'),
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
  'Start a new graph run. Creates the run, initializes all node states, returns the first pending node.',
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
  'Report an agent node as complete and fetch the next pending node. Combines notify + askNext in one step. Always dispatches the COMPLETE event.',
  GraphAdvanceSchema.shape,
  async (args) => {
    const rt = await getRuntime();
    try {
      const result = await rt.graphAdvance(args.runId, args.nodeId, args.durationMs, args.skip);
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
  'Jump to a specific node — re-run a phase after an approval REWORK decision. Resets the target node and its upstream dependencies to pending.',
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
  'Force-terminate a graph run. All unfinished nodes are marked skipped; run status becomes terminated. Irreversible.',
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
  'Query the full status snapshot of a run — all node states and retry counts.',
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
server.tool('graph_list', 'List all runs — newest first.', GraphListSchema.shape, async (_args) => {
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

// Tool 7: graph_init — initialise database schema + full-registry health check
server.tool(
  'graph_init',
  'Initialize the database (create tables + run migration) plus a full health check (entry-skill contract alignment with orphan detection + config health report). Idempotent — safe to call repeatedly.',
  GraphInitSchema.shape,
  async (_args) => {
    const rt = await getRuntime();
    try {
      const report = await rt.graphInit();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(report) }],
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
  'Clean up completed run records. Optional cutoff timestamp.',
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
  'Clean up all run records — including running/blocked/terminated. Destructive — requires confirmation.',
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
